import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { physiologyLogbook, type AcademicLogbookProfile } from "@workspace/api-zod";

// Specialty-specific content is declarative configuration. Resolve the real
// department, so test departments inherit exactly the same forms and validation.
const profiles: AcademicLogbookProfile[] = [physiologyLogbook];

export function academicLogbookForDepartment(department: { name: string; code: string }): AcademicLogbookProfile | null {
  return profiles.find((profile) => profile.departmentNames.some((name) => name.toLowerCase() === department.name.trim().toLowerCase())
    || profile.departmentCodes.includes(department.code.trim().toUpperCase())) ?? null;
}

export async function getAcademicLogbook(configSourceId: number): Promise<AcademicLogbookProfile | null> {
  const [department] = await db.select({ name: departmentsTable.name, code: departmentsTable.code })
    .from(departmentsTable).where(eq(departmentsTable.id, configSourceId)).limit(1);
  return department ? academicLogbookForDepartment(department) : null;
}
