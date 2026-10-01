import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, assignmentTypesTable, caseLogsTable, departmentsTable, studentsTable, usersTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; token: string; role: string; departmentId: number | null };
let mirrorId: number;
let mirrorHod: { id: number; token: string; role: string; departmentId: number };
let adminAccountId: number;

before(async () => {
  runtime = await setup();
  const passwordHash = await bcrypt.hash(password, 10);
  const [adminUser] = await db.insert(usersTable).values({
    fullName: "Management Test Admin", email: "management-admin@example.test", passwordHash,
    role: "admin", status: "approved", departmentId: null,
  }).returning({ id: usersTable.id });
  adminAccountId = adminUser.id;
  admin = { id: adminUser.id, token: jwt.sign({ id: adminUser.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }), role: "admin", departmentId: null };

  const [mirror] = await db.insert(departmentsTable).values({
    name: "Pediatrics (Management Test)", code: "TEST-MANAGEMENT-ONE", isTest: true,
    configSourceDepartmentId: departmentIds[0],
  }).returning();
  mirrorId = mirror.id;
  const [hod] = await db.insert(usersTable).values({
    fullName: "Management Test HOD", email: "management-test-hod@example.test", passwordHash,
    role: "hod", status: "approved", departmentId: mirrorId,
  }).returning({ id: usersTable.id });
  mirrorHod = { id: hod.id, token: jwt.sign({ id: hod.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }), role: "hod", departmentId: mirrorId };
});

after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

type TestResponse = { status: number; body: any; headers: Headers };
const apiRequest = (path: string, account?: any, method = "GET", body?: unknown) =>
  request(runtime.base, path, account, method, body) as Promise<TestResponse>;

const call = (path: string, who?: keyof typeof a | "admin", method = "GET", body?: unknown) => {
  const account = who === "admin" ? admin : who ? a[who] : undefined;
  return apiRequest(path, account, method, body);
};

let serial = 0;
async function createMirrorResident(status: "approved" | "pending" = "approved") {
  const suffix = `${Date.now()}-${serial++}`;
  const created = await call(`/superadmin/departments/${mirrorId}/students`, "admin", "POST", {
    fullName: "Synthetic Test Resident", email: `mirror-resident-${suffix}@example.test`, password,
    registrationNumber: `MIRROR-${suffix}`, batch: "2026", dateOfJoining: "2026-01-01",
    kuhsId: `MIRROR-KUHS-${suffix}`, approvalMode: status === "pending" ? "hod" : "automatic",
  });
  assert.equal(created.status, 201);
  return created.body.student as { id: number; status: string; email: string };
}

async function createMirrorProfessor() {
  const suffix = `${Date.now()}-${serial++}`;
  const created = await apiRequest("/admin/professors", mirrorHod, "POST", {
    fullName: "Synthetic Test Professor", email: `mirror-professor-${suffix}@example.test`,
  });
  assert.equal(created.status, 201);
  return created.body.professor as { id: number; fullName: string };
}

function evidence(t: TestContext, label: string, method: string, path: string, actor: string, response: { status: number; body: any }) {
  t.diagnostic(`${label}: ${method} /api${path} as ${actor} -> ${response.status} ${JSON.stringify({ message: response.body?.message })}`);
}

test("admin deactivation changes pending test residents and preserves their profile", async (t) => {
  const resident = await createMirrorResident("pending");
  const path = `/superadmin/users/${resident.id}/deactivate`;

  const unauthenticated = await call(path, undefined, "POST", {});
  evidence(t, "unauthenticated", "POST", path, "nobody", unauthenticated);
  assert.equal(unauthenticated.status, 401);

  const wrongRole = await call(path, "hod0", "POST", {});
  evidence(t, "wrong role", "POST", path, "HOD", wrongRole);
  assert.equal(wrongRole.status, 403);

  const [before] = await db.select({ sessionVersion: usersTable.sessionVersion }).from(usersTable).where(eq(usersTable.id, resident.id));
  const deactivated = await call(path, "admin", "POST", {});
  evidence(t, "admin deactivates pending test resident", "POST", path, "admin", deactivated);
  assert.equal(deactivated.status, 200);
  const [afterUser] = await db.select({ status: usersTable.status, sessionVersion: usersTable.sessionVersion })
    .from(usersTable).where(eq(usersTable.id, resident.id));
  assert.equal(afterUser.status, "rejected");
  assert.equal(afterUser.sessionVersion, before.sessionVersion + 1);
  assert.equal((await db.select().from(studentsTable).where(eq(studentsTable.userId, resident.id))).length, 1);

  const nonexistentPath = "/superadmin/users/999999999/deactivate";
  const nonexistent = await call(nonexistentPath, "admin", "POST", {});
  evidence(t, "nonexistent account", "POST", nonexistentPath, "admin", nonexistent);
  assert.equal(nonexistent.status, 404);

  const repeated = await call(path, "admin", "POST", {});
  assert.equal(repeated.status, 200);
  const [afterRepeat] = await db.select({ sessionVersion: usersTable.sessionVersion }).from(usersTable).where(eq(usersTable.id, resident.id));
  assert.equal(afterRepeat.sessionVersion, afterUser.sessionVersion);
});

test("deactivated test faculty can be reactivated but old impersonation sessions remain invalid", async () => {
  const professor = await createMirrorProfessor();
  const impersonation = await call(`/superadmin/users/${professor.id}/impersonate`, "admin", "POST", {});
  assert.equal(impersonation.status, 200);
  const oldSession = { id: professor.id, token: impersonation.body.token, role: "professor", departmentId: mirrorId };
  assert.equal((await apiRequest("/auth/me", oldSession)).status, 200);

  assert.equal((await call(`/superadmin/users/${professor.id}/deactivate`, "admin", "POST", {})).status, 200);
  assert.equal((await apiRequest("/auth/me", oldSession)).status, 401);

  const reactivated = await call(`/superadmin/users/${professor.id}/reactivate`, "admin", "POST", {});
  assert.equal(reactivated.status, 200);
  assert.equal((await apiRequest("/auth/me", oldSession)).status, 401);
  const [account] = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.id, professor.id));
  assert.equal(account.status, "approved");
});

test("admin can permanently delete a mirror resident without touching the parent department", async () => {
  const resident = await createMirrorResident("approved");
  const [profile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, resident.id));
  const parentResident = a.student0;
  const [parentBefore] = await db.select({ id: usersTable.id, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, parentResident.id));

  const path = `/superadmin/users/${resident.id}/hard`;
  const unauthenticated = await call(path, undefined, "DELETE");
  assert.equal(unauthenticated.status, 401);
  const wrongRole = await call(path, "hod0", "DELETE");
  assert.equal(wrongRole.status, 403);
  const deleted = await call(path, "admin", "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deletedRecords.students, 1);
  const missing = await call(path, "admin", "DELETE");
  assert.equal(missing.status, 404);

  assert.equal((await db.select().from(usersTable).where(eq(usersTable.id, resident.id))).length, 0);
  assert.equal((await db.select().from(studentsTable).where(eq(studentsTable.id, profile.id))).length, 0);
  const [parentAfter] = await db.select({ id: usersTable.id, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, parentResident.id));
  assert.deepEqual(parentAfter, parentBefore);
});

test("admin can delete a professor added by the test HOD and the cascade stays on that user", async () => {
  const professor = await createMirrorProfessor();
  const resident = await createMirrorResident("approved");
  const [profile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, resident.id));
  await db.insert(caseLogsTable).values({
    studentId: profile.id, date: "2026-09-01", patientUhid: "SYNTHETIC-TEST", patientAge: "Adult",
    patientGender: "other", diagnosisProvisional: "Synthetic test", diagnosisFinal: "Synthetic test",
    supervisorId: professor.id, status: "verified",
  });
  const [assignmentType] = await db.insert(assignmentTypesTable).values({
    departmentId: mirrorId, name: "Synthetic mirror assignment", description: "Synthetic fixture", createdBy: professor.id,
  }).returning({ id: assignmentTypesTable.id });

  const realCase = await db.insert(caseLogsTable).values({
    studentId: a.student0.studentId!, date: "2026-09-02", patientUhid: "SYNTHETIC-REAL-TEST", patientAge: "Adult",
    patientGender: "other", diagnosisProvisional: "Synthetic parent fixture", diagnosisFinal: "Synthetic parent fixture",
    supervisorId: a.faculty0.id, status: "verified",
  }).returning({ id: caseLogsTable.id });

  const path = `/superadmin/users/${professor.id}/hard`;
  const wrongTarget = await call(`/superadmin/users/${mirrorHod.id}/hard`, "admin", "DELETE");
  assert.equal(wrongTarget.status, 403);
  const deleted = await call(path, "admin", "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deletedRecords.caseLogs, 1);
  assert.equal(deleted.body.deletedRecords.assignmentTypesReassigned, 1);
  const [reassignedType] = await db.select({ createdBy: assignmentTypesTable.createdBy }).from(assignmentTypesTable)
    .where(eq(assignmentTypesTable.id, assignmentType.id));
  assert.equal(reassignedType.createdBy, mirrorHod.id);
  assert.equal((await db.select().from(caseLogsTable).where(eq(caseLogsTable.id, realCase[0].id))).length, 1);
  assert.equal((await db.select().from(usersTable).where(eq(usersTable.id, mirrorHod.id))).length, 1);
});

test("hard-delete uses the acting admin if the target mirror has no active HOD", async () => {
  const [mirrorWithoutHod] = await db.insert(departmentsTable).values({
    name: "Mirror Without HOD", code: "TEST-MANAGEMENT-NO-HOD", isTest: true,
    configSourceDepartmentId: departmentIds[1],
  }).returning();
  const passwordHash = await bcrypt.hash(password, 10);
  const [professor] = await db.insert(usersTable).values({
    fullName: "No HOD Test Professor", email: "no-hod-test-professor@example.test", passwordHash,
    role: "professor", status: "approved", departmentId: mirrorWithoutHod.id,
  }).returning({ id: usersTable.id });
  const [assignmentType] = await db.insert(assignmentTypesTable).values({
    departmentId: mirrorWithoutHod.id, name: "No HOD assignment", description: "Synthetic fixture", createdBy: professor.id,
  }).returning({ id: assignmentTypesTable.id });

  const deleted = await call(`/superadmin/users/${professor.id}/hard`, "admin", "DELETE");
  assert.equal(deleted.status, 200);
  const [reassignedType] = await db.select({ createdBy: assignmentTypesTable.createdBy }).from(assignmentTypesTable)
    .where(eq(assignmentTypesTable.id, assignmentType.id));
  assert.equal(reassignedType.createdBy, adminAccountId);
});
