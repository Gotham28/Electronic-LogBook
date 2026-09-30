import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { _arogya, checkAndIncrementLimit, buildProgressFacts, buildAppraisalFacts } from "../lib/arogya.js";
import { findStudent, callerCanAccessStudent } from "../lib/appraisals.js";
import { db, studentsTable, usersTable } from "@workspace/db";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { AROGYA_HELP_GUIDE } from "../lib/arogya-help.js";
import { idSchema } from "../lib/validation.js";

const router = Router();

router.post("/ask", requireAuth, async (req, res) => {
  const userId = String(req.user!.id);

  // Arogya is for residents, professors, and HODs only.
  if (!req.user!.departmentId) {
    res.status(403).json({ error: "Arogya is not available for this account type." });
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

    // Step 5: access control
    if (!callerCanAccessStudent(req.user!, student)) {
      res.status(403).json({ error: "Student is outside your appraisal access scope." });
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

export default router;
