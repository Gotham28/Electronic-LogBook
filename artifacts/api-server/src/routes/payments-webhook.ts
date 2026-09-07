import { Router } from "express";
import crypto from "node:crypto";
import { db, paymentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

function verifySignature(raw: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// No requireAuth / requirePaymentToken here, deliberately. The caller is Razorpay's own
// server, not a logged-in user or a pending applicant with a payment token - there is no
// session to authenticate. Ownership (AGENTS.md "ownership before data") is still enforced,
// just differently: the payments row is looked up by razorpay_order_id from the
// signature-verified payload, and that row's own userId is what everything downstream uses.
// A userId is never read from the request body or trusted from the payload to identify a user.
router.post("/webhook", async (req, res) => {
  const signatureHeader = req.headers["x-razorpay-signature"];
  const eventIdHeader = req.headers["x-razorpay-event-id"];
  const eventId = typeof eventIdHeader === "string" ? eventIdHeader : undefined;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const raw = req.body;

  if (typeof signatureHeader !== "string" || !signatureHeader || !secret || !Buffer.isBuffer(raw) || !verifySignature(raw, signatureHeader, secret)) {
    logger.warn({ eventId, status: 400 }, "Razorpay webhook: signature verification failed");
    res.sendStatus(400);
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    logger.warn({ eventId, status: 400 }, "Razorpay webhook: body is not valid JSON");
    res.sendStatus(400);
    return;
  }

  const event = typeof payload?.event === "string" ? payload.event : undefined;
  const entity = payload?.payload?.payment?.entity;
  const orderId: string | undefined = typeof entity?.order_id === "string" ? entity.order_id : undefined;

  if (event !== "payment.captured" && event !== "payment.failed") {
    logger.info({ event, eventId, orderId, status: 200 }, "Razorpay webhook: event ignored");
    res.sendStatus(200);
    return;
  }

  if (!orderId || typeof entity?.id !== "string" || typeof entity?.amount !== "number") {
    logger.warn({ event, eventId, orderId, status: 200 }, "Razorpay webhook: payload missing expected payment fields");
    res.sendStatus(200);
    return;
  }
  const paymentId: string = entity.id;
  const amount: number = entity.amount;

  const [row] = await db.select().from(paymentsTable).where(eq(paymentsTable.razorpayOrderId, orderId)).limit(1);
  if (!row) {
    logger.warn({ event, eventId, orderId, status: 200 }, "Razorpay webhook: order not found");
    res.sendStatus(200);
    return;
  }

  if (event === "payment.captured") {
    if (amount !== row.amountPaise) {
      logger.warn({ event, eventId, orderId, status: 200, receivedAmountPaise: amount, expectedAmountPaise: row.amountPaise },
        "Razorpay webhook: captured amount does not match stored order amount");
      res.sendStatus(200);
      return;
    }
    await db.update(paymentsTable).set({ status: "paid", razorpayPaymentId: paymentId, updatedAt: new Date() })
      .where(and(eq(paymentsTable.razorpayOrderId, orderId), eq(paymentsTable.status, "created")));
    logger.info({ event, eventId, orderId, status: 200 }, "Razorpay webhook: processed");
    res.sendStatus(200);
    return;
  }

  // payment.failed
  await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(paymentsTable.razorpayOrderId, orderId), eq(paymentsTable.status, "created")));
  logger.info({ event, eventId, orderId, status: 200 }, "Razorpay webhook: processed");
  res.sendStatus(200);
});

export default router;
