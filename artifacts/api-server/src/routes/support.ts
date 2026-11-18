import { Router, type Request } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, usersTable, departmentsTable, supportTicketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { JWT_SECRET } from "../lib/env.js";
import { sendSupportTicketEmail } from "../lib/mailer.js";

const router = Router();

// Bounded per-process throttling supplements honeypot protection.
// Multi-instance deployments must also rate-limit at their shared gateway.
// req.ip is the resolved client IP, not the shared load-balancer address, now that
// app.ts sets trust proxy to exactly one hop (SEC-12) - each attacker gets their own
// bucket instead of every caller sharing one.
const supportIpAttempts = new Map<string, { count: number; expires: number }>();
let globalSupportAttempts = { count: 0, expires: Date.now() + 3600000 };
const IP_WINDOW_MS = 3600000; // 1 hour
const MAX_PER_IP = 5;
const MAX_GLOBAL_PER_HOUR = 100;

export const ticketCategories = ["login_issue", "bug", "feature_request", "other"] as const;
export type TicketCategory = typeof ticketCategories[number];

const createTicketSchema = z.object({
  category: z.enum(ticketCategories, { errorMap: () => ({ message: "Select a valid category" }) }),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message must be at most 2000 characters"),
  name: z.string().trim().max(100, "Name must be at most 100 characters").optional().nullable(),
  email: z.string().trim().email("Enter a valid email address").max(254).optional().nullable().or(z.literal("")),
  pageUrl: z.string().trim().max(500, "Page URL must be at most 500 characters").optional().nullable(),
  userAgent: z.string().trim().max(300).optional().nullable(),
  honeypot: z.string().optional().nullable(),
  hp: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
}).strict();

async function resolveOptionalUser(req: Request): Promise<{ userId: number | null; userRole: string | null; departmentName: string | null }> {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.token;

  if (!token || typeof token !== "string") {
    return { userId: null, userRole: null, departmentName: null };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
    if (!decoded || decoded.scope === "payment" || !Number.isSafeInteger(decoded.id) || decoded.id <= 0) {
      return { userId: null, userRole: null, departmentName: null };
    }
    const [user] = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
        status: usersTable.status,
        sessionVersion: usersTable.sessionVersion,
      })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.id))
      .limit(1);

    if (!user || user.status !== "approved" || user.sessionVersion !== (decoded.sessionVersion ?? 0)) {
      return { userId: null, userRole: null, departmentName: null };
    }

    let departmentName: string | null = null;
    if (user.departmentId) {
      const [dept] = await db
        .select({ name: departmentsTable.name })
        .from(departmentsTable)
        .where(eq(departmentsTable.id, user.departmentId))
        .limit(1);
      if (dept) departmentName = dept.name;
    }

    return { userId: user.id, userRole: user.role, departmentName };
  } catch {
    return { userId: null, userRole: null, departmentName: null };
  }
}

// POST /api/support/tickets (public endpoint, no requireAuth)
router.post("/tickets", async (req, res) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  const { category, message, name, email, pageUrl, userAgent, honeypot, hp, website } = parsed.data;

  // Abuse protection 1: Honeypot field (hidden from genuine users). If filled, pretend success.
  const honeypotVal = honeypot || hp || website;
  if (typeof honeypotVal === "string" && honeypotVal.trim().length > 0) {
    const fakeCode = `SUP-${randomBytes(3).toString("hex").toUpperCase()}`;
    res.status(200).json({ referenceCode: fakeCode });
    return;
  }

  // Abuse protection 2: In-memory per-IP and global throttling
  const now = Date.now();
  for (const [key, value] of supportIpAttempts) {
    if (value.expires <= now) supportIpAttempts.delete(key);
  }
  if (globalSupportAttempts.expires <= now) {
    globalSupportAttempts = { count: 0, expires: now + IP_WINDOW_MS };
  }

  const clientIp = req.ip || "unknown";
  const ipEntry = supportIpAttempts.get(clientIp);

  if ((ipEntry && ipEntry.count >= MAX_PER_IP) || globalSupportAttempts.count >= MAX_GLOBAL_PER_HOUR) {
    res.setHeader("Retry-After", "3600");
    res.status(429).json({ message: "Too many support requests. Please try again later." });
    return;
  }

  // Resolve optional user identity without failing on invalid token
  const { userId, userRole, departmentName } = await resolveOptionalUser(req);

  // Strip query string and fragment from page_url
  const sanitizedPageUrl = pageUrl ? pageUrl.split(/[?#]/)[0].slice(0, 500) : null;
  const rawUserAgent = userAgent || req.headers["user-agent"] || null;
  const sanitizedUserAgent = rawUserAgent ? String(rawUserAgent).slice(0, 300) : null;

  const referenceCode = `SUP-${randomBytes(3).toString("hex").toUpperCase()}`;

  // 1. Insert ticket into DB first
  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      referenceCode,
      name: name?.trim() || null,
      email: email?.trim() || null,
      category,
      message: message.trim(),
      pageUrl: sanitizedPageUrl,
      userAgent: sanitizedUserAgent,
      userId,
      status: "open",
      emailStatus: "pending",
    })
    .returning();

  // Increment throttle counters after genuine insert
  supportIpAttempts.set(clientIp, {
    count: (ipEntry?.count || 0) + 1,
    expires: ipEntry?.expires || now + IP_WINDOW_MS,
  });
  globalSupportAttempts.count++;

  // 2. Dispatch email asynchronously (never blocks response and never fails the request)
  void (async () => {
    try {
      await sendSupportTicketEmail({
        referenceCode: ticket.referenceCode,
        category: ticket.category,
        name: ticket.name,
        email: ticket.email,
        message: ticket.message,
        pageUrl: ticket.pageUrl,
        userAgent: ticket.userAgent,
        createdAt: ticket.createdAt,
        userRole,
        departmentName,
      });
      await db
        .update(supportTicketsTable)
        .set({ emailStatus: "sent", updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, ticket.id));
    } catch {
      // Do not log message body or reporter email per AGENTS.md §8 and log-leaks standard
      req.log?.error?.({ ticketId: ticket.id, status: "email_failed" }, "Support ticket email delivery failed");
      await db
        .update(supportTicketsTable)
        .set({ emailStatus: "failed", updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, ticket.id))
        .catch(() => {});
    }
  })();

  res.status(200).json({ referenceCode: ticket.referenceCode });
});

export default router;
