import { Router, type IRouter } from "express";
import { db, caseLogsTable, procedureLogsTable, academicLogsTable, studentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// PATCH /api/logs/:logType/:logId/review
router.patch("/:logType/:logId/review", requireAuth, requireRole(["professor", "hod"]), async (req, res) => {
  try {
    const { logType, logId } = req.params;
    const { status, comments } = req.body;

    const id = parseInt(String(logId), 10);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid logId" });
      return;
    }

    if (!["verified", "rejected"].includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }

    const reviewer = req.user!;
    let target: { supervisorId: number | null; studentId: number } | undefined;

    if (logType === "case") {
      [target] = await db.select({ supervisorId: caseLogsTable.supervisorId, studentId: caseLogsTable.studentId })
        .from(caseLogsTable).where(eq(caseLogsTable.id, id)).limit(1);
    } else if (logType === "procedure") {
      [target] = await db.select({ supervisorId: procedureLogsTable.supervisorId, studentId: procedureLogsTable.studentId })
        .from(procedureLogsTable).where(eq(procedureLogsTable.id, id)).limit(1);
    } else if (logType === "academic") {
      [target] = await db.select({ supervisorId: academicLogsTable.supervisorId, studentId: academicLogsTable.studentId })
        .from(academicLogsTable).where(eq(academicLogsTable.id, id)).limit(1);
    } else {
      res.status(400).json({ message: "Invalid logType" });
      return;
    }

    if (!target) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    // A faculty member can review only entries explicitly sent to them.
    if (reviewer.role === "professor" && target.supervisorId !== reviewer.id) {
      res.status(403).json({ message: "This entry was assigned to another faculty member" });
      return;
    }

    // HOD oversight is limited to students in the HOD's own department.
    if (reviewer.role === "hod") {
      const [student] = await db.select({ departmentId: usersTable.departmentId })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(eq(studentsTable.id, target.studentId))
        .limit(1);
      if (!student || student.departmentId !== reviewer.departmentId) {
        res.status(403).json({ message: "This entry is outside your department" });
        return;
      }
    }

    let updatedRows: any[] = [];
    const updateData = {
      status,
      facultyRemarks: comments || null,
      reviewedBy: reviewer.id,
      reviewedAt: new Date()
    };

    if (logType === "case") {
      updatedRows = await db.update(caseLogsTable).set(updateData).where(eq(caseLogsTable.id, id)).returning();
    } else if (logType === "procedure") {
      updatedRows = await db.update(procedureLogsTable).set(updateData).where(eq(procedureLogsTable.id, id)).returning();
    } else if (logType === "academic") {
      updatedRows = await db.update(academicLogsTable).set(updateData).where(eq(academicLogsTable.id, id)).returning();
    }

    if (updatedRows.length === 0) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    res.json(updatedRows[0]);
  } catch (error) {
    req.log.error(error, "Error updating log review status");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
