import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setup, accounts as a, request } from "./support.js";
import { engine, db, caseLogsTable, usersTable, departmentConfigsTable } from "./database.js";
import { eq } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("HOD below-target diagnostics are consistent and disclose names only in the authorized response", async () => {
  const priorV2 = process.env.AROGYA_ASSISTANT_V2_ENABLED;
  const priorKey = process.env.OPENAI_API_KEY;
  const priorModel = process.env.OPENAI_MODEL;
  const originalFetch = globalThis.fetch;
  const providerBodies: string[] = [];
  process.env.AROGYA_ASSISTANT_V2_ENABLED = "true";
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  process.env.OPENAI_MODEL = "synthetic-test-model";
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.openai.com/v1/chat/completions") {
      const payload = JSON.parse(init?.body as string);
      providerBodies.push(JSON.stringify(payload));
      const isApprovalQuestion = JSON.stringify(payload).toLocaleLowerCase().includes("student acceptance procedure");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        reply: isApprovalQuestion
          ? "Self-registered residents remain pending until payment is complete and the HOD approves them. Residents created directly by an HOD are automatically approved."
          : "The current department summary is shown in the checked facts.",
        steps: [],
      }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  try {
    await db.update(usersTable).set({ fullName: "Diagnostic Resident" }).where(eq(usersTable.id, a.student0.id));
    await db.insert(caseLogsTable).values({
      studentId: a.student0.studentId!, date: "2026-02-01", patientAge: "synthetic", patientGender: "other",
      diagnosisFinal: "synthetic test value", category: "Synthetic category", supervisorId: a.faculty0.id, status: "verified",
      chiefComplaints: "synthetic test value",
    });

    const unauthenticated = await request(runtime.base, "/arogya/ask", undefined, "POST", {
      question: "Which approved residents are currently classified below their configured progress targets?",
    });
    console.log("AROGYA_AUTH_EVIDENCE", JSON.stringify({ case: "unauthenticated", request: { method: "POST", path: "/api/arogya/ask" }, response: { status: unauthenticated.status } }));
    assert.equal(unauthenticated.status, 401);

    const wrongDepartment = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "How is this resident progressing?", context: { studentId: a.student1.studentId },
    });
    console.log("AROGYA_AUTH_EVIDENCE", JSON.stringify({ case: "authenticated wrong department", request: { method: "POST", path: "/api/arogya/ask", role: "hod", selectedStudent: "another department" }, response: { status: wrongDepartment.status } }));
    assert.equal(wrongDepartment.status, 403);

    const belowTarget = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Which approved residents are currently classified below their configured progress targets?",
    });
    console.log("AROGYA_AUTH_EVIDENCE", JSON.stringify({ case: "authenticated correct department", request: { method: "POST", path: "/api/arogya/ask", role: "hod", question: "Which approved residents are currently classified below their configured progress targets?" }, response: { status: belowTarget.status } }));
    assert.equal(belowTarget.status, 200);
    assert.match(belowTarget.body.reply, /Diagnostic Resident/);
    assert.equal(providerBodies.length, 0, "the evidence-backed below-target answer should be assembled locally");

    const fallingBehind = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Who's falling behind?",
    });
    assert.equal(fallingBehind.status, 200);
    assert.match(fallingBehind.body.reply, /Diagnostic Resident/);
    assert.equal(providerBodies.length, 0, "the short suggestion prompt should use the same checked classification");

    const nonexistent = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Show progress for this resident.", context: { studentId: 999999 },
    });
    console.log("AROGYA_AUTH_EVIDENCE", JSON.stringify({ case: "authenticated nonexistent resident", request: { method: "POST", path: "/api/arogya/ask", role: "hod", selectedStudent: 999999 }, response: { status: nonexistent.status } }));
    assert.equal(nonexistent.status, 404);

    const report = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Summarize my department's approved residents and pending review queue.",
    });
    assert.equal(report.status, 200);
    assert.ok(report.body.facts.some((item: any) => item.label === "Diagnostic Resident"));
    assert.match(report.body.reply, /Diagnostic Resident/);
    assert.match(report.body.reply, /pending records in the HOD review queue/);
    assert.equal(providerBodies.length, 0, "department summaries should use the checked facts directly");

    const acceptance = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Student acceptance proceduree: are they automatically accepted or does the HOD have to do it?",
    });
    assert.equal(acceptance.status, 200);
    assert.match(acceptance.body.reply, /Self-registered residents remain pending/);
    const acceptancePrompt = JSON.parse(providerBodies[0]).messages[0].content as string;
    assert.match(acceptancePrompt, /pending status/);
    assert.match(acceptancePrompt, /payment must be completed/);
    assert.match(acceptancePrompt, /created directly by an HOD/);
    assert.ok(providerBodies.every((body) => !body.includes("Diagnostic Resident")), "resident names must stay out of provider input");
    assert.ok(providerBodies.every((body) => !body.includes("synthetic test value")), "clinical text must stay out of provider input");

    await db.update(departmentConfigsTable).set({ requiredCases: null, requiredProcedures: null, requiredAcademic: null })
      .where(eq(departmentConfigsTable.departmentId, a.hod0.departmentId));
    const untracked = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Which approved residents are currently classified below their configured progress targets?",
    });
    assert.equal(untracked.status, 200);
    assert.match(untracked.body.reply, /could not classify/i);
    assert.doesNotMatch(untracked.body.reply, /No approved residents are currently classified below/);

    const untrackedShortQuestion = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Who's falling behind?",
    });
    assert.equal(untrackedShortQuestion.status, 200);
    assert.match(untrackedShortQuestion.body.reply, /could not classify/i);
    assert.doesNotMatch(untrackedShortQuestion.body.reply, /No approved residents are currently classified below/);

    const untrackedReport = await request(runtime.base, "/arogya/ask", a.hod0, "POST", {
      question: "Summarize my department's approved residents and pending review queue.",
    });
    assert.equal(untrackedReport.status, 200);
    assert.match(untrackedReport.body.reply, /cannot be classified against configured targets/i);
    assert.match(untrackedReport.body.reply, /untracked categories/);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorV2 === undefined) delete process.env.AROGYA_ASSISTANT_V2_ENABLED; else process.env.AROGYA_ASSISTANT_V2_ENABLED = priorV2;
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = priorKey;
    if (priorModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = priorModel;
  }
});
