import { Router, type IRouter } from "express";
import crypto from "crypto";
import { 
  db, studentsTable, caseLogsTable, procedureLogsTable, 
  academicLogsTable, usersTable, departmentsTable, departmentConfigsTable,
  postingsTable, leaveRecordsTable, appraisalsTable, researchTable, assessmentsTable, procedureTypesTable, departmentCatalogTable, certificationsTable, conferencesTable
} from "@workspace/db";
import { eq, and, or, desc, count, sql, isNull, aliasedTable } from "drizzle-orm";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { studentAccess } from "../middlewares/student-access.js";
import { z } from "zod";
import { dateSchema, idSchema, nameSchema, validate } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";

const router: IRouter = Router();
router.use(requireAuth, requireRole(["student", "professor", "hod"]), requireDepartment);

router.get("/requirements", async (req, res) => {
  const departmentId = req.user!.departmentId!;
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  const [procedureRequirements, academicRequirements] = await Promise.all([
    db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId)),
    db.select().from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "academic"))),
  ]);
  res.json({ procedureRequirements, academicRequirements });
});
router.use("/:studentId", studentAccess);

// Helper for validating supervisor
async function validateSupervisor(supervisorId: number, departmentId: number) {
  if (!Number.isSafeInteger(supervisorId) || supervisorId <= 0) return false;
  const supervisorMatch = await db.select().from(usersTable).where(and(eq(usersTable.id, supervisorId),
    eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"))).limit(1);
  return supervisorMatch.length > 0 && ["professor", "hod"].includes(supervisorMatch[0].role);
}

// ---------------------------------------------------------
// NEW REAL DATABASE ROUTES
// ---------------------------------------------------------

router.get("/:studentId/dashboard", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) {
      res.status(400).json({ message: "Invalid studentId" });
      return;
    }

    const studentMatch = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      name: usersTable.fullName,
      registrationNumber: studentsTable.registrationNumber,
      dateOfJoining: studentsTable.dateOfJoining,
      batch: studentsTable.batch,
      department: departmentsTable.name,
      departmentId: usersTable.departmentId,
    })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);

    if (studentMatch.length === 0) {
      res.status(404).json({ message: "Student not found" });
      return;
    }
    const student = studentMatch[0];

    const caller = req.user!;
    if (caller.role === "student" && caller.id !== student.userId) {
      res.status(403).json({ message: "You may only view your own dashboard" });
      return;
    }
    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
      res.status(403).json({ message: "This student is outside your department" });
      return;
    }

    // Counts
    const caseLogsCounts = await db.select({ status: caseLogsTable.status, count: count() }).from(caseLogsTable).where(eq(caseLogsTable.studentId, studentId)).groupBy(caseLogsTable.status);
    const procLogsCounts = await db.select({ status: procedureLogsTable.status, count: count() }).from(procedureLogsTable).where(eq(procedureLogsTable.studentId, studentId)).groupBy(procedureLogsTable.status);
    const acadLogsCounts = await db.select({ status: academicLogsTable.status, count: count() }).from(academicLogsTable).where(eq(academicLogsTable.studentId, studentId)).groupBy(academicLogsTable.status);

    const calcCounts = (counts: any[]) => ({
      verified: counts.find(c => c.status === "verified")?.count || 0,
      total: counts.reduce((acc, c) => acc + Number(c.count), 0)
    });

    const cases = calcCounts(caseLogsCounts);
    const procs = calcCounts(procLogsCounts);
    const acads = calcCounts(acadLogsCounts);

    const configSourceId = await resolveConfigDepartmentId(student.departmentId!);
    const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId));
    const reqCases = config?.requiredCases ?? 0;
    const reqProcs = config?.requiredProcedures ?? 0;
    const reqAcad = config?.requiredAcademic ?? 0;

    // Recent Logs (simplified for dashboard). Scoped like /logs (student.ts:165-173):
    // professors see only entries they supervise; students (own) and HODs (dept-wide,
    // already enforced by studentAccess) see the rest. Excludes soft-deleted rows and
    // returns only the fields this summary needs - no clinical text, no UHID.
    const recentCaseFilter = caller.role === "professor"
      ? and(eq(caseLogsTable.studentId, studentId), eq(caseLogsTable.supervisorId, caller.id), isNull(caseLogsTable.deletedAt))
      : and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt));
    const recentProcFilter = caller.role === "professor"
      ? and(eq(procedureLogsTable.studentId, studentId), eq(procedureLogsTable.supervisorId, caller.id), isNull(procedureLogsTable.deletedAt))
      : and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt));
    const recentCases = await db.select({ id: caseLogsTable.id, date: caseLogsTable.date, status: caseLogsTable.status })
      .from(caseLogsTable).where(recentCaseFilter).orderBy(desc(caseLogsTable.createdAt)).limit(1);
    const recentProcs = await db.select({ id: procedureLogsTable.id, date: procedureLogsTable.date, status: procedureLogsTable.status })
      .from(procedureLogsTable).where(recentProcFilter).orderBy(desc(procedureLogsTable.createdAt)).limit(1);
    
    res.json({
      student: {
        id: student.id,
        name: student.name,
        registrationNumber: student.registrationNumber,
        dateOfJoining: student.dateOfJoining,
        joiningYear: student.batch,
        department: student.department || "Unassigned",
      },
      categories: [
        { id: "cases", name: "Clinical Cases Presented", logged: cases.total, required: reqCases, verified: cases.verified, percentage: Math.min(100, Math.round((cases.verified / (reqCases || 1)) * 100)) },
        { id: "procedures", name: "Required Procedures", logged: procs.total, required: reqProcs, verified: procs.verified, percentage: Math.min(100, Math.round((procs.verified / (reqProcs || 1)) * 100)) },
        { id: "academics", name: "Case Discussions", logged: acads.total, required: reqAcad, verified: acads.verified, percentage: Math.min(100, Math.round((acads.verified / (reqAcad || 1)) * 100)) },
      ],
      recentLogs: [...recentCases, ...recentProcs]
    });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching dashboard");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Logs (Cases, Procedures, Academics) are fetched in one go by the frontend using /:studentId/logs
router.get("/:studentId/logs", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) {
      res.status(400).json({ message: "Invalid studentId format" });
      return;
    }

    // Fetch profile
    const mentorsTable = aliasedTable(usersTable, "mentors");

    const studentMatch = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      name: usersTable.fullName,
      registrationNumber: studentsTable.registrationNumber,
      dateOfJoining: studentsTable.dateOfJoining,
      batch: studentsTable.batch,
      department: departmentsTable.name,
      departmentId: usersTable.departmentId,
      mentorName: mentorsTable.fullName,
      mentorRole: mentorsTable.role,
    })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .leftJoin(mentorsTable, eq(studentsTable.mentorId, mentorsTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);

    if (studentMatch.length === 0) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const caller = req.user!;
    const student = studentMatch[0];
    if (caller.role === "student" && caller.id !== student.userId) {
      res.status(403).json({ message: "You may only view your own logbook" });
      return;
    }
    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
      res.status(403).json({ message: "This student is outside your department" });
      return;
    }

    // Faculty inspection is assignment-scoped. HODs retain department-wide oversight.
    const caseFilter = caller.role === "professor"
      ? and(eq(caseLogsTable.studentId, studentId), eq(caseLogsTable.supervisorId, caller.id), isNull(caseLogsTable.deletedAt))
      : and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt));
    const procedureFilter = caller.role === "professor"
      ? and(eq(procedureLogsTable.studentId, studentId), eq(procedureLogsTable.supervisorId, caller.id), isNull(procedureLogsTable.deletedAt))
      : and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt));
    const academicFilter = caller.role === "professor"
      ? and(eq(academicLogsTable.studentId, studentId), eq(academicLogsTable.supervisorId, caller.id))
      : eq(academicLogsTable.studentId, studentId);
    const conferenceFilter = caller.role === "professor"
      ? and(eq(conferencesTable.studentId, studentId), eq(conferencesTable.supervisorId, caller.id))
      : eq(conferencesTable.studentId, studentId);

    const [caseLogsRaw, procedureLogsRaw, academicLogsRaw, conferenceLogsRaw] = await Promise.all([
      db.select({ log: caseLogsTable, supervisorName: usersTable.fullName })
        .from(caseLogsTable).leftJoin(usersTable, eq(caseLogsTable.supervisorId, usersTable.id))
        .where(caseFilter).orderBy(desc(caseLogsTable.createdAt)),
      db.select({ log: procedureLogsTable, supervisorName: usersTable.fullName })
        .from(procedureLogsTable).leftJoin(usersTable, eq(procedureLogsTable.supervisorId, usersTable.id))
        .where(procedureFilter).orderBy(desc(procedureLogsTable.createdAt)),
      db.select({ log: academicLogsTable, supervisorName: usersTable.fullName })
        .from(academicLogsTable).leftJoin(usersTable, eq(academicLogsTable.supervisorId, usersTable.id))
        .where(academicFilter).orderBy(desc(academicLogsTable.createdAt)),
      db.select({ log: conferencesTable, supervisorName: usersTable.fullName })
        .from(conferencesTable).leftJoin(usersTable, eq(conferencesTable.supervisorId, usersTable.id))
        .where(conferenceFilter).orderBy(desc(conferencesTable.createdAt)),
    ]);

    res.json({
      profile: {
        department: studentMatch[0].department || "Unassigned",
        registrationNumber: studentMatch[0].registrationNumber,
        dateOfJoining: studentMatch[0].dateOfJoining,
        joiningYear: studentMatch[0].batch,
      },
      caseLogs: caseLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
      procedureLogs: procedureLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
      academicLogs: academicLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
      conferenceLogs: conferenceLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
    });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching student logs");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Progress — per-item log counts (category, procedure, academic type) by verified/pending.
// Unlike /:studentId/logs above, which is assignment-scoped ("Faculty inspection is
// assignment-scoped. HODs retain department-wide oversight." — student.ts:178), this
// endpoint deliberately does NOT filter by supervisorId. Progress counts represent the
// student's total training progress across all supervisors, not what one supervisor
// personally reviewed. A professor calling this route sees the same totals as the HOD,
// because the purpose is to assess training completeness, not to scope inspection.
router.get("/:studentId/progress", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) {
      res.status(400).json({ message: "Invalid studentId format" });
      return;
    }

    // Defense-in-depth: re-resolve the student row and re-check departmentId,
    // mirroring /:studentId/logs (student.ts:147-176), even though studentAccess
    // (line 26) already covers this. AGENTS.md §3 treats a missing re-check as a
    // defect, not redundant code.
    const studentMatch = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      departmentId: usersTable.departmentId,
    })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);

    if (studentMatch.length === 0) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const caller = req.user!;
    const student = studentMatch[0];
    if (caller.role === "student" && caller.id !== student.userId) {
      res.status(403).json({ message: "You may only view your own progress" });
      return;
    }
    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
      res.status(403).json({ message: "This student is outside your department" });
      return;
    }

    // All three queries filter by studentId only — no supervisorId filter.
    // See the comment block above this handler for why.
    const [caseCounts, procedureCounts, academicCounts] = await Promise.all([
      // Query 1: case_logs grouped by category and status.
      // NULL category (rows predating migration 0005) is a valid group — passed through as null.
      db.select({
        category: caseLogsTable.category,
        status: caseLogsTable.status,
        count: count(),
      })
      .from(caseLogsTable)
      .where(and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt)))
      .groupBy(caseLogsTable.category, caseLogsTable.status),

      // Query 2: procedure_logs grouped by procedureGroup, procedureName, competencyLevel, status.
      db.select({
        procedureGroup: procedureLogsTable.procedureGroup,
        procedureName: procedureLogsTable.procedureName,
        competencyLevel: procedureLogsTable.competencyLevel,
        status: procedureLogsTable.status,
        count: count(),
      })
      .from(procedureLogsTable)
      .where(and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt)))
      .groupBy(procedureLogsTable.procedureGroup, procedureLogsTable.procedureName, procedureLogsTable.competencyLevel, procedureLogsTable.status),

      // Query 3: academic_logs grouped by activityType and status.
      // academic_logs has no deletedAt column — no deletedAt filter here.
      db.select({
        activityType: academicLogsTable.activityType,
        status: academicLogsTable.status,
        count: count(),
      })
      .from(academicLogsTable)
      .where(eq(academicLogsTable.studentId, studentId))
      .groupBy(academicLogsTable.activityType, academicLogsTable.status),
    ]);

    // Reshape raw per-status rows into the response shape.
    // "verified" counts rows with status="verified". "pending" counts rows with
    // status="pending". Rows with status="rejected" are counted in neither.

    // --- Case categories ---
    const caseCategoryMap = new Map<string | null, { verified: number; pending: number }>();
    for (const row of caseCounts) {
      const key = row.category ?? null;
      if (!caseCategoryMap.has(key)) {
        caseCategoryMap.set(key, { verified: 0, pending: 0 });
      }
      const entry = caseCategoryMap.get(key)!;
      if (row.status === "verified") entry.verified += Number(row.count);
      // case_logs.status has no NOT NULL constraint (unlike procedure_logs.status and
      // academic_logs.status) — a NULL status is treated as pending, matching the
      // column's DEFAULT 'pending' semantics.
      else if (row.status === "pending" || row.status === null) entry.pending += Number(row.count);
    }
    const caseCategories = Array.from(caseCategoryMap.entries()).map(([value, counts]) => ({
      value,
      verified: counts.verified,
      pending: counts.pending,
    }));

    // --- Procedures (group+name totals, with byCompetency breakdown) ---
    const procedureMap = new Map<string, {
      group: string;
      name: string;
      verified: number;
      pending: number;
      competencyMap: Map<string, { verified: number; pending: number }>;
    }>();
    for (const row of procedureCounts) {
      const key = `${row.procedureGroup}\0${row.procedureName}`;
      if (!procedureMap.has(key)) {
        procedureMap.set(key, {
          group: row.procedureGroup,
          name: row.procedureName,
          verified: 0,
          pending: 0,
          competencyMap: new Map(),
        });
      }
      const entry = procedureMap.get(key)!;
      if (row.status === "verified") entry.verified += Number(row.count);
      else if (row.status === "pending") entry.pending += Number(row.count);

      if (!entry.competencyMap.has(row.competencyLevel)) {
        entry.competencyMap.set(row.competencyLevel, { verified: 0, pending: 0 });
      }
      const compEntry = entry.competencyMap.get(row.competencyLevel)!;
      if (row.status === "verified") compEntry.verified += Number(row.count);
      else if (row.status === "pending") compEntry.pending += Number(row.count);
    }
    const procedures = Array.from(procedureMap.values()).map((entry) => ({
      group: entry.group,
      name: entry.name,
      verified: entry.verified,
      pending: entry.pending,
      byCompetency: Array.from(entry.competencyMap.entries()).map(([level, counts]) => ({
        level,
        verified: counts.verified,
        pending: counts.pending,
      })),
    }));

    // --- Academics ---
    const academicMap = new Map<string, { verified: number; pending: number }>();
    for (const row of academicCounts) {
      if (!academicMap.has(row.activityType)) {
        academicMap.set(row.activityType, { verified: 0, pending: 0 });
      }
      const entry = academicMap.get(row.activityType)!;
      if (row.status === "verified") entry.verified += Number(row.count);
      else if (row.status === "pending") entry.pending += Number(row.count);
    }
    const academics = Array.from(academicMap.entries()).map(([value, counts]) => ({
      value,
      verified: counts.verified,
      pending: counts.pending,
    }));

    // Counts only — no patient text, no UHID, no free-text field (AGENTS.md §8).
    res.json({ caseCategories, procedures, academics });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching student progress");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Postings
router.get("/:studentId/postings", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;
    // Same supervisor scoping as /logs (student.ts:165-173): professors see only the
    // postings they supervise; students (own) and HODs (dept-wide, already enforced by
    // studentAccess) see the rest.
    const postingsFilter = caller.role === "professor"
      ? and(eq(postingsTable.studentId, studentId), eq(postingsTable.supervisorId, caller.id))
      : eq(postingsTable.studentId, studentId);
    const data = await db
      .select({
        id: postingsTable.id,
        ward: postingsTable.ward,
        startDate: postingsTable.startDate,
        endDate: postingsTable.endDate,
        supervisorId: postingsTable.supervisorId,
        supervisorName: usersTable.fullName
      })
      .from(postingsTable)
      .leftJoin(usersTable, eq(postingsTable.supervisorId, usersTable.id))
      .where(postingsFilter)
      .orderBy(desc(postingsTable.createdAt));
      
    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const options = await db.select({ name: departmentCatalogTable.value }).from(departmentCatalogTable)
      .where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "posting")));
    res.json({ options: options.map((item) => item.name), data });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching postings");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/postings", validate(z.object({ ward: nameSchema, startDate: dateSchema, endDate: dateSchema,
  supervisorId: idSchema }).strict().refine((v) => v.endDate >= v.startDate, "End date must be on or after start date")), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { ward, postingName, startDate, endDate, supervisorId } = req.body;
    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const [option] = await db.select({ id: departmentCatalogTable.id }).from(departmentCatalogTable).where(and(
      eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "posting"), eq(departmentCatalogTable.value, ward))).limit(1);
    if (!option || !(await validateSupervisor(Number(supervisorId), req.user!.departmentId!))) {
      res.status(400).json({ message: "Select a posting and supervisor from your department" }); return;
    }
    
    const [inserted] = await db.insert(postingsTable).values({
      studentId,
      ward,
      startDate,
      endDate,
      supervisorId: parseInt(supervisorId, 10) || null,
    }).returning();
    res.status(201).json({ success: true, posting: inserted });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error creating posting");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Leave Records
router.get("/:studentId/leave-balance", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;

    if (caller.role === "student") {
      const [ownProfile] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.userId, caller.id));
      if (!ownProfile || ownProfile.id !== studentId) {
        res.status(403).json({ message: "Forbidden: you may only view your own leave balance" });
        return;
      }
    } else if (caller.role === "professor" || caller.role === "hod") {
      // Missing scope must fail closed (AGENTS.md sec 3) - a professor/HOD with no
      // department assignment gets no data, never every department's.
      if (caller.departmentId === null) {
        res.status(403).json({ message: "Your account needs a department assignment" });
        return;
      }
      const [studentUser] = await db
        .select({ departmentId: usersTable.departmentId })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(eq(studentsTable.id, studentId));
      if (!studentUser) {
        res.status(404).json({ message: "Student not found" });
        return;
      }
      if (studentUser.departmentId !== caller.departmentId) {
        res.status(403).json({ message: "Forbidden: student is in a different department" });
        return;
      }
    }

    const currentYear = new Date().getFullYear().toString();
    
    const configSourceId = await resolveConfigDepartmentId(caller.departmentId!);
    const leaveTypes = await db.select({ name: departmentCatalogTable.name, value: departmentCatalogTable.value, required: departmentCatalogTable.required }).from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "leave_type")));
    
    const relevantLeaves = await db.select({
      leaveType: leaveRecordsTable.leaveType,
      startDate: leaveRecordsTable.startDate,
      endDate: leaveRecordsTable.endDate
    })
    .from(leaveRecordsTable)
    .where(sql`${leaveRecordsTable.studentId} = ${studentId} AND ${leaveRecordsTable.status} IN ('approved', 'pending') AND ${leaveRecordsTable.startDate} LIKE ${currentYear + '-%'}`);

    const usedMap: Record<string, number> = {};
    for (const l of relevantLeaves) {
      if (!l.startDate || !l.endDate) continue;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      if (diffDays > 0) {
        usedMap[l.leaveType] = (usedMap[l.leaveType] || 0) + diffDays;
      }
    }

    const balances: Record<string, { used: number, total: number | null }> = {};
    for (const type of leaveTypes) {
      if (caller.role === "student" && type.name.toLowerCase().includes("maternity")) continue;
      balances[type.value] = { used: usedMap[type.value] || 0, total: type.required || null };
    }
    res.json(balances);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching leave balance");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:studentId/leave-records", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    // Leave reasons can disclose a health condition (AGENTS.md sec 8). Unlike the other
    // student.ts record types, no supervisor relationship exists for leave - the owning
    // student and the department HOD are the only legitimate readers. Body matches
    // studentAccess's own 403 exactly (middlewares/student-access.ts:16): a professor's
    // rejection here must not be distinguishable from "no such student" or this becomes
    // a second way to enumerate which students exist, the exact leak studentAccess's
    // uniform 403 exists to close (docs/SECURITY_FIXES.md sec 1b).
    if (req.user!.role === "professor") {
      res.status(403).json({ message: "Student is outside your access scope" });
      return;
    }
    const data = await db.select().from(leaveRecordsTable).where(eq(leaveRecordsTable.studentId, studentId)).orderBy(desc(leaveRecordsTable.createdAt));
    res.json({ data: data.map(d => ({ ...d, number: d.id })) }); // Map id to number for frontend compat
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/leave-records", validate(z.object({ startDate: dateSchema, endDate: dateSchema,
  leaveType: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(4000) }).strict().refine((v) => v.endDate >= v.startDate, "End date must be on or after start date")), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { fromDate, toDate, leaveType, reason, startDate, endDate } = req.body;
    
    const [studentUser] = await db.select({ departmentId: usersTable.departmentId }).from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id)).where(eq(studentsTable.id, studentId)).limit(1);
    
    if (!studentUser) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const currentYear = new Date().getFullYear().toString();
    const configSourceId = await resolveConfigDepartmentId(studentUser.departmentId!);
    const result = await db.transaction(async (tx) => {
      const hashBuffer = crypto.createHash("md5").update(`leave_lock_${studentId}`).digest();
      const hash = hashBuffer.readInt32BE(0);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash})`);

      const [catalogEntry] = await tx.select().from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "leave_type"), eq(departmentCatalogTable.value, leaveType))).limit(1);

      if (!catalogEntry) {
        return { status: 400, body: { message: "Invalid leave type for this department" } };
      }

      const start = new Date(startDate || fromDate);
      const end = new Date(endDate || toDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      if (diffDays <= 0) {
        return { status: 400, body: { message: "End date must be after start date" } };
      }

      const relevantLeaves = await tx.select({ startDate: leaveRecordsTable.startDate, endDate: leaveRecordsTable.endDate })
        .from(leaveRecordsTable)
        .where(sql`${leaveRecordsTable.studentId} = ${studentId} AND ${leaveRecordsTable.leaveType} = ${leaveType} AND ${leaveRecordsTable.status} IN ('approved', 'pending') AND ${leaveRecordsTable.startDate} LIKE ${currentYear + '-%'}`);
      
      let used = 0;
      for (const l of relevantLeaves) {
        if (!l.startDate || !l.endDate) continue;
        const lStart = new Date(l.startDate);
        const lEnd = new Date(l.endDate);
        const lDiffTime = lEnd.getTime() - lStart.getTime();
        used += Math.ceil(lDiffTime / (1000 * 60 * 60 * 24)) + 1;
      }

      if (catalogEntry.required > 0 && used + diffDays > catalogEntry.required) {
        return { status: 400, body: { message: `Requested leave exceeds remaining balance (Remaining: ${catalogEntry.required - used} days)` } };
      }

      const [inserted] = await tx.insert(leaveRecordsTable).values({
        studentId,
        startDate: startDate || fromDate,
        endDate: endDate || toDate,
        leaveType,
        reason,
        status: "pending"
      }).returning();
      
      return { status: 201, body: { success: true, leave: { ...inserted, number: inserted.id } } };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    // Never the error object itself: a failed insert throws DrizzleQueryError, whose
    // message carries the SQL plus every bound parameter - including the leave reason,
    // which can disclose a health condition (AGENTS.md sec 8). Id and status code only,
    // matching app.ts:96.
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Leave POST error");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Assessments — GET is auth-required with ownership/department check
router.get("/:studentId/assessments", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;

    if (caller.role === "student") {
      // Students may only read their own assessments
      const [ownProfile] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.userId, caller.id));
      if (!ownProfile || ownProfile.id !== studentId) {
        res.status(403).json({ message: "Forbidden: you may only view your own assessments" });
        return;
      }
    } else if (caller.role === "professor" || caller.role === "hod") {
      // Professors/HODs may only read assessments for students in their department.
      // Missing scope must fail closed (AGENTS.md sec 3) - a professor/HOD with no
      // department assignment gets no data, never every department's.
      if (caller.departmentId === null) {
        res.status(403).json({ message: "Your account needs a department assignment" });
        return;
      }
      const [studentUser] = await db
        .select({ departmentId: usersTable.departmentId })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(eq(studentsTable.id, studentId));
      if (!studentUser) {
        res.status(404).json({ message: "Student not found" });
        return;
      }
      if (studentUser.departmentId !== caller.departmentId) {
        res.status(403).json({ message: "Forbidden: student is not in your department" });
        return;
      }
    }
    // admin role: no restriction

    // Same supervisor scoping as /logs (student.ts:165-173): a professor sees only the
    // assessments they themselves recorded; students (own) and HODs (dept-wide, already
    // enforced above and by studentAccess) see the rest.
    const assessmentsFilter = caller.role === "professor"
      ? and(eq(assessmentsTable.studentId, studentId), eq(assessmentsTable.assessorId, caller.id))
      : eq(assessmentsTable.studentId, studentId);
    const data = await db
      .select({
        id: assessmentsTable.id,
        number: assessmentsTable.id,
        examName: assessmentsTable.examName,
        type: assessmentsTable.type,
        date: assessmentsTable.date,
        marks: assessmentsTable.marks,
        maximum: sql`100`.as("maximum"),
        assessorId: assessmentsTable.assessorId,
        assessorName: usersTable.fullName
      })
      .from(assessmentsTable)
      .leftJoin(usersTable, eq(assessmentsTable.assessorId, usersTable.id))
      .where(assessmentsFilter)
      .orderBy(desc(assessmentsTable.createdAt));
    res.json(data);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching assessments");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /students/:studentId/assessments — professors only; assessorId set server-side
router.post("/:studentId/assessments", requireAuth, requireRole(["professor", "hod"]), validate(z.object({ examName: nameSchema,
  type: z.enum(["quarterly", "annual"]), date: dateSchema, marks: z.coerce.number().int().min(0).max(100) }).strict()), async (req, res) => {
  try {
    const professorId = req.user!.id;
    const professorDeptId = req.user!.departmentId;
    const studentId = parseInt(String(req.params.studentId), 10);

    // Validate the student belongs to the professor's department
    const [student] = await db
      .select({ id: studentsTable.id, userId: studentsTable.userId })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId));

    if (!student) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const [studentUser] = await db
      .select({ departmentId: usersTable.departmentId })
      .from(usersTable)
      .where(eq(usersTable.id, student.userId));

    // Missing scope must fail closed (AGENTS.md sec 3) - null !== null is false, so the
    // old && form let a professor with no department create an assessment for anyone.
    if (professorDeptId === null || studentUser?.departmentId !== professorDeptId) {
      res.status(403).json({ message: "Student does not belong to your department" });
      return;
    }

    const { examName, type, date, marks } = req.body;
    if (!examName || marks === undefined) {
      res.status(400).json({ message: "examName and marks are required" });
      return;
    }

    const [inserted] = await db.insert(assessmentsTable).values({
      examName,
      type: type || "quarterly",
      date: date || new Date().toISOString().slice(0, 10),
      marks: parseInt(marks, 10) || 0,
      assessorId: professorId,   // always set from JWT — never client-supplied
      studentId
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error creating assessment");
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /students/:studentId/assessments/:assessmentId — edit score/details
router.patch("/:studentId/assessments/:assessmentId", requireAuth, requireRole(["professor", "hod"]), validate(z.object({
  examName: nameSchema.optional(), type: z.enum(["quarterly", "annual"]).optional(),
  date: dateSchema.optional(), marks: z.coerce.number().int().min(0).max(100).optional()
}).strict()), async (req, res) => {
  try {
    const caller = req.user!;
    const studentId = parseInt(String(req.params.studentId), 10);
    const assessmentId = parseInt(String(req.params.assessmentId), 10);
    if (isNaN(studentId) || isNaN(assessmentId)) { res.status(400).json({ message: "Invalid id format" }); return; }

    const [assessment] = await db.select({ id: assessmentsTable.id, assessorId: assessmentsTable.assessorId })
      .from(assessmentsTable).where(and(eq(assessmentsTable.id, assessmentId), eq(assessmentsTable.studentId, studentId))).limit(1);
    
    if (!assessment) { res.status(404).json({ message: "Assessment not found" }); return; }

    if (caller.role === "professor" && assessment.assessorId !== caller.id) {
      res.status(403).json({ message: "You may only edit assessments you recorded" }); return;
    }

    const [studentUser] = await db.select({ departmentId: usersTable.departmentId })
      .from(studentsTable).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId)).limit(1);

    if (!studentUser || studentUser.departmentId !== caller.departmentId) {
      res.status(403).json({ message: "Student is outside your department" }); return;
    }

    const updateSet: any = {};
    if (req.body.examName !== undefined) updateSet.examName = req.body.examName;
    if (req.body.type !== undefined) updateSet.type = req.body.type;
    if (req.body.date !== undefined) updateSet.date = req.body.date;
    if (req.body.marks !== undefined) updateSet.marks = req.body.marks;

    if (Object.keys(updateSet).length === 0) { res.json({ message: "No updates provided" }); return; }

    const [updated] = await db.update(assessmentsTable).set(updateSet)
      .where(eq(assessmentsTable.id, assessmentId)).returning();
    res.json(updated);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, assessmentId: req.params.assessmentId, status: 500 }, "Error updating assessment");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:studentId/thesis", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;
    // A thesis has two possible supervisors - guide and co-guide - so scoping mirrors
    // /logs (student.ts:165-173) against either, not a single supervisorId column.
    const thesisFilter = caller.role === "professor"
      ? and(eq(researchTable.studentId, studentId), or(eq(researchTable.guideId, caller.id), eq(researchTable.coGuideId, caller.id)))
      : eq(researchTable.studentId, studentId);
    const match = await db.select().from(researchTable).where(thesisFilter).limit(1);
    res.json({ data: match.length > 0 ? match[0] : null });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});


const optionalDate = z.union([dateSchema, z.literal(""), z.null()]).transform((v) => v || null);
router.post("/:studentId/thesis", validate(z.object({ thesisTitle: z.string().trim().min(1).max(4000), guideId: idSchema,
  coGuideId: idSchema.nullable(), protocolSubmissionDate: optionalDate, iecClearanceDate: optionalDate,
  dataCollectionStartDate: optionalDate, dataCollectionEndDate: optionalDate, submissionDate: optionalDate }).strict()), async (req, res) => {
  const body = req.body;
  if (!(await validateSupervisor(body.guideId, req.user!.departmentId!)) ||
    (body.coGuideId && !(await validateSupervisor(body.coGuideId, req.user!.departmentId!)))) {
    res.status(400).json({ message: "Select guides from your department" }); return;
  }
  if (body.dataCollectionStartDate && body.dataCollectionEndDate && body.dataCollectionEndDate < body.dataCollectionStartDate) {
    res.status(400).json({ message: "Data collection end date must follow the start date" }); return;
  }
  const [row] = await db.insert(researchTable).values({ ...body, studentId: Number(req.params.studentId) })
    .onConflictDoUpdate({ target: researchTable.studentId, set: { ...body, updatedAt: new Date() } }).returning();
  res.json({ data: row });
});

router.get("/:studentId/certifications", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;

    // Professors may only see certifications for their direct mentees (studentsTable.mentorId = caller.id).
    // Leave-records remain a separate 403 because they can disclose health conditions (AGENTS.md §8).
    // Certifications carry no such sensitivity — but we still scope them to mentee relationship.
    if (caller.role === "professor") {
      const [mentee] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.id, studentId), eq(studentsTable.mentorId, caller.id)))
        .limit(1);
      if (!mentee) {
        res.status(403).json({ message: "Student is outside your access scope" });
        return;
      }
    }
    res.json(await db.select().from(certificationsTable).where(eq(certificationsTable.studentId, Number(req.params.studentId))).orderBy(desc(certificationsTable.createdAt)));
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching certifications");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/certifications", validate(z.object({ title: nameSchema, provider: nameSchema, issueDate: dateSchema,
  expiryDate: dateSchema, certificateUrl: z.string().url().max(2000).refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL")
}).strict().refine((v) => v.expiryDate >= v.issueDate, "Expiry must be on or after issue date")), async (req, res) => {
  const [row] = await db.insert(certificationsTable).values({ ...req.body, studentId: Number(req.params.studentId),
    issueDate: new Date(req.body.issueDate + "T00:00:00Z"), expiryDate: new Date(req.body.expiryDate + "T00:00:00Z") }).returning();
  res.status(201).json(row);
});

// ── Faculty Review Endpoints ──────────────────────────────────────────────────
// Professors and HODs can approve / reject postings, thesis milestones, and
// certifications for students in their department.
// Professors are additionally scoped to their mentee relationship (AGENTS.md §3, §4).

const reviewBody = z.object({
  status: z.enum(["verified", "rejected"]),
  remarks: z.string().max(4000).optional(),
}).strict();

// PATCH /:studentId/postings/:postingId/review
router.patch("/:studentId/postings/:postingId/review", requireAuth, requireRole(["professor", "hod"]),
  validate(reviewBody), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const postingId = parseInt(String(req.params.postingId), 10);
    if (isNaN(studentId) || isNaN(postingId)) { res.status(400).json({ message: "Invalid id" }); return; }
    const reviewer = req.user!;

    // Resolve the posting — confirm it exists and belongs to this student (§3)
    const [posting] = await db.select({ supervisorId: postingsTable.supervisorId, studentId: postingsTable.studentId })
      .from(postingsTable).where(and(eq(postingsTable.id, postingId), eq(postingsTable.studentId, studentId))).limit(1);
    if (!posting) { res.status(404).json({ message: "Posting not found" }); return; }

    // Professors may only review postings where they are the named supervisor (§3)
    if (reviewer.role === "professor" && posting.supervisorId !== reviewer.id) {
      res.status(403).json({ message: "Posting not assigned to you" }); return;
    }

    // Confirm student is in reviewer's department (§3, §4 — uses usersTable.departmentId)
    const [studentRow] = await db.select({ departmentId: usersTable.departmentId })
      .from(studentsTable).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId)).limit(1);
    if (!studentRow || studentRow.departmentId !== reviewer.departmentId) {
      res.status(403).json({ message: "Posting not assigned to you" }); return;
    }

    const [updated] = await db.update(postingsTable)
      .set({ status: req.body.status, facultyRemarks: req.body.remarks ?? null })
      .where(eq(postingsTable.id, postingId)).returning();
    res.json(updated);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, postingId: req.params.postingId, status: 500 }, "Error reviewing posting");
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /:studentId/thesis/review
router.patch("/:studentId/thesis/review", requireAuth, requireRole(["professor", "hod"]),
  validate(z.object({
    protocolStatus: z.enum(["pending", "submitted", "approved"]).optional(),
    midTermStatus: z.enum(["pending", "submitted", "approved"]).optional(),
    finalSubmissionStatus: z.enum(["pending", "submitted", "approved"]).optional(),
    remarks: z.string().max(4000).optional(),
  }).strict()), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) { res.status(400).json({ message: "Invalid studentId" }); return; }
    const reviewer = req.user!;

    // Resolve the thesis
    const [thesis] = await db.select({ guideId: researchTable.guideId, coGuideId: researchTable.coGuideId })
      .from(researchTable).where(eq(researchTable.studentId, studentId)).limit(1);
    if (!thesis) { res.status(404).json({ message: "Thesis not found" }); return; }

    // Professors must be guide or co-guide (§3)
    if (reviewer.role === "professor" &&
        thesis.guideId !== reviewer.id && thesis.coGuideId !== reviewer.id) {
      res.status(403).json({ message: "You are not the guide for this thesis" }); return;
    }

    // Confirm student is in reviewer's department (§3, §4)
    const [studentRow] = await db.select({ departmentId: usersTable.departmentId })
      .from(studentsTable).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId)).limit(1);
    if (!studentRow || studentRow.departmentId !== reviewer.departmentId) {
      res.status(403).json({ message: "You are not the guide for this thesis" }); return;
    }

    const { protocolStatus, midTermStatus, finalSubmissionStatus, remarks } = req.body;
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (protocolStatus !== undefined) updateSet.protocolStatus = protocolStatus;
    if (midTermStatus !== undefined) updateSet.midTermStatus = midTermStatus;
    if (finalSubmissionStatus !== undefined) updateSet.finalSubmissionStatus = finalSubmissionStatus;
    if (remarks !== undefined) updateSet.facultyRemarks = remarks ?? null;

    const [updated] = await db.update(researchTable).set(updateSet)
      .where(eq(researchTable.studentId, studentId)).returning();
    res.json({ data: updated });
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error reviewing thesis");
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /:studentId/certifications/:certId/review
router.patch("/:studentId/certifications/:certId/review", requireAuth, requireRole(["professor", "hod"]),
  validate(reviewBody), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const certId = req.params.certId; // UUID
    if (isNaN(studentId)) { res.status(400).json({ message: "Invalid studentId" }); return; }
    const reviewer = req.user!;

    // Confirm certification belongs to this student (§3)
    const [cert] = await db.select({ id: certificationsTable.id })
      .from(certificationsTable)
      .where(and(eq(certificationsTable.id, certId), eq(certificationsTable.studentId, studentId))).limit(1);
    if (!cert) { res.status(404).json({ message: "Certification not found" }); return; }

    // Professors must have this student as a direct mentee (§3, §4)
    if (reviewer.role === "professor") {
      const [mentee] = await db.select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.id, studentId), eq(studentsTable.mentorId, reviewer.id))).limit(1);
      if (!mentee) { res.status(403).json({ message: "Student is outside your access scope" }); return; }
    }

    // Confirm student is in reviewer's department (§3, §4)
    const [studentRow] = await db.select({ departmentId: usersTable.departmentId })
      .from(studentsTable).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId)).limit(1);
    if (!studentRow || studentRow.departmentId !== reviewer.departmentId) {
      res.status(403).json({ message: "Student is outside your access scope" }); return;
    }

    const [updated] = await db.update(certificationsTable)
      .set({ status: req.body.status, facultyRemarks: req.body.remarks ?? null })
      .where(eq(certificationsTable.id, certId)).returning();
    res.json(updated);
  } catch (error) {
    req.log.error({ studentId: req.params.studentId, certId: req.params.certId, status: 500 }, "Error reviewing certification");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST LOGS

const optionalText = z.string().max(8000).optional();
router.post("/:studentId/case-logs", validate(z.object({ supervisorId: idSchema, date: dateSchema, patientAge: nameSchema,
  patientGender: z.enum(["male", "female", "other"]), diagnosisFinal: z.string().trim().min(1).max(8000),
  patientUhid: optionalText, chiefComplaints: optionalText, diagnosisProvisional: optionalText, history: optionalText,
  examination: optionalText, investigations: optionalText, differentialDiagnosis: optionalText, managementPlan: optionalText,
  outcome: optionalText, learningPoints: optionalText, category: optionalText }).strict()), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, date, patientAge, patientGender, diagnosisFinal } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum, req.user!.departmentId!))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }
    
    const [inserted] = await db.insert(caseLogsTable).values({
      studentId, supervisorId: supervisorIdNum, date, patientAge, patientGender, 
      diagnosisFinal,
      patientUhid: req.body.patientUhid,
      chiefComplaints: req.body.chiefComplaints,
      diagnosisProvisional: req.body.diagnosisProvisional,
      category: req.body.category,
      history: req.body.history, 
      examination: req.body.examination, investigations: req.body.investigations, 
      differentialDiagnosis: req.body.differentialDiagnosis, managementPlan: req.body.managementPlan, 
      outcome: req.body.outcome, learningPoints: req.body.learningPoints, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/procedure-logs", validate(z.object({ supervisorId: idSchema, procedureGroup: nameSchema,
  procedureName: nameSchema, date: dateSchema, patientUhid: nameSchema, patientAge: nameSchema,
  competencyLevel: nameSchema }).strict()), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, procedureGroup, procedureName, date, patientUhid, patientAge, competencyLevel } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum, req.user!.departmentId!))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const [option] = await db.select({ id: procedureTypesTable.id }).from(procedureTypesTable).where(and(
      eq(procedureTypesTable.departmentId, configSourceId), eq(procedureTypesTable.name, procedureName), eq(procedureTypesTable.group, procedureGroup))).limit(1);
    if (!option) { res.status(400).json({ message: "Select a procedure from your department" }); return; }

    const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures }).from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
    const enabledFeatures = config?.enabledFeatures as Record<string, boolean> | null;
    
    if (enabledFeatures?.procedureExperience) {
      const [compLevel] = await db.select({ id: departmentCatalogTable.id }).from(departmentCatalogTable).where(and(
        eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "competency_level"), eq(departmentCatalogTable.value, competencyLevel))).limit(1);
      if (!compLevel) { res.status(400).json({ message: "Invalid competency level for your department" }); return; }
    } else {
      if (competencyLevel !== "N/A") {
        res.status(400).json({ message: "Procedure experience is not enabled for your department" });
        return;
      }
    }
    const [inserted] = await db.insert(procedureLogsTable).values({
      studentId, supervisorId: supervisorIdNum, procedureGroup, procedureName, date, 
      patientUhid, patientAge, competencyLevel, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/academic-logs", validate(z.object({ supervisorId: idSchema, activityType: nameSchema,
  topic: z.string().trim().min(1).max(4000), date: dateSchema, presenter: optionalText,
  presentationType: z.string().max(160).nullable().optional() }).strict()), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, activityType, topic, date } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum, req.user!.departmentId!))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const [option] = await db.select({ id: departmentCatalogTable.id }).from(departmentCatalogTable).where(and(
      eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "academic"), eq(departmentCatalogTable.value, activityType))).limit(1);
    if (!option) { res.status(400).json({ message: "Select an academic activity from your department" }); return; }
    const [inserted] = await db.insert(academicLogsTable).values({
      studentId, supervisorId: supervisorIdNum, activityType, presentationType: req.body.presentationType, 
      topic, date, presenter: req.body.presenter, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/conference-logs", validate(z.object({ supervisorId: idSchema.optional().nullable(), conferenceName: nameSchema,
  role: z.enum(["attended", "presented"]), date: dateSchema, location: optionalText.nullable(),
  certificateUrl: optionalText.nullable() }).strict()), async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, conferenceName, role, date, location, certificateUrl } = req.body;
    
    let supervisorIdNum = null;
    if (supervisorId) {
      supervisorIdNum = parseInt(supervisorId, 10);
      if (!(await validateSupervisor(supervisorIdNum, req.user!.departmentId!))) {
        res.status(400).json({ message: "Invalid supervisorId" });
        return;
      }
    }

    const [inserted] = await db.insert(conferencesTable).values({
      studentId, supervisorId: supervisorIdNum, conferenceName, role, date, location, certificateUrl, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE Case Log
router.delete("/:studentId/case-logs/:logId", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const logId = parseInt(String(req.params.logId), 10);
    const caller = req.user!;

    if (caller.role !== "student") {
      res.status(403).json({ message: "Only students can delete their own logs" });
      return;
    }
    
    const [ownProfile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, caller.id));
    if (!ownProfile || ownProfile.id !== studentId) {
      res.status(403).json({ message: "Forbidden: you can only delete your own logs" });
      return;
    }

    const [log] = await db.select().from(caseLogsTable).where(and(eq(caseLogsTable.id, logId), eq(caseLogsTable.studentId, studentId)));
    if (!log) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    if (log.status !== "pending") {
      res.status(400).json({ message: "Only pending logs can be deleted" });
      return;
    }

    await db.update(caseLogsTable).set({ deletedAt: new Date() }).where(eq(caseLogsTable.id, logId));
    res.json({ message: "Log deleted successfully" });
  } catch (error) {
    req.log.error({ logId: req.params.logId, status: 500 }, "Error deleting case log");
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE Procedure Log
router.delete("/:studentId/procedure-logs/:logId", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const logId = parseInt(String(req.params.logId), 10);
    const caller = req.user!;

    if (caller.role !== "student") {
      res.status(403).json({ message: "Only students can delete their own logs" });
      return;
    }
    
    const [ownProfile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, caller.id));
    if (!ownProfile || ownProfile.id !== studentId) {
      res.status(403).json({ message: "Forbidden: you can only delete your own logs" });
      return;
    }

    const [log] = await db.select().from(procedureLogsTable).where(and(eq(procedureLogsTable.id, logId), eq(procedureLogsTable.studentId, studentId)));
    if (!log) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    if (log.status !== "pending") {
      res.status(400).json({ message: "Only pending logs can be deleted" });
      return;
    }

    await db.update(procedureLogsTable).set({ deletedAt: new Date() }).where(eq(procedureLogsTable.id, logId));
    res.json({ message: "Log deleted successfully" });
  } catch (error) {
    req.log.error({ logId: req.params.logId, status: 500 }, "Error deleting procedure log");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
