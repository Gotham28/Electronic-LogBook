// Evidence Gate SEC-34-37 (docs/SECURITY_FIXES.md's exception for studentAccess, extended
// here to four routes the section 1b preflight found outside that pattern). Four cases each:
//   1. unauthenticated                       -> 401
//   2. authenticated, wrong owner             -> 403
//   3. authenticated, correct owner           -> 200 (or the route's normal success code)
//   4. authenticated, nonexistent record id   -> 403, body byte-identical to case 2
//
// Each route used to look up the row first (404 if absent) and only then check ownership
// (403 if present but not the caller's). That let any authenticated caller learn which ids
// exist by walking them and watching which status code came back. All four routes now do
// the existence check and the ownership check as one combined condition with one response,
// so a caller who fails either reason gets an identical, non-distinguishing 403.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { setup, request, accounts as a, departmentIds } from "./support.js";
import { engine, db, usersTable, paymentsTable, subscriptionPlansTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let planId: number;

before(async () => {
  runtime = await setup();
  const [plan] = await db.insert(subscriptionPlansTable).values({
    code: "sec37-test-plan", name: "SEC-37 Test Plan", amountPaise: 100000, currency: "INR", durationMonths: 24, active: true,
  }).returning();
  planId = plan.id;
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

// Guaranteed absent: support.ts's fixtures use small sequential ids from a fresh PGlite instance.
const NONEXISTENT_ID = 999999999;

test("SEC-34: PATCH /logs/:logType/:logId/review — nonexistent log and wrong-supervisor log return the same 403", async () => {
  const created = await call("/students/" + a.student0.studentId + "/case-logs", "student0", "POST",
    { date: "2026-09-01", patientAge: "Adult", patientGender: "other", diagnosisFinal: "SEC-34 evidence", supervisorId: a.faculty0.id });
  assert.equal(created.status, 201, "fixture: case log supervised by faculty0");
  const base = "/logs/case/" + created.body.id + "/review";

  const unauthenticated = await call(base, undefined, "PATCH", { status: "verified" });
  // faculty20: a second professor in student0's own department who is NOT the named supervisor.
  const wrongOwner = await call(base, "faculty20", "PATCH", { status: "verified" });
  const nonexistent = await call("/logs/case/" + NONEXISTENT_ID + "/review", "faculty0", "PATCH", { status: "verified" });
  const correctOwner = await call(base, "faculty0", "PATCH", { status: "verified" });

  console.log("SEC-34 unauthenticated ->", unauthenticated.status);
  console.log("SEC-34 wrong-owner (different professor, same dept) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-34 nonexistent logId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-34 correct-owner (named supervisor) ->", correctOwner.status, JSON.stringify(correctOwner.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
  assert.equal(correctOwner.body.status, "verified");
});

test("SEC-35: GET /professors/:professorId/review-queue — nonexistent id and cross-department id return the same 403", async () => {
  const unauthenticated = await call("/professors/" + a.faculty0.id + "/review-queue");
  // faculty1: a real professor, but in a different department than hod0.
  const wrongOwner = await call("/professors/" + a.faculty1.id + "/review-queue", "hod0");
  const nonexistent = await call("/professors/" + NONEXISTENT_ID + "/review-queue", "hod0");
  const correctOwner = await call("/professors/" + a.faculty0.id + "/review-queue", "hod0");

  console.log("SEC-35 unauthenticated ->", unauthenticated.status);
  console.log("SEC-35 wrong-owner (real professor, different department) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-35 nonexistent professorId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-35 correct-owner (HOD, own-department professor) ->", correctOwner.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
});

test("SEC-36: POST /admin/students/:id/approve — nonexistent id and cross-department id return the same 403", async () => {
  // Approval also requires a paid payment (SEC-36 is only about the existence/ownership
  // split; this fixture exists so the correct-owner case can reach 200 rather than 402).
  await db.insert(paymentsTable).values({ userId: a.pending0.id, planId, razorpayOrderId: "sec36-approve-fixture",
    amountPaise: 100000, currency: "INR", status: "paid" });

  const unauthenticated = await call("/admin/students/" + a.pending0.id + "/approve", undefined, "POST", {});
  const wrongOwner = await call("/admin/students/" + a.pending2.id + "/approve", "hod0", "POST", {});
  const nonexistent = await call("/admin/students/" + NONEXISTENT_ID + "/approve", "hod0", "POST", {});
  const correctOwner = await call("/admin/students/" + a.pending0.id + "/approve", "hod0", "POST", {});

  console.log("SEC-36 approve unauthenticated ->", unauthenticated.status);
  console.log("SEC-36 approve wrong-owner (real pending student, different department) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-36 approve nonexistent id ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-36 approve correct-owner ->", correctOwner.status, JSON.stringify(correctOwner.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
});

test("SEC-36: POST /admin/students/:id/reject — nonexistent id and cross-department id return the same 403", async () => {
  const unauthenticated = await call("/admin/students/" + a.pending1.id + "/reject", undefined, "POST", {});
  const wrongOwner = await call("/admin/students/" + a.pending2.id + "/reject", "hod1", "POST", {});
  const nonexistent = await call("/admin/students/" + NONEXISTENT_ID + "/reject", "hod1", "POST", {});
  const correctOwner = await call("/admin/students/" + a.pending1.id + "/reject", "hod1", "POST", {});

  console.log("SEC-36 reject unauthenticated ->", unauthenticated.status);
  console.log("SEC-36 reject wrong-owner (real pending student, different department) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-36 reject nonexistent id ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-36 reject correct-owner ->", correctOwner.status, JSON.stringify(correctOwner.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
});

test("SEC-36: DELETE /admin/users/:id — nonexistent id and cross-department id return the same 403", async () => {
  const unauthenticated = await call("/admin/users/" + a.student22.id, undefined, "DELETE");
  const wrongOwner = await call("/admin/users/" + a.student21.id, "hod2", "DELETE");
  const nonexistent = await call("/admin/users/" + NONEXISTENT_ID, "hod2", "DELETE");
  const correctOwner = await call("/admin/users/" + a.student22.id, "hod2", "DELETE");

  console.log("SEC-36 delete unauthenticated ->", unauthenticated.status);
  console.log("SEC-36 delete wrong-owner (real user, different department) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-36 delete nonexistent id ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-36 delete correct-owner ->", correctOwner.status, JSON.stringify(correctOwner.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
});

test("SEC-37: POST /payments/verify — nonexistent order id and wrong-owner order id return the same 403", async () => {
  process.env.RAZORPAY_KEY_ID = "sec37-test-key-id";
  process.env.RAZORPAY_KEY_SECRET = "sec37-test-key-secret";

  // A second pending applicant, independent of the SEC-36 fixtures (pending0/pending1 are
  // consumed - approved/rejected - by that test's correct-owner cases, so a fresh one is
  // needed here to own a payment row that pending2's token must not be able to verify).
  const [otherPending] = await db.insert(usersTable).values({
    fullName: "SEC-37 Test Other Pending", email: "sec37-other-pending@example.test",
    role: "student", status: "pending", departmentId: departmentIds[0],
  }).returning();
  await db.insert(paymentsTable).values({ userId: otherPending.id, planId, razorpayOrderId: "sec37-not-yours",
    amountPaise: 100000, currency: "INR", status: "created" });
  await db.insert(paymentsTable).values({ userId: a.pending2.id, planId, razorpayOrderId: "sec37-mine",
    amountPaise: 100000, currency: "INR", status: "created" });

  const requester = { ...a.pending2, token: jwt.sign({ id: a.pending2.id, scope: "payment" }, process.env.JWT_SECRET!, { expiresIn: "15m" }) };
  const verifyPath = "/payments/verify";

  const unauthenticated = await request(runtime.base, verifyPath, undefined, "POST",
    { razorpay_order_id: "sec37-not-yours", razorpay_payment_id: "irrelevant", razorpay_signature: "irrelevant" });
  const wrongOwner = await request(runtime.base, verifyPath, requester, "POST",
    { razorpay_order_id: "sec37-not-yours", razorpay_payment_id: "irrelevant", razorpay_signature: "irrelevant" });
  const nonexistent = await request(runtime.base, verifyPath, requester, "POST",
    { razorpay_order_id: "sec37-does-not-exist", razorpay_payment_id: "irrelevant", razorpay_signature: "irrelevant" });

  const paymentId = "sec37-payment-id";
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`sec37-mine|${paymentId}`).digest("hex");
  const correctOwner = await request(runtime.base, verifyPath, requester, "POST",
    { razorpay_order_id: "sec37-mine", razorpay_payment_id: paymentId, razorpay_signature: signature });

  console.log("SEC-37 unauthenticated ->", unauthenticated.status);
  console.log("SEC-37 wrong-owner (real order, belongs to a different pending applicant) ->", wrongOwner.status, JSON.stringify(wrongOwner.body));
  console.log("SEC-37 nonexistent order id ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-37 correct-owner ->", correctOwner.status, JSON.stringify(correctOwner.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwner.status, 403);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwner.body);
  assert.equal(correctOwner.status, 200);
  assert.equal(correctOwner.body.status, "paid");
});
