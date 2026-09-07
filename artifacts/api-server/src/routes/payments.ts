import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db, paymentsTable, subscriptionPlansTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc, gt, sql } from "drizzle-orm";
import { requirePaymentToken } from "../middlewares/payment-token.js";
import { validate } from "../lib/validation.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.use(requirePaymentToken);

// Same bounded per-process throttle pattern as routes/auth.ts:16-31, keyed on the
// payment token's user id instead of IP. Multi-instance deployments must also
// rate-limit at their shared gateway.
const attempts = new Map<number, { count: number; expires: number }>();
router.use((req, res, next) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.paymentUser!.id;
  const entry = attempts.get(key);
  if ((!entry && attempts.size >= 5000) || (entry && entry.count >= 20)) {
    res.setHeader("Retry-After", "900");
    res.status(429).json({ message: "Too many payment attempts. Try again later." });
    return;
  }
  attempts.set(key, { count: (entry?.count || 0) + 1, expires: entry?.expires || now + 900000 });
  next();
});

function razorpayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

// Razorpay's error responses are shaped { error: { code, description, ... } }. Narrowed from
// unknown rather than cast to any, mirroring the postgresErrorCode style in
// payments-webhook.ts.
function razorpayErrorDetails(body: unknown): { code?: string; description?: string } {
  if (typeof body !== "object" || body === null || !("error" in body)) return {};
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return {};
  const code = "code" in error && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
  const description = "description" in error && typeof (error as { description?: unknown }).description === "string"
    ? (error as { description: string }).description : undefined;
  return { code, description };
}

// An unpaid order is only reused while the payment token that can pay it is still valid.
const REUSE_WINDOW_MS = 1800000;

router.post("/create-order", validate(z.object({}).strict()), async (req, res) => {
  const credentials = razorpayCredentials();
  if (!credentials) { res.status(503).json({ message: "Payments are not configured" }); return; }
  const userId = req.paymentUser!.id;
  const lockKey = "payment-order:" + userId;

  // Both checks run under a per-user advisory lock so a concurrent call cannot slip between
  // them. The Razorpay call below deliberately runs outside any transaction; the second
  // transaction re-checks under the same lock before inserting.
  const decided = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [paid] = await tx.select({ id: paymentsTable.id }).from(paymentsTable)
      .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "paid"))).limit(1);
    if (paid) return { outcome: "paid" as const };
    const [reusable] = await tx.select().from(paymentsTable)
      .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "created"),
        gt(paymentsTable.createdAt, new Date(Date.now() - REUSE_WINDOW_MS))))
      .orderBy(desc(paymentsTable.createdAt)).limit(1);
    if (reusable) return { outcome: "reuse" as const, row: reusable };
    return { outcome: "create" as const };
  });
  if (decided.outcome === "paid") { res.status(409).json({ message: "A completed payment already exists for this account" }); return; }
  if (decided.outcome === "reuse") {
    res.json({ orderId: decided.row.razorpayOrderId, amountPaise: decided.row.amountPaise,
      currency: decided.row.currency, keyId: credentials.keyId });
    return;
  }

  const [user] = await db.select({ departmentId: usersTable.departmentId }).from(usersTable)
    .where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(401).json({ message: "Invalid payment token" }); return; }

  let plan;
  if (user.departmentId) {
    [plan] = await db.select().from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.departmentId, user.departmentId), eq(subscriptionPlansTable.active, true))).limit(1);
  }
  if (!plan) {
    [plan] = await db.select().from(subscriptionPlansTable)
      .where(and(isNull(subscriptionPlansTable.departmentId), eq(subscriptionPlansTable.active, true))).limit(1);
  }
  if (!plan) { res.status(500).json({ message: "No subscription plan is configured" }); return; }
  const selectedPlan = plan;

  let response: Response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: selectedPlan.amountPaise,
        currency: selectedPlan.currency,
        receipt: crypto.randomUUID(),
        payment_capture: 1,
      }),
    });
  } catch {
    logger.error("Razorpay order request failed");
    res.status(502).json({ message: "Unable to create payment order" });
    return;
  }
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    const { code, description } = razorpayErrorDetails(errorBody);
    logger.error({ status: response.status, razorpayCode: code, razorpayDescription: description }, "Razorpay order creation failed");
    res.status(502).json({ message: "Unable to create payment order" });
    return;
  }
  const order = await response.json().catch(() => null) as { id?: string } | null;
  if (!order?.id) {
    logger.error({ status: response.status }, "Razorpay order response missing id");
    res.status(502).json({ message: "Unable to create payment order" });
    return;
  }
  const orderId = order.id;

  // Re-check under the same lock: a concurrent request may have inserted its own row while
  // this one was at Razorpay. The loser's order is left unused at Razorpay, never stored and
  // never handed to the client, so no applicant is shown two payable orders.
  const stored = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [paid] = await tx.select({ id: paymentsTable.id }).from(paymentsTable)
      .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "paid"))).limit(1);
    if (paid) return { outcome: "paid" as const };
    const [reusable] = await tx.select().from(paymentsTable)
      .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "created"),
        gt(paymentsTable.createdAt, new Date(Date.now() - REUSE_WINDOW_MS))))
      .orderBy(desc(paymentsTable.createdAt)).limit(1);
    if (reusable) return { outcome: "reuse" as const, row: reusable };
    const [inserted] = await tx.insert(paymentsTable).values({
      userId, planId: selectedPlan.id, razorpayOrderId: orderId,
      amountPaise: selectedPlan.amountPaise, currency: selectedPlan.currency, status: "created",
    }).returning();
    return { outcome: "inserted" as const, row: inserted };
  });

  if (stored.outcome === "paid") { res.status(409).json({ message: "A completed payment already exists for this account" }); return; }
  if (stored.outcome === "reuse") logger.info({ userId }, "Concurrent request won; discarding this duplicate Razorpay order");
  res.json({ orderId: stored.row.razorpayOrderId, amountPaise: stored.row.amountPaise,
    currency: stored.row.currency, keyId: credentials.keyId });
});

const verifyBody = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
}).strict();

router.post("/verify", validate(verifyBody), async (req, res) => {
  const credentials = razorpayCredentials();
  if (!credentials) { res.status(503).json({ message: "Payments are not configured" }); return; }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as z.infer<typeof verifyBody>;

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.razorpayOrderId, razorpay_order_id)).limit(1);
  if (!payment) { res.status(404).json({ message: "Payment order not found" }); return; }
  if (payment.userId !== req.paymentUser!.id) { res.status(403).json({ message: "This payment does not belong to your account" }); return; }
  if (payment.status === "paid") { res.json({ status: "paid" }); return; }

  const expected = crypto.createHmac("sha256", credentials.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(razorpay_signature, "utf8");
  const matches = expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  if (!matches) { res.status(400).json({ message: "Signature verification failed" }); return; }

  const [updated] = await db.update(paymentsTable).set({ status: "paid", razorpayPaymentId: razorpay_payment_id, updatedAt: new Date() })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "created")))
    .returning({ id: paymentsTable.id });
  if (!updated) {
    // The row was not 'created', so nothing was marked paid. Report what it actually is
    // rather than the stale copy read above.
    const [current] = await db.select({ status: paymentsTable.status }).from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id)).limit(1);
    if (!current) { res.status(404).json({ message: "Payment order not found" }); return; }
    // 'paid' here means a concurrent verify for this same order won the race and wrote the
    // row first. The payment did succeed, so this caller gets the same 200 as the idempotent
    // path above. Answering 409 would tell an applicant who has genuinely paid that they
    // have not. Do NOT collapse this back into a single 409.
    if (current.status === "paid") { res.json({ status: "paid" }); return; }
    res.status(409).json({ message: "This payment cannot be completed", status: current.status });
    return;
  }

  res.json({ status: "paid" });
});

export default router;
