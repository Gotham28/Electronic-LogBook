import { db, departmentConfigsTable, departmentCatalogTable, procedureTypesTable } from "@workspace/db";
import { eq, and, sum } from "drizzle-orm";

/**
 * Recomputes requiredProcedures for the given department:
 *   SUM of procedure_types.required for that department (no period filter —
 *   procedure_types has no period column).
 *
 * Then upserts only requiredProcedures into department_configs, leaving all
 * other columns untouched.
 */
export async function recomputeProcedureRequirement(departmentId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ total: sum(procedureTypesTable.required) })
      .from(procedureTypesTable)
      .where(eq(procedureTypesTable.departmentId, departmentId));

    const requiredProcedures = row?.total != null ? Number(row.total) : null;

    await tx.insert(departmentConfigsTable).values({ departmentId, requiredProcedures })
      .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredProcedures } });
  });
}

/**
 * Recomputes requiredCases and requiredAcademic for the given department:
 *   requiredCases   = SUM of department_catalog.required
 *                       WHERE kind = 'case_category' AND period = 'total'
 *   requiredAcademic = SUM of department_catalog.required
 *                       WHERE kind = 'academic'       AND period = 'total'
 * Rows with period = 'month' are excluded from both sums.
 *
 * Then upserts only requiredCases + requiredAcademic into department_configs,
 * leaving all other columns untouched.
 */
export async function recomputeCatalogRequirements(departmentId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [casesRow] = await tx
      .select({ total: sum(departmentCatalogTable.required) })
      .from(departmentCatalogTable)
      .where(
        and(
          eq(departmentCatalogTable.departmentId, departmentId),
          eq(departmentCatalogTable.kind, "case_category"),
          eq(departmentCatalogTable.period, "total"),
        ),
      );

    const [academicRow] = await tx
      .select({ total: sum(departmentCatalogTable.required) })
      .from(departmentCatalogTable)
      .where(
        and(
          eq(departmentCatalogTable.departmentId, departmentId),
          eq(departmentCatalogTable.kind, "academic"),
          eq(departmentCatalogTable.period, "total"),
        ),
      );

    const requiredCases = casesRow?.total != null ? Number(casesRow.total) : null;
    const requiredAcademic = academicRow?.total != null ? Number(academicRow.total) : null;

    await tx.insert(departmentConfigsTable).values({ departmentId, requiredCases, requiredAcademic })
      .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredCases, requiredAcademic } });
  });
}
