import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, departmentsTable, usersTable, departmentConfigsTable, procedureTypesTable, departmentCatalogTable, studentsTable, caseLogsTable, procedureLogsTable } from "@workspace/db";
import { configSchema, emailSchema, nameSchema, passwordSchema, targetSchema } from "./validation.js";
import { sendAccountCreatedEmail } from "./mailer.js";

export const setupSchema = z.object({
  name: nameSchema, code: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/), description: z.string().max(1000).optional(),
  hod: z.object({ fullName: nameSchema, email: emailSchema }).strict(),
  config: configSchema.optional(),
  procedures: z.array(z.object({ name: nameSchema, group: nameSchema, required: targetSchema }).strict()).max(1000).optional(),
  catalog: z.array(z.object({ kind: z.enum(["posting", "academic", "case_category", "competency_level", "leave_type"]), name: nameSchema, value: nameSchema,
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
    
    const catalog = setup.catalog?.map((p) => ({ ...p, departmentId: department.id })) || [];
    if (!catalog.some((c) => c.kind === "competency_level")) {
      catalog.push(
        { departmentId: department.id, kind: "competency_level", name: "Observed / procedure seen", value: "observed", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Assisted", value: "assisted", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Performed under supervision", value: "performed_under_supervision", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Performed independently", value: "performed_independently", required: 0, period: "total" }
      );
    }
    if (!catalog.some((c) => c.kind === "leave_type")) {
      catalog.push(
        { departmentId: department.id, kind: "leave_type", name: "Casual Leave", value: "casual", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Academic Leave", value: "academic", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Medical Leave", value: "medical", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Maternity / Paternity Leave", value: "maternity_paternity", required: 0, period: "total" }
      );
    }
    if (catalog.length) await tx.insert(departmentCatalogTable).values(catalog).onConflictDoNothing();

    return { departmentId: department.id, hodId: created.id };
  });

  try {
    await provisionMirrorForRealDepartment(result.departmentId, setup.name, setup.description);
  } catch (error) {
    console.warn(`Failed to provision mirror test department for ${setup.code}`);
  }

  try {
    await sendAccountCreatedEmail(setup.hod.email, setup.hod.fullName, password as string, "hod", setup.name);
  } catch (error) {
    console.warn(`HOD account created but welcome email failed to send to ${setup.hod.email}`);
  }

  return result;
}

export async function provisionMirrorForRealDepartment(
  realDepartmentId: number,
  realDepartmentName: string,
  realDepartmentDescription: string | null | undefined
): Promise<{ created: boolean; mirrorDepartmentId?: number }> {
  return await db.transaction(async (tx) => {
    const [existingMirror] = await tx.select()
      .from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDepartmentId))
      .limit(1);
    
    if (existingMirror) return { created: false };

    const testCode = `TEST-${realDepartmentId}`;
    const [mirrorDept] = await tx.insert(departmentsTable).values({
      name: `${realDepartmentName} (Test)`,
      code: testCode,
      description: realDepartmentDescription,
      isTest: true,
      configSourceDepartmentId: realDepartmentId
    }).returning();

    const safeName = realDepartmentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const testPasswordHash = await bcrypt.hash(testCode, 12);

    await tx.insert(usersTable).values({
      fullName: "Test HOD",
      email: `test.hod@${safeName}.test`,
      passwordHash: testPasswordHash,
      role: "hod",
      status: "approved",
      departmentId: mirrorDept.id
    });

    const [testProfUser] = await tx.insert(usersTable).values({
      fullName: "Test Professor",
      email: `test.prof@${safeName}.test`,
      passwordHash: testPasswordHash,
      role: "professor",
      status: "approved",
      departmentId: mirrorDept.id
    }).returning({ id: usersTable.id });

    const [testStudentUser] = await tx.insert(usersTable).values({
      fullName: "Test Student",
      email: `test.student@${safeName}.test`,
      passwordHash: testPasswordHash,
      role: "student",
      status: "approved",
      departmentId: mirrorDept.id
    }).returning({ id: usersTable.id });


    const [testStudent] = await tx.insert(studentsTable).values({
      userId: testStudentUser.id,
      registrationNumber: `TEST-${testStudentUser.id}`,
      batch: new Date().getFullYear().toString(),
      dateOfJoining: new Date().toISOString().slice(0, 10),
      kuhsId: `UNIV-${testStudentUser.id}`,
      specialty: mirrorDept.name
    }).returning({ id: studentsTable.id });

    // Insert test fixture logs using the source department's own catalog.
    // category comes from department_catalog (kind = 'case_category'),
    // procedureGroup / procedureName come from procedure_types.
    // All via configSourceDepartmentId (= realDepartmentId). If the source
    // has no catalog rows, skip — do not invent values (AGENTS.md §7).
    const sourceCaseCategories = await tx.select({
      name: departmentCatalogTable.name,
      value: departmentCatalogTable.value,
    }).from(departmentCatalogTable).where(
      and(eq(departmentCatalogTable.departmentId, realDepartmentId), eq(departmentCatalogTable.kind, "case_category"))
    );

    const sourceProcedures = await tx.select({
      name: procedureTypesTable.name,
      group: procedureTypesTable.group,
    }).from(procedureTypesTable).where(
      eq(procedureTypesTable.departmentId, realDepartmentId)
    );

    const dummyDate = new Date().toISOString().slice(0, 10);

    // Case logs — one per source case_category, up to 2
    if (sourceCaseCategories.length > 0) {
      const caseRows = sourceCaseCategories.slice(0, 2).map((cat, idx) => ({
        studentId: testStudent.id,
        supervisorId: testProfUser.id,
        date: dummyDate,
        patientUhid: `TEST-UHID-${idx + 1}`,
        patientAge: String(20 + idx * 10),
        patientGender: (idx === 0 ? "male" : "female") as "male" | "female",
        diagnosisFinal: `[TEST DATA] Synthetic fixture for ${cat.name}`,
        category: cat.value,
        status: idx === 0 ? ("verified" as const) : ("pending" as const),
        ...(idx === 0 ? { reviewedBy: testProfUser.id, reviewedAt: new Date() } : {}),
      }));
      await tx.insert(caseLogsTable).values(caseRows);
    }

    // Procedure logs — one per source procedure_type, up to 2
    if (sourceProcedures.length > 0) {
      const procRows = sourceProcedures.slice(0, 2).map((proc, idx) => ({
        studentId: testStudent.id,
        supervisorId: testProfUser.id,
        procedureGroup: proc.group,
        procedureName: proc.name,
        date: dummyDate,
        patientUhid: `TEST-UHID-P${idx + 1}`,
        patientAge: String(25 + idx * 15),
        competencyLevel: idx === 0 ? "performed_independently" : "performed_under_supervision",
        status: idx === 0 ? ("verified" as const) : ("pending" as const),
        ...(idx === 0 ? {
          facultyVerifiedLevel: "performed_independently",
          reviewedBy: testProfUser.id,
          reviewedAt: new Date(),
        } : {}),
      }));
      await tx.insert(procedureLogsTable).values(procRows);
    }

    return { created: true, mirrorDepartmentId: mirrorDept.id };
  });
}

