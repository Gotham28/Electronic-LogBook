import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, password } from "./support.js";
import { engine, db, usersTable, studentsTable, departmentsTable } from "./database.js";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string };

before(async () => {
  runtime = await setup();
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

after(async () => { 
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); 
  await engine.close(); 
});

const call = (path: string, who?: keyof typeof a | "admin", method?: string, body?: unknown) => {
  const account = who === "admin"
    ? { ...adminAccount, role: "admin", email: "admin@example.test", departmentId: 0 }
    : who ? a[who] : undefined;
  return request(runtime.base, path, account as any, method, body);
};

test("backfilling a real department with no existing mirror creates exactly one mirror with 3 approved test accounts", async () => {
  // Create a real department directly in DB (simulating pre-existing)
  const [realDept] = await db.insert(departmentsTable).values({
    name: "Legacy Real Dept", code: "LEGACY1", isTest: false
  }).returning();

  const res = await call("/superadmin/departments/backfill-test-departments", "admin", "POST");
  assert.equal(res.status, 200);
  
  assert.ok(res.body.provisioned.includes(realDept.id));

  // Verify exactly one mirror
  const mirrors = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDept.id));
  assert.equal(mirrors.length, 1);
  const mirrorDept = mirrors[0];
  assert.equal(mirrorDept.isTest, true);
  assert.equal(mirrorDept.name, "Legacy Real Dept (Test)");

  // Verify exactly 3 test accounts
  const testAccounts = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDept.id));
  assert.equal(testAccounts.length, 3);
  
  const testHod = testAccounts.find((u: any) => u.role === "hod");
  const testProf = testAccounts.find((u: any) => u.role === "professor");
  const testStudent = testAccounts.find((u: any) => u.role === "student");

  assert.ok(testHod);
  assert.ok(testProf);
  assert.ok(testStudent);

  assert.equal(testHod.status, "approved");
  assert.equal(testProf.status, "approved");
  assert.equal(testStudent.status, "approved");

  // Check student profile
  const [studentProfile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, testStudent.id));
  assert.ok(studentProfile);
  assert.equal(studentProfile.specialty, mirrorDept.name);
});

test("calling the backfill route twice in a row is idempotent", async () => {
  const [realDept2] = await db.insert(departmentsTable).values({
    name: "Legacy Real Dept 2", code: "LEGACY2", isTest: false
  }).returning();

  const res1 = await call("/superadmin/departments/backfill-test-departments", "admin", "POST");
  assert.equal(res1.status, 200);
  assert.ok(res1.body.provisioned.includes(realDept2.id));

  const res2 = await call("/superadmin/departments/backfill-test-departments", "admin", "POST");
  assert.equal(res2.status, 200);
  assert.ok(res2.body.skipped.includes(realDept2.id));
  assert.equal(res2.body.provisioned.includes(realDept2.id), false);
  
  // Still exactly one mirror
  const mirrors = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDept2.id));
  assert.equal(mirrors.length, 1);
});

test("a department that is itself a mirror is never selected as a candidate", async () => {
  const [mirrorDept] = await db.insert(departmentsTable).values({
    name: "Existing Mirror", code: "TEST-LEGACY3", isTest: true
  }).returning();

  const res = await call("/superadmin/departments/backfill-test-departments", "admin", "POST");
  assert.equal(res.status, 200);
  assert.equal(res.body.provisioned.includes(mirrorDept.id), false);
  assert.equal(res.body.skipped.includes(mirrorDept.id), false);
  assert.equal(res.body.failed.find((f: any) => f.departmentId === mirrorDept.id), undefined);
});

test("non-admin callers get 403", async () => {
  const resHod = await call("/superadmin/departments/backfill-test-departments", "hod0", "POST");
  assert.equal(resHod.status, 403);
  const resFac = await call("/superadmin/departments/backfill-test-departments", "faculty0", "POST");
  assert.equal(resFac.status, 403);
  const resStu = await call("/superadmin/departments/backfill-test-departments", "student0", "POST");
  assert.equal(resStu.status, 403);
});

test("one department's provisioning failure does not prevent others from being provisioned", async () => {
  // Create a bad department that will cause unique constraint failure for testCode
  const [goodDept] = await db.insert(departmentsTable).values({
    name: "Good Dept", code: "GOOD1", isTest: false
  }).returning();

  const [badDept] = await db.insert(departmentsTable).values({
    name: "Bad Dept", code: "BAD1", isTest: false
  }).returning();

  // Sabotage the badDept by pre-creating a mirror with its expected TEST code
  await db.insert(departmentsTable).values({
    name: "Blocking Dept", code: `TEST-${badDept.id}`, isTest: true
  }); // Note: no configSourceDepartmentId set, so it won't be caught by the existingMirror check, but will fail the unique constraint on code

  const res = await call("/superadmin/departments/backfill-test-departments", "admin", "POST");
  assert.equal(res.status, 200);
  
  assert.ok(res.body.provisioned.includes(goodDept.id));
  const badFailure = res.body.failed.find((f: any) => f.departmentId === badDept.id);
  assert.ok(badFailure);
  assert.equal(typeof badFailure.message, "string");
  // The exact error message depends on postgres unique constraint wording, but we just verify it exists as a string
});
