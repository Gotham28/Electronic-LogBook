import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, usersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.env.ADMIN_EMAIL;
if (!email) throw new Error("Missing required environment variable: ADMIN_EMAIL");
const password = process.env.ADMIN_INITIAL_PASSWORD;
if (!password) throw new Error("Missing required environment variable: ADMIN_INITIAL_PASSWORD");

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes");

async function provisionAdmin() {
  const validatedEmail = emailSchema.parse(email);
  const validatedPassword = passwordSchema.parse(password);

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, validatedEmail)).limit(1);
  if (existing) throw new Error("An account with this email already exists");

  const passwordHash = await bcrypt.hash(validatedPassword, 12);
  const [admin] = await db.insert(usersTable).values({
    fullName: "System Admin",
    email: validatedEmail,
    passwordHash,
    role: "admin",
    status: "approved",
    departmentId: null,
  }).returning({ id: usersTable.id });

  console.log("Admin account provisioned:", { id: admin.id });
}

provisionAdmin().catch((error) => {
  // Database exceptions may contain bound values. Never print credentials or SQL parameters.
  console.error(error instanceof z.ZodError ? "Invalid ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD" : error.cause ? "Database provisioning failed; check constraints and existing records" : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
