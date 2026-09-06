import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db, paymentsTable, subscriptionPlansTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
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

router.post("/create-order", validate(z.object({}).strict()), async (req, res) => {
  const credentials = razorpayCredentials();
  if (!credentials) { res.status(503).json({ message: "Payments are not configured" }); return; }
  const userId = req.paymentUser!.id;

  const [existingPaid] = await db.select({ id: paymentsTable.id }).from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "paid"))).limit(1);
  if (existingPaid) { res.status(409).json({ message: "A completed payment already exists for this account" }); return; }

  const [existingCreated] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "created")))
    .orderBy(desc(paymentsTable.createdAt)).limit(1);
  if (existingCreated) {
    res.json({ orderId: existingCreated.razorpayOrderId, amountPaise: existingCreated.amountPaise,
      currency: existingCreated.currency, keyId: credentials.keyId });
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

  let response: Response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: plan.amountPaise,
        currency: plan.currency,
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
    logger.error({ status: response.status }, "Razorpay order creation failed");
    res.status(502).json({ message: "Unable to create payment order" });
    return;
  }
  const order = await response.json().catch(() => null) as { id?: string } | null;
  if (!order?.id) {
    logger.error({ status: response.status }, "Razorpay order response missing id");
    res.status(502).json({ message: "Unable to create payment order" });
    return;
  }

  await db.insert(paymentsTable).values({
    userId, planId: plan.id, razorpayOrderId: order.id,
    amountPaise: plan.amountPaise, currency: plan.currency, status: "created",
  });

  res.json({ orderId: order.id, amountPaise: plan.amountPaise, currency: plan.currency, keyId: credentials.keyId });
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

  await db.update(paymentsTable).set({ status: "paid", razorpayPaymentId: razorpay_payment_id, updatedAt: new Date() })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "created")));

  res.json({ status: "paid" });
});

export default router;
