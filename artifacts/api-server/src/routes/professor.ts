import { Router, type IRouter } from "express";
import { db, caseLogsTable, procedureLogsTable, academicLogsTable, studentsTable, usersTable, departmentsTable, departmentConfigsTable, conferencesTable, clinicalWorkLogsTable, departmentCatalogTable } from "@workspace/db";
import { eq, and, inArray, count, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { completionPercent } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { clinicalWorkTarget, verifiedClinicalWorkCounts } from "../lib/clinical-work-progress.js";
import { getDepartmentFeatures } from "../lib/department-features.js";

const router: IRouter = Router();

// Both professors and HODs can access all routes in this router
router.use(requireAuth, requireRole(["professor", "hod"]), requireDepartment);

function computeCompletion(cases: number, procs: number, acad: number, clinical: number, reqCases: number | null, reqProcs: number | null, reqAcad: number | null, reqClinical: number) {
  return completionPercent([[cases, reqCases], [procs, reqProcs], [acad, reqAcad], [clinical, reqClinical]]);
}

function shortfallStatus(pct: number | null): "on_track" | "at_risk" | "behind" | "not_tracked" {
  if (pct === null) return "not_tracked";
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
    const { features } = await getDepartmentFeatures(deptId);

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

    const confWhere = isHod && deptId != null
      ? eq(conferencesTable.status, "pending")
      : and(eq(conferencesTable.supervisorId, professorId), eq(conferencesTable.status, "pending"));

    const confQuery = db.select({
      log: conferencesTable,
      student: studentsTable,
      user: usersTable,
      department: departmentsTable,
    })
    .from(conferencesTable)
    .innerJoin(studentsTable, eq(conferencesTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

    const conferences = await confQuery.where(and(confWhere, eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved")));

    const clinicalWhere = isHod && deptId != null
      ? eq(clinicalWorkLogsTable.status, "pending")
      : and(eq(clinicalWorkLogsTable.supervisorId, professorId), eq(clinicalWorkLogsTable.status, "pending"));
    const clinicalWorks = await db.select({ log: clinicalWorkLogsTable, student: studentsTable, user: usersTable, department: departmentsTable })
      .from(clinicalWorkLogsTable)
      .innerJoin(studentsTable, eq(clinicalWorkLogsTable.studentId, studentsTable.id))
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .where(and(clinicalWhere, eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved"), isNull(clinicalWorkLogsTable.deletedAt)));
    const clinicalNames = new Map<string, string>();
    if (clinicalWorks.length > 0) {
      const configSourceId = await resolveConfigDepartmentId(deptId);
      const rows = await db.select({ value: departmentCatalogTable.value, name: departmentCatalogTable.name }).from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, configSourceId),
          inArray(departmentCatalogTable.kind, ["clinical_work_category", "clinical_work_subtype"])));
      rows.forEach((row) => clinicalNames.set(row.value, row.name));
    }

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
        // The provisional diagnosis is optional; the final diagnosis is always recorded.
        title: `${c.log.diagnosisProvisional || c.log.diagnosisFinal} — ${c.log.patientAge}, ${c.log.patientGender}`,
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
        departmentId: p.department?.id,
        type: "Procedure",
        title: p.log.procedureName,
        date: p.log.date,
        patientUhid: p.log.patientUhid,
        patientInfo: p.log.patientAge,
        detail: features.freeTextProcedures ? ((p.log as any).diagnosis ? `${p.log.procedureName} - ${(p.log as any).diagnosis}` : p.log.procedureName) : `${p.log.procedureGroup} procedure`,
        declaredCompetency: p.log.competencyLevel,
        diagnosis: (p.log as any).diagnosis,
        sex: (p.log as any).sex,
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
        departmentId: a.department?.id,
        type: "Academic",
        title: `${a.log.activityType}: ${a.log.topic}`,
        date: a.log.date,
        detail: a.log.presentationType || a.log.activityType,
        description: a.log.description,
        presentationType: a.log.presentationType,
        status: a.log.status
      })),
      ...conferences.map(c => ({
        id: `conference-${c.log.id}`,
        dbId: c.log.id,
        logType: "conference",
        studentId: c.student.id,
        studentName: c.user.fullName,
        registrationNumber: c.student.registrationNumber,
        department: c.department?.name || "Unknown",
        type: "Conference",
        title: c.log.conferenceName,
        date: c.log.date,
        conferenceType: c.log.conferenceType,
        level: c.log.level,
        category: c.log.category,
        location: c.log.location,
        certificateUrl: c.log.certificateUrl,
        detail: c.log.role === "presented" ? "Presented" : "Attended",
        status: c.log.status
      })),
      ...clinicalWorks.map((c: any) => {
        const category = clinicalNames.get(c.log.category) || c.log.category;
        const subType = c.log.subType ? (clinicalNames.get(c.log.subType) || c.log.subType) : null;
        return {
          id: `clinical_work-${c.log.id}`,
          dbId: c.log.id,
          logType: "clinical_work",
          studentId: c.student.id,
          studentName: c.user.fullName,
          registrationNumber: c.student.registrationNumber,
          department: c.department?.name || "Unknown",
          type: "Clinical Work",
          title: subType ? `${category} — ${subType}` : category,
          date: c.log.date,
          caseNumber: c.log.caseNumber,
          patientInfo: `${c.log.patientAge} / ${c.log.patientSex}`,
          detail: subType ? `${category} — ${subType}` : category,
          organSystem: c.log.organSystem,
          clinicalFindings: c.log.clinicalFindings,
          declaredCompetency: c.log.competency,
          status: c.log.status
        };
      })
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

      // Verified, not-deleted entries of this department's students only.
      const studentIds = studentsInDept.map((s) => s.studentId);
      const caseCountRows = await db
        .select({ studentId: caseLogsTable.studentId, cnt: count() })
        .from(caseLogsTable)
        .where(and(inArray(caseLogsTable.studentId, studentIds), eq(caseLogsTable.status, "verified"), isNull(caseLogsTable.deletedAt)))
        .groupBy(caseLogsTable.studentId);

      const procCountRows = await db
        .select({ studentId: procedureLogsTable.studentId, cnt: count() })
        .from(procedureLogsTable)
        .where(and(inArray(procedureLogsTable.studentId, studentIds), eq(procedureLogsTable.status, "verified"), isNull(procedureLogsTable.deletedAt)))
        .groupBy(procedureLogsTable.studentId);

      // academic_logs has no deletedAt column.
      const acadCountRows = await db
        .select({ studentId: academicLogsTable.studentId, cnt: count() })
        .from(academicLogsTable)
        .where(and(inArray(academicLogsTable.studentId, studentIds), eq(academicLogsTable.status, "verified")))
        .groupBy(academicLogsTable.studentId);

      const toMap = (rows: { studentId: number; cnt: number }[]) =>
        Object.fromEntries(rows.map(r => [r.studentId, Number(r.cnt)]));

      const caseMap = toMap(caseCountRows as any);
      const procMap = toMap(procCountRows as any);
      const acadMap = toMap(acadCountRows as any);

      const configSourceId = await resolveConfigDepartmentId(deptId);
      const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId));
      const reqCases = config?.requiredCases ?? 0;
      const reqProcs = config?.requiredProcedures ?? 0;
      const reqAcad = config?.requiredAcademic ?? 0;
      const [reqClinical, clinicalMap] = await Promise.all([
        clinicalWorkTarget(configSourceId), verifiedClinicalWorkCounts(studentIds)]);

      menteesData = studentsInDept.map(s => {
        const cases = caseMap[s.studentId] ?? 0;
        const procs = procMap[s.studentId] ?? 0;
        const acad  = acadMap[s.studentId]  ?? 0;
        const clinical = clinicalMap.get(s.studentId) ?? 0;
        const pct   = computeCompletion(cases, procs, acad, clinical, reqCases, reqProcs, reqAcad, reqClinical);
        return {
          id:                 s.studentId,
          name:               s.fullName,
          registrationNumber: s.regNum,
          department:         s.deptName || "Unknown",
          overallCompletion:  pct,
          shortfallStatus:    shortfallStatus(pct),
          logCounts: { cases, procs, acad, clinical },
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
