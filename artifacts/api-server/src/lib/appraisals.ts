import { and, eq } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { db, departmentsTable, studentsTable, usersTable } from "@workspace/db";

const appraisalStudentUsers = aliasedTable(usersTable, "appraisal_student_users");

export async function findStudent(studentId: number) {
  const [student] = await db.select({
    id: studentsTable.id,
    userId: studentsTable.userId,
    mentorId: studentsTable.mentorId,
    name: appraisalStudentUsers.fullName,
    registrationNumber: studentsTable.registrationNumber,
    batch: studentsTable.batch,
    departmentId: appraisalStudentUsers.departmentId,
    departmentName: departmentsTable.name,
  }).from(studentsTable)
    .innerJoin(appraisalStudentUsers, eq(studentsTable.userId, appraisalStudentUsers.id))
    .innerJoin(departmentsTable, eq(appraisalStudentUsers.departmentId, departmentsTable.id))
    .where(and(eq(studentsTable.id, studentId), eq(appraisalStudentUsers.role, "student"), eq(appraisalStudentUsers.status, "approved")))
    .limit(1);
  return student;
}

export function callerCanAccessStudent(caller: NonNullable<Express.Request["user"]>, student: NonNullable<Awaited<ReturnType<typeof findStudent>>>) {
  if (caller.role === "student") return student.userId === caller.id;
  if (student.departmentId !== caller.departmentId) return false;
  return caller.role !== "professor" || student.mentorId === caller.id;
}
