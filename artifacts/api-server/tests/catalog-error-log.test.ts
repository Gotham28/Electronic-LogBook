// GET /api/departments/:id/catalog failure log: says which step failed and the Postgres
// error code, never the error text (AGENTS.md §8).
//
// Same method as log-leaks.test.ts: NODE_ENV=production so pino writes plain JSON lines,
// and each forced failure is set up and undone inside its own test. Here the lines are also
// captured, so the fields can be asserted rather than read by eye.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, password } from "./support.js";
import { engine, db, departmentsTable, usersTable } from "./database.js";
import { sql } from "drizzle-orm";
import pino from "pino";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "error";

let runtime: Awaited<ReturnType<typeof setup>>;
const lines: string[] = [];
before(async () => {
  runtime = await setup();
  const { logger } = await import("../src/lib/logger.js");
  const stream = (logger as any)[pino.symbols.streamSym];
  const write = stream.write.bind(stream);
  stream.write = (chunk: string) => { lines.push(String(chunk)); return write(chunk); };
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

function catalogFailureLine() {
  const found = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((entry) => entry?.msg === "Error resolving config department");
  assert.equal(found.length, 1, "expected exactly one catalog failure log line");
  lines.length = 0;
  return found[0];
}

test("catalog still loads normally (200)", async () => {
  const res = await request(runtime.base, `/departments/${a.hod0.departmentId}/catalog`, a.hod0);
  assert.equal(res.status, 200);
});

test("a missing table (the missing-migration case) logs step load-catalog and code 42P01", async (t) => {
  lines.length = 0;
  await db.execute(sql`ALTER TABLE department_posting_schedule RENAME TO department_posting_schedule_hidden`);
  const res = await request(runtime.base, `/departments/${a.hod0.departmentId}/catalog`, a.hod0);
  await db.execute(sql`ALTER TABLE department_posting_schedule_hidden RENAME TO department_posting_schedule`);

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { message: "Internal server error" });
  const entry = catalogFailureLine();
  t.diagnostic("logged: " + JSON.stringify({ step: entry.step, code: entry.code, departmentId: entry.departmentId, status: entry.status }));
  assert.equal(entry.step, "load-catalog");
  assert.equal(entry.code, "42P01");
  assert.equal(entry.err, undefined, "the error object must not be logged");
  assert.ok(!/select|department_posting_schedule/i.test(JSON.stringify(entry)), "no SQL text in the log line");
});

test("a test department whose source is itself a test department logs step resolve-config-source", async (t) => {
  lines.length = 0;
  const [source] = await db.insert(departmentsTable).values({ name: "Log test source", code: "LOG-SRC", isTest: true }).returning();
  const [mirror] = await db.insert(departmentsTable).values({ name: "Log test mirror", code: "LOG-MIR", isTest: true, configSourceDepartmentId: source.id }).returning();
  const [user] = await db.insert(usersTable).values({ fullName: "Log test professor", email: "log-test-prof@example.test", role: "professor",
    status: "approved", departmentId: mirror.id, passwordHash: await bcrypt.hash(password, 10) }).returning();
  const account = { id: user.id, token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) } as any;

  const res = await request(runtime.base, `/departments/${mirror.id}/catalog`, account);
  assert.equal(res.status, 500);
  const entry = catalogFailureLine();
  t.diagnostic("logged: " + JSON.stringify({ step: entry.step, code: entry.code, departmentId: entry.departmentId, status: entry.status }));
  assert.equal(entry.step, "resolve-config-source");
  assert.equal(entry.code, "UNEXPECTED");
});
