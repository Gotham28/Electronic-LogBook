import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, usersTable, departmentsTable } from "./database.js";
import { eq, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string };

before(async () => {
  runtime = await setup();
  const hash = await bcrypt.hash(password, 10);
  const [admin] = await db.insert(usersTable).values({
    fullName: "Test Admin Impersonator", email: "admin-imp@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash,
  }).returning();
  adminAccount = {
    id: admin.id,
    token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "admin", method?: string, body?: unknown, customHeaders?: Record<string, string>) => {
  const account = who === "admin"
    ? { ...adminAccount, role: "admin", email: "admin-imp@example.test", departmentId: 0 }
    : who ? a[who] : undefined;
  
  if (customHeaders) {
    // A quick hack to send custom auth header since `call` in these tests typically uses cookies/auth depending on `account`
    return request(runtime.base, path, account as any, method, body, customHeaders);
  }
  return request(runtime.base, path, account as any, method, body);
};

// =========================================================================
// 1. Unauthenticated request to the new route → 401
// =========================================================================
test("unauthenticated requests to impersonation route get 401", async () => {
  const res = await call(`/superadmin/users/${a.student0.id}/impersonate`, undefined, "POST", {});
  assert.equal(res.status, 401);
});

// =========================================================================
// 2. Authenticated non-admin (hod/professor/student) → 403
// =========================================================================
test("HOD, professor, and student accounts get 403 on impersonation route", async () => {
  for (const role of ["hod0", "faculty0", "student0"] as const) {
    const res = await call(`/superadmin/users/${a.student0.id}/impersonate`, role, "POST", {});
    assert.equal(res.status, 403);
  }
});

// =========================================================================
// 3. Admin targeting a user in a real (non-isTest) department → 403
// =========================================================================
test("admin targeting a user in a real (non-isTest) department is denied with 403", async () => {
  // a.student0 is in departmentIds[0], which is a real department (isTest = false in setup)
  const res = await call(`/superadmin/users/${a.student0.id}/impersonate`, "admin", "POST", {});
  assert.equal(res.status, 403);
  assert.ok(res.body.message.match(/outside of test departments/i));
});

// =========================================================================
// 4. Admin targeting a user in an isTest department → 200, token round-trip
// =========================================================================
test("admin can impersonate a user in an isTest department", async () => {
  // Create an isTest department
  const [testDept] = await db.insert(departmentsTable).values({
    name: "Mirror Dept", code: "MIRROR", isTest: true, configSourceDepartmentId: departmentIds[0]
  }).returning();

  // Create a student in the test department
  const hash = await bcrypt.hash(password, 10);
  const [testStudent] = await db.insert(usersTable).values({
    fullName: "Test Account", email: "testacc@example.test",
    role: "student", status: "approved", departmentId: testDept.id, passwordHash: hash,
  }).returning();

  // Impersonate
  const res = await call(`/superadmin/users/${testStudent.id}/impersonate`, "admin", "POST", {});
  assert.equal(res.status, 200);
  assert.equal(res.body.id, testStudent.id);
  assert.equal(res.body.role, "student");
  assert.ok(res.body.token);

  // Round-trip through GET /api/auth/me
  // We cannot use the `call` helper directly with this token as it expects one of the predefined accounts
  // So we manually use request with custom headers
  const meRes = await request(runtime.base, "/auth/me", undefined, "GET", undefined, {
    "Authorization": `Bearer ${res.body.token}`
  });
  
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.id, testStudent.id);
  assert.equal(meRes.body.email, undefined); // sessionProfile doesn't return email, returns name etc
  assert.equal(meRes.body.role, "student");
});

// =========================================================================
// 5. Admin targeting a nonexistent user id → 404
// =========================================================================
test("admin targeting a nonexistent user gets 404", async () => {
  const res = await call(`/superadmin/users/999999/impersonate`, "admin", "POST", {});
  assert.equal(res.status, 404);
});

// =========================================================================
// 6. Token exp reflects the short 20-minute window
// =========================================================================
test("impersonation token has 20-minute expiry", async () => {
  // Create an isTest department
  const [testDept] = await db.insert(departmentsTable).values({
    name: "Mirror Dept 2", code: "MIRROR2", isTest: true
  }).returning();

  const hash = await bcrypt.hash(password, 10);
  const [testFaculty] = await db.insert(usersTable).values({
    fullName: "Test Faculty", email: "testfac@example.test",
    role: "professor", status: "approved", departmentId: testDept.id, passwordHash: hash,
  }).returning();

  const res = await call(`/superadmin/users/${testFaculty.id}/impersonate`, "admin", "POST", {});
  assert.equal(res.status, 200);
  
  const token = res.body.token;
  const decoded = jwt.decode(token) as any;
  
  // Expiry should be exactly 20 minutes (1200 seconds) from issuance
  const lifetime = decoded.exp - decoded.iat;
  assert.equal(lifetime, 1200);
});

// =========================================================================
// 7. Token invalidated when sessionVersion changes
// =========================================================================
test("impersonation token dies if target sessionVersion changes", async () => {
  // Create an isTest department
  const [testDept] = await db.insert(departmentsTable).values({
    name: "Mirror Dept 3", code: "MIRROR3", isTest: true
  }).returning();

  const hash = await bcrypt.hash(password, 10);
  const [testHod] = await db.insert(usersTable).values({
    fullName: "Test HOD", email: "testhod@example.test",
    role: "hod", status: "approved", departmentId: testDept.id, passwordHash: hash,
  }).returning();

  // 1. Get token
  const res = await call(`/superadmin/users/${testHod.id}/impersonate`, "admin", "POST", {});
  assert.equal(res.status, 200);
  const token = res.body.token;

  // 2. Token works initially
  const meRes = await request(runtime.base, "/auth/me", undefined, "GET", undefined, {
    "Authorization": `Bearer ${token}`
  });
  assert.equal(meRes.status, 200);

  // 3. Deactivate the user (bumps sessionVersion)
  await db.update(usersTable)
    .set({ status: "rejected", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
    .where(eq(usersTable.id, testHod.id));

  // 4. Token should now be rejected by requireAuth
  const meResAfter = await request(runtime.base, "/auth/me", undefined, "GET", undefined, {
    "Authorization": `Bearer ${token}`
  });
  assert.equal(meResAfter.status, 401);
  assert.ok(meResAfter.body.message.match(/no longer active/i));
});
