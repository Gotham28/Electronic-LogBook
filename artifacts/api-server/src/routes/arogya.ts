import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { _arogya, checkAndIncrementLimit, buildProgressFacts, buildAppraisalFacts } from "../lib/arogya.js";
import { callerCanAccessStudent, findStudent } from "../lib/appraisals.js";
import { buildDepartmentReportFacts } from "../lib/department-report.js";
import { db, departmentsTable, studentsTable, usersTable } from "@workspace/db";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { AROGYA_HELP_GUIDE } from "../lib/arogya-help.js";
import { idSchema } from "../lib/validation.js";
import { capabilitySignature, knowledgeVersion, roleWorkflows } from "../lib/arogya/knowledge/index.js";
import { canonicalArogyaRole } from "../lib/arogya/policy.js";
import { normalizeHistory, scrubAccountNames, containsSensitiveClinicalInput } from "../lib/arogya/input-privacy.js";
import { answerArogya, ArogyaProviderError, validateV2Enabled } from "../lib/arogya/provider.js";
import type { ArogyaLogType } from "../lib/arogya/facts.js";

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

router.post("/ask", requireAuth, async (req, res) => {
  const userId = String(req.user!.id);

  // Arogya is for residents, professors, and HODs only.
  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
    return;
  }

  if (validateV2Enabled()) {
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

router.post("/progress-coach", requireAuth, async (req, res) => {
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

router.post("/appraisal-draft/:studentId", requireAuth, async (req, res) => {
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

router.post("/department-report", requireAuth, async (req, res) => {
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
