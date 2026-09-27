import { db, departmentConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveConfigDepartmentId } from "./department-config-source.js";

export async function getDepartmentFeatures(departmentId: number) {
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  return { configSourceId, features: (config?.enabledFeatures ?? {}) as Record<string, boolean> };
}
