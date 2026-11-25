import { db, departmentConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveConfigDepartmentId } from "./department-config-source.js";

export async function getDepartmentFeatures(departmentId: number) {
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  // The stored configuration is the only input: nothing here reads the department's name or code.
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures, procedureLogFields: departmentConfigsTable.procedureLogFields })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  const features = ({ ...(config?.enabledFeatures ?? {}) } as Record<string, boolean>);
  return { configSourceId, features, procedureLogFields: config?.procedureLogFields ?? null };
}
