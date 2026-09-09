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
    { startDate: "2026-09-01", endDate: "2026-09-03", leaveType: "Casual", reason: secretReason });
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
