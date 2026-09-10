import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, departmentsTable, usersTable, departmentConfigsTable, procedureTypesTable, departmentCatalogTable } from "@workspace/db";
import { configSchema, emailSchema, nameSchema, passwordSchema, targetSchema } from "./validation.js";
import { sendAccountCreatedEmail } from "./mailer.js";

export const setupSchema = z.object({
  name: nameSchema, code: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/), description: z.string().max(1000).optional(),
  hod: z.object({ fullName: nameSchema, email: emailSchema }).strict(),
  config: configSchema.optional(),
  procedures: z.array(z.object({ name: nameSchema, group: nameSchema, required: targetSchema }).strict()).max(1000).optional(),
  catalog: z.array(z.object({ kind: z.enum(["posting", "academic"]), name: nameSchema, value: nameSchema,
    required: targetSchema, period: z.enum(["total", "month"]) }).strict()).max(1000).optional(),
}).strict();

export async function provisionDepartment(input: unknown, initialPassword: unknown) {
  const setup = setupSchema.parse(input);
  const password = passwordSchema.parse(initialPassword);
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.transaction(async (tx) => {
    const [found] = await tx.select().from(departmentsTable).where(eq(departmentsTable.code, setup.code)).limit(1);
    if (found && found.name !== setup.name) throw new Error("This department code already belongs to a different department name");
    const department = found || (await tx.insert(departmentsTable).values({ name: setup.name, code: setup.code, description: setup.description }).returning())[0];
    const [hod] = await tx.select({ id: usersTable.id, email: usersTable.email }).from(usersTable)
      .where(and(eq(usersTable.departmentId, department.id), eq(usersTable.role, "hod"), eq(usersTable.status, "approved"))).limit(1);
    if (hod) throw new Error("An active HOD already exists. No accounts or credentials were changed.");
    const [created] = await tx.insert(usersTable).values({ ...setup.hod, passwordHash, role: "hod", status: "approved", departmentId: department.id }).returning({ id: usersTable.id });
    if (setup.config) await tx.insert(departmentConfigsTable).values({ ...setup.config, departmentId: department.id })
      .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: setup.config });
    if (setup.procedures?.length) await tx.insert(procedureTypesTable).values(setup.procedures.map((p) => ({ ...p, departmentId: department.id })));
    if (setup.catalog?.length) await tx.insert(departmentCatalogTable).values(setup.catalog.map((p) => ({ ...p, departmentId: department.id })));
    return { departmentId: department.id, hodId: created.id };
  });

  try {
    await sendAccountCreatedEmail(setup.hod.email, setup.hod.fullName, password as string, "hod", setup.name);
  } catch (error) {
    console.warn(`HOD account created but welcome email failed to send to ${setup.hod.email}`);
  }

  return result;
}

