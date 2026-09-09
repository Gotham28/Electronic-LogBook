import { Router, type IRouter } from "express";
import { db, caseLogsTable, procedureLogsTable, academicLogsTable, studentsTable, usersTable, departmentsTable, departmentConfigsTable } from "@workspace/db";
import { eq, and, inArray, count, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { completionPercent } from "../lib/validation.js";

const router: IRouter = Router();

// Both professors and HODs can access all routes in this router
router.use(requireAuth, requireRole(["professor", "hod"]), requireDepartment);

function computeCompletion(cases: number, procs: number, acad: number, reqCases: number, reqProcs: number, reqAcad: number) {
  return completionPercent([[cases, reqCases], [procs, reqProcs], [acad, reqAcad]]);
}

function shortfallStatus(pct: number): "on_track" | "at_risk" | "behind" {
  if (pct >= 75) return "on_track";
  if (pct >= 40) return "at_risk";
  return "behind";
}

router.get("/:professorId/review-queue", async (req, res) => {
  try {
    const professorId = parseInt(String(req.params.professorId), 10);
    if (isNaN(professorId)) {
      res.status(400).json({ message: "Invalid professorId" });
      return;
    }

    // Caller must be the same user as the professorId param, or an HOD viewing their dept
    const caller = req.user!;
    if (caller.role !== "hod" && caller.id !== professorId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const profMatch = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, professorId), inArray(usersTable.role, ["professor", "hod"])))
      .limit(1);

    // Nonexistent id and wrong-department both return the same status and body (SEC-35):
    // an HOD probing ids cannot tell "no such user" from "real user, different department".
    if (profMatch.length === 0 || caller.departmentId !== profMatch[0].departmentId || profMatch[0].status !== "approved") {
      res.status(403).json({ message: "Faculty member is outside your department" });
      return;
    }

    const deptId = caller.departmentId!;
    const isHod = profMatch[0].role === "hod";

    // For HOD: show all pending logs in their department.
    // For professor: show only logs where they are the named supervisor.
    const caseWhere = isHod && deptId != null
      ? eq(caseLogsTable.status, "pending")   // dept-scoped below via join
      : and(eq(caseLogsTable.supervisorId, professorId), eq(caseLogsTable.status, "pending"));

    const procWhere = isHod && deptId != null
      ? eq(procedureLogsTable.status, "pending")
      : and(eq(procedureLogsTable.supervisorId, professorId), eq(procedureLogsTable.status, "pending"));

    const acadWhere = isHod && deptId != null
      ? eq(academicLogsTable.status, "pending")
      : and(eq(academicLogsTable.supervisorId, professorId), eq(academicLogsTable.status, "pending"));

    const caseQuery = db.select({
      log: caseLogsTable,
      student: studentsTable,
      user: usersTable,
      department: departmentsTable,
    })
    .from(caseLogsTable)
    .innerJoin(studentsTable, eq(caseLogsTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

    // If HOD, filter to their department via the joined usersTable
    const cases = await caseQuery.where(and(caseWhere, eq(usersTable.departmentId, deptId),
      eq(usersTable.status, "approved"), isNull(caseLogsTable.deletedAt)));

    const procQuery = db.select({
      log: procedureLogsTable,
      student: studentsTable,
      user: usersTable,
      department: departmentsTable,
    })
    .from(procedureLogsTable)
    .innerJoin(studentsTable, eq(procedureLogsTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

    const procedures = await procQuery.where(and(procWhere, eq(usersTable.departmentId, deptId),
      eq(usersTable.status, "approved"), isNull(procedureLogsTable.deletedAt)));

    const acadQuery = db.select({
      log: academicLogsTable,
      student: studentsTable,
      user: usersTable,
      department: departmentsTable,
    })
    .from(academicLogsTable)
    .innerJoin(studentsTable, eq(academicLogsTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

    const academics = await acadQuery.where(and(acadWhere, eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved")));

    const pendingReviews = [
      ...cases.map(c => ({
        id: `case-${c.log.id}`,
        dbId: c.log.id,
        logType: "case",
        studentId: c.student.id,
        studentName: c.user.fullName,
        registrationNumber: c.student.registrationNumber,
        department: c.department?.name || "Unknown",
        type: "Case Log",
        title: `${c.log.diagnosisProvisional} — ${c.log.patientAge}, ${c.log.patientGender}`,
        date: c.log.date,
        patientUhid: c.log.patientUhid,
        patientInfo: `${c.log.patientAge} / ${c.log.patientGender}`,
        detail: c.log.chiefComplaints,
        diagnosis: c.log.diagnosisProvisional,
        status: c.log.status
      })),
      ...procedures.map(p => ({
        id: `procedure-${p.log.id}`,
        dbId: p.log.id,
        logType: "procedure",
        studentId: p.student.id,
        studentName: p.user.fullName,
        registrationNumber: p.student.registrationNumber,
        department: p.department?.name || "Unknown",
        type: "Procedure",
        title: p.log.procedureName,
        date: p.log.date,
        patientUhid: p.log.patientUhid,
        patientInfo: p.log.patientAge,
        detail: `${p.log.procedureGroup} procedure`,
        declaredCompetency: p.log.competencyLevel,
        status: p.log.status
      })),
      ...academics.map(a => ({
        id: `academic-${a.log.id}`,
        dbId: a.log.id,
        logType: "academic",
        studentId: a.student.id,
        studentName: a.user.fullName,
        registrationNumber: a.student.registrationNumber,
        department: a.department?.name || "Unknown",
        type: "Academic",
        title: `${a.log.activityType}: ${a.log.topic}`,
        date: a.log.date,
        detail: a.log.presentationType || a.log.activityType,
        status: a.log.status
      }))
    ];

    // ── Mentees (all students in the professor's / HOD's department) ──────────
    let menteesData: any[] = [];
    if (deptId != null) {
      const studentsInDept = await db
        .select({
          studentId: studentsTable.id,
          userId:    studentsTable.userId,
          regNum:    studentsTable.registrationNumber,
          fullName:  usersTable.fullName,
          deptName:  departmentsTable.name,
        })
        .from(studentsTable)
        .innerJoin(usersTable,      eq(studentsTable.userId,      usersTable.id))
        .leftJoin(departmentsTable, eq(usersTable.departmentId,   departmentsTable.id))
        .where(and(eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved")));

      const caseCountRows = await db
        .select({ studentId: caseLogsTable.studentId, cnt: count() })
        .from(caseLogsTable)
        .where(eq(caseLogsTable.status, "verified"))
        .groupBy(caseLogsTable.studentId);

      const procCountRows = await db
        .select({ studentId: procedureLogsTable.studentId, cnt: count() })
        .from(procedureLogsTable)
        .where(eq(procedureLogsTable.status, "verified"))
        .groupBy(procedureLogsTable.studentId);

      const acadCountRows = await db
        .select({ studentId: academicLogsTable.studentId, cnt: count() })
        .from(academicLogsTable)
        .where(eq(academicLogsTable.status, "verified"))
        .groupBy(academicLogsTable.studentId);

      const toMap = (rows: { studentId: number; cnt: number }[]) =>
        Object.fromEntries(rows.map(r => [r.studentId, Number(r.cnt)]));

      const caseMap = toMap(caseCountRows as any);
      const procMap = toMap(procCountRows as any);
      const acadMap = toMap(acadCountRows as any);

      const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, deptId));
      const reqCases = config?.requiredCases ?? 0;
      const reqProcs = config?.requiredProcedures ?? 0;
      const reqAcad = config?.requiredAcademic ?? 0;

      menteesData = studentsInDept.map(s => {
        const cases = caseMap[s.studentId] ?? 0;
        const procs = procMap[s.studentId] ?? 0;
        const acad  = acadMap[s.studentId]  ?? 0;
        const pct   = computeCompletion(cases, procs, acad, reqCases, reqProcs, reqAcad);
        return {
          id:                 s.studentId,
          name:               s.fullName,
          registrationNumber: s.regNum,
          department:         s.deptName || "Unknown",
          overallCompletion:  pct,
          shortfallStatus:    shortfallStatus(pct),
          logCounts: { cases, procs, acad },
        };
      });
    }

    res.json({
      faculty: { name: profMatch[0].fullName, role: profMatch[0].role },
      pendingReviews,
      assignedMentees: menteesData,
    });
  } catch (error) {
    req.log.error({ professorId: req.params.professorId, status: 500 }, "Error fetching professor review queue");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
