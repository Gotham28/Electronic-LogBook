import { Router } from "express";
import crypto from "node:crypto";
import { db, paymentsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

function verifySignature(raw: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

// Mirrors the error.code / error.cause.code shape already relied on in app.ts's error
// handler, narrowed for an `unknown` catch binding instead of `any`.
function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const direct = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (typeof direct === "string") return direct;
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    const nested = (cause as { code?: unknown }).code;
    if (typeof nested === "string") return nested;
  }
  return undefined;
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

  if (!secret) {
    logger.error({ eventId, status: 400 }, "Razorpay webhook: RAZORPAY_WEBHOOK_SECRET is not configured, webhooks cannot be verified");
    res.sendStatus(400);
    return;
  }

  if (typeof signatureHeader !== "string" || !signatureHeader || !Buffer.isBuffer(raw) || !verifySignature(raw, signatureHeader, secret)) {
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

  try {
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
      // Razorpay allows retrying payment against the same order_id, so a prior payment.failed
      // must not permanently strand the row - a declined card followed by a successful one is
      // payment.failed then payment.captured for the same order_id. 'paid' is excluded (never
      // reprocess an already-paid row) and 'refunded' is excluded (never silently resurrect a
      // refunded payment back to paid) - inArray only, no "status != 'paid'" shortcut.
      await db.update(paymentsTable).set({ status: "paid", razorpayPaymentId: paymentId, updatedAt: new Date() })
        .where(and(eq(paymentsTable.razorpayOrderId, orderId), inArray(paymentsTable.status, ["created", "failed"])));
      logger.info({ event, eventId, orderId, status: 200 }, "Razorpay webhook: processed");
      res.sendStatus(200);
      return;
    }

    // payment.failed
    await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(paymentsTable.razorpayOrderId, orderId), eq(paymentsTable.status, "created")));
    logger.info({ event, eventId, orderId, status: 200 }, "Razorpay webhook: processed");
    res.sendStatus(200);
  } catch (error) {
    // Never surface a non-2xx to Razorpay for a database error: it triggers retries and, after
    // 24 hours of failures, Razorpay disables the webhook outright. The row simply stays at its
    // previous status, which the browser /verify path already handles safely. No error object,
    // payload, or stack trace is logged - only these four fields.
    if (postgresErrorCode(error) === "23505") {
      // payments_one_paid_per_user rejected this write: the user already has a 'paid' row and
      // this capture could not be recorded against a second one. This is not a transient
      // blip - it means the user was charged twice and only one charge is on record.
      logger.error({ event, eventId, orderId, status: 200 },
        "Razorpay webhook: duplicate paid row for this user, capture could not be recorded, MANUAL RECONCILIATION REQUIRED");
    } else {
      logger.error({ event, eventId, orderId, status: 200 }, "Razorpay webhook: database operation failed");
    }
    res.sendStatus(200);
  }
});

export default router;
