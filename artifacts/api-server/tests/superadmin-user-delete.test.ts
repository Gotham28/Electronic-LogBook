import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, usersTable, studentsTable, caseLogsTable, assignmentTypesTable } from "./database.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Admin (platform-level) permanent delete and reactivate for residents and faculty:
// DELETE /api/superadmin/users/:id/hard and POST /api/superadmin/users/:id/reactivate.
// Each route is shown with the four AGENTS.md §11 cases (401, 403, 200, 404).

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string };
before(async () => {
  runtime = await setup();
  const hash = await bcrypt.hash(password, 10);
  const [admin] = await db.insert(usersTable).values({
    fullName: "Test Admin", email: "admin-user-delete@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash,
  }).returning();
  adminAccount = { id: admin.id, token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "admin", method?: string, body?: unknown) => {
  const account = who === "admin" ? { ...adminAccount, role: "admin", email: "admin-user-delete@example.test", departmentId: 0 }
    : who ? a[who] : undefined;
  return request(runtime.base, path, account as any, method, body);
};

function evidence(t: TestContext, label: string, method: string, path: string, who: string, res: { status: number; body: any }) {
  t.diagnostic(`${label}: ${method} /api${path} as ${who} -> ${res.status} ${JSON.stringify({ message: res.body?.message })}`);
}

// ---------------------------------------------------------------------------
// DELETE /api/superadmin/users/:id/hard
// ---------------------------------------------------------------------------
test("admin hard-delete: unauthenticated request gets 401", async (t) => {
  const path = `/superadmin/users/${a.student1.id}/hard`;
  const res = await call(path, undefined, "DELETE");
  evidence(t, "unauthenticated", "DELETE", path, "nobody", res);
  assert.equal(res.status, 401);
});

test("admin hard-delete: non-admin callers get 403 and nothing is deleted", async (t) => {
  const path = `/superadmin/users/${a.student1.id}/hard`;
  for (const who of ["hod1", "faculty1", "student21"] as const) {
    const res = await call(path, who, "DELETE");
    evidence(t, `wrong role (${who})`, "DELETE", path, who, res);
    assert.equal(res.status, 403);
  }
  const [still] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, a.student1.id));
  assert.ok(still, "student1 must still exist after refused deletes");
});

test("admin hard-delete: admin cannot delete an HOD or another admin (403)", async (t) => {
  const hodPath = `/superadmin/users/${a.hod1.id}/hard`;
  const hodRes = await call(hodPath, "admin", "DELETE");
  evidence(t, "wrong target (HOD)", "DELETE", hodPath, "admin", hodRes);
  assert.equal(hodRes.status, 403);

  const selfPath = `/superadmin/users/${adminAccount.id}/hard`;
  const selfRes = await call(selfPath, "admin", "DELETE");
  evidence(t, "wrong target (admin, self)", "DELETE", selfPath, "admin", selfRes);
  assert.equal(selfRes.status, 403);

  const [hod] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, a.hod1.id));
  assert.ok(hod, "HOD must still exist");
});

test("admin hard-delete: nonexistent user gets 404", async (t) => {
  const path = `/superadmin/users/99999/hard`;
  const res = await call(path, "admin", "DELETE");
  evidence(t, "nonexistent row", "DELETE", path, "admin", res);
  assert.equal(res.status, 404);
});

test("admin hard-delete: admin permanently deletes a resident and their records (200)", async (t) => {
  await db.insert(caseLogsTable).values({
    studentId: a.student1.studentId!, date: "2026-09-01", patientUhid: "TEST-UHID", patientAge: "30",
    patientGender: "male", diagnosisProvisional: "Test", diagnosisFinal: "Test", status: "pending",
  });

  const path = `/superadmin/users/${a.student1.id}/hard`;
  const res = await call(path, "admin", "DELETE");
  evidence(t, "correct target (resident)", "DELETE", path, "admin", res);
  assert.equal(res.status, 200);
  assert.equal(res.body.deletedRecords.caseLogs, 1);
  assert.equal(res.body.deletedRecords.students, 1);
  assert.equal(res.body.deletedRecords.users, 1);

  assert.equal((await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, a.student1.studentId!))).length, 0);
  assert.equal((await db.select().from(studentsTable).where(eq(studentsTable.id, a.student1.studentId!))).length, 0);
  assert.equal((await db.select().from(usersTable).where(eq(usersTable.id, a.student1.id))).length, 0);

  // The same id a second time is now a nonexistent row.
  const again = await call(path, "admin", "DELETE");
  evidence(t, "nonexistent row (already deleted)", "DELETE", path, "admin", again);
  assert.equal(again.status, 404);
});

test("admin hard-delete: faculty's assignment types pass to their department's HOD", async (t) => {
  const [type] = await db.insert(assignmentTypesTable).values({
    departmentId: departmentIds[2], name: "Test type (admin delete)", description: "Test", createdBy: a.faculty2.id,
  }).returning();

  const path = `/superadmin/users/${a.faculty2.id}/hard`;
  const res = await call(path, "admin", "DELETE");
  evidence(t, "correct target (faculty)", "DELETE", path, "admin", res);
  assert.equal(res.status, 200);
  assert.equal(res.body.deletedRecords.users, 1);
  assert.equal(res.body.deletedRecords.assignmentTypesReassigned, 1);

  const [after] = await db.select({ createdBy: assignmentTypesTable.createdBy }).from(assignmentTypesTable).where(eq(assignmentTypesTable.id, type.id));
  assert.equal(after.createdBy, a.hod2.id, "assignment type must pass to the department HOD, not the admin");
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/users/:id/reactivate
// ---------------------------------------------------------------------------
test("admin reactivate: unauthenticated request gets 401", async (t) => {
  const path = `/superadmin/users/${a.student0.id}/reactivate`;
  const res = await call(path, undefined, "POST", {});
  evidence(t, "unauthenticated", "POST", path, "nobody", res);
  assert.equal(res.status, 401);
});

test("admin reactivate: non-admin caller and HOD target get 403", async (t) => {
  const path = `/superadmin/users/${a.student0.id}/reactivate`;
  const res = await call(path, "hod0", "POST", {});
  evidence(t, "wrong role (hod0)", "POST", path, "hod0", res);
  assert.equal(res.status, 403);

  const hodPath = `/superadmin/users/${a.hod0.id}/reactivate`;
  const hodRes = await call(hodPath, "admin", "POST", {});
  evidence(t, "wrong target (HOD)", "POST", hodPath, "admin", hodRes);
  assert.equal(hodRes.status, 403);
});

test("admin reactivate: nonexistent user gets 404", async (t) => {
  const path = `/superadmin/users/99999/reactivate`;
  const res = await call(path, "admin", "POST", {});
  evidence(t, "nonexistent row", "POST", path, "admin", res);
  assert.equal(res.status, 404);
});

test("admin reactivate: admin reactivates a deactivated faculty member (200); an active account is 409", async (t) => {
  const activePath = `/superadmin/users/${a.faculty0.id}/reactivate`;
  const active = await call(activePath, "admin", "POST", {});
  evidence(t, "account not deactivated", "POST", activePath, "admin", active);
  assert.equal(active.status, 409);

  const deactivated = await call(`/superadmin/users/${a.faculty0.id}/deactivate`, "admin", "POST", {});
  assert.equal(deactivated.status, 200);

  const res = await call(activePath, "admin", "POST", {});
  evidence(t, "correct target (deactivated faculty)", "POST", activePath, "admin", res);
  assert.equal(res.status, 200);

  const [row] = await db.select({ status: usersTable.status, sessionVersion: usersTable.sessionVersion }).from(usersTable).where(eq(usersTable.id, a.faculty0.id));
  assert.equal(row.status, "approved");
  assert.equal(row.sessionVersion, 2, "deactivate and reactivate each end existing sessions");
});
