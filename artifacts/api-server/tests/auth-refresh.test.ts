import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { setup, request, accounts as a, password } from "./support.js";
import { engine, db, usersTable, departmentsTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; token: string };
let testStudentId: number;

const secret = () => process.env.JWT_SECRET!;
const now = () => Math.floor(Date.now() / 1000);
const refresh = (token?: string, headers: Record<string, string> = {}) =>
  request(runtime.base, "/auth/refresh", token ? ({ token } as any) : undefined, "POST", {}, headers);

before(async () => {
  runtime = await setup();
  const hash = await bcrypt.hash(password, 10);
  const [adminRow] = await db.insert(usersTable).values({ fullName: "Refresh Admin", email: "refresh-admin@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash }).returning();
  admin = { id: adminRow.id, token: jwt.sign({ id: adminRow.id, sessionVersion: 0 }, secret(), { expiresIn: "1h" }) };
  const [testDept] = await db.insert(departmentsTable).values({ name: "Refresh Test Dept", code: "REFRESH-T", isTest: true }).returning();
  const [student] = await db.insert(usersTable).values({ fullName: "Refresh Test Student", email: "refresh-student@example.test",
    role: "student", status: "approved", departmentId: testDept.id, passwordHash: hash }).returning();
  testStudentId = student.id;
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

async function impersonate() {
  const res = await request(runtime.base, `/superadmin/users/${testStudentId}/impersonate`, { token: admin.token } as any, "POST", {});
  assert.equal(res.status, 200);
  return res.body.token as string;
}

test("refresh without a token is 401", async () => {
  const res = await refresh();
  assert.equal(res.status, 401);
});

test("refresh with an expired token is 401 Token expired", async () => {
  const expired = jwt.sign({ id: a.student0.id, sessionVersion: 0, iat: now() - 7200, exp: now() - 60 }, secret());
  const res = await refresh(expired);
  assert.equal(res.status, 401);
  assert.equal(res.body.message, "Token expired");
});

test("refresh with a payment-scope token is 401", async () => {
  const payment = jwt.sign({ id: a.student0.id, scope: "payment" }, secret(), { expiresIn: "30m" });
  const res = await refresh(payment);
  assert.equal(res.status, 401);
});

test("normal session renews with the same identity and a 1-day lifetime, and keeps the original sign-in time", async () => {
  const origIat = now() - 3600;
  const token = jwt.sign({ id: a.student0.id, sessionVersion: 0, origIat }, secret(), { expiresIn: "1h" });
  const res = await refresh(token);
  assert.equal(res.status, 200);
  const decoded = jwt.decode(res.body.token) as any;
  assert.equal(decoded.id, a.student0.id);
  assert.equal(decoded.sessionVersion, 0);
  assert.equal(decoded.origIat, origIat);
  assert.equal(decoded.exp - decoded.iat, 86400);
  assert.equal(decoded.impersonatedBy, undefined);
  assert.match(res.headers.get("set-cookie") || "", /token=/);
  const me = await request(runtime.base, "/auth/me", { token: res.body.token } as any);
  assert.equal(me.status, 200);
  assert.equal(me.body.id, a.student0.id);
});

test("a token issued before this change (no origIat) falls back to its iat", async () => {
  const token = jwt.sign({ id: a.student0.id, sessionVersion: 0 }, secret(), { expiresIn: "1h" });
  const res = await refresh(token);
  assert.equal(res.status, 200);
  const decoded = jwt.decode(res.body.token) as any;
  assert.equal(decoded.origIat, (jwt.decode(token) as any).iat);
});

test("normal session past the 7-day cap is 401", async () => {
  const token = jwt.sign({ id: a.student0.id, sessionVersion: 0, origIat: now() - 7 * 86400 - 60 }, secret(), { expiresIn: "1h" });
  const res = await refresh(token);
  assert.equal(res.status, 401);
});

test("login token carries origIat", async () => {
  const res = await request(runtime.base, "/auth/login", undefined, "POST", { username: a.student1.email, password });
  assert.equal(res.status, 200);
  const decoded = jwt.decode(res.body.token) as any;
  assert.ok(Number.isSafeInteger(decoded.origIat));
});

test("impersonation session renews for 20 minutes, keeps impersonation claims and never sets a cookie", async () => {
  const token = await impersonate();
  const original = jwt.decode(token) as any;
  assert.equal(original.exp - original.iat, 1200);
  const res = await refresh(token);
  assert.equal(res.status, 200);
  const decoded = jwt.decode(res.body.token) as any;
  assert.equal(decoded.id, testStudentId);
  assert.equal(decoded.impersonatedBy, admin.id);
  assert.equal(decoded.origIat, original.origIat);
  assert.equal(decoded.exp - decoded.iat, 1200);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("impersonation session past the 8-hour cap is 401", async () => {
  const token = jwt.sign({ id: testStudentId, sessionVersion: 0, impersonatedBy: admin.id, impersonatorSessionVersion: 0,
    origIat: now() - 8 * 3600 - 60 }, secret(), { expiresIn: "20m" });
  const res = await refresh(token);
  assert.equal(res.status, 401);
  assert.match(res.body.message, /Session limit reached/);
});

test("impersonation stops renewing once the admin signs out", async () => {
  const token = await impersonate();
  await db.update(usersTable).set({ sessionVersion: sql`${usersTable.sessionVersion} + 1` }).where(eq(usersTable.id, admin.id));
  try {
    const res = await refresh(token);
    assert.equal(res.status, 401);
  } finally {
    await db.update(usersTable).set({ sessionVersion: 0 }).where(eq(usersTable.id, admin.id));
  }
});

test("impersonation stops renewing once the admin is deactivated", async () => {
  const token = await impersonate();
  await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, admin.id));
  try {
    const res = await refresh(token);
    assert.equal(res.status, 401);
  } finally {
    await db.update(usersTable).set({ status: "approved" }).where(eq(usersTable.id, admin.id));
  }
});

test("a bumped target sessionVersion stops renewal", async () => {
  const token = await impersonate();
  await db.update(usersTable).set({ sessionVersion: sql`${usersTable.sessionVersion} + 1` }).where(eq(usersTable.id, testStudentId));
  const res = await refresh(token);
  assert.equal(res.status, 401);
});

test("150 renewals from one IP do not use up the login throttle", async () => {
  const token = jwt.sign({ id: a.student2.id, sessionVersion: 0 }, secret(), { expiresIn: "1h" });
  for (let i = 0; i < 150; i++) {
    const res = await refresh(token);
    assert.equal(res.status, 200);
  }
  const login = await request(runtime.base, "/auth/login", undefined, "POST", { username: a.student2.email, password });
  assert.equal(login.status, 200);
});
