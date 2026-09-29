import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { _arogya, checkAndIncrementLimit, buildProgressFacts } from "../lib/arogya.js";
import { db } from "@workspace/db";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { AROGYA_HELP_GUIDE } from "../lib/arogya-help.js";

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
    console.log("AROGYA_DEBUG_ERROR:", err?.message, err?.stack);
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
    const factsPack = await buildProgressFacts(req.user!, db);
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

export default router;
