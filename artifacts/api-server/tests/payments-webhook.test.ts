import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setup, accounts as a } from "./support.js";
import { engine, db, paymentsTable, subscriptionPlansTable } from "./database.js";
import { eq } from "drizzle-orm";

// Fixture tests against PGlite (see support.ts / database.ts) - these prove the route's
// signature check, event routing, ownership lookup, amount check and idempotent writes
// behave correctly. They do NOT exercise the raw-body middleware wiring against real
// Razorpay traffic (real HTTP framing, chunked bodies, etc.) - that needs a live test webhook.
process.env.RAZORPAY_WEBHOOK_SECRET = "test-only-webhook-secret";

let runtime: Awaited<ReturnType<typeof setup>>;
let planId: number;

before(async () => {
  runtime = await setup();
  const [plan] = await db.insert(subscriptionPlansTable).values({
    code: "webhook-test-plan", name: "Webhook Test Plan", amountPaise: 140000, currency: "INR", durationMonths: 36, active: true,
  }).returning();
  planId = plan.id;
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

function sign(rawBody: string) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest("hex");
}

async function postWebhook(rawBody: string, signature?: string) {
  const response = await fetch(runtime.base + "/api/payments/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signature !== undefined ? { "X-Razorpay-Signature": signature } : {}) },
    body: rawBody,
  });
  return response.status;
}

async function insertPayment(orderId: string, userId: number, amountPaise = 140000, status: "created" | "paid" | "failed" = "created") {
  const [row] = await db.insert(paymentsTable).values({ userId, planId, razorpayOrderId: orderId, amountPaise, currency: "INR", status }).returning();
  return row;
}

async function paymentRow(orderId: string) {
  const [row] = await db.select().from(paymentsTable).where(eq(paymentsTable.razorpayOrderId, orderId)).limit(1);
  return row;
}

function capturedBody(orderId: string, paymentId: string, amount: number) {
  return JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId, amount } } } });
}
function failedBody(orderId: string, paymentId: string, amount: number) {
  return JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: paymentId, order_id: orderId, amount } } } });
}

test("missing X-Razorpay-Signature header -> 400, payments row unchanged", async () => {
  await insertPayment("order_missing_sig", a.pending0.id);
  const body = capturedBody("order_missing_sig", "pay_1", 140000);
  const status = await postWebhook(body);
  assert.equal(status, 400);
  assert.equal((await paymentRow("order_missing_sig"))!.status, "created");
});

test("wrong signature -> 400, payments row unchanged", async () => {
  await insertPayment("order_wrong_sig", a.pending0.id);
  const body = capturedBody("order_wrong_sig", "pay_2", 140000);
  const status = await postWebhook(body, "0".repeat(64));
  assert.equal(status, 400);
  assert.equal((await paymentRow("order_wrong_sig"))!.status, "created");
});

test("valid signature, payment.captured, known order at 'created' -> 200, row becomes 'paid' with razorpay_payment_id stored", async () => {
  await insertPayment("order_captured", a.pending0.id);
  const body = capturedBody("order_captured", "pay_captured_1", 140000);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  const row = await paymentRow("order_captured");
  assert.equal(row!.status, "paid");
  assert.equal(row!.razorpayPaymentId, "pay_captured_1");
});

test("the exact same request replayed a second time -> 200, row still 'paid', unchanged", async () => {
  const body = capturedBody("order_captured", "pay_captured_1", 140000);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  const row = await paymentRow("order_captured");
  assert.equal(row!.status, "paid");
  assert.equal(row!.razorpayPaymentId, "pay_captured_1");
});

test("valid signature, payment.captured, unknown order id -> 200, no row created", async () => {
  const body = capturedBody("order_does_not_exist", "pay_unknown", 140000);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  assert.equal(await paymentRow("order_does_not_exist"), undefined);
});

test("valid signature, event 'subscription.charged' (unhandled) -> 200, nothing written", async () => {
  await insertPayment("order_unhandled_event", a.pending0.id);
  const body = JSON.stringify({ event: "subscription.charged", payload: {} });
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  assert.equal((await paymentRow("order_unhandled_event"))!.status, "created");
});

test("valid signature, payment.failed on a 'created' row -> 200, row becomes 'failed'", async () => {
  await insertPayment("order_failed", a.pending0.id);
  const body = failedBody("order_failed", "pay_failed_1", 140000);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  assert.equal((await paymentRow("order_failed"))!.status, "failed");
});

test("valid signature, payment.failed on a row already at 'paid' -> 200, row STILL 'paid'", async () => {
  // Different user than the 'order_captured' test: payments_one_paid_per_user allows only
  // one 'paid' row per user, and that row already exists for a.pending0.
  await insertPayment("order_already_paid", a.pending1.id, 140000, "paid");
  const body = failedBody("order_already_paid", "pay_should_not_apply", 140000);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  assert.equal((await paymentRow("order_already_paid"))!.status, "paid");
});

test("valid signature, payment.captured, amount mismatch -> 200, row still 'created'", async () => {
  await insertPayment("order_amount_mismatch", a.pending2.id, 140000);
  const body = capturedBody("order_amount_mismatch", "pay_mismatch", 99999);
  const status = await postWebhook(body, sign(body));
  assert.equal(status, 200);
  assert.equal((await paymentRow("order_amount_mismatch"))!.status, "created");
});
