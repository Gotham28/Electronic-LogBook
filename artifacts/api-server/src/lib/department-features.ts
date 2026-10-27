import { db, departmentConfigsTable, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveConfigDepartmentId } from "./department-config-source.js";

export async function getDepartmentFeatures(departmentId: number) {
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  const [[dept], [config]] = await Promise.all([
    db.select({ name: departmentsTable.name, code: departmentsTable.code }).from(departmentsTable).where(eq(departmentsTable.id, configSourceId)).limit(1),
    db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
      .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1),
  ]);
  const features = ((config?.enabledFeatures ?? {}) as Record<string, boolean>);
  const isMicro = dept?.code?.toLowerCase() === "microbiology" || dept?.name?.toLowerCase().includes("microbiology");
  if (isMicro) {
    if (features.microbiologyCaseFields === undefined) features.microbiologyCaseFields = true;
    if (features.freeTextProcedures === undefined) features.freeTextProcedures = true;
    if (features.hideProcedureAge === undefined) features.hideProcedureAge = true;
    if (features.procedureExperience === undefined) features.procedureExperience = false;
    if (features.useThesisAndMandatoryCertificationsLabel === undefined) features.useThesisAndMandatoryCertificationsLabel = true;
    if (features.attendedConferences === undefined) features.attendedConferences = true;
    if (features.hideLeaveRecords === undefined) features.hideLeaveRecords = true;
    if (features.dailyAttendance === undefined) features.dailyAttendance = true;
  }
  return { configSourceId, features };
}
