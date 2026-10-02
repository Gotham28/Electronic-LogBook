import { and, eq } from "drizzle-orm";
import { db, studentsTable, usersTable } from "@workspace/db";
import type { ArogyaRole } from "./knowledge/types.js";
import { callerCanAccessStudent, findStudent } from "../appraisals.js";

export interface ArogyaActor {
  id: number;
  role: string;
  departmentId: number | null;
}

export function canonicalArogyaRole(role: string): ArogyaRole | null {
  return role === "student" || role === "professor" || role === "hod" ? role : null;
}

export async function assertAuthorizedStudent(actor: ArogyaActor, requestedStudentId?: number) {
  if (!Number.isSafeInteger(actor.departmentId) || actor.departmentId! <= 0) throw new Error("AROGYA_SCOPE_403");
  if (actor.role === "student") {
    const [own] = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      departmentId: usersTable.departmentId,
      name: usersTable.fullName,
      status: usersTable.status,
    }).from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(studentsTable.userId, actor.id), eq(usersTable.role, "student")))
      .limit(1);
    if (!own || own.status !== "approved") throw new Error("AROGYA_SCOPE_404");
    if (requestedStudentId !== undefined && requestedStudentId !== own.id) throw new Error("AROGYA_SCOPE_403");
    return own;
  }
  if (actor.role !== "professor" && actor.role !== "hod") throw new Error("AROGYA_SCOPE_403");
  if (requestedStudentId === undefined) throw new Error("AROGYA_SCOPE_404");
  const student = await findStudent(requestedStudentId);
  if (!student) throw new Error("AROGYA_SCOPE_404");
  if (!callerCanAccessStudent(actor as NonNullable<Express.Request["user"]>, student) || student.departmentId !== actor.departmentId) {
    throw new Error("AROGYA_SCOPE_403");
  }
  return student;
}

