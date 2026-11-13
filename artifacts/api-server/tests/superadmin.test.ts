import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds, password, sentEmails, simulateFailure } from "./support.js";
import { engine, db, collegesTable, usersTable, studentsTable, caseLogsTable, departmentsTable, departmentConfigsTable, departmentCatalogTable, procedureTypesTable, assignmentTypesTable, assignmentsTable, assignmentRecipientsTable, departmentPostingScheduleTable, departmentLogbookSectionsTable } from "./database.js";
import { eq, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string };
let testCollegeId: number;
before(async () => {
  runtime = await setup();
  testCollegeId = (await db.select({ id: collegesTable.id }).from(collegesTable))[0].id;
  // Create an admin account for testing. This mirrors what provision-admin.ts
  // would do in production but uses the test database directly.
  const hash = await bcrypt.hash(password, 10);
  const [admin] = await db.insert(usersTable).values({
    fullName: "Test Admin", email: "admin@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash,
  }).returning();
  adminAccount = {
    id: admin.id,
    token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "admin", method?: string, body?: unknown) => {
  const account = who === "admin"
    ? { ...adminAccount, role: "admin", email: "admin@example.test", departmentId: 0 }
    : who ? a[who] : undefined;
  const scopedPath = path.startsWith("/superadmin/") && !path.startsWith("/superadmin/colleges") && !path.startsWith("/superadmin/announcements")
    ? `${path}${path.includes("?") ? "&" : "?"}collegeId=${testCollegeId}` : path;
  let scopedBody = body as any;
  if (scopedPath.includes("/superadmin/departments/backfill-test-departments")) scopedBody = { ...(scopedBody ?? {}), collegeId: testCollegeId };
  if (path === "/superadmin/departments" && scopedBody?.setup) scopedBody = { ...scopedBody, setup: { ...scopedBody.setup, collegeId: testCollegeId } };
  return request(runtime.base, scopedPath, account as any, method, scopedBody);
};

const reportScopeCase = (label: string, method: string, path: string, response: { status: number; body: unknown }) => {
  console.log(`${label}: ${method} ${path} -> ${response.status} ${JSON.stringify(response.body)}`);
};

// =========================================================================
// 1. Role gating: HOD, professor, and student get 403 on every admin route
// =========================================================================
test("HOD, professor, and student accounts get 403 on every superadmin route", async () => {
  const routes: Array<[string, string]> = [
    ["/superadmin/departments", "GET"],
    ["/superadmin/departments", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/replace-hod", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/roster", "GET"],
    ["/superadmin/departments/" + departmentIds[0] + "/users/" + a.faculty0.id + "/name", "PATCH"],
    ["/superadmin/departments/" + departmentIds[0] + "/faculty", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/students", "POST"],
    ["/superadmin/users/" + a.student0.id + "/deactivate", "POST"],
    ["/superadmin/departments/" + departmentIds[0], "DELETE"],
  ];
  for (const role of ["hod0", "faculty0", "student0"] as const) {
    for (const [path, method] of routes) {
      const res = await call(path, role, method, method !== "GET" ? {} : undefined);
      assert.equal(res.status, 403, `${role} on ${method} ${path} should be 403, got ${res.status}`);
    }
  }
});

test("selected college scope returns 401, 403, 200 and 404 for the four roster cases", async () => {
  const collegeCreated = await call("/superadmin/colleges", "admin", "POST", {
    name: "Scope Test College", acceptingRegistrations: false,
  });
  assert.equal(collegeCreated.status, 201);
  const collegeB = collegeCreated.body as { id: number; name: string; acceptingRegistrations: boolean };
  const [collegeBRow] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeB.id));
  assert.equal(collegeBRow.code, "scope-test-college", "the internal code is generated from the college name");
  const collegeUpdated = await call(`/superadmin/colleges/${collegeB.id}`, "admin", "PATCH", {
    name: "Scope Test College Updated", acceptingRegistrations: true,
  });
  assert.equal(collegeUpdated.status, 200);
  assert.equal(collegeUpdated.body.acceptingRegistrations, true);
  const [departmentB] = await db.insert(departmentsTable).values({ name: "Scope Test Department", code: "SCOPE-TEST", collegeId: collegeB.id }).returning();
  const blockedCollegeDelete = await call(`/superadmin/colleges/${collegeB.id}`, "admin", "DELETE");
  reportScopeCase("Admin attempts to delete a college with departments", "DELETE", `/superadmin/colleges/${collegeB.id}`, blockedCollegeDelete);
  assert.equal(blockedCollegeDelete.status, 409);
  assert.match(blockedCollegeDelete.body.message, /delete all departments/i);
  const path = `/superadmin/departments/${departmentB.id}/roster`;

  const unauthenticated = await request(runtime.base, `${path}?collegeId=${collegeB.id}`, undefined, "GET");
  reportScopeCase("Unauthenticated roster request", "GET", `${path}?collegeId=${collegeB.id}`, unauthenticated);
  assert.equal(unauthenticated.status, 401);

  const wrongCollege = await request(runtime.base, `${path}?collegeId=${testCollegeId}`, adminAccount as any, "GET");
  reportScopeCase("Admin selected a different college", "GET", `${path}?collegeId=${testCollegeId}`, wrongCollege);
  assert.equal(wrongCollege.status, 403);

  const correctCollege = await request(runtime.base, `${path}?collegeId=${collegeB.id}`, adminAccount as any, "GET");
  reportScopeCase("Admin selected the department's college", "GET", `${path}?collegeId=${collegeB.id}`, correctCollege);
  assert.equal(correctCollege.status, 200);

  const nonexistentPath = `/superadmin/departments/999999/roster?collegeId=${collegeB.id}`;
  const nonexistentDepartment = await request(runtime.base, nonexistentPath, adminAccount as any, "GET");
  reportScopeCase("Admin requested a nonexistent department", "GET", nonexistentPath, nonexistentDepartment);
  assert.equal(nonexistentDepartment.status, 404);

  const [userB] = await db.insert(usersTable).values({
    fullName: "Scoped College User", email: "scoped-college-user@example.test", passwordHash: "test-hash",
    role: "professor", status: "approved", departmentId: departmentB.id,
  }).returning({ id: usersTable.id });
  const userPath = `/superadmin/users/${userB.id}/deactivate`;
  const userUnauthenticatedPath = `${userPath}?collegeId=${collegeB.id}`;
  const userUnauthenticated = await request(runtime.base, userUnauthenticatedPath, undefined, "POST", {});
  reportScopeCase("Unauthenticated user action", "POST", userUnauthenticatedPath, userUnauthenticated);
  assert.equal(userUnauthenticated.status, 401);
  const userWrongCollegePath = `${userPath}?collegeId=${testCollegeId}`;
  const userWrongCollege = await request(runtime.base, userWrongCollegePath, adminAccount as any, "POST", {});
  reportScopeCase("Admin selected a different college for a user action", "POST", userWrongCollegePath, userWrongCollege);
  assert.equal(userWrongCollege.status, 403);
  const userCorrectCollegePath = `${userPath}?collegeId=${collegeB.id}`;
  const userCorrectCollege = await request(runtime.base, userCorrectCollegePath, adminAccount as any, "POST", {});
  reportScopeCase("Admin selected the user's college", "POST", userCorrectCollegePath, userCorrectCollege);
  assert.equal(userCorrectCollege.status, 200);
  const missingUserPath = `/superadmin/users/999999/deactivate?collegeId=${collegeB.id}`;
  const missingUser = await request(runtime.base, missingUserPath, adminAccount as any, "POST", {});
  reportScopeCase("Admin requested a nonexistent user", "POST", missingUserPath, missingUser);
  assert.equal(missingUser.status, 404);

  const mismatchedCreate = await request(runtime.base, `/superadmin/departments?collegeId=${collegeB.id}`, adminAccount as any, "POST", {
    setup: { collegeId: testCollegeId, name: "Mismatched Department", code: "MISMATCHED", hod: { fullName: "Test HOD", email: "mismatch@example.test" } },
  });
  assert.equal(mismatchedCreate.status, 403);

  await db.insert(departmentPostingScheduleTable).values({ departmentId: departmentIds[0], trainingYear: 1, postingValue: "test-unit", months: 2 });
  await db.insert(departmentLogbookSectionsTable).values({ departmentId: departmentIds[0], value: "test-section", definition: { fields: [] } });
  const sourceConfig = (await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentIds[0])))[0];
  const sourceCatalogCount = (await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, departmentIds[0]))).length;
  const sourceProcedureCount = (await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, departmentIds[0]))).length;
  const copied = await request(runtime.base, `/superadmin/departments?collegeId=${collegeB.id}`, adminAccount as any, "POST", {
    setup: { collegeId: collegeB.id, copyFromDepartmentId: departmentIds[0], name: "Copied Settings Department", code: "COPIED-SETTINGS",
      hod: { fullName: "Copied Test HOD", email: "copied-settings-hod@example.test" } },
  });
  assert.equal(copied.status, 201);
  const copiedDepartmentId = copied.body.departmentId as number;
  const copiedConfig = (await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, copiedDepartmentId)))[0];
  assert.equal(copiedConfig.requiredCases, sourceConfig.requiredCases);
  assert.equal(copiedConfig.requiredProcedures, sourceConfig.requiredProcedures);
  assert.deepEqual(copiedConfig.enabledFeatures, sourceConfig.enabledFeatures);
  assert.equal((await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, copiedDepartmentId))).length, sourceCatalogCount);
  assert.equal((await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, copiedDepartmentId))).length, sourceProcedureCount);
  assert.equal((await db.select().from(departmentPostingScheduleTable).where(eq(departmentPostingScheduleTable.departmentId, copiedDepartmentId))).length, 1);
  assert.equal((await db.select().from(departmentLogbookSectionsTable).where(eq(departmentLogbookSectionsTable.departmentId, copiedDepartmentId))).length, 1);
  assert.equal((await db.select().from(usersTable).where(eq(usersTable.departmentId, copiedDepartmentId))).length, 1);
  await db.update(departmentConfigsTable).set({ requiredCases: 999 }).where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
  assert.equal((await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, copiedDepartmentId)))[0].requiredCases,
    sourceConfig.requiredCases, "later source edits must not affect copied settings");
  await db.update(departmentConfigsTable).set({ requiredCases: sourceConfig.requiredCases }).where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
});

test("college deletion requires platform admin access and an empty college", async () => {
  const first = await call("/superadmin/colleges", "admin", "POST", { name: "Delete Ready College" });
  assert.equal(first.status, 201);
  const [firstRow] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, first.body.id));
  assert.equal(firstRow.code, "delete-ready-college");
  const second = await call("/superadmin/colleges", "admin", "POST", { name: "Delete Ready College" });
  assert.equal(second.status, 201);
  const [secondRow] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, second.body.id));
  assert.equal(secondRow.code, "delete-ready-college-2", "same-name colleges receive a unique generated code");

  const path = `/superadmin/colleges/${second.body.id}`;
  const unauthenticated = await request(runtime.base, path, undefined, "DELETE");
  reportScopeCase("Unauthenticated college deletion", "DELETE", path, unauthenticated);
  assert.equal(unauthenticated.status, 401);
  const wrongRole = await call(path, "hod0", "DELETE");
  reportScopeCase("Non-admin college deletion", "DELETE", path, wrongRole);
  assert.equal(wrongRole.status, 403);
  const allowed = await call(path, "admin", "DELETE");
  reportScopeCase("Admin deletes an empty college", "DELETE", path, allowed);
  assert.equal(allowed.status, 200);
  const missing = await call("/superadmin/colleges/999999", "admin", "DELETE");
  reportScopeCase("Admin deletes a nonexistent college", "DELETE", "/superadmin/colleges/999999", missing);
  assert.equal(missing.status, 404);

  const [stillPresent] = await db.select({ id: collegesTable.id }).from(collegesTable).where(eq(collegesTable.id, first.body.id));
  assert.ok(stillPresent, "deleting one college must not affect another college");
  assert.equal((await call(`/superadmin/colleges/${first.body.id}`, "admin", "DELETE")).status, 200);
});

// =========================================================================
// 2. Admin gets 403 on HOD-only student approve/reject
// =========================================================================
test("admin account gets 403 on HOD-only student approve/reject routes", async () => {
  const pendingId = a.pending0.id;
  assert.equal((await call("/admin/students/" + pendingId + "/approve", "admin", "POST")).status, 403);
  assert.equal((await call("/admin/students/" + pendingId + "/reject", "admin", "POST")).status, 403);
  assert.equal((await call("/admin/roster", "admin")).status, 403);
});

// =========================================================================
// 3. Admin can list departments with HODs
// =========================================================================
test("admin can list all departments with their current HOD and mirror test department ids", async () => {
  // Backfill to ensure some mirrors exist
  const backfillRes = await call("/superadmin/departments/backfill-test-departments", "admin", "POST", {});
  assert.equal(backfillRes.status, 200);

  const res = await call("/superadmin/departments", "admin");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 3);
  
  const failedDeptIds = new Set((backfillRes.body.failed || []).map((f: any) => f.departmentId));

  // Each department has an hod field and mirrorDepartmentId
  for (const dept of res.body) {
    assert.ok(dept.id);
    assert.ok(dept.name);
    assert.ok(dept.code);
    assert.strictEqual(dept.isTest, undefined, "isTest should not be returned");
    if (failedDeptIds.has(dept.id)) {
      assert.ok(dept.mirrorDepartmentId === null || typeof dept.mirrorDepartmentId === "number", "mirrorDepartmentId should be null or number for failed seed departments");
    } else {
      assert.ok(typeof dept.mirrorDepartmentId === "number", "mirrorDepartmentId should be a number after backfilling");
    }
    if (dept.hod) {
      assert.ok(dept.hod.id);
      assert.ok(dept.hod.fullName);
      assert.ok(dept.hod.email);
    }
  }

  // Create a new department and confirm it gets a mirror automatically, per Task A's auto-provisioning
  const createRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "No Mirror Dept", code: "NO-MIRROR", hod: { fullName: "No Mirror", email: "nomirror@example.test" } },
  });
  assert.equal(createRes.status, 201);
  
  const res2 = await call("/superadmin/departments", "admin");
  const newDept = res2.body.find((d: any) => d.id === createRes.body.departmentId);
  assert.ok(newDept);
  assert.ok(typeof newDept.mirrorDepartmentId === "number", "a freshly created department should already have a mirror, per provisionDepartment()'s synchronous auto-provisioning");
});

// =========================================================================
// 4. Admin can create a department via provisionDepartment
// =========================================================================
test("admin can create a department with HOD via the API", async () => {
  const emailStart = sentEmails.length;
  const res = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Superadmin Created Dept", code: "SADMIN-TEST", hod: { fullName: "New HOD", email: "newhod@example.test" } },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.departmentId);
  assert.ok(res.body.hodId);
  const welcome = sentEmails.slice(emailStart).find((email) => email.to === "newhod@example.test");
  const generatedPassword = welcome?.text.match(/^Password:\s*(\S+)$/m)?.[1];
  assert.ok(generatedPassword, "the HOD welcome email must contain the generated initial password");
  assert.equal(/^[A-Za-z0-9_-]{32}$/.test(generatedPassword!), true, "the HOD password must be 32 URL-safe characters");
  assert.ok(!JSON.stringify(res.body).includes(generatedPassword!), "the API response must not disclose the generated password");

  // Verify the HOD was created correctly
  const [hod] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.hodId));
  assert.equal(hod.role, "hod");
  assert.equal(hod.status, "approved");
  assert.equal(hod.departmentId, res.body.departmentId);
  assert.ok(await bcrypt.compare(generatedPassword!, hod.passwordHash), "the emailed password must match the stored bcrypt hash");
  const login = await call("/auth/login", undefined, "POST", { username: "newhod@example.test", password: generatedPassword });
  assert.equal(login.status, 200, "the emailed password must authenticate");

  const secondStart = sentEmails.length;
  const second = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Second HOD Password Dept", code: "SADMIN-TEST2", hod: { fullName: "Second HOD", email: "second-hod@example.test" } },
  });
  assert.equal(second.status, 201);
  const secondWelcome = sentEmails.slice(secondStart).find((email) => email.to === "second-hod@example.test");
  const secondPassword = secondWelcome?.text.match(/^Password:\s*(\S+)$/m)?.[1];
  assert.ok(secondPassword);
  assert.equal(secondPassword !== generatedPassword, true, "each HOD account must receive a fresh password");

  // Duplicate HOD for same department is rejected
  const dup = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Superadmin Created Dept", code: "SADMIN-TEST", hod: { fullName: "Another HOD", email: "anotherhod@example.test" } },
  });
  assert.equal(dup.status, 400);
  assert.ok(dup.body.message.match(/active HOD already exists/i));

  const legacyPassword = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Legacy Password Dept", code: "LEGACY-HOD-PASS", hod: { fullName: "Legacy HOD", email: "legacy-hod@example.test" } },
    hodPassword: password,
  });
  assert.equal(legacyPassword.status, 400, "the endpoint must reject client-supplied HOD passwords");
  assert.equal((await db.select().from(departmentsTable).where(eq(departmentsTable.code, "LEGACY-HOD-PASS"))).length, 0,
    "a legacy password request must not create the department");

  assert.equal((await call("/superadmin/departments", undefined, "POST", {
    setup: { name: "Unauthenticated Department", code: "UNAUTH-HOD", hod: { fullName: "Unauth HOD", email: "unauth-hod@example.test" } },
  })).status, 401);
  assert.equal((await call("/superadmin/departments", "hod0", "POST", {
    setup: { name: "HOD Created Department", code: "HOD-CREATED", hod: { fullName: "Other HOD", email: "other-hod@example.test" } },
  })).status, 403);

  simulateFailure.enabled = true;
  try {
    const failedEmail = await call("/superadmin/departments", "admin", "POST", {
      setup: { name: "Failed Email Department", code: "HOD-EMAIL-FAIL", hod: { fullName: "Mail Failure HOD", email: "mail-failure-hod@example.test" } },
    });
    assert.equal(failedEmail.status, 201);
    assert.equal(failedEmail.body.emailAccepted, false);
    assert.ok(!JSON.stringify(failedEmail.body).includes("password"));
    assert.ok(!JSON.stringify(failedEmail.body).includes("Password"));
  } finally {
    simulateFailure.enabled = false;
  }
});

// =========================================================================
// 5. Admin can view any department's roster
// =========================================================================
test("admin can view any department roster (plain user rows only)", async () => {
  const res = await call("/superadmin/departments/" + departmentIds[0] + "/roster", "admin");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  // Each row has only: id, fullName, email, role, status — no clinical joins
  for (const user of res.body) {
    assert.ok("id" in user);
    assert.ok("fullName" in user);
    assert.ok("email" in user);
    assert.ok("role" in user);
    assert.ok("status" in user);
    // §4: no studentId or studentProfileId in the admin roster
    assert.ok(!("studentId" in user));
    assert.ok(!("studentProfileId" in user));
  }
  // Nonexistent department returns 404
  assert.equal((await call("/superadmin/departments/999999/roster", "admin")).status, 404);
});

// =========================================================================
// 5a. Admin can rename a faculty, HOD, or student in the selected department
// =========================================================================
test("admin can rename department faculty and students; route is authenticated and department-scoped", async (t) => {
  const departmentId = departmentIds[0];
  const targets = [a.hod0, a.faculty0, a.student0];
  const originalNames = new Map<number, string>();
  for (const target of targets) {
    const [user] = await db.select({ id: usersTable.id, fullName: usersTable.fullName })
      .from(usersTable).where(eq(usersTable.id, target.id)).limit(1);
    assert.ok(user);
    originalNames.set(user.id, user.fullName);
  }

  const describe = (label: string, path: string, actor: string, body: unknown, response: { status: number; body: any }) => {
    t.diagnostic(`${label}: PATCH ${path} as ${actor} with ${JSON.stringify(body)} -> ${response.status} ${JSON.stringify(response.body)}`);
  };

  try {
    const facultyPath = `/superadmin/departments/${departmentId}/users/${a.faculty0.id}/name`;
    const unauthenticated = await call(facultyPath, undefined, "PATCH", { fullName: "Renamed Test Faculty" });
    describe("Unauthenticated request", facultyPath, "anonymous", { fullName: "Renamed Test Faculty" }, unauthenticated);
    assert.equal(unauthenticated.status, 401);

    const wrongRole = await call(facultyPath, "hod1", "PATCH", { fullName: "Renamed Test Faculty" });
    describe("Authenticated non-admin request", facultyPath, "HOD", { fullName: "Renamed Test Faculty" }, wrongRole);
    assert.equal(wrongRole.status, 403);

    const renamedFaculty = await call(facultyPath, "admin", "PATCH", { fullName: "Renamed Test Faculty" });
    describe("Admin edits faculty in selected department", facultyPath, "admin", { fullName: "Renamed Test Faculty" }, renamedFaculty);
    assert.equal(renamedFaculty.status, 200);
    assert.equal(renamedFaculty.body.fullName, "Renamed Test Faculty");
    assert.equal(renamedFaculty.body.role, "professor");

    const hodPath = `/superadmin/departments/${departmentId}/users/${a.hod0.id}/name`;
    const renamedHod = await call(hodPath, "admin", "PATCH", { fullName: "Renamed Test HOD" });
    assert.equal(renamedHod.status, 200);
    assert.equal(renamedHod.body.role, "hod");

    const studentPath = `/superadmin/departments/${departmentId}/users/${a.student0.id}/name`;
    const renamedStudent = await call(studentPath, "admin", "PATCH", { fullName: "Renamed Test Student" });
    assert.equal(renamedStudent.status, 200);
    assert.equal(renamedStudent.body.role, "student");

    const crossDepartmentPath = `/superadmin/departments/${departmentId}/users/${a.faculty1.id}/name`;
    const crossDepartment = await call(crossDepartmentPath, "admin", "PATCH", { fullName: "Must Not Change" });
    describe("Admin targets a user from another department", crossDepartmentPath, "admin", { fullName: "Must Not Change" }, crossDepartment);
    assert.equal(crossDepartment.status, 404);

    const nonexistentPath = `/superadmin/departments/${departmentId}/users/999999/name`;
    const nonexistent = await call(nonexistentPath, "admin", "PATCH", { fullName: "No Such User" });
    describe("Admin targets a nonexistent user", nonexistentPath, "admin", { fullName: "No Such User" }, nonexistent);
    assert.equal(nonexistent.status, 404);

    const invalidName = await call(facultyPath, "admin", "PATCH", { fullName: "   " });
    assert.equal(invalidName.status, 400);
  } finally {
    for (const [id, fullName] of originalNames) {
      await db.update(usersTable).set({ fullName }).where(eq(usersTable.id, id));
    }
  }
});

// =========================================================================
// 6. Admin can create faculty in any department
// =========================================================================
test("admin can create faculty in any department", async () => {
  const emailStart = sentEmails.length;
  const res = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Admin-Created Faculty", email: "admin-fac@example.test",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.faculty.departmentId, departmentIds[1]);
  assert.equal(res.body.emailAccepted, true);
  const welcome = sentEmails.slice(emailStart).find((email) => email.to === "admin-fac@example.test");
  assert.equal(welcome?.subject, "Your E-LogBook Account Has Been Created");
  const generatedPassword = welcome?.text.match(/^Password:\s*(\S+)$/m)?.[1];
  assert.ok(generatedPassword, "the welcome email must contain the generated initial password");
  assert.equal(/^[A-Za-z0-9_-]{32}$/.test(generatedPassword!), true, "the faculty password must be 32 URL-safe characters");
  assert.ok(!JSON.stringify(res.body).includes(generatedPassword!), "the API response must not disclose the generated password");
  const [createdUser] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.faculty.id));
  assert.ok(await bcrypt.compare(generatedPassword!, createdUser.passwordHash), "the emailed password must match the stored bcrypt hash");
  const login = await call("/auth/login", undefined, "POST", { username: "admin-fac@example.test", password: generatedPassword });
  assert.equal(login.status, 200, "the emailed password must authenticate");

  const secondEmailStart = sentEmails.length;
  const second = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Second Admin-Created Faculty", email: "admin-fac-second@example.test",
  });
  assert.equal(second.status, 201);
  const secondWelcome = sentEmails.slice(secondEmailStart).find((email) => email.to === "admin-fac-second@example.test");
  const secondPassword = secondWelcome?.text.match(/^Password:\s*(\S+)$/m)?.[1];
  assert.ok(secondPassword);
  assert.equal(secondPassword !== generatedPassword, true, "each faculty account must receive a fresh password");

  // Duplicate email rejected
  const dup = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Duplicate", email: "admin-fac@example.test",
  });
  assert.equal(dup.status, 400);

  // Legacy client-supplied credentials are rejected by the strict request schema.
  const suppliedPassword = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Client Password Faculty", email: "client-password-fac@example.test", password,
  });
  assert.equal(suppliedPassword.status, 400);

  // The route remains admin-only and requires authentication.
  assert.equal((await call("/superadmin/departments/" + departmentIds[1] + "/faculty", undefined, "POST", {
    fullName: "Unauthenticated Faculty", email: "unauth-fac@example.test",
  })).status, 401);
  assert.equal((await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "hod0", "POST", {
    fullName: "HOD Faculty", email: "hod-fac@example.test",
  })).status, 403);

  // Nonexistent department rejected
  assert.equal((await call("/superadmin/departments/999999/faculty", "admin", "POST", {
    fullName: "Nobody", email: "nobody@example.test",
  })).status, 404);

  // A failed email submission keeps the account but never discloses the password.
  simulateFailure.enabled = true;
  try {
    const failedEmail = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
      fullName: "Email Failure Faculty", email: "admin-fac-failed@example.test",
    });
    assert.equal(failedEmail.status, 201);
    assert.equal(failedEmail.body.emailAccepted, false);
    assert.ok(!JSON.stringify(failedEmail.body).includes("password"));
    assert.ok(!JSON.stringify(failedEmail.body).includes("Password"));
  } finally {
    simulateFailure.enabled = false;
  }
});

// =========================================================================
// 7. Admin can create a student (auto-approved)
// =========================================================================
test("admin can create student in any department (auto-approved)", async () => {
  const res = await call("/superadmin/departments/" + departmentIds[2] + "/students", "admin", "POST", {
    fullName: "Admin-Created Student", email: "admin-stu@example.test", password,
    registrationNumber: "ADMIN-STU-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "UNIV-ADMIN-001",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.student.departmentId, departmentIds[2]);

  // Verify the student is approved
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.student.id));
  assert.equal(user.status, "approved");
  assert.equal(user.role, "student");

  // Verify student profile row was created
  const [profile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, res.body.student.id));
  assert.ok(profile);
  assert.equal(profile.registrationNumber, "ADMIN-STU-001");
});

// =========================================================================
// 8. HOD swap is transactional
// =========================================================================
test("HOD swap: success, sessionVersion bump, wrong-role/wrong-dept/nonexistent-dept rejected", async () => {
  // Create a department with a known HOD and a professor for the swap
  const setupRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Swap Test Dept", code: "SWAP-TEST", hod: { fullName: "Original HOD", email: "swap-hod@example.test" } },
  });
  assert.equal(setupRes.status, 201);
  const deptId = setupRes.body.departmentId;
  const originalHodId = setupRes.body.hodId;

  // Create a professor in that department for the swap
  const profRes = await call("/superadmin/departments/" + deptId + "/faculty", "admin", "POST", {
    fullName: "Swap Professor", email: "swap-prof@example.test",
  });
  assert.equal(profRes.status, 201);
  const profId = profRes.body.faculty.id;

  // Successful HOD swap
  const swapEmailStart = sentEmails.length;
  const swapRes = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: profId,
  });
  assert.equal(swapRes.status, 200);
  assert.equal(swapRes.body.demotedId, originalHodId);
  assert.equal(swapRes.body.promotedId, profId);
  assert.equal(swapRes.body.emailAccepted, true);
  const appointment = sentEmails.slice(swapEmailStart).find((email) => email.subject === "You Have Been Appointed HOD in E-LogBook");
  assert.equal(appointment?.to, "swap-prof@example.test");
  assert.match(appointment?.text ?? "", /existing account/);

  // Verify: original HOD is now professor
  const [demoted] = await db.select().from(usersTable).where(eq(usersTable.id, originalHodId));
  assert.equal(demoted.role, "professor");
  assert.equal(demoted.status, "approved");

  // Verify: professor is now HOD
  const [promoted] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(promoted.role, "hod");
  assert.equal(promoted.status, "approved");

  // Verify: sessionVersion was bumped on both
  assert.ok(demoted.sessionVersion > 0, "demoted HOD sessionVersion should have been bumped");
  assert.ok(promoted.sessionVersion > 0, "promoted HOD sessionVersion should have been bumped");

  // Attempt swap with a non-professor (a student) — should fail
  const studentSwap = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: a.student0.id,
  });
  assert.equal(studentSwap.status, 400);
  // Verify the current HOD didn't change
  const [stillHod] = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, deptId), eq(usersTable.role, "hod")));
  assert.equal(stillHod.id, profId);

  // Attempt swap with a user from a different department — should fail
  const crossDeptSwap = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: a.faculty0.id,
  });
  assert.ok([400].includes(crossDeptSwap.status));
  // Current HOD remains unchanged
  const [unchanged] = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, deptId), eq(usersTable.role, "hod")));
  assert.equal(unchanged.id, profId);

  // Nonexistent department
  assert.equal((await call("/superadmin/departments/999999/replace-hod", "admin", "POST", { incomingUserId: profId })).status, 404);
});

// =========================================================================
// 8b. HOD swap transaction rollback: a throw after the demotion write rolls
//     back both changes — the outgoing HOD stays "hod", the incoming user
//     stays "professor". This exercises db.transaction() directly to inject a
//     genuine failure between the two writes (the HTTP route's pre-write
//     validation prevents this scenario from occurring via the API).
// =========================================================================
test("HOD swap: genuine mid-transaction failure rolls back the demotion write", async () => {
  // Set up a fresh department with a known HOD and professor
  const setupRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Rollback Test Dept", code: "ROLLBACK-T", hod: { fullName: "Rollback HOD", email: "rb-hod@example.test" } },
  });
  assert.equal(setupRes.status, 201);
  const deptId = setupRes.body.departmentId;
  const hodId = setupRes.body.hodId;

  const profRes = await call("/superadmin/departments/" + deptId + "/faculty", "admin", "POST", {
    fullName: "Rollback Professor", email: "rb-prof@example.test",
  });
  assert.equal(profRes.status, 201);
  const profId = profRes.body.faculty.id;

  // Capture pre-transaction state
  const [hodBefore] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  const [profBefore] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(hodBefore.role, "hod");
  assert.equal(profBefore.role, "professor");

  // Run a transaction that mirrors the route's write pattern: demotion
  // succeeds, then a thrown error prevents the promotion from executing.
  // If the transaction mechanism works, the demotion is rolled back.
  await assert.rejects(
    () => db.transaction(async (tx) => {
      // Step 4 from superadmin.ts: demote current HOD
      await tx.update(usersTable)
        .set({ role: "professor", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
        .where(and(eq(usersTable.id, hodId), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")));

      // Verify demotion took effect inside the transaction
      const [demotedInTx] = await tx.select({ role: usersTable.role }).from(usersTable)
        .where(eq(usersTable.id, hodId));
      assert.equal(demotedInTx.role, "professor", "demotion should be visible inside the transaction");

      // Simulate a failure before the promotion write executes
      throw new Error("Injected failure after demotion");
    }),
    { message: "Injected failure after demotion" },
  );

  // After the rolled-back transaction: both users must be unchanged
  const [hodAfter] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.equal(hodAfter.role, "hod", "outgoing HOD should still be hod after rollback");
  assert.equal(hodAfter.sessionVersion, hodBefore.sessionVersion, "outgoing HOD sessionVersion should be unchanged after rollback");

  const [profAfter] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(profAfter.role, "professor", "incoming user should still be professor after rollback");
  assert.equal(profAfter.sessionVersion, profBefore.sessionVersion, "incoming user sessionVersion should be unchanged after rollback");
});

// =========================================================================
// 9. Deactivating a student/faculty retains existing logs/records
// =========================================================================
test("deactivating a student retains their existing logs/records", async () => {
  // Use student0 who has case logs from access.test.ts fixture pattern.
  // First, create a case log to ensure data exists.
  const student = a.student0;
  const supervisorId = a.faculty0.id;
  const base = "/students/" + student.studentId;
  const caseBody = { date: "2026-09-02", patientAge: "Adult", patientGender: "other", diagnosisFinal: "Synthetic retention test", supervisorId };
  const log = await call(base + "/case-logs", "student0", "POST", caseBody);
  assert.equal(log.status, 201);

  // Deactivate student0 via superadmin
  const deactivate = await call("/superadmin/users/" + student.id + "/deactivate", "admin", "POST", {});
  assert.equal(deactivate.status, 200);

  // Verify the student's case log still exists
  const [caseLog] = await db.select().from(caseLogsTable).where(eq(caseLogsTable.id, log.body.id));
  assert.ok(caseLog, "Case log should still exist after deactivation");

  // Verify student profile still exists
  const [profile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, student.id));
  assert.ok(profile, "Student profile should still exist after deactivation");

  // Verify user status is rejected
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, student.id));
  assert.equal(user.status, "rejected");
});

// =========================================================================
// 10. Admin cannot deactivate another admin or an HOD
// =========================================================================
test("admin cannot deactivate another admin or an HOD via the deactivate endpoint", async () => {
  // Cannot deactivate admin
  const adminRes = await call("/superadmin/users/" + adminAccount.id + "/deactivate", "admin", "POST", {});
  assert.equal(adminRes.status, 403);
  assert.ok(adminRes.body.message.match(/cannot deactivate/i));

  // Cannot deactivate HOD
  const hodRes = await call("/superadmin/users/" + a.hod0.id + "/deactivate", "admin", "POST", {});
  assert.equal(hodRes.status, 403);
  assert.ok(hodRes.body.message.match(/cannot deactivate/i));

  // Verify neither account was actually changed
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, adminAccount.id));
  assert.equal(adminUser.status, "approved");
  const [hodUser] = await db.select().from(usersTable).where(eq(usersTable.id, a.hod0.id));
  assert.equal(hodUser.status, "approved");
});

// =========================================================================
// 11. Registration cannot create an admin role
// =========================================================================
test("registration cannot create an admin role account", async () => {
  // The registrationBody schema at auth.ts:100-102 uses .strict() and does not
  // include a "role" field. Any extra field (including role) is rejected with 400.
  // The route handler also hardcodes role: "student" at auth.ts:121.
  // This test confirms that sending role: "admin" is rejected.
  const registration = {
    fullName: "Fake admin", email: "fakeadmin@example.test", password,
    registrationNumber: "FAKE-ADMIN", batch: "2026", dateOfJoining: "2026-01-01",
    kuhsId: "FAKE-ADMIN-001", departmentId: departmentIds[0],
    verificationToken: "fake-but-irrelevant-here",
    role: "admin",
  };
  const res = await call("/auth/register", undefined, "POST", registration);
  // .strict() rejects the extra "role" field with 400 before any processing
  assert.equal(res.status, 400);
});

// =========================================================================
// 12. Unauthenticated requests get 401
// =========================================================================
test("unauthenticated requests to superadmin routes get 401", async () => {
  assert.equal((await call("/superadmin/departments")).status, 401);
  assert.equal((await call("/superadmin/departments/" + departmentIds[0] + "/roster")).status, 401);
  assert.equal((await call("/superadmin/users/" + a.student0.id + "/deactivate", undefined, "POST", {})).status, 401);
  assert.equal((await call("/superadmin/departments/" + departmentIds[0], undefined, "DELETE")).status, 401);
});

// =========================================================================
// 13. Deactivating faculty via superadmin works
// =========================================================================
test("admin can deactivate faculty and their session is invalidated", async () => {
  // Create a fresh faculty to deactivate
  const fac = await call("/superadmin/departments/" + departmentIds[0] + "/faculty", "admin", "POST", {
    fullName: "Deactivate Target", email: "deac-target@example.test",
  });
  assert.equal(fac.status, 201);
  const facId = fac.body.faculty.id;

  const deactivate = await call("/superadmin/users/" + facId + "/deactivate", "admin", "POST", {});
  assert.equal(deactivate.status, 200);

  // User status is rejected
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, facId));
  assert.equal(user.status, "rejected");

  // Nonexistent user returns 404
  assert.equal((await call("/superadmin/users/999999/deactivate", "admin", "POST", {})).status, 404);
});

// =========================================================================
// 14. Delete department — success (empty department with dependents)
// =========================================================================
test("admin can delete an empty department, cascading to users/config/catalog/procedure-types", async () => {
  // Create a test department (provisionDepartment creates dept + HOD only
  // via the API's .strict() body — config/catalog/procedure rows are NOT
  // created by the API call, so we insert them directly)
  const createRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Delete Test Dept", code: "DEL-TEST", hod: { fullName: "Delete HOD", email: "del-hod@example.test" } },
  });
  assert.equal(createRes.status, 201);
  const deptId = createRes.body.departmentId;
  const hodId = createRes.body.hodId;

  // Seed dependent rows directly in the test database
  await db.insert(departmentConfigsTable).values({
    departmentId: deptId, requiredCases: 5, requiredProcedures: 5, requiredAcademic: 5,
  }).onConflictDoUpdate({
    target: departmentConfigsTable.departmentId,
    set: { requiredCases: 5, requiredProcedures: 5, requiredAcademic: 5 }
  });
  await db.insert(departmentCatalogTable).values({
    departmentId: deptId, kind: "posting", name: "Delete test unit", value: "del-unit",
  });
  await db.insert(procedureTypesTable).values({
    departmentId: deptId, name: "Delete test procedure", group: "Delete test group", required: 1,
  });

  // Verify the department and its dependents exist before delete
  const [deptBefore] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
  assert.ok(deptBefore, "Department should exist before delete");
  const [hodBefore] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.ok(hodBefore, "HOD user should exist before delete");
  const configsBefore = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, deptId));
  assert.ok(configsBefore.length > 0, "Department configs should exist before delete");
  const catalogBefore = await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, deptId));
  assert.ok(catalogBefore.length > 0, "Department catalog should exist before delete");
  const procTypesBefore = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, deptId));
  assert.ok(procTypesBefore.length > 0, "Procedure types should exist before delete");

  // Delete the department
  const deleteRes = await call("/superadmin/departments/" + deptId, "admin", "DELETE");
  assert.equal(deleteRes.status, 200);
  assert.ok(deleteRes.body.message);

  // Verify everything was cleaned up
  const [deptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
  assert.equal(deptAfter, undefined, "Department should be gone after delete");
  const [hodAfter] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.equal(hodAfter, undefined, "HOD user should be gone after delete");
  const configsAfter = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, deptId));
  assert.equal(configsAfter.length, 0, "Department configs should be gone after delete");
  const catalogAfter = await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, deptId));
  assert.equal(catalogAfter.length, 0, "Department catalog should be gone after delete");
  const procTypesAfter = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, deptId));
  assert.equal(procTypesAfter.length, 0, "Procedure types should be gone after delete");
});

// =========================================================================
// 15. Delete department — 404 on unknown department
// =========================================================================
test("delete department returns 404 for nonexistent id", async () => {
  const res = await call("/superadmin/departments/999999", "admin", "DELETE");
  assert.equal(res.status, 404);
  assert.ok(res.body.message.match(/not found/i));
});

// =========================================================================
// 16. Delete department — 409 FK-violation when clinical data exists
//     Creates a department with a student who has a case_logs row. The
//     delete attempt must return 409 and leave everything intact (the
//     transaction rolled back).
// =========================================================================
test("delete department returns 409 when clinical data blocks the delete, and nothing is deleted", async () => {
  // 1. Create a department with an HOD
  const createRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "FK Block Dept", code: "FK-BLOCK", hod: { fullName: "FK HOD", email: "fk-hod@example.test" } },
  });
  assert.equal(createRes.status, 201);
  const deptId = createRes.body.departmentId;
  const hodId = createRes.body.hodId;

  // 2. Create a student in that department
  const stuRes = await call("/superadmin/departments/" + deptId + "/students", "admin", "POST", {
    fullName: "FK Student", email: "fk-student@example.test", password,
    registrationNumber: "FK-STU-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "FK-KUHS-001",
  });
  assert.equal(stuRes.status, 201);
  const studentUserId = stuRes.body.student.id;

  // 3. Look up the student profile id (studentsTable.id, not usersTable.id — §4)
  const [studentProfile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, studentUserId));
  assert.ok(studentProfile, "Student profile should exist");

  // 4. Insert a case_logs row referencing this student — this is the FK that
  //    will block deletion of the student and therefore the department
  await db.insert(caseLogsTable).values({
    studentId: studentProfile.id,
    date: "2026-09-10",
    patientAge: "Child",
    patientGender: "other",
    diagnosisFinal: "FK block test",
  });

  // 5. Attempt to delete the department — should get 409
  const deleteRes = await call("/superadmin/departments/" + deptId, "admin", "DELETE");
  assert.equal(deleteRes.status, 409, "Expected 409 FK violation, got " + deleteRes.status);
  assert.ok(deleteRes.body.message, "409 response should include an explanatory message");

  // 6. Verify nothing was deleted — transaction should have rolled back
  const [deptStillExists] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
  assert.ok(deptStillExists, "Department should still exist after failed delete");

  const [hodStillExists] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.ok(hodStillExists, "HOD should still exist after failed delete");

  const [studentStillExists] = await db.select().from(usersTable).where(eq(usersTable.id, studentUserId));
  assert.ok(studentStillExists, "Student user should still exist after failed delete");

  const [profileStillExists] = await db.select().from(studentsTable).where(eq(studentsTable.userId, studentUserId));
  assert.ok(profileStillExists, "Student profile should still exist after failed delete");

  const caseLogStillExists = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, studentProfile.id));
  assert.ok(caseLogStillExists.length > 0, "Case log should still exist after failed delete");
});

// =========================================================================
// 17. Delete department — success with assignments (proves delete-order fix)
// =========================================================================
test("admin can delete a department that has assignments (delete-order fix)", async () => {
  const createRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Assignment Delete Dept", code: "ASG-DEL", hod: { fullName: "Asg HOD", email: "asghod@example.test" } },
  });
  assert.equal(createRes.status, 201);
  const deptId = createRes.body.departmentId;
  const hodId = createRes.body.hodId;

  // Insert assignment type
  const [asgType] = await db.insert(assignmentTypesTable).values({
    departmentId: deptId,
    name: "Test Assignment Type",
    description: "Type for delete-order fix",
    createdBy: hodId,
  }).returning();

  // Insert assignment
  const [asg] = await db.insert(assignmentsTable).values({
    departmentId: deptId,
    typeId: asgType.id,
    facultyId: hodId,
    title: "Test Assignment",
    instructions: "Instructions",
    dueAt: new Date(Date.now() + 86400000), // tomorrow
  }).returning();

  // Verify they exist
  const [typeBefore] = await db.select().from(assignmentTypesTable).where(eq(assignmentTypesTable.id, asgType.id));
  assert.ok(typeBefore, "Assignment type should exist before delete");
  const [asgBefore] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, asg.id));
  assert.ok(asgBefore, "Assignment should exist before delete");

  // Call delete
  const deleteRes = await call("/superadmin/departments/" + deptId, "admin", "DELETE");
  assert.equal(deleteRes.status, 200);

  // Verify everything is gone
  const [deptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
  assert.equal(deptAfter, undefined, "Department should be gone");
  const [hodAfter] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.equal(hodAfter, undefined, "HOD should be gone");
  const [typeAfter] = await db.select().from(assignmentTypesTable).where(eq(assignmentTypesTable.id, asgType.id));
  assert.equal(typeAfter, undefined, "Assignment type should be gone");
  const [asgAfter] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, asg.id));
  assert.equal(asgAfter, undefined, "Assignment should be gone");
});

// =========================================================================
// 18. Delete department — cross-department assignment cleanup
// =========================================================================
test("delete department cleans up cross-department assignment recipients correctly", async () => {
  // Create Dept A
  const createA = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Dept A", code: "DEPT-A", hod: { fullName: "HOD A", email: "hoda@example.test" } },
  });
  assert.equal(createA.status, 201);
  const deptAId = createA.body.departmentId;
  const hodAId = createA.body.hodId;

  // Create Dept B
  const createB = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Dept B", code: "DEPT-B", hod: { fullName: "HOD B", email: "hodb@example.test" } },
  });
  assert.equal(createB.status, 201);
  const deptBId = createB.body.departmentId;

  // In Dept A: create assignment type and assignment
  const [asgTypeA] = await db.insert(assignmentTypesTable).values({
    departmentId: deptAId,
    name: "Type A",
    description: "Dept A Assignment Type",
    createdBy: hodAId,
  }).returning();

  const [asgA] = await db.insert(assignmentsTable).values({
    departmentId: deptAId,
    typeId: asgTypeA.id,
    facultyId: hodAId,
    title: "Assignment A",
    instructions: "For Dept B student",
    dueAt: new Date(Date.now() + 86400000),
  }).returning();

  // Create student in Dept B
  const stuB = await call("/superadmin/departments/" + deptBId + "/students", "admin", "POST", {
    fullName: "Student B", email: "stub@example.test", password,
    registrationNumber: "STU-B-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "KUHS-B-001",
  });
  assert.equal(stuB.status, 201);
  const stuBUserId = stuB.body.student.id;
  
  const [stuBProfile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, stuBUserId));
  assert.ok(stuBProfile, "Dept B student profile should exist");

  // Insert assignment_recipients row linking Dept A assignment to Dept B student
  const [recipient] = await db.insert(assignmentRecipientsTable).values({
    assignmentId: asgA.id,
    studentId: stuBProfile.id,
    status: "assigned",
  }).returning();

  // Call DELETE on Dept B
  const deleteB = await call("/superadmin/departments/" + deptBId, "admin", "DELETE");
  assert.equal(deleteB.status, 200);

  // Verify Dept B is gone
  const [deptBAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptBId));
  assert.equal(deptBAfter, undefined, "Dept B should be gone");
  const [stuBAfter] = await db.select().from(usersTable).where(eq(usersTable.id, stuBUserId));
  assert.equal(stuBAfter, undefined, "Dept B student user should be gone");
  const [recipientAfter] = await db.select().from(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.id, recipient.id));
  assert.equal(recipientAfter, undefined, "Cross-department assignment recipient row should be gone");

  // Verify Dept A is still intact
  const [deptAAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptAId));
  assert.ok(deptAAfter, "Dept A should still exist");
  const [hodAAfter] = await db.select().from(usersTable).where(eq(usersTable.id, hodAId));
  assert.ok(hodAAfter, "Dept A HOD should still exist");
  const [asgAAfter] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, asgA.id));
  assert.ok(asgAAfter, "Dept A assignment should still exist");
  const [asgTypeAAfter] = await db.select().from(assignmentTypesTable).where(eq(assignmentTypesTable.id, asgTypeA.id));
  assert.ok(asgTypeAAfter, "Dept A assignment type should still exist");
});
