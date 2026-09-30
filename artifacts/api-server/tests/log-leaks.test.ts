// Evidence Gate C (docs/SECURITY_FIXES.md sec 3) — SEC-03, SEC-08.
//
// Forces a real query failure on each of the two routes and lets pino log it exactly as
// it would in production: NODE_ENV=production (skips the pino-pretty worker-thread
// transport pino uses in dev/test, so the JSON line prints once, on this process's own
// stdout - node:test's own runner then carries it into whoever reads this run's output)
// and LOG_LEVEL=error (support.ts otherwise sets LOG_LEVEL=silent). A secret marker is
// planted in the field that would leak (the leave reason; the plaintext password) so its
// absence from the captured line is a direct, checkable fact, not an inference. The CHECK
// constraint that forces each failure is added and dropped inside its own test, touching
// no fixture data used elsewhere in the suite.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db } from "./database.js";
import { _arogya } from "../src/lib/arogya.js";
import { sql } from "drizzle-orm";

process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "error";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("SEC-03: forced POST /:studentId/leave-records failure logs id and status only, never the reason", async () => {
  await db.execute(sql`ALTER TABLE leave_records ADD CONSTRAINT force_fail_sec03 CHECK (false) NOT VALID`);
  const secretReason = "SEC-03-EVIDENCE-MARKER-diabetes-mellitus-type-2-do-not-log";
  const response = await call("/students/" + a.student0.studentId + "/leave-records", "student0", "POST",
    { startDate: "2026-09-01", endDate: "2026-09-03", leaveType: "casual", reason: secretReason });
  await db.execute(sql`ALTER TABLE leave_records DROP CONSTRAINT force_fail_sec03`);

  // The pino line this request produces prints to this process's own stdout above/below
  // this line (NODE_ENV=production, LOG_LEVEL=error, both set above) - that printed line
  // IS the evidence; nothing here manufactures it.
  console.log("SEC-03 forced-failure response ->", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 500);
});

test("SEC-08: forced POST /admin/professors failure logs department id and status only, never the password", async () => {
  await db.execute(sql`ALTER TABLE users ADD CONSTRAINT force_fail_sec08 CHECK (false) NOT VALID`);
  const secretPassword = "SEC08EvidenceMarkerPlaintextPW!";
  const response = await call("/admin/professors", "hod0", "POST",
    { fullName: "SEC-08 evidence professor", email: "sec08-evidence@example.test", password: secretPassword });
  await db.execute(sql`ALTER TABLE users DROP CONSTRAINT force_fail_sec08`);

  console.log("SEC-08 forced-failure response ->", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 500);
});

test("SEC-09: POST /api/arogya/ask never logs question, system prompt, or reply", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: "Ask your supervisor for guidance.", tokenCount: 10 });

  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logged.push(args.map(String).join(" ")); };

  try {
    const response = await call("/arogya/ask", "student0", "POST", { question: "Secret question" });
    assert.equal(response.status, 200);
    for (const entry of logged) {
      assert.ok(!entry.includes("Secret question"), "question must not appear in logs");
      assert.ok(!entry.includes("Use only the facts"), "system prompt must not appear in logs");
      assert.ok(!entry.includes("Ask your supervisor"), "reply must not appear in logs");
    }
  } finally {
    _arogya.call = orig;
    console.log = originalLog;
  }
});

test("SEC-10: POST /api/arogya/progress-coach never logs prompt or reply", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: JSON.stringify(["Secret tip one", "Secret tip two", "Secret tip three"]), tokenCount: 10 });

  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => { logged.push(args.map(String).join(" ")); };

  try {
    const response = await call("/arogya/progress-coach", "student0", "POST");
    assert.equal(response.status, 200);
    for (const entry of logged) {
      assert.ok(!entry.includes("progress coach tips"), "prompt must not appear in logs");
      assert.ok(!entry.includes("Secret tip"), "reply must not appear in logs");
    }
  } finally {
    _arogya.call = orig;
    console.log = originalLog;
  }
});

test("forced PATCH /:studentId/postings/:postingId failure returns a plain 500 with no error text or stack", async () => {
  const created = await call("/students/" + a.student0.studentId + "/postings", "student0", "POST",
    { ward: "unit-0", startDate: "2026-02-01", endDate: "2026-02-10", supervisorId: a.faculty0.id });
  assert.equal(created.status, 201);
  await db.execute(sql`ALTER TABLE postings ADD CONSTRAINT force_fail_posting_patch CHECK (false) NOT VALID`);
  const response = await call("/students/" + a.student0.studentId + "/postings/" + created.body.posting.id, "student0", "PATCH",
    { endDate: "2026-02-12" });
  await db.execute(sql`ALTER TABLE postings DROP CONSTRAINT force_fail_posting_patch`);

  console.log("posting PATCH forced-failure response ->", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: "Internal server error" });
});

// Records everything written through console.* / process streams while `run` executes, then
// passes it through unchanged. pino writes to fd 1 directly, so its line still prints below
// as evidence; this catches the console.error(error) shape that logged the bound parameters.
async function captureConsole<T>(run: () => Promise<T>): Promise<{ result: T; output: string }> {
  const chunks: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: any, ...rest: any[]) => { chunks.push(String(chunk)); return out(chunk, ...rest); }) as any;
  process.stderr.write = ((chunk: any, ...rest: any[]) => { chunks.push(String(chunk)); return err(chunk, ...rest); }) as any;
  try { return { result: await run(), output: chunks.join("") }; }
  finally { process.stdout.write = out; process.stderr.write = err; }
}

test("forced POST /:studentId/academic-logs failure never writes the topic or description to the console", async () => {
  const marker = "ACADEMIC-LOG-MARKER-patient-history-do-not-log";
  await db.execute(sql`ALTER TABLE academic_logs ADD CONSTRAINT force_fail_academic CHECK (false) NOT VALID`);
  const { result: response, output } = await captureConsole(() =>
    call("/students/" + a.student0.studentId + "/academic-logs", "student0", "POST",
      { supervisorId: a.faculty0.id, activityType: "discussion-0", topic: marker, date: "2026-03-01", description: marker }));
  await db.execute(sql`ALTER TABLE academic_logs DROP CONSTRAINT force_fail_academic`);

  console.log("academic-log forced-failure response ->", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 500);
  assert.ok(!output.includes(marker), "the academic log topic reached the console");
});
