import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db, studentsTable, usersTable } from "@workspace/db";
import { idSchema } from "../lib/validation.js";

// Mounted before every student route, including both legacy URL aliases.
export const studentAccess: RequestHandler = async (req, res, next) => {
  const parsed = idSchema.safeParse(req.params.studentId);
  if (!parsed.success) { res.status(400).json({ message: "Invalid student ID" }); return; }
  const caller = req.user!;
  const [student] = await db.select({ userId: studentsTable.userId }).from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(and(eq(studentsTable.id, parsed.data), eq(usersTable.departmentId, caller.departmentId!),
      eq(usersTable.role, "student"), eq(usersTable.status, "approved"))).limit(1);
  if (!student || (caller.role === "student" && student.userId !== caller.id)) {
    res.status(403).json({ message: "Student is outside your access scope" }); return;
  }
  const isRead = ["GET", "HEAD"].includes(req.method);
  if (req.method === "POST" && req.path === "/assessments" && caller.role === "student") {
    res.status(403).json({ message: "Only faculty can record assessments" }); return;
  }
  const facultyAssessment = req.method === "POST" && req.path === "/assessments" && ["professor", "hod"].includes(caller.role);
  if (!isRead && caller.role !== "student" && !facultyAssessment) {
    res.status(403).json({ message: "Only the student can modify their records" }); return;
  }
  next();
};
