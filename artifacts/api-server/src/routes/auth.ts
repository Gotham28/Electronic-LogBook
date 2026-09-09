import { Router } from "express";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db, usersTable, studentsTable, departmentsTable, registrationOtpsTable, passwordResetsTable, paymentsTable } from "@workspace/db";
import { eq, and, desc, gt, lt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOtpEmail, sendPasswordResetEmail } from "../lib/mailer.js";
import { requireAuth } from "../middlewares/auth.js";
import { JWT_SECRET } from "../lib/env.js";
import { dateSchema, emailSchema, idSchema, nameSchema, passwordSchema, validate } from "../lib/validation.js";

const router = Router();
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

// Bounded per-process throttling supplements single-use, attempt-limited database codes.
// Multi-instance deployments must also rate-limit at their shared gateway.
const attempts = new Map<string, { count: number; expires: number }>();
router.use((req, res, next) => {
  if (req.method !== "POST") { next(); return; }
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.ip || "unknown";
  const entry = attempts.get(key);
  if ((!entry && attempts.size >= 5000) || (entry && entry.count >= 100)) {
    res.setHeader("Retry-After", "900");
    res.status(429).json({ message: "Too many authentication attempts. Try again later." }); return;
  }
  attempts.set(key, { count: (entry?.count || 0) + 1, expires: entry?.expires || now + 900000 });
  next();
});

const emailBody = z.object({ email: emailSchema }).strict();
const verifyBody = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) }).strict();

function proofMatches(token: unknown, purpose: string, email: string, id: number): boolean {
  try {
    if (typeof token !== "string") return false;
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    return payload.purpose === purpose && payload.email === email && payload.otpId === id;
  } catch { return false; }
}

for (const flow of [
  { send: "/send-otp", verify: "/verify-otp", table: registrationOtpsTable, purpose: "registration", mail: sendOtpEmail },
  { send: "/forgot-password", verify: "/verify-reset-otp", table: passwordResetsTable, purpose: "password-reset", mail: sendPasswordResetEmail },
] as const) {
  router.post(flow.send, validate(emailBody), async (req, res) => {
    const { email } = req.body;
    const [account] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const eligible = flow.purpose === "registration" ? !account : !!account;
    const message = "If this email is eligible, a verification code has been sent.";
    if (!eligible) { res.json({ message }); return; }
    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const issued = await db.transaction(async (tx) => {
      // Serialize issuance for this email across API instances; concurrent sends cannot reset attempts.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${flow.purpose + ":" + email}))`);
      const [recent] = await tx.select().from(flow.table).where(eq(flow.table.email, email)).orderBy(desc(flow.table.createdAt)).limit(1);
      if (recent && Date.now() - recent.createdAt.getTime() < 60000) return false;
      await tx.delete(flow.table).where(eq(flow.table.email, email));
      await tx.insert(flow.table).values({ email, otpHash, expiresAt: new Date(Date.now() + 600000) });
      return true;
    });
    if (!issued) { res.status(429).json({ message: "Please wait 60 seconds before requesting another code" }); return; }
    await flow.mail(email, otp);
    res.json({ message });
  });

  router.post(flow.verify, validate(verifyBody), async (req, res) => {
    const { email, otp } = req.body;
    const [latest] = await db.select().from(flow.table).where(eq(flow.table.email, email)).orderBy(desc(flow.table.createdAt)).limit(1);
    if (!latest) { res.status(400).json({ message: "Invalid or expired code" }); return; }
    const [record] = await db.update(flow.table).set({ attempts: sql`${flow.table.attempts} + 1` })
      .where(and(eq(flow.table.id, latest.id), eq(flow.table.verified, false), gt(flow.table.expiresAt, new Date()), lt(flow.table.attempts, 5))).returning();
    if (!record || !(await bcrypt.compare(otp, record.otpHash))) {
      res.status(400).json({ message: "Invalid or expired code" }); return;
    }
    const [verified] = await db.update(flow.table).set({ verified: true })
      .where(and(eq(flow.table.id, record.id), eq(flow.table.verified, false))).returning();
    if (!verified) { res.status(400).json({ message: "Code has already been used" }); return; }
    const verificationToken = jwt.sign({ purpose: flow.purpose, email, otpId: record.id }, JWT_SECRET, { expiresIn: "10m" });
    res.json({ message: "Email verified", verificationToken });
  });
}

const registrationBody = z.object({ fullName: nameSchema, email: emailSchema, password: passwordSchema,
  registrationNumber: nameSchema, batch: z.string().trim().min(1).max(40), dateOfJoining: dateSchema,
  kuhsId: nameSchema, departmentId: idSchema, verificationToken: z.string().min(1).max(2048) }).strict();

router.post("/register", validate(registrationBody), async (req, res) => {
  const body = req.body as z.infer<typeof registrationBody>;
  const [department] = await db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable)
    .innerJoin(usersTable, and(eq(usersTable.departmentId, departmentsTable.id), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")))
    .where(eq(departmentsTable.id, body.departmentId)).limit(1);
  if (!department) { res.status(400).json({ message: "Choose an available department" }); return; }
  const [code] = await db.select().from(registrationOtpsTable).where(and(eq(registrationOtpsTable.email, body.email),
    eq(registrationOtpsTable.verified, true), gt(registrationOtpsTable.expiresAt, new Date()))).orderBy(desc(registrationOtpsTable.createdAt)).limit(1);
  if (!code || !proofMatches(body.verificationToken, "registration", body.email, code.id)) {
    res.status(400).json({ message: "Please verify your email before registering" }); return;
  }
  const passwordHash = await bcrypt.hash(body.password, 12);
  const createdUserId = await db.transaction(async (tx) => {
    const [consumed] = await tx.delete(registrationOtpsTable).where(and(eq(registrationOtpsTable.id, code.id),
      eq(registrationOtpsTable.verified, true), gt(registrationOtpsTable.expiresAt, new Date()))).returning();
    if (!consumed) return null;
    const [user] = await tx.insert(usersTable).values({ fullName: body.fullName, email: body.email, passwordHash,
      role: "student", status: "pending", departmentId: department.id }).returning({ id: usersTable.id });
    await tx.insert(studentsTable).values({ userId: user.id, registrationNumber: body.registrationNumber, batch: body.batch,
      dateOfJoining: body.dateOfJoining, kuhsId: body.kuhsId, specialty: department.name });
    return user.id;
  });
  if (!createdUserId) { res.status(409).json({ message: "Verification has already been used" }); return; }
  const paymentToken = jwt.sign({ id: createdUserId, scope: "payment" }, JWT_SECRET, { expiresIn: "30m" });
  res.status(201).json({ message: "Registration successful. Pending your department HOD's approval.", paymentToken });
});

async function sessionProfile(id: number) {
  const [row] = await db.select({ id: usersTable.id, name: usersTable.fullName, role: usersTable.role,
    departmentId: usersTable.departmentId, departmentName: departmentsTable.name, studentProfileId: studentsTable.id })
    .from(usersTable).leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .leftJoin(studentsTable, eq(studentsTable.userId, usersTable.id)).where(eq(usersTable.id, id)).limit(1);
  return row;
}

router.post("/login", validate(z.object({ username: z.string().trim().min(1).max(254), password: z.string().min(1).max(72) }).strict()), async (req, res) => {
  const { username, password } = req.body;
  let user = (await db.select().from(usersTable).where(eq(usersTable.email, username.toLowerCase())).limit(1))[0];
  if (!user) {
    const [student] = await db.select({ user: usersTable }).from(studentsTable).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.registrationNumber, username)).limit(1);
    user = student?.user;
  }
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) { res.status(401).json({ message: "Invalid credentials" }); return; }
  if (user.role === "student" && user.status === "pending") {
    const [paid] = await db.select({ id: paymentsTable.id }).from(paymentsTable)
      .where(and(eq(paymentsTable.userId, user.id), eq(paymentsTable.status, "paid"))).limit(1);
    if (!paid) {
      const paymentToken = jwt.sign({ id: user.id, scope: "payment" }, JWT_SECRET, { expiresIn: "30m" });
      res.status(402).json({ message: "Payment is required before your account can be approved.", paymentToken });
      return;
    }
  }
  if (user.status !== "approved") { res.status(403).json({ message: "Your account is pending approval or is inactive" }); return; }
  if (["student", "professor", "hod"].includes(user.role) && !user.departmentId) {
    res.status(403).json({ message: "Your account needs a department assignment" }); return;
  }
  const token = jwt.sign({ id: user.id, sessionVersion: user.sessionVersion }, JWT_SECRET, { expiresIn: "1d" });
  res.cookie("token", token, { ...cookieOptions, maxAge: 86400000 });
  res.json({ ...await sessionProfile(user.id), token });
});

router.get("/me", requireAuth, async (req, res) => { res.json(await sessionProfile(req.user!.id)); });
// Bumps sessionVersion (same mechanism as change-password below and admin.ts's
// deactivate/reactivate), so a token captured before logout is rejected by requireAuth's
// account.sessionVersion check (middlewares/auth.ts:51) rather than staying valid for the
// rest of its 1-day expiry.
router.post("/logout", requireAuth, async (req, res) => {
  await db.update(usersTable).set({ sessionVersion: sql`${usersTable.sessionVersion} + 1` }).where(eq(usersTable.id, req.user!.id));
  res.clearCookie("token", cookieOptions);
  res.json({ message: "Logged out" });
});

router.post("/reset-password", validate(z.object({ email: emailSchema, newPassword: passwordSchema,
  verificationToken: z.string().min(1).max(2048) }).strict()), async (req, res) => {
  const { email, newPassword, verificationToken } = req.body;
  const [code] = await db.select().from(passwordResetsTable).where(and(eq(passwordResetsTable.email, email),
    eq(passwordResetsTable.verified, true), gt(passwordResetsTable.expiresAt, new Date()))).orderBy(desc(passwordResetsTable.createdAt)).limit(1);
  if (!code || !proofMatches(verificationToken, "password-reset", email, code.id)) {
    res.status(400).json({ message: "Please verify your reset code" }); return;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const changed = await db.transaction(async (tx) => {
    const [consumed] = await tx.delete(passwordResetsTable).where(and(eq(passwordResetsTable.id, code.id),
      eq(passwordResetsTable.verified, true), gt(passwordResetsTable.expiresAt, new Date()))).returning();
    if (!consumed) return false;
    await tx.update(usersTable).set({ passwordHash, sessionVersion: sql`${usersTable.sessionVersion} + 1` }).where(eq(usersTable.email, email));
    return true;
  });
  if (!changed) { res.status(409).json({ message: "Verification has already been used" }); return; }
  res.json({ message: "Password reset. Please sign in again." });
});

router.post("/change-password", requireAuth, validate(z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema }).strict()), async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  if (!user?.passwordHash || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    res.status(400).json({ message: "Current password is incorrect" }); return;
  }
  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await db.update(usersTable).set({ passwordHash, sessionVersion: sql`${usersTable.sessionVersion} + 1` }).where(eq(usersTable.id, user.id));
  res.clearCookie("token", cookieOptions);
  res.json({ message: "Password changed. Please sign in again." });
});

export default router;
