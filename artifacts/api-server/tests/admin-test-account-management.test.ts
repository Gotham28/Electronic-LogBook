import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, DrizzleQueryError, eq, inArray } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, assignmentTypesTable, caseLogsTable, collegesTable, departmentsTable, studentsTable, usersTable, getTestCollegeId } from "./database.js";
import { buildCanonicalMirrorEmails, buildMirrorSafeName, provisionDepartment } from "../src/lib/department-provisioning.js";

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
    configSourceDepartmentId: departmentIds[0], collegeId: await getTestCollegeId(),
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
  t.diagnostic(`${label}: ${method} /api${path} as ${actor} -> ${response.status} ${JSON.stringify({
    message: response.body?.message,
    status: response.body?.status,
    mirrorDepartmentId: response.body?.mirrorDepartmentId,
  })}`);
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
    configSourceDepartmentId: departmentIds[1], collegeId: await getTestCollegeId(),
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

const generatedTestPassword = () => randomBytes(18).toString("base64url");

async function createRealWithMirrorWithoutProfessor(suffix: string) {
  const collegeId = await getTestCollegeId();
  const { departmentId: realDepartmentId } = await provisionDepartment({
    collegeId,
    name: `Psychiatry Check ${suffix}`,
    code: `PSY-${suffix}`,
    hod: { fullName: `HOD ${suffix}`, email: `hod-${suffix}@example.test` },
  }, generatedTestPassword());
  const [mirror] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId));
  assert.ok(mirror);
  await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")));
  return { collegeId, realDepartmentId, mirror };
}

test("restore-test-faculty authorization - 401 unauthenticated", async (t) => {
  const { realDepartmentId } = await createRealWithMirrorWithoutProfessor("auth401");
  const path = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;
  const res = await call(path, undefined, "POST", {});
  evidence(t, "unauthenticated", "POST", path, "nobody", res);
  assert.equal(res.status, 401);
});

test("restore-test-faculty authorization - 403 wrong role and cross-college scope", async (t) => {
  const { realDepartmentId } = await createRealWithMirrorWithoutProfessor("auth403");
  const path = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;

  const nonAdmin = await call(path, "hod0", "POST", {});
  evidence(t, "non-admin caller", "POST", path, "HOD", nonAdmin);
  assert.equal(nonAdmin.status, 403);

  const [otherCollege] = await db.insert(collegesTable).values({
    name: "Cross College Guard Check",
    code: "cross-college-guard-check",
    acceptingRegistrations: false,
  }).returning();
  const crossCollegePath = `${path}?collegeId=${otherCollege.id}`;
  const crossCollege = await call(crossCollegePath, "admin", "POST", {});
  evidence(t, "cross-college admin", "POST", crossCollegePath, "admin", crossCollege);
  assert.equal(crossCollege.status, 403);
});

test("restore-test-faculty authorization - 200 authorized admin creates and reports already_present", async (t) => {
  const { collegeId, realDepartmentId, mirror } = await createRealWithMirrorWithoutProfessor("auth200");
  const path = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;

  const created = await call(path, "admin", "POST", {});
  evidence(t, "authorized admin restore", "POST", path, "admin", created);
  assert.equal(created.status, 200);
  assert.equal(created.body.status, "created");
  assert.equal(created.body.mirrorDepartmentId, mirror.id);
  assert.equal(created.body.professor.status, "approved");

  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonicalProfEmail = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code)).professor;
  assert.equal(created.body.professor.email, canonicalProfEmail);

  const alreadyPresent = await call(path, "admin", "POST", {});
  evidence(t, "authorized admin repeat restore", "POST", path, "admin", alreadyPresent);
  assert.equal(alreadyPresent.status, 200);
  assert.equal(alreadyPresent.body.status, "already_present");
  assert.equal(alreadyPresent.body.professor.id, created.body.professor.id);
});

test("restore-test-faculty authorization - 404 nonexistent department and missing mirror", async (t) => {
  const nonexistentPath = "/superadmin/departments/999999999/restore-test-faculty";
  const nonexistent = await call(nonexistentPath, "admin", "POST", {});
  evidence(t, "nonexistent department", "POST", nonexistentPath, "admin", nonexistent);
  assert.equal(nonexistent.status, 404);

  const [noMirrorDept] = await db.insert(departmentsTable).values({
    name: "Dept Without Mirror",
    code: "NOMIRROR-ROUTE",
    isTest: false,
    collegeId: await getTestCollegeId(),
  }).returning();
  const missingMirrorPath = `/superadmin/departments/${noMirrorDept.id}/restore-test-faculty`;
  const missingMirror = await call(missingMirrorPath, "admin", "POST", {});
  evidence(t, "missing mirror", "POST", missingMirrorPath, "admin", missingMirror);
  assert.equal(missingMirror.status, 404);
});

test("restore-test-faculty handles concurrent requests and preserves deactivated faculty", async () => {
  const { realDepartmentId, mirror } = await createRealWithMirrorWithoutProfessor("concur");
  const path = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;

  const responses = await Promise.all([
    call(path, "admin", "POST", {}),
    call(path, "admin", "POST", {}),
  ]);
  assert.deepEqual(responses.map((r) => r.status), [200, 200]);
  assert.deepEqual(responses.map((r) => r.body.status).sort(), ["already_present", "created"]);

  const [prof] = await db.select().from(usersTable)
    .where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")));
  assert.ok(prof);
  assert.equal((await call(`/superadmin/users/${prof.id}/deactivate`, "admin", "POST", {})).status, 200);

  const afterDeactivate = await call(path, "admin", "POST", {});
  assert.equal(afterDeactivate.status, 200);
  assert.equal(afterDeactivate.body.status, "already_present");
  assert.equal(afterDeactivate.body.professor.status, "rejected");

  const professors = await db.select().from(usersTable)
    .where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")));
  assert.equal(professors.length, 1);
  assert.equal(professors[0].status, "rejected");
});

test("restore-test-faculty returns 409 on out-of-scope email collision without creating a row", async () => {
  const { collegeId, realDepartmentId, mirror } = await createRealWithMirrorWithoutProfessor("collision");
  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonicalProfEmail = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code)).professor;

  const passwordHash = await bcrypt.hash(generatedTestPassword(), 10);
  await db.insert(usersTable).values({
    fullName: "Out of Scope Collision User",
    email: canonicalProfEmail,
    passwordHash,
    role: "professor",
    status: "approved",
    departmentId: departmentIds[0],
  });

  const res = await call(`/superadmin/departments/${realDepartmentId}/restore-test-faculty`, "admin", "POST", {});
  assert.equal(res.status, 409);
  assert.match(res.body.message, /non-professor account in this test department/i);
  assert.match(res.body.message, /another department/i);
  assert.equal(res.body.message.includes(canonicalProfEmail), false);

  const mirrorProfs = await db.select().from(usersTable)
    .where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")));
  assert.equal(mirrorProfs.length, 0);
});

test("reset-test-credentials authorization and atomic canonical-only reset preserving custom logins", async (t) => {
  const collegeId = await getTestCollegeId();
  const { departmentId: realDepartmentId } = await provisionDepartment({
    collegeId,
    name: "Reset Scope Dept",
    code: "RESETSCOPE1",
    hod: { fullName: "Reset Scope HOD", email: "reset-scope-hod@example.test" },
  }, generatedTestPassword());
  const [mirror] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId));
  assert.ok(mirror);

  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code));

  const customResidentEmail = "custom-mirror-resident@example.test";
  const customResidentPass = randomBytes(18).toString("base64url");
  const customResidentCreated = await call(`/superadmin/departments/${mirror.id}/students`, "admin", "POST", {
    fullName: "Custom Mirror Resident",
    email: customResidentEmail,
    password: customResidentPass,
    registrationNumber: "CUSTOM-REG-1",
    batch: "2026",
    dateOfJoining: "2026-01-01",
    kuhsId: "CUSTOM-KUHS-1",
    approvalMode: "automatic",
  });
  assert.equal(customResidentCreated.status, 201);

  const customProfHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  const [customProf] = await db.insert(usersTable).values({
    fullName: "Custom Mirror Professor",
    email: "custom-mirror-prof-reset@example.test",
    passwordHash: customProfHash,
    role: "professor",
    status: "approved",
    departmentId: mirror.id,
  }).returning();

  const sentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  for (const email of [canonical.hod, canonical.professor, canonical.student]) {
    await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, email));
  }
  const [customResidentBefore] = await db.select().from(usersTable).where(eq(usersTable.email, customResidentEmail));

  const path = `/superadmin/departments/${realDepartmentId}/reset-test-credentials`;
  const unauthReset = await call(path, undefined, "POST", {});
  evidence(t, "unauthenticated reset", "POST", path, "nobody", unauthReset);
  assert.equal(unauthReset.status, 401);

  const wrongRoleReset = await call(path, "hod0", "POST", {});
  evidence(t, "non-admin reset", "POST", path, "HOD", wrongRoleReset);
  assert.equal(wrongRoleReset.status, 403);

  const [otherCollege] = await db.insert(collegesTable).values({
    name: "Reset Cross College Check",
    code: "reset-cross-college-check",
    acceptingRegistrations: false,
  }).returning();
  const crossCollegePath = `${path}?collegeId=${otherCollege.id}`;
  const crossCollegeReset = await call(crossCollegePath, "admin", "POST", {});
  evidence(t, "cross-college query reset", "POST", crossCollegePath, "admin", crossCollegeReset);
  assert.equal(crossCollegeReset.status, 403);

  const nonexistentResetPath = "/superadmin/departments/999999999/reset-test-credentials";
  const nonexistentReset = await call(nonexistentResetPath, "admin", "POST", {});
  evidence(t, "nonexistent dept reset", "POST", nonexistentResetPath, "admin", nonexistentReset);
  assert.equal(nonexistentReset.status, 404);

  const reset = await call(path, "admin", "POST", {});
  evidence(t, "authorized admin reset", "POST", path, "admin", reset);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.mirrorCode, mirror.code);

  for (const email of [canonical.hod, canonical.professor, canonical.student]) {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    assert.ok(row?.passwordHash);
    assert.equal(await bcrypt.compare(mirror.code, row.passwordHash!), true);
  }

  const [customResidentAfter] = await db.select().from(usersTable).where(eq(usersTable.email, customResidentEmail));
  assert.equal(customResidentAfter.email, customResidentEmail);
  assert.equal(customResidentAfter.passwordHash, customResidentBefore.passwordHash);

  const [customProfAfter] = await db.select().from(usersTable).where(eq(usersTable.id, customProf.id));
  assert.equal(customProfAfter.email, "custom-mirror-prof-reset@example.test");
  assert.equal(customProfAfter.passwordHash, customProfHash);
});

test("reset-test-credentials preserves body collegeId compatibility without query string", async (t) => {
  const collegeId = await getTestCollegeId();
  const { departmentId: realDepartmentId } = await provisionDepartment({
    collegeId,
    name: "Reset Body Scope Dept",
    code: "RESETBODY1",
    hod: { fullName: "Reset Body HOD", email: "reset-body-hod@example.test" },
  }, generatedTestPassword());
  const [mirror] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId));
  assert.ok(mirror);

  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code));
  const sentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, canonical.hod));

  const [otherCollege] = await db.insert(collegesTable).values({
    name: "Reset Body Wrong College",
    code: "reset-body-wrong-college",
    acceptingRegistrations: false,
  }).returning();

  const rawReset = (query: string, body: unknown) =>
    fetch(`${runtime.base}/api/superadmin/departments/${realDepartmentId}/reset-test-credentials${query}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() as any }));

  const wrongBodyCollege = await rawReset("", { collegeId: otherCollege.id });
  evidence(t, "wrong college in reset body", "POST", `/superadmin/departments/${realDepartmentId}/reset-test-credentials`, "admin", wrongBodyCollege);
  assert.equal(wrongBodyCollege.status, 403);

  const [afterWrongBody] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, canonical.hod));
  assert.equal(afterWrongBody.passwordHash, sentinelHash);

  const mismatchedQueryAndBody = await rawReset(`?collegeId=${collegeId}`, { collegeId: otherCollege.id });
  assert.equal(mismatchedQueryAndBody.status, 403);

  const unknownBodyKey = await rawReset(`?collegeId=${collegeId}`, { unexpectedField: true });
  assert.equal(unknownBodyKey.status, 400);

  const bodyOnlySuccess = await rawReset("", { collegeId });
  evidence(t, "body collegeId reset without query", "POST", `/superadmin/departments/${realDepartmentId}/reset-test-credentials`, "admin", bodyOnlySuccess);
  assert.equal(bodyOnlySuccess.status, 200);
  assert.equal(bodyOnlySuccess.body.mirrorCode, mirror.code);

  const [afterBodyReset] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, canonical.hod));
  assert.ok(afterBodyReset.passwordHash);
  assert.equal(await bcrypt.compare(mirror.code, afterBodyReset.passwordHash!), true);
});

test("ambiguous linked mirrors fail closed across listing, restore, and reset without mutation", async (t) => {
  const collegeId = await getTestCollegeId();
  const { departmentId: realDepartmentId } = await provisionDepartment({
    collegeId,
    name: "Ambiguous Route Dept",
    code: "AMBIGROUTE1",
    hod: { fullName: "Ambig Route HOD", email: "ambig-route-hod@example.test" },
  }, generatedTestPassword());

  const [mirrorOne] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId));
  assert.ok(mirrorOne);
  await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorOne.id), eq(usersTable.role, "professor")));

  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonicalOne = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirrorOne.code));
  const sentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, canonicalOne.hod));

  const [mirrorTwo] = await db.insert(departmentsTable).values({
    name: "Ambiguous Route Dept (Test 2)",
    code: `TEST-AMBIG-${realDepartmentId}`,
    collegeId,
    isTest: true,
    configSourceDepartmentId: realDepartmentId,
  }).returning();
  const dupHodHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  const [mirrorTwoHod] = await db.insert(usersTable).values({
    fullName: "Duplicate Mirror HOD",
    email: `dup-mirror-hod-${realDepartmentId}@example.test`,
    passwordHash: dupHodHash,
    role: "hod",
    status: "approved",
    departmentId: mirrorTwo.id,
  }).returning();

  const list = await call("/superadmin/departments", "admin", "GET");
  assert.equal(list.status, 200);
  const deptEntry = (list.body as any[]).find((d) => d.id === realDepartmentId);
  assert.ok(deptEntry);
  assert.equal(deptEntry.mirrorAmbiguous, true);
  assert.equal(deptEntry.mirrorDepartmentId, null);
  assert.equal(deptEntry.mirrorCode, null);
  assert.equal(deptEntry.mirrorDefaultEmails, null);

  const restorePath = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;
  assert.equal((await call(restorePath, undefined, "POST", {})).status, 401);
  assert.equal((await call(restorePath, "hod0", "POST", {})).status, 403);
  const ambiguousRestore = await call(restorePath, "admin", "POST", {});
  evidence(t, "ambiguous mirror restore", "POST", restorePath, "admin", ambiguousRestore);
  assert.equal(ambiguousRestore.status, 409);

  const resetPath = `/superadmin/departments/${realDepartmentId}/reset-test-credentials`;
  assert.equal((await call(resetPath, undefined, "POST", {})).status, 401);
  assert.equal((await call(resetPath, "hod0", "POST", {})).status, 403);
  const ambiguousReset = await call(resetPath, "admin", "POST", {});
  evidence(t, "ambiguous mirror reset", "POST", resetPath, "admin", ambiguousReset);
  assert.equal(ambiguousReset.status, 409);

  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorOne.id), eq(usersTable.role, "professor")))).length, 0);
  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorTwo.id), eq(usersTable.role, "professor")))).length, 0);
  const [hodOneAfter] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, canonicalOne.hod));
  assert.equal(hodOneAfter.passwordHash, sentinelHash);
  const [hodTwoAfter] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, mirrorTwoHod.id));
  assert.equal(hodTwoAfter.passwordHash, dupHodHash);
});

test("GET /superadmin/departments returns mirrorDefaultEmails without resetting test credentials", async () => {
  const collegeId = await getTestCollegeId();
  const { departmentId: realDepartmentId } = await provisionDepartment({
    collegeId,
    name: "Browse No Reset Dept",
    code: "BROWSENORESET1",
    hod: { fullName: "Browse No Reset HOD", email: "browse-no-reset-hod@example.test" },
  }, generatedTestPassword());
  const [mirror] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId));
  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code));

  const sentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, canonical.hod));

  const list = await call("/superadmin/departments", "admin", "GET");
  assert.equal(list.status, 200);
  const deptEntry = (list.body as any[]).find((d) => d.id === realDepartmentId);
  assert.ok(deptEntry);
  assert.deepEqual(deptEntry.mirrorDefaultEmails, canonical);

  const [afterList] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, canonical.hod));
  assert.equal(afterList.passwordHash, sentinelHash);
});

test("restore-test-faculty and reset-test-credentials bind to expectedMirrorDepartmentId and return 409 on stale targets", async (t) => {
  const { collegeId, realDepartmentId, mirror: originalMirror } = await createRealWithMirrorWithoutProfessor("stalebind");
  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));

  const restorePath = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;
  const resetPath = `/superadmin/departments/${realDepartmentId}/reset-test-credentials`;

  assert.equal((await call(restorePath, "admin", "POST", { expectedMirrorDepartmentId: -1 })).status, 400);
  assert.equal((await call(resetPath, "admin", "POST", { expectedMirrorDepartmentId: -1 })).status, 400);

  const originalUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.departmentId, originalMirror.id));
  if (originalUsers.length) {
    await db.delete(studentsTable).where(inArray(studentsTable.userId, originalUsers.map((u) => u.id)));
    await db.delete(usersTable).where(eq(usersTable.departmentId, originalMirror.id));
  }
  await db.delete(departmentsTable).where(eq(departmentsTable.id, originalMirror.id));

  const replacementCode = `TEST-REPL-ROUTE-${realDepartmentId}`;
  const [replacementMirror] = await db.insert(departmentsTable).values({
    name: "Replaced Route Mirror",
    code: replacementCode,
    collegeId,
    isTest: true,
    configSourceDepartmentId: realDepartmentId,
  }).returning();
  const replacementCanonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, replacementCode));
  const sentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
  const [replacementHod] = await db.insert(usersTable).values({
    fullName: "Test HOD",
    email: replacementCanonical.hod,
    passwordHash: sentinelHash,
    role: "hod",
    status: "approved",
    departmentId: replacementMirror.id,
  }).returning({ id: usersTable.id });

  const staleRestore = await call(restorePath, "admin", "POST", { expectedMirrorDepartmentId: originalMirror.id });
  evidence(t, "stale mirror restore", "POST", restorePath, "admin", staleRestore);
  assert.equal(staleRestore.status, 409);
  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, replacementMirror.id), eq(usersTable.role, "professor")))).length, 0);

  const staleReset = await call(resetPath, "admin", "POST", { expectedMirrorDepartmentId: originalMirror.id });
  evidence(t, "stale mirror reset", "POST", resetPath, "admin", staleReset);
  assert.equal(staleReset.status, 409);
  const [hodAfterStaleReset] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, replacementHod.id));
  assert.equal(hodAfterStaleReset.passwordHash, sentinelHash);

  // Supplying another college's mirror ID as expectedMirrorDepartmentId must fail closed without touching either mirror
  const [otherCollege] = await db.insert(collegesTable).values({
    name: "Stale Expected Other College",
    code: "stale-expected-other-college",
    acceptingRegistrations: false,
  }).returning();
  const { departmentId: otherDeptId } = await provisionDepartment({
    collegeId: otherCollege.id,
    name: "Other College Dept",
    code: "OTHERMIRR1",
    hod: { fullName: "Other College HOD", email: "other-college-mirr-hod@example.test" },
  }, generatedTestPassword());
  const [otherMirror] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, otherDeptId));
  await db.delete(usersTable).where(and(eq(usersTable.departmentId, otherMirror.id), eq(usersTable.role, "professor")));

  const crossMirrorRestore = await call(restorePath, "admin", "POST", { expectedMirrorDepartmentId: otherMirror.id });
  assert.equal(crossMirrorRestore.status, 409);
  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, replacementMirror.id), eq(usersTable.role, "professor")))).length, 0);
  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, otherMirror.id), eq(usersTable.role, "professor")))).length, 0);

  // Matching expectedMirrorDepartmentId succeeds
  const matchedRestore = await call(restorePath, "admin", "POST", { expectedMirrorDepartmentId: replacementMirror.id });
  assert.equal(matchedRestore.status, 200);
  assert.equal(matchedRestore.body.status, "created");
  assert.equal(matchedRestore.body.mirrorDepartmentId, replacementMirror.id);

  const matchedReset = await fetch(`${runtime.base}/api${resetPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ collegeId, expectedMirrorDepartmentId: replacementMirror.id }),
  }).then(async (r) => ({ status: r.status, body: await r.json() as any }));
  assert.equal(matchedReset.status, 200);
  assert.equal(matchedReset.body.mirrorCode, replacementMirror.code);

  const [hodAfterMatchedReset] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, replacementHod.id));
  assert.ok(hodAfterMatchedReset.passwordHash);
  assert.equal(await bcrypt.compare(replacementMirror.code, hodAfterMatchedReset.passwordHash!), true);

  // Existing callers sending no request body (with JSON Content-Type) remain compatible; headerless writes are rejected with 415
  const noBodyRestore = await fetch(`${runtime.base}/api${restorePath}?collegeId=${collegeId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
  });
  assert.equal(noBodyRestore.status, 200);
  const noBodyRestoreJson = await noBodyRestore.json() as any;
  assert.equal(noBodyRestoreJson.status, "already_present");
  assert.equal(noBodyRestoreJson.mirrorDepartmentId, replacementMirror.id);

  const noBodyReset = await fetch(`${runtime.base}/api${resetPath}?collegeId=${collegeId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
  });
  assert.equal(noBodyReset.status, 200);
  const noBodyResetJson = await noBodyReset.json() as any;
  assert.equal(noBodyResetJson.mirrorCode, replacementMirror.code);

  const headerlessRestore = await fetch(`${runtime.base}/api${restorePath}?collegeId=${collegeId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert.equal(headerlessRestore.status, 415);

  const headerlessReset = await fetch(`${runtime.base}/api${resetPath}?collegeId=${collegeId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert.equal(headerlessReset.status, 415);
});

test("restore-test-faculty returns 409 when a non-professor account in the same mirror uses the canonical professor email", async (t) => {
  const { collegeId, realDepartmentId, mirror } = await createRealWithMirrorWithoutProfessor("samemirrorcol");
  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonicalProfEmail = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code)).professor;

  await db.update(usersTable)
    .set({ email: canonicalProfEmail })
    .where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "hod")));

  const path = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;
  const res = await call(path, "admin", "POST", {});
  evidence(t, "same-mirror non-professor collision", "POST", path, "admin", res);
  assert.equal(res.status, 409);
  assert.match(res.body.message, /non-professor account in this test department/i);
  assert.match(res.body.message, /another department/i);
  assert.equal(res.body.message.includes(canonicalProfEmail), false);
  assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")))).length, 0);
});

test("restore-test-faculty and reset-test-credentials return retryable 409 on SQLSTATE 55P03 without mutating accounts", async (t) => {
  // Synthetic PGlite unit simulation of PostgreSQL SQLSTATE 55P03 (lock_not_available);
  // PGlite uses a single connection, so real multi-connection lock contention proof requires PostgreSQL.
  const { collegeId, realDepartmentId, mirror } = await createRealWithMirrorWithoutProfessor("route55p03");
  const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
  const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDepartmentId, college.code, mirror.code));

  const sentinelHash = await bcrypt.hash(generatedTestPassword(), 10);
  await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, canonical.hod));

  const originalTransaction = db.transaction.bind(db);
  let nowaitIntercepts = 0;

  (db as any).transaction = async (callback: (tx: any) => Promise<any>, config?: any) =>
    originalTransaction(async (tx: any) => {
      const originalSelect = tx.select.bind(tx);
      const wrappedTx = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop !== "select") return Reflect.get(target, prop, receiver);
          return (...selectArgs: any[]) => {
            const qb = originalSelect(...selectArgs);
            const originalFrom = qb.from.bind(qb);
            qb.from = (table: any) => {
              const fromBuilder = originalFrom(table);
              if (table !== usersTable) return fromBuilder;
              const originalFor = fromBuilder.for.bind(fromBuilder);
              fromBuilder.for = (strength: string, lockConfig?: { noWait?: boolean }) => {
                const lockedBuilder = originalFor(strength, lockConfig);
                if (strength === "update" && lockConfig?.noWait === true) {
                  nowaitIntercepts += 1;
                  const sqlText = lockedBuilder.toSQL().sql;
                  const rejectNowait = () => {
                    const pgErr = Object.assign(new Error('could not obtain lock on row in relation "users"'), { code: "55P03" });
                    return Promise.reject(new DrizzleQueryError(sqlText, [], pgErr));
                  };
                  return new Proxy(lockedBuilder, {
                    get(lockTarget, lockProp) {
                      if (lockProp === "then") {
                        return (onFulfilled: any, onRejected: any) => rejectNowait().then(onFulfilled, onRejected);
                      }
                      if (lockProp === "limit") {
                        return () => ({
                          then: (onFulfilled: any, onRejected: any) => rejectNowait().then(onFulfilled, onRejected),
                        });
                      }
                      return Reflect.get(lockTarget, lockProp);
                    },
                  });
                }
                return lockedBuilder;
              };
              return fromBuilder;
            };
            return qb;
          };
        },
      });
      return callback(wrappedTx);
    }, config);

  try {
    const resetPath = `/superadmin/departments/${realDepartmentId}/reset-test-credentials`;
    const resetConflict = await call(resetPath, "admin", "POST", { expectedMirrorDepartmentId: mirror.id });
    evidence(t, "55P03 lock conflict reset", "POST", resetPath, "admin", resetConflict);
    assert.equal(resetConflict.status, 409);
    assert.match(resetConflict.body.message, /try again/i);
    assert.equal(resetConflict.body.message.includes(mirror.code), false);
    assert.equal(resetConflict.body.message.includes(canonical.hod), false);

    const [hodAfter] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, canonical.hod));
    assert.equal(hodAfter.passwordHash, sentinelHash);

    const restorePath = `/superadmin/departments/${realDepartmentId}/restore-test-faculty`;
    const restoreConflict = await call(restorePath, "admin", "POST", { expectedMirrorDepartmentId: mirror.id });
    evidence(t, "55P03 lock conflict restore", "POST", restorePath, "admin", restoreConflict);
    assert.equal(restoreConflict.status, 409);
    assert.match(restoreConflict.body.message, /try again/i);
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirror.id), eq(usersTable.role, "professor")))).length, 0);
    assert.equal(nowaitIntercepts, 2);
  } finally {
    (db as any).transaction = originalTransaction;
  }
});
