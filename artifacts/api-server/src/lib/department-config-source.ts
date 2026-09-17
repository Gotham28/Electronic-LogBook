import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function resolveConfigDepartmentId(departmentId: number): Promise<number> {
  const [dept] = await db.select({
    id: departmentsTable.id,
    configSourceDepartmentId: departmentsTable.configSourceDepartmentId,
    isTest: departmentsTable.isTest
  })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, departmentId))
    .limit(1);

  if (!dept) {
    throw new Error(`Department ${departmentId} not found`);
  }

  if (dept.configSourceDepartmentId === null) {
    return dept.id;
  }

  const [sourceDept] = await db.select({
    id: departmentsTable.id,
    isTest: departmentsTable.isTest
  })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, dept.configSourceDepartmentId))
    .limit(1);

  if (!sourceDept) {
    throw new Error(`Source department ${dept.configSourceDepartmentId} not found`);
  }

  if (sourceDept.isTest) {
    throw new Error(`Source department ${sourceDept.id} is itself a test department (one hop only)`);
  }

  return sourceDept.id;
}
