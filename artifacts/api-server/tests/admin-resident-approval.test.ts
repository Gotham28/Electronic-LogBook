import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, departmentsTable, paymentsTable, studentsTable, usersTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; token: string; role: string; departmentId: number | null };

before(async () => {
  runtime = await setup();
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    fullName: "Approval Test Admin", email: "approval-admin@example.test", passwordHash,
    role: "admin", status: "approved", departmentId: null,
  }).returning({ id: usersTable.id });
  admin = { id: user.id, token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }), role: "admin", departmentId: null };
});

after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

type TestResponse = { status: number; body: any; headers: Headers };
const apiRequest = (path: string, account?: any, method = "GET", body?: unknown, headers = {}) =>
  request(runtime.base, path, account, method, body, headers) as Promise<TestResponse>;

const call = (path: string, who?: keyof typeof a | "admin", method = "GET", body?: unknown, headers = {}) => {
  const account = who === "admin" ? admin : who ? a[who] : undefined;
  return apiRequest(path, account, method, body, headers);
};

let nextFixture = 0;
async function createResident(departmentId: number, approvalMode: "hod" | "automatic") {
  const suffix = `${Date.now()}-${nextFixture++}`;
  return call(`/superadmin/departments/${departmentId}/students`, "admin", "POST", {
    fullName: "Approval Fixture Resident", email: `approval-${suffix}@example.test`, password,
    registrationNumber: `AP-${suffix}`, batch: "2026", dateOfJoining: "2026-01-01",
    kuhsId: `AP-KUHS-${suffix}`, approvalMode,
  });
}

test("admin-created resident defaults to automatic approval without a payment and can sign in", async () => {
  const created = await call(`/superadmin/departments/${departmentIds[0]}/students`, "admin", "POST", {
    fullName: "Automatic Approval Fixture", email: "automatic-approval@example.test", password,
    registrationNumber: "AUTO-APPROVAL-1", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "AUTO-KUHS-1",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.student.status, "approved");
  assert.equal(created.body.approvalMode, "automatic");
  assert.equal(created.body.approvalFallback, null);
  assert.equal((await db.select({ id: paymentsTable.id }).from(paymentsTable).where(eq(paymentsTable.userId, created.body.student.id))).length, 0);
  const [profile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, created.body.student.id));
  assert.equal(profile.adminProvisioned, true);
  const login = await apiRequest("/auth/login", undefined, "POST", { username: "automatic-approval@example.test", password });
  assert.equal(login.status, 200);
});

test("HOD approval of an admin-created resident needs no payment and remains department-scoped", async (t) => {
  const created = await createResident(departmentIds[0], "hod");
  assert.equal(created.status, 201);
  assert.equal(created.body.student.status, "pending");
  assert.equal(created.body.approvalFallback, null);
  assert.equal(created.body.hodEmailAccepted, true);
  assert.equal((await db.select({ id: paymentsTable.id }).from(paymentsTable).where(eq(paymentsTable.userId, created.body.student.id))).length, 0);

  const path = `/admin/students/${created.body.student.id}/approve`;
  const unauthenticated = await call(path, undefined, "POST", {});
  t.diagnostic(`POST /api${path} unauthenticated -> ${unauthenticated.status} ${JSON.stringify(unauthenticated.body)}`);
  assert.equal(unauthenticated.status, 401);

  const wrongOwner = await call(path, "hod1", "POST", {});
  t.diagnostic(`POST /api${path} as HOD of another department -> ${wrongOwner.status} ${JSON.stringify(wrongOwner.body)}`);
  assert.equal(wrongOwner.status, 403);

  const correctOwner = await call(path, "hod0", "POST", {});
  t.diagnostic(`POST /api${path} as assigned HOD -> ${correctOwner.status} ${JSON.stringify({ message: correctOwner.body.message, emailAccepted: correctOwner.body.emailAccepted })}`);
  assert.equal(correctOwner.status, 200);

  const nonexistentPath = "/admin/students/999999999/approve";
  const nonexistent = await call(nonexistentPath, "hod0", "POST", {});
  t.diagnostic(`POST /api${nonexistentPath} as HOD -> ${nonexistent.status} ${JSON.stringify(nonexistent.body)}`);
  assert.equal(nonexistent.status, 403);

  const noPaymentLogin = await apiRequest("/auth/login", undefined, "POST", {
    username: created.body.student.email, password,
  });
  assert.equal(noPaymentLogin.status, 200);
  const stillNoPayment = await db.select({ id: paymentsTable.id }).from(paymentsTable).where(eq(paymentsTable.userId, created.body.student.id));
  assert.equal(stillNoPayment.length, 0);
});

test("an admin-created pending resident cannot enter the payment flow", async () => {
  const created = await createResident(departmentIds[0], "hod");
  assert.equal(created.status, 201);
  const login = await apiRequest("/auth/login", undefined, "POST", {
    username: created.body.student.email, password,
  });
  assert.equal(login.status, 403);
  assert.match(login.body.message, /HOD approval/i);
  assert.equal("paymentToken" in login.body, false);

  const token = jwt.sign({ id: created.body.student.id, scope: "payment" }, process.env.JWT_SECRET!, { expiresIn: "10m" });
  const payment = await apiRequest("/payments/order", undefined, "POST", {}, { Authorization: `Bearer ${token}` });
  assert.equal(payment.status, 403);
});

test("no active HOD in the actual target department falls back to approved without payment", async () => {
  const [department] = await db.insert(departmentsTable).values({ name: "No HOD Fixture", code: "NO-HOD-APPROVAL" }).returning();
  const created = await createResident(department.id, "hod");
  assert.equal(created.status, 201);
  assert.equal(created.body.student.departmentId, department.id);
  assert.equal(created.body.student.status, "approved");
  assert.equal(created.body.approvalFallback, "no_active_hod");
  assert.equal(created.body.hodEmailAccepted, null);
  assert.equal((await db.select({ id: paymentsTable.id }).from(paymentsTable).where(eq(paymentsTable.userId, created.body.student.id))).length, 0);
  const login = await apiRequest("/auth/login", undefined, "POST", {
    username: created.body.student.email, password,
  });
  assert.equal(login.status, 200);
});

test("self-registered residents retain the existing paid-payment requirement", async () => {
  const approve = await call(`/admin/students/${a.pending0.id}/approve`, "hod0", "POST", {});
  assert.equal(approve.status, 402);
  const login = await apiRequest("/auth/login", undefined, "POST", {
    username: a.pending0.email, password,
  });
  assert.equal(login.status, 402);
  assert.equal(typeof login.body.paymentToken, "string");
  const [profile] = await db.select({ adminProvisioned: studentsTable.adminProvisioned })
    .from(studentsTable).where(eq(studentsTable.userId, a.pending0.id));
  assert.equal(profile.adminProvisioned, false);
});

test("HOD queues and approval use the mirror department, not its parent department", async () => {
  const [mirror] = await db.insert(departmentsTable).values({
    name: "Pediatrics (Test Fixture)", code: "TEST-APPROVAL-MIRROR", isTest: true,
    configSourceDepartmentId: departmentIds[0],
  }).returning();
  const passwordHash = await bcrypt.hash(password, 10);
  const [hod] = await db.insert(usersTable).values({
    fullName: "Mirror Approval HOD", email: "mirror-approval-hod@example.test", passwordHash,
    role: "hod", status: "approved", departmentId: mirror.id,
  }).returning({ id: usersTable.id });
  const token = jwt.sign({ id: hod.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  const mirrorHod = { id: hod.id, token, role: "hod", departmentId: mirror.id };

  const created = await createResident(mirror.id, "hod");
  assert.equal(created.status, 201);
  assert.equal(created.body.student.status, "pending");

  const realQueue = await call("/admin/students/pending", "hod0");
  const mirrorQueue = await apiRequest("/admin/students/pending", mirrorHod);
  assert.equal(realQueue.body.some((student: any) => student.id === created.body.student.id), false);
  assert.equal(mirrorQueue.body.some((student: any) => student.id === created.body.student.id), true);

  const parentHodAttempt = await call(`/admin/students/${created.body.student.id}/approve`, "hod0", "POST", {});
  assert.equal(parentHodAttempt.status, 403);
  const mirrorHodApproval = await apiRequest(`/admin/students/${created.body.student.id}/approve`, mirrorHod, "POST", {});
  assert.equal(mirrorHodApproval.status, 200);
  assert.equal((await db.select({ departmentId: usersTable.departmentId, status: usersTable.status }).from(usersTable)
    .where(and(eq(usersTable.id, created.body.student.id), eq(usersTable.role, "student"))))[0].departmentId, mirror.id);
});

test("invalid approval modes and client-supplied provenance are rejected", async () => {
  const base = {
    fullName: "Invalid Approval Fixture", email: "invalid-approval@example.test", password,
    registrationNumber: "INVALID-APPROVAL-1", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "INVALID-KUHS-1",
  };
  const invalidMode = await call(`/superadmin/departments/${departmentIds[0]}/students`, "admin", "POST", { ...base, approvalMode: "skip" });
  assert.equal(invalidMode.status, 400);
  const forgedMarker = await call(`/superadmin/departments/${departmentIds[0]}/students`, "admin", "POST", { ...base, adminProvisioned: false });
  assert.equal(forgedMarker.status, 400);
});
