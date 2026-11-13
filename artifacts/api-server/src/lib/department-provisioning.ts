import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq, and, sum } from "drizzle-orm";
import { db, collegesTable, departmentsTable, usersTable, departmentConfigsTable, procedureTypesTable, departmentCatalogTable,
  departmentPostingScheduleTable, departmentLogbookSectionsTable, studentsTable, caseLogsTable, procedureLogsTable } from "@workspace/db";
import { configSchema, emailSchema, nameSchema, passwordSchema, targetSchema } from "./validation.js";
import { sendAccountCreatedEmail } from "./mailer.js";
import { recomputeCatalogRequirements, recomputeProcedureRequirement } from "./department-requirements.js";

export const setupSchema = z.object({
  collegeId: z.number().int().positive(), copyFromDepartmentId: z.number().int().positive().optional(),
  name: nameSchema, code: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/), description: z.string().max(1000).optional(),
  hod: z.object({ fullName: nameSchema, email: emailSchema }).strict(),
  config: configSchema.optional(),
  procedures: z.array(z.object({ name: nameSchema, group: nameSchema, required: targetSchema }).strict()).max(1000).optional(),
  catalog: z.array(z.object({ kind: z.enum(["posting", "academic", "case_category", "competency_level", "leave_type"]), name: nameSchema, value: nameSchema,
    required: targetSchema, period: z.enum(["total", "month"]) }).strict()).max(1000).optional(),
}).strict().refine((setup) => !setup.copyFromDepartmentId ||
  (!setup.config && !setup.procedures?.length && !setup.catalog?.length), {
  message: "Choose either copied settings or manually supplied department settings",
  path: ["copyFromDepartmentId"],
});

export async function provisionDepartment(input: unknown, initialPassword: unknown) {
  const setup = setupSchema.parse(input);
  const password = passwordSchema.parse(initialPassword);
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.transaction(async (tx) => {
    const [source] = setup.copyFromDepartmentId
      ? await tx.select({ id: departmentsTable.id, collegeId: departmentsTable.collegeId, isTest: departmentsTable.isTest })
        .from(departmentsTable).where(and(eq(departmentsTable.id, setup.copyFromDepartmentId), eq(departmentsTable.isTest, false))).limit(1)
      : [undefined];
    if (setup.copyFromDepartmentId && !source) throw new Error("Configuration source must be a real department in the selected college");
    const [found] = await tx.select().from(departmentsTable)
      .where(and(eq(departmentsTable.code, setup.code), eq(departmentsTable.collegeId, setup.collegeId))).limit(1);
    if (found && found.name !== setup.name) throw new Error("This department code already belongs to a different department name");
    if (found && setup.copyFromDepartmentId) throw new Error("Settings can only be copied while creating a new department");
    const department = found || (await tx.insert(departmentsTable).values({ name: setup.name, code: setup.code, description: setup.description,
      collegeId: setup.collegeId }).returning())[0];
    let copiedSourceConfig = false;
    if (source) {
      const [sourceConfig] = await tx.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, source.id)).limit(1);
      if (sourceConfig) {
        copiedSourceConfig = true;
        await tx.insert(departmentConfigsTable).values({
        departmentId: department.id, requiredCases: sourceConfig.requiredCases, requiredProcedures: sourceConfig.requiredProcedures,
        requiredAcademic: sourceConfig.requiredAcademic, enabledFeatures: sourceConfig.enabledFeatures,
        procedureLogFields: sourceConfig.procedureLogFields,
        }).onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: {
        requiredCases: sourceConfig.requiredCases, requiredProcedures: sourceConfig.requiredProcedures,
        requiredAcademic: sourceConfig.requiredAcademic, enabledFeatures: sourceConfig.enabledFeatures,
        procedureLogFields: sourceConfig.procedureLogFields,
        } });
      }
      const catalog = await tx.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, source.id));
      if (catalog.length) await tx.insert(departmentCatalogTable).values(catalog.map(({ id: _id, departmentId: _departmentId, ...row }) => ({ ...row, departmentId: department.id })));
      const procedures = await tx.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, source.id));
      if (procedures.length) await tx.insert(procedureTypesTable).values(procedures.map(({ id: _id, departmentId: _departmentId, ...row }) => ({ ...row, departmentId: department.id })));
      const schedule = await tx.select().from(departmentPostingScheduleTable).where(eq(departmentPostingScheduleTable.departmentId, source.id));
      if (schedule.length) await tx.insert(departmentPostingScheduleTable).values(schedule.map(({ id: _id, departmentId: _departmentId, ...row }) => ({ ...row, departmentId: department.id })));
      const sections = await tx.select().from(departmentLogbookSectionsTable).where(eq(departmentLogbookSectionsTable.departmentId, source.id));
      if (sections.length) await tx.insert(departmentLogbookSectionsTable).values(sections.map(({ id: _id, departmentId: _departmentId, ...row }) => ({ ...row, departmentId: department.id })));
    }
    const [hod] = await tx.select({ id: usersTable.id, email: usersTable.email }).from(usersTable)
      .where(and(eq(usersTable.departmentId, department.id), eq(usersTable.role, "hod"), eq(usersTable.status, "approved"))).limit(1);
    if (hod) throw new Error("An active HOD already exists. No accounts or credentials were changed.");
    const [created] = await tx.insert(usersTable).values({ ...setup.hod, passwordHash, role: "hod", status: "approved", departmentId: department.id }).returning({ id: usersTable.id });
    if (setup.config) {
      const enabledFeatures = { procedureExperience: true, ...setup.config.enabledFeatures };
      await tx.insert(departmentConfigsTable).values({ ...setup.config, enabledFeatures, departmentId: department.id })
        .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { ...setup.config, enabledFeatures } });
    } else {
      await tx.insert(departmentConfigsTable).values({ departmentId: department.id })
        .onConflictDoNothing();
    }
    if (setup.procedures?.length) await tx.insert(procedureTypesTable).values(setup.procedures.map((p) => ({ ...p, departmentId: department.id })));
    
    const catalog = setup.catalog?.map((p) => ({ ...p, departmentId: department.id })) || [];
    const copiedCatalog = setup.copyFromDepartmentId
      ? await tx.select({ kind: departmentCatalogTable.kind }).from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, department.id))
      : [];
    const hasCompetencyLevels = catalog.some((c) => c.kind === "competency_level") || copiedCatalog.some((c) => c.kind === "competency_level");
    const hasLeaveTypes = catalog.some((c) => c.kind === "leave_type") || copiedCatalog.some((c) => c.kind === "leave_type");
    if (!hasCompetencyLevels) {
      catalog.push(
        { departmentId: department.id, kind: "competency_level", name: "Observed / procedure seen", value: "observed", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Assisted", value: "assisted", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Performed under supervision", value: "performed_under_supervision", required: 0, period: "total" },
        { departmentId: department.id, kind: "competency_level", name: "Performed independently", value: "performed_independently", required: 0, period: "total" }
      );
    }
    if (!hasLeaveTypes) {
      catalog.push(
        { departmentId: department.id, kind: "leave_type", name: "Casual Leave", value: "casual", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Academic Leave", value: "academic", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Medical Leave", value: "medical", required: 0, period: "total" },
        { departmentId: department.id, kind: "leave_type", name: "Maternity / Paternity Leave", value: "maternity_paternity", required: 0, period: "total" }
      );
    }
    if (catalog.length) await tx.insert(departmentCatalogTable).values(catalog).onConflictDoNothing();

    if (setup.copyFromDepartmentId && !copiedSourceConfig) {
      const [procedureTotal] = await tx.select({ total: sum(procedureTypesTable.required) }).from(procedureTypesTable)
        .where(eq(procedureTypesTable.departmentId, department.id));
      const [caseTotal] = await tx.select({ total: sum(departmentCatalogTable.required) }).from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, department.id), eq(departmentCatalogTable.kind, "case_category"), eq(departmentCatalogTable.period, "total")));
      const [academicTotal] = await tx.select({ total: sum(departmentCatalogTable.required) }).from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, department.id), eq(departmentCatalogTable.kind, "academic"), eq(departmentCatalogTable.period, "total")));
      await tx.update(departmentConfigsTable).set({
        requiredProcedures: procedureTotal?.total == null ? null : Number(procedureTotal.total),
        requiredCases: caseTotal?.total == null ? null : Number(caseTotal.total),
        requiredAcademic: academicTotal?.total == null ? null : Number(academicTotal.total),
      }).where(eq(departmentConfigsTable.departmentId, department.id));
    }

    return { departmentId: department.id, hodId: created.id };
  });

  // New manually configured departments derive totals from their targets. Copied settings
  // preserve the source totals (or derive them in the copy transaction if no config row existed).
  if (!setup.copyFromDepartmentId) {
    await recomputeProcedureRequirement(result.departmentId);
    await recomputeCatalogRequirements(result.departmentId);
  }

  try {
    await provisionMirrorForRealDepartment(result.departmentId, setup.name, setup.description);
  } catch {
    console.warn(`Failed to provision mirror test department for ${setup.code}`);
  }

  let emailAccepted = false;
  try {
    await sendAccountCreatedEmail(setup.hod.email, setup.hod.fullName, password as string, "hod", setup.name);
    emailAccepted = true;
  } catch {
    // The department id only; never the HOD's email address or name in a log.
    console.warn(`HOD account created but the welcome email failed to send (department ${result.departmentId})`);
  }

  return { ...result, emailAccepted };
}

export async function provisionMirrorForRealDepartment(
  realDepartmentId: number,
  realDepartmentName: string,
  realDepartmentDescription: string | null | undefined
): Promise<{ created: boolean; mirrorDepartmentId?: number }> {
  return await db.transaction(async (tx) => {
    const [realDepartment] = await tx.select({ collegeId: departmentsTable.collegeId })
      .from(departmentsTable).where(eq(departmentsTable.id, realDepartmentId)).limit(1);
    if (!realDepartment) throw new Error("Source department not found");
    const [college] = realDepartment.collegeId
      ? await tx.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, realDepartment.collegeId)).limit(1)
      : [undefined];
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
      collegeId: realDepartment.collegeId,
      isTest: true,
      configSourceDepartmentId: realDepartmentId
    }).returning();

    const safeName = [college?.code, String(realDepartmentId)].filter(Boolean).join("-")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

