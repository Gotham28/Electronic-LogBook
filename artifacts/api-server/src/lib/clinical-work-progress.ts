import { db, clinicalWorkLogsTable, departmentCatalogTable, departmentConfigsTable } from "@workspace/db";
import { and, count, eq, inArray, isNull, sum } from "drizzle-orm";

/**
 * The clinical work target that counts toward completion: the SUM of the HOD's
 * per-category minimums (department_catalog.required, kind 'clinical_work_category',
 * period 'total'), the same rule as requiredCases and requiredAcademic
 * (department-requirements.ts). 0 when the department has Clinical Work switched off or
 * sets no minimums, which completionPercent() skips.
 *
 * Takes the config-source department id (resolveConfigDepartmentId), because targets live
 * on the real department, not on a test mirror.
 */
export async function clinicalWorkTarget(configSourceId: number): Promise<number> {
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  if (!(config?.enabledFeatures as Record<string, boolean> | undefined)?.clinicalWorks) return 0;
  const [row] = await db.select({ total: sum(departmentCatalogTable.required) }).from(departmentCatalogTable)
    .where(and(eq(departmentCatalogTable.departmentId, configSourceId),
      eq(departmentCatalogTable.kind, "clinical_work_category"), eq(departmentCatalogTable.period, "total")));
  return row?.total != null ? Number(row.total) : 0;
}

/**
 * Verified, not-deleted clinical work entries per student, for the given students only.
 * Counts only: no patient fields are read (AGENTS.md §8).
 */
export async function verifiedClinicalWorkCounts(studentIds: number[]): Promise<Map<number, number>> {
  if (studentIds.length === 0) return new Map();
  const rows = await db.select({ studentId: clinicalWorkLogsTable.studentId, cnt: count() }).from(clinicalWorkLogsTable)
    .where(and(inArray(clinicalWorkLogsTable.studentId, studentIds), eq(clinicalWorkLogsTable.status, "verified"),
      isNull(clinicalWorkLogsTable.deletedAt)))
    .groupBy(clinicalWorkLogsTable.studentId);
  return new Map(rows.map((row) => [row.studentId, Number(row.cnt)]));
}
