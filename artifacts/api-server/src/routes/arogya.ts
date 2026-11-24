import { Router, type RequestHandler } from "express";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { _arogya, checkAndIncrementLimit, buildProgressFacts, buildAppraisalFacts } from "../lib/arogya.js";
import { callerCanAccessStudent, findStudent } from "../lib/appraisals.js";
import { buildDepartmentReportFacts } from "../lib/department-report.js";
import { assistantUsageEventsTable, db, departmentsTable, studentsTable, usersTable, type ProcedureType } from "@workspace/db";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { AROGYA_HELP_GUIDE } from "../lib/arogya-help.js";
import { idSchema } from "../lib/validation.js";
import { capabilitySignature, knowledgeVersion, roleWorkflows } from "../lib/arogya/knowledge/index.js";
import { assertAuthorizedStudent, canonicalArogyaRole } from "../lib/arogya/policy.js";
import { normalizeHistory, scrubAccountNames, containsSensitiveClinicalInput } from "../lib/arogya/input-privacy.js";
import { answerArogya, ArogyaProviderError, validateV2Enabled } from "../lib/arogya/provider.js";
import type { ArogyaLogType } from "../lib/arogya/facts.js";
import { getWeeklyDepartmentDigest } from "../lib/arogya/weekly-digest.js";

const router = Router();

const validationCode = z.enum([
  "student_required", "period_required", "appraisal_exists", "date_required", "publication_required",
  "score_required", "remediation_required", "record_not_pending", "record_not_assigned",
]);
const contextSchema = z.object({
  workflowId: z.string().max(80).optional(),
  studentId: z.number().int().positive().optional(),
  log: z.object({ type: z.enum(["case", "procedure", "academic", "clinical-work", "conference"]), id: z.number().int().positive() }).strict().optional(),
  appraisalPeriod: z.object({ quarter: z.number().int().min(1).max(4), year: z.number().int().min(2000).max(2200) }).strict().optional(),
  validationCodes: z.array(validationCode).max(8).optional(),
}).strict();
const askV2Schema = z.object({
  question: z.string().trim().min(1).max(1200),
  history: z.unknown().optional(),
  context: contextSchema.optional(),
}).strict();

const usageEventSchema = z.object({
  eventType: z.enum(["panel_open", "quick_action_click", "nudge_click"]),
}).strict();

const postgresIntegerMax = 2_147_483_647;
const usageCountQuery = z.object({ departmentId: idSchema.max(postgresIntegerMax).optional() }).strict();
type UsageFeature = "ask" | "progress-coach" | "appraisal-draft" | "department-report" | "department-report-weekly";

function trackMochiRequest(feature: UsageFeature): RequestHandler {
  return (req, res, next) => {
    const actor = req.user!;
    const role = canonicalArogyaRole(actor.role);
    if (role && Number.isSafeInteger(actor.departmentId) && actor.departmentId! > 0) {
      res.once("finish", () => {
        const tokenCount = res.locals.mochiTokenCount;
        void db.insert(assistantUsageEventsTable).values({
          userId: actor.id,
          role,
          departmentId: actor.departmentId,
          feature: res.locals.mochiAskV2 === true ? "ask-v2" : feature,
          eventType: "api_request",
          httpStatus: res.statusCode,
          tokenCount: Number.isSafeInteger(tokenCount) && tokenCount >= 0 && tokenCount <= postgresIntegerMax
            ? tokenCount : null,
        }).catch(() => {
          req.log.warn({ userId: actor.id, status: 500 }, "Mochi request usage could not be recorded");
        });
      });
    }
    next();
  };
}

router.post("/usage", requireAuth, requireDepartment, async (req, res) => {
  const actor = req.user!;
  const role = canonicalArogyaRole(actor.role);
  if (!role) {
    res.status(403).json({ error: "Mochi usage is unavailable for this account type." });
    return;
  }

  const event = usageEventSchema.safeParse(req.body);
  if (!event.success) {
    res.status(400).json({ error: "Invalid Mochi usage event." });
    return;
  }

  try {
    await db.insert(assistantUsageEventsTable).values({
      userId: actor.id,
      role,
      departmentId: actor.departmentId,
      feature: "mochi",
      eventType: event.data.eventType,
    });
    res.json({ recorded: true });
  } catch {
    res.status(500).json({ error: "Mochi usage could not be recorded." });
  }
});

router.get("/usage", requireAuth, async (req, res) => {
  const actor = req.user!;
  if (actor.role !== "admin" && actor.role !== "hod") {
    res.status(403).json({ error: "You cannot view Mochi usage counts." });
    return;
  }

  const query = usageCountQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid department filter." });
    return;
  }

  let departmentId = query.data.departmentId;
  if (actor.role === "hod") {
    const assignedDepartment = actor.departmentId;
    if (!assignedDepartment || !Number.isSafeInteger(assignedDepartment) || assignedDepartment < 1
      || (departmentId !== undefined && departmentId !== assignedDepartment)) {
      res.status(403).json({ error: "You cannot view Mochi usage for this department." });
      return;
    }
    departmentId = assignedDepartment;
  }

  try {
    let collegeId: number | undefined;
    if (actor.role === "admin" && actor.departmentId !== null) {
      const [assignment] = await db.select({ collegeId: departmentsTable.collegeId }).from(departmentsTable)
        .where(eq(departmentsTable.id, actor.departmentId)).limit(1);
      if (!assignment) {
        res.status(403).json({ error: "A college assignment is required." });
        return;
      }
      collegeId = assignment.collegeId;
    }

    if (departmentId !== undefined) {
      const [department] = await db.select({ collegeId: departmentsTable.collegeId }).from(departmentsTable)
        .where(eq(departmentsTable.id, departmentId)).limit(1);
      if (!department) {
        res.status(404).json({ error: "Department not found." });
        return;
      }
      if (collegeId !== undefined && department.collegeId !== collegeId) {
        res.status(403).json({ error: "You cannot view Mochi usage for this department." });
        return;
      }
    }

    const scope = and(
      departmentId === undefined ? undefined : eq(assistantUsageEventsTable.departmentId, departmentId),
      collegeId === undefined ? undefined : inArray(assistantUsageEventsTable.departmentId,
        db.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.collegeId, collegeId))),
    );
    const counts = await db.select({
      feature: assistantUsageEventsTable.feature,
      eventType: assistantUsageEventsTable.eventType,
      count: count(),
    }).from(assistantUsageEventsTable)
      .where(scope)
      .groupBy(assistantUsageEventsTable.feature, assistantUsageEventsTable.eventType)
      .orderBy(assistantUsageEventsTable.feature, assistantUsageEventsTable.eventType);
    res.json({ departmentId: departmentId ?? null, counts });
  } catch {
    res.status(500).json({ error: "Mochi usage counts could not be loaded." });
  }
});

router.get("/progress-gaps", requireAuth, requireDepartment, requireRole(["student"]), async (req, res) => {
  const actor = req.user!;
  try {
    const resident = await assertAuthorizedStudent(actor);
    if (resident.departmentId !== actor.departmentId) {
      res.status(403).json({ error: "You cannot view these progress targets." });
      return;
    }
    const facts = await buildProgressFacts(resident.id, actor.departmentId!, db);
    const config = facts.departmentTargets;
    const features = config?.enabledFeatures ?? {};
    const gaps: Array<{ label: string; verified: number; target: number }> = [];
    const includeGap = (label: string, verified: number, target: number | null | undefined) => {
      if (target != null && target > 0 && verified < target) gaps.push({ label, verified, target });
    };
    if (!features.hideCaseLogs) {
      includeGap("Cases", facts.caseCategories.reduce((sum, item) => sum + item.verified, 0), config?.requiredCases);
    }
    if (!features.hideProcedureLogs) {
      includeGap("Procedures", facts.procedures.reduce((sum, item) => sum + item.verified, 0), config?.requiredProcedures);
      const verifiedByProcedure = new Map(facts.procedures.map((item) => [`${item.group}\0${item.name}`, item.verified]));
      for (const requirement of facts.procedureRequirements as ProcedureType[]) {
        includeGap(`${requirement.group}: ${requirement.name}`,
          verifiedByProcedure.get(`${requirement.group}\0${requirement.name}`) ?? 0, requirement.required);
      }
    }
    includeGap("Academic activities", facts.academics.reduce((sum, item) => sum + item.verified, 0), config?.requiredAcademic);
    res.json({ gaps });
  } catch (error) {
    if (error instanceof Error && error.message === "AROGYA_SCOPE_404") {
      res.status(404).json({ error: "Resident profile not found." });
      return;
    }
    if (error instanceof Error && error.message === "AROGYA_SCOPE_403") {
      res.status(403).json({ error: "You cannot view these progress targets." });
      return;
    }
    res.status(500).json({ error: "Progress targets could not be loaded." });
  }
});

router.get("/context", requireAuth, async (req, res) => {
  const role = canonicalArogyaRole(req.user!.role);
  if (!role || !Number.isSafeInteger(req.user!.departmentId) || req.user!.departmentId! <= 0) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }
  try {
    const { features, configSourceId } = await getDepartmentFeatures(req.user!.departmentId!);
    const [department] = await db.select({ name: departmentsTable.name }).from(departmentsTable)
      .where(eq(departmentsTable.id, req.user!.departmentId!)).limit(1);
    if (!department) { res.status(403).json({ error: "A department assignment is required." }); return; }
    const workflows = roleWorkflows(role, features);
    res.json({
      mode: validateV2Enabled() ? "v2" : "legacy",
      role,
      departmentLabel: department.name,
      workflows: workflows.map((workflow) => ({ id: workflow.id, title: workflow.title, available: workflow.available })),
      actions: workflows.filter((workflow) => workflow.available && workflow.href)
        .map((workflow) => ({ id: workflow.id, label: workflow.title, href: workflow.href })),
      knowledgeVersion,
      capabilitySignature: capabilitySignature(role, configSourceId, features),
    });
  } catch {
    res.status(500).json({ error: "Arogya context could not be loaded." });
  }
});

router.post("/ask", requireAuth, trackMochiRequest("ask"), async (req, res) => {
  const userId = String(req.user!.id);

  // Arogya is for residents, professors, and HODs only.
  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }

  if (validateV2Enabled()) {
    res.locals.mochiAskV2 = true;
    const parsed = askV2Schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid Arogya request." }); return; }
    const history = normalizeHistory(parsed.data.history);
    if (!history) { res.status(400).json({ error: "Conversation history is invalid or too long." }); return; }
    const question = parsed.data.question;
    if (containsSensitiveClinicalInput(question)) {
      res.status(400).json({ error: "Please remove patient details and ask about the ELogbook workflow only." });
      return;
    }

    const role = canonicalArogyaRole(req.user!.role);
    if (!role) { res.status(403).json({ error: "Arogya is not available for this account type." }); return; }
    const context = parsed.data.context ?? {};
    try {
      const { features, configSourceId } = await getDepartmentFeatures(req.user!.departmentId!);
      const [department] = await db.select({ name: departmentsTable.name }).from(departmentsTable)
        .where(eq(departmentsTable.id, req.user!.departmentId!)).limit(1);
      if (!department) { res.status(403).json({ error: "A department assignment is required." }); return; }
      if (context.workflowId && !roleWorkflows(role, features).some((item) => item.id === context.workflowId)) {
        res.status(400).json({ error: "That workflow is not available to your role." }); return;
      }
      if (context.log?.type === "clinical-work" && !features.clinicalWorks ||
        context.log?.type === "conference" && !features.attendedConferences ||
        context.log?.type === "case" && features.hideCaseLogs ||
        context.log?.type === "procedure" && features.hideProcedureLogs) {
        res.status(403).json({ error: "That workflow is unavailable for your department." }); return;
      }
      let accountNames: string[] = [];
      const residentMention = /\b(?:student|resident)\s+(?:named\s+)?([\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+)?)/u.exec(question)?.[1];
      if (role === "student") {
        const own = await db.select({ name: usersTable.fullName }).from(usersTable)
          .where(and(eq(usersTable.id, req.user!.id), eq(usersTable.role, "student"), eq(usersTable.departmentId, req.user!.departmentId!))).limit(1);
        accountNames = own.map((item) => item.name);
        if (context.studentId !== undefined) {
          const [ownProfile] = await db.select({ id: studentsTable.id }).from(studentsTable)
            .where(eq(studentsTable.userId, req.user!.id)).limit(1);
          if (!ownProfile) { res.status(404).json({ error: "Student profile not found." }); return; }
          if (ownProfile.id !== context.studentId) { res.status(403).json({ error: "The selected record is outside your access scope." }); return; }
        }
      } else {
        const members = await db.select({ id: usersTable.id, name: usersTable.fullName, role: usersTable.role }).from(usersTable)
          .where(and(eq(usersTable.departmentId, req.user!.departmentId!), eq(usersTable.status, "approved"),
            inArray(usersTable.role, ["student", "professor", "hod"])));
        accountNames = members.map((item) => item.name);
        const scrubbedQuestion = scrubAccountNames(question, accountNames);
        if ((scrubbedQuestion !== question || residentMention) && context.studentId === undefined && /\b(?:student|resident|appraisal|progress|case|log)\b/i.test(question)) {
          res.json({ reply: "Select the resident in Arogya or on the appraisal page, then ask again so I can check the right record.",
            kind: "clarification", steps: [], sources: [], facts: [], actions: [], clarification: { type: "student" },
            knowledgeVersion, capabilitySignature: capabilitySignature(role, req.user!.departmentId!, features) });
          return;
        }
        if (context.studentId !== undefined) {
          const selectedStudent = await findStudent(context.studentId);
          if (!selectedStudent) { res.status(404).json({ error: "Student not found." }); return; }
          if (!callerCanAccessStudent(req.user!, selectedStudent) || selectedStudent.departmentId !== req.user!.departmentId) {
            res.status(403).json({ error: "Student is outside your department." }); return;
          }
          if (scrubbedQuestion !== question && !new RegExp(selectedStudent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(question)) {
            res.json({ reply: "The resident mentioned in the question does not match the selected resident. Select the intended resident and ask again.",
              kind: "clarification", steps: [], sources: [], facts: [], actions: [], clarification: { type: "student" },
              knowledgeVersion, capabilitySignature: capabilitySignature(role, req.user!.departmentId!, features) });
            return;
          }
          if (residentMention && residentMention.length > 1) {
            const mentioned = residentMention.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
            const selectedName = selectedStudent.name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
            if (!selectedName.includes(mentioned)) {
              res.json({ reply: "The resident mentioned in the question does not match the selected resident. Select the intended resident and ask again.",
                kind: "clarification", steps: [], sources: [], facts: [], actions: [], clarification: { type: "student" },
                knowledgeVersion, capabilitySignature: capabilitySignature(role, req.user!.departmentId!, features) });
              return;
            }
          }
        }
      }

      checkAndIncrementLimit(userId);
      const answer = await answerArogya({
        question,
        history,
        context: { ...context, log: context.log ? { ...context.log, type: context.log.type as ArogyaLogType } : undefined },
        studentId: context.studentId,
        actor: { id: req.user!.id, role, departmentId: req.user!.departmentId },
        features,
        configSourceId,
        departmentLabel: department.name,
      }, accountNames);
      console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 200, toolCount: answer.facts.length ? 1 : 0 }));
      res.json(answer);
    } catch (err: any) {
      if (err instanceof ArogyaProviderError && err.code === "AROGYA_UNAVAILABLE") {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 503 }));
        res.status(503).json({ error: "Arogya is not available right now." }); return;
      }
      if (err instanceof ArogyaProviderError && err.code === "AROGYA_LIMIT_REACHED" || err?.message === "AROGYA_LIMIT_REACHED") {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 429 }));
        res.status(429).json({ error: "You've reached today's Arogya limit. Try again tomorrow." }); return;
      }
      if (err?.message === "AROGYA_SCOPE_403" || err?.message === "AROGYA_SCOPE") {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 403 }));
        res.status(403).json({ error: "The selected record is outside your access scope." }); return;
      }
      if (err?.message === "AROGYA_SCOPE_404") {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 404 }));
        res.status(404).json({ error: "The selected record was not found." }); return;
      }
      if (err?.status === 404 || err?.status === 403) {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: err.status }));
        res.status(err.status).json({ error: err.status === 404 ? "The selected record was not found." : "The selected record is outside your access scope." }); return;
      }
      if (err instanceof ArogyaProviderError && err.code === "AROGYA_INVALID_OUTPUT") {
        console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 502 }));
        res.status(502).json({ error: "Arogya returned an invalid response. Please try again." }); return;
      }
      console.log(JSON.stringify({ userId, feature: "ask-v2", httpStatus: 500 }));
      res.status(500).json({ error: "Arogya couldn't check that right now." });
    }
    return;
  }

  try {
    const rawQuestion = req.body.question;
    if (typeof rawQuestion !== "string" || rawQuestion.length > 500) {
      res.status(400).json({ message: "Invalid question" });
      return;
    }

    const sanitisedQuestion = rawQuestion.replace(/\b[A-Z]{0,4}\d{6,12}\b/g, "");

    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const { features } = await getDepartmentFeatures(req.user!.departmentId!);

    const factsPack = {
      configSourceId,
      features,
      appGuide: AROGYA_HELP_GUIDE
    };

    checkAndIncrementLimit(userId);

    const { reply, tokenCount } = await _arogya.call(sanitisedQuestion, factsPack);
    res.locals.mochiTokenCount = tokenCount;
    console.log(JSON.stringify({ userId, feature: "ask", httpStatus: 200, tokenCount }));
    res.json({ reply });
  } catch (err: any) {
    if (err.message === "AROGYA_UNAVAILABLE") {
      console.log(JSON.stringify({ userId, feature: "ask", httpStatus: 503, tokenCount: 0 }));
      res.status(503).json({ error: "Arogya is not available right now." });
      return;
    }
    if (err.message === "AROGYA_LIMIT_REACHED") {
      console.log(JSON.stringify({ userId, feature: "ask", httpStatus: 429, tokenCount: 0 }));
      res.status(429).json({ error: "You've reached today's Arogya limit. Try again tomorrow." });
      return;
    }
    console.log(JSON.stringify({ userId, feature: "ask", httpStatus: 500, tokenCount: 0 }));
    res.status(500).json({ error: "Arogya couldn't answer right now." });
  }
});

router.post("/progress-coach", requireAuth, trackMochiRequest("progress-coach"), async (req, res) => {
  const userId = String(req.user!.id);

  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }

  if (req.user!.role !== "student") {
    res.status(403).json({ error: "Progress coach is only available for residents." });
    return;
  }

  try {
    checkAndIncrementLimit(userId);

    // Resolve student row for this user, then pass ids explicitly (ownership is req.user === student)
    const [studentMatch] = await db.select({ id: studentsTable.id, departmentId: usersTable.departmentId })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.userId, req.user!.id))
      .limit(1);
    if (!studentMatch) {
      console.log(JSON.stringify({ userId, feature: "progress-coach", httpStatus: 404, tokenCount: 0 }));
      res.status(404).json({ error: "Student profile not found." });
      return;
    }

    const factsPack = await buildProgressFacts(studentMatch.id, studentMatch.departmentId!, db);
    const userMessage = `Give me exactly three short progress coach tips based only on the facts provided. Return them as a JSON array of three strings and nothing else. Example: ["tip one","tip two","tip three"]`;

    const { reply, tokenCount } = await _arogya.call(userMessage, factsPack);
    res.locals.mochiTokenCount = tokenCount;
    let tips;
    try {
      tips = JSON.parse(reply);
      if (!Array.isArray(tips) || tips.length !== 3) throw new Error();
    } catch {
      throw new Error();
    }

    console.log(JSON.stringify({ userId, feature: "progress-coach", httpStatus: 200, tokenCount }));
    res.json({ tips });
  } catch (err: any) {
    if (err.message === "AROGYA_UNAVAILABLE") {
      console.log(JSON.stringify({ userId, feature: "progress-coach", httpStatus: 503, tokenCount: 0 }));
      res.status(503).json({ error: "Arogya is not available right now." });
      return;
    }
    if (err.message === "AROGYA_LIMIT_REACHED") {
      console.log(JSON.stringify({ userId, feature: "progress-coach", httpStatus: 429, tokenCount: 0 }));
      res.status(429).json({ error: "You've reached today's Arogya limit. Try again tomorrow." });
      return;
    }
    console.log(JSON.stringify({ userId, feature: "progress-coach", httpStatus: 500, tokenCount: 0 }));
    res.status(500).json({ error: "Arogya couldn't answer right now." });
  }
});

router.post("/appraisal-draft/:studentId", requireAuth, trackMochiRequest("appraisal-draft"), async (req, res) => {
  const userId = String(req.user!.id);

  // Step 1: parse studentId
  const parsed = idSchema.safeParse(req.params.studentId);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid student ID." });
    return;
  }

  // Step 2: block students
  if (req.user!.role === "student") {
    res.status(403).json({ error: "Appraisal draft is only available for faculty." });
    return;
  }

  // Step 3: block null departmentId
  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }

  try {
    // Step 4: find student
    const student = await findStudent(parsed.data);
    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }

    // Step 5: access control — department match only (mentor relationship not required for draft)
    if (student.departmentId !== req.user!.departmentId) {
      res.status(403).json({ error: "Student is outside your department." });
      return;
    }

    // Step 6: rate limit
    checkAndIncrementLimit(userId);

    // Step 7: build facts pack
    const factsPack = await buildAppraisalFacts(student.id, student.departmentId!, db);

    // Step 8: call AI
    const userMessage = `Draft facultyRemarks and remediationSuggestions for a quarterly appraisal. Based only on the facts provided, write two separate plain-text paragraphs. Return a JSON object with exactly two keys: facultyRemarks and remediationSuggestions. Each value must be a plain string of 2-4 sentences. Do not invent any number. Do not mention scores or suggest any numeric score value. Example: {"facultyRemarks":"...","remediationSuggestions":"..."}`;
    const { reply, tokenCount } = await _arogya.call(userMessage, factsPack);
    res.locals.mochiTokenCount = tokenCount;

    // Step 9: parse and validate reply
    let parsedReply: { facultyRemarks: string; remediationSuggestions: string };
    try {
      parsedReply = JSON.parse(reply);
      if (typeof parsedReply?.facultyRemarks !== "string" || typeof parsedReply?.remediationSuggestions !== "string") {
        throw new Error();
      }
    } catch {
      throw new Error();
    }

    // Step 10: log and respond
    console.log(JSON.stringify({ userId, feature: "appraisal-draft", httpStatus: 200, tokenCount }));
    res.json({ facultyRemarks: parsedReply.facultyRemarks, remediationSuggestions: parsedReply.remediationSuggestions });
  } catch (err: any) {
    if (err.message === "AROGYA_UNAVAILABLE") {
      console.log(JSON.stringify({ userId, feature: "appraisal-draft", httpStatus: 503, tokenCount: 0 }));
      res.status(503).json({ error: "Arogya is not available right now." });
      return;
    }
    if (err.message === "AROGYA_LIMIT_REACHED") {
      console.log(JSON.stringify({ userId, feature: "appraisal-draft", httpStatus: 429, tokenCount: 0 }));
      res.status(429).json({ error: "You've reached today's Arogya limit. Try again tomorrow." });
      return;
    }
    console.log(JSON.stringify({ userId, feature: "appraisal-draft", httpStatus: 500, tokenCount: 0 }));
    res.status(500).json({ error: "Arogya couldn't answer right now." });
  }
});

router.post("/department-report/weekly", requireAuth, requireDepartment, requireRole(["hod"]),
  trackMochiRequest("department-report-weekly"), async (req, res) => {
    if (req.body?.departmentId !== undefined) {
      res.status(403).json({ error: "Use the department assigned to your account." });
      return;
    }
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) {
      res.status(400).json({ error: "Invalid weekly digest request." });
      return;
    }
    const departmentId = req.user!.departmentId!;
    try {
      const [department] = await db.select({ id: departmentsTable.id }).from(departmentsTable)
        .where(eq(departmentsTable.id, departmentId)).limit(1);
      if (!department) {
        res.status(404).json({ error: "Department not found." });
        return;
      }
      const { tokenCount, ...digest } = await getWeeklyDepartmentDigest(department.id);
      res.locals.mochiTokenCount = tokenCount;
      if (digest.status === "failed") {
        res.status(503).json({ error: "This week's Mochi digest is unavailable." });
        return;
      }
      res.status(digest.status === "pending" ? 202 : 200).json(digest);
    } catch {
      res.status(500).json({ error: "The Mochi digest could not be loaded." });
    }
  });

router.post("/department-report", requireAuth, trackMochiRequest("department-report"), async (req, res) => {
  const userId = String(req.user!.id);

  if (req.user!.role !== "hod") {
    res.status(403).json({ error: "Department report is only available for HODs." });
    return;
  }

  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }

  try {
    let type = req.body.type;
    if (type !== "report" && type !== "falling_behind") type = "report";

    checkAndIncrementLimit(userId);

    const { facts, nameMap } = await buildDepartmentReportFacts(req.user!.departmentId, db);

    const userMessage = type === "report"
      ? "Write a short department progress report (4-6 sentences) for the HOD based only on the facts provided. Mention overall completion, any residents significantly behind, and the professor review backlog. Use the resident and professor placeholders as given. Do not invent any number."
      : "List only the residents who are below target (belowTarget: true in the facts). For each, write one sentence describing their specific gaps using only the facts provided. Use the resident placeholders as given. Return a plain list, one resident per line. Do not invent any number. If no residents are below target, say so.";

    const { reply, tokenCount } = await _arogya.call(userMessage, facts, nameMap);
    res.locals.mochiTokenCount = tokenCount;

    console.log(JSON.stringify({ userId, feature: "department-report", httpStatus: 200, tokenCount }));
    res.json({ reply, type });
  } catch (err: any) {
    if (err.message === "AROGYA_UNAVAILABLE") {
      console.log(JSON.stringify({ userId, feature: "department-report", httpStatus: 503, tokenCount: 0 }));
      res.status(503).json({ error: "Arogya is not available right now." });
      return;
    }
    if (err.message === "AROGYA_LIMIT_REACHED") {
      console.log(JSON.stringify({ userId, feature: "department-report", httpStatus: 429, tokenCount: 0 }));
      res.status(429).json({ error: "You've reached today's Arogya limit. Try again tomorrow." });
      return;
    }
    console.log(JSON.stringify({ userId, feature: "department-report", httpStatus: 500, tokenCount: 0 }));
    res.status(500).json({ error: "Arogya couldn't answer right now." });
  }
});

export default router;
