import { and, eq } from "drizzle-orm";
import { db, departmentsTable, studentsTable, usersTable } from "@workspace/db";
import { sendHODApprovalRequestEmail } from "./mailer.js";

/** Send the pending-access notice to the department's current approved HOD. */
export async function notifyCurrentHodOfPendingStudent(studentUserId: number): Promise<void> {
  const [student] = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    departmentId: usersTable.departmentId,
    registrationNumber: studentsTable.registrationNumber,
    departmentName: departmentsTable.name,
  }).from(usersTable)
    .innerJoin(studentsTable, eq(studentsTable.userId, usersTable.id))
    .innerJoin(departmentsTable, eq(departmentsTable.id, usersTable.departmentId))
    .where(eq(usersTable.id, studentUserId)).limit(1);

  if (!student?.departmentId) throw new Error("Student approval notification details unavailable");

  const [hod] = await db.select({ email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable)
    .where(and(
      eq(usersTable.departmentId, student.departmentId),
      eq(usersTable.role, "hod"),
      eq(usersTable.status, "approved"),
    )).limit(1);

  if (!hod) throw new Error("Current department HOD unavailable");

  await sendHODApprovalRequestEmail(
    hod.email,
    hod.fullName,
    student.fullName,
    student.registrationNumber || "Not Provided",
    student.departmentName,
  );
}

// Keep the existing payment-flow name available to its current callers.
export const notifyCurrentHodOfPaidStudent = notifyCurrentHodOfPendingStudent;
