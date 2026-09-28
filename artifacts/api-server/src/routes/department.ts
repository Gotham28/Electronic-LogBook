import { Router, type IRouter } from "express";
import { db, usersTable, departmentsTable, studentsTable, caseLogsTable, procedureLogsTable, academicLogsTable, departmentConfigsTable, departmentCatalogTable, procedureTypesTable, clinicalWorkLogsTable, departmentPostingScheduleTable } from "@workspace/db";
import { eq, and, inArray, count, sql, isNull } from "drizzle-orm";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { completionPercent, idSchema } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { clinicalWorkTarget, verifiedClinicalWorkCounts } from "../lib/clinical-work-progress.js";

const router: IRouter = Router();

// Registration only needs the directory, not department rosters or staff identities.
router.get("/", async (_req, res) => {
  res.json(await db.select({ id: departmentsTable.id, name: departmentsTable.name, code: departmentsTable.code }).from(departmentsTable)
    .innerJoin(usersTable, and(eq(usersTable.departmentId, departmentsTable.id), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")))
    .leftJoin(departmentConfigsTable, eq(departmentConfigsTable.departmentId, departmentsTable.id))
    .where(eq(departmentsTable.isTest, false))
    .orderBy(departmentsTable.name));
});

router.use(requireAuth, requireRole(["student", "professor", "hod"]), requireDepartment);
router.use("/:departmentId", (req, res, next) => {
  const id = idSchema.safeParse(req.params.departmentId);
  if (!id.success) { res.status(400).json({ message: "Invalid department ID" }); return; }
  if (id.data !== req.user!.departmentId) { res.status(403).json({ message: "Department is outside your access scope" }); return; }
  next();
});

router.get("/:departmentId/catalog", async (req, res) => {
  // Logged on failure, so the log says which part broke.
  let step = "resolve-config-source";
  try {
    const departmentId = req.user!.departmentId!;
    const configSourceId = await resolveConfigDepartmentId(departmentId);
    step = "load-catalog";
    const [department, hod, config, procedures, catalog, postingSchedule] = await Promise.all([
      db.select({ id: departmentsTable.id, name: departmentsTable.name, code: departmentsTable.code }).from(departmentsTable).where(eq(departmentsTable.id, departmentId)).limit(1),
      db.select({ id: usersTable.id, name: usersTable.fullName }).from(usersTable)
        .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "hod"), eq(usersTable.status, "approved"))).limit(1),
      db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1),
      db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId)).orderBy(procedureTypesTable.name),
      db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, configSourceId)).orderBy(departmentCatalogTable.name),
      db.select({ trainingYear: departmentPostingScheduleTable.trainingYear, postingValue: departmentPostingScheduleTable.postingValue,
        months: departmentPostingScheduleTable.months }).from(departmentPostingScheduleTable)
        .where(eq(departmentPostingScheduleTable.departmentId, configSourceId))
        .orderBy(departmentPostingScheduleTable.trainingYear, departmentPostingScheduleTable.sortOrder),
    ]);
    res.json({ department: department[0], hod: hod[0] || null, config: config[0] || null, procedures,
      postings: catalog.filter((item) => item.kind === "posting"), academics: catalog.filter((item) => item.kind === "academic"), caseCategories: catalog.filter((item) => item.kind === "case_category"),
      competencyLevels: catalog.filter((item) => item.kind === "competency_level"), leaveTypes: catalog.filter((item) => item.kind === "leave_type"),
      conferenceLevels: catalog.filter((item) => item.kind === "conference_level"),
      clinicalWorkCategories: catalog.filter((item) => item.kind === "clinical_work_category"),
      clinicalWorkSubtypes: catalog.filter((item) => item.kind === "clinical_work_subtype"),
      organSystemOptions: catalog.filter((item) => item.kind === "organ_system_option"),
      postingSchedule });
  } catch (error: any) {
    // The Postgres error code only (e.g. 42P01 missing table, 42703 missing column), never
    // the error text, which can carry SQL parameters (AGENTS.md §8). Same rule as app.ts.
    const code = error?.code ?? error?.cause?.code;
    req.log.error({ departmentId: req.params.departmentId, step,
      code: typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : "UNEXPECTED", status: 500 }, "Error resolving config department");
    res.status(500).json({ message: "Internal server error" });
  }
});

function computeCompletion(cases: number, procs: number, acad: number, clinical: number, reqCases: number | null, reqProcs: number | null, reqAcad: number | null, reqClinical: number) {
  return completionPercent([[cases, reqCases], [procs, reqProcs], [acad, reqAcad], [clinical, reqClinical]]);
}

// GET /api/departments/:departmentId/config
router.get("/:departmentId/config", async (req, res) => {
  try {
    const departmentId = Number(req.params.departmentId);
    if (isNaN(departmentId)) {
      res.status(400).json({ message: "Invalid departmentId" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(departmentId);
    const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId));
    res.json(config || null);
  } catch (error) {
    req.log.error({ departmentId: req.params.departmentId, status: 500 }, "Error fetching department config");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:departmentId/professors", async (req, res) => {
  try {
    const departmentId = Number(req.params.departmentId);
    if (isNaN(departmentId)) {
      res.status(400).json({ message: "Invalid departmentId format" });
      return;
    }

    const professors = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.departmentId, departmentId),
          inArray(usersTable.role, ["professor", "hod"]), eq(usersTable.status, "approved")
        )
      );

    res.json(professors);
  } catch (error) {
    req.log.error({ departmentId: req.params.departmentId, status: 500 }, "Error fetching professors by department");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/departments/:departmentId/analytics
router.get("/:departmentId/analytics", requireRole(["hod"]), async (req, res) => {
  try {
    const departmentId = Number(req.params.departmentId);
    if (isNaN(departmentId)) {
      res.status(400).json({ message: "Invalid departmentId format" });
      return;
    }

    // 404 if department doesn't exist
    const deptMatch = await db.select().from(departmentsTable).where(eq(departmentsTable.id, departmentId)).limit(1);
    if (deptMatch.length === 0) {
      res.status(404).json({ message: "Department not found" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(departmentId);

    // Approved students in this department (via users.departmentId). Pending applicants and
    // deactivated (rejected) accounts are not residents, matching the review queue's scope.
    const studentsInDept = await db
      .select({
        studentId:          studentsTable.id,
        userId:             studentsTable.userId,
        registrationNumber: studentsTable.registrationNumber,
        dateOfJoining:      studentsTable.dateOfJoining,
        kuhsId:             studentsTable.kuhsId,
        fullName:           usersTable.fullName,
        email:              usersTable.email,
      })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "student"), eq(usersTable.status, "approved")));

    const studentIds = studentsInDept.map(s => s.studentId);

    // ── Log status breakdown across all three tables ──────────────────────────
    let logStats = { pending: 0, verified: 0, rejected: 0 };

    if (studentIds.length > 0) {
      // Case and procedure logs are soft-deleted (deletedAt); academic logs have no such column.
      const countByStatus = async (tbl: typeof caseLogsTable | typeof procedureLogsTable | typeof academicLogsTable, idCol: any, deletedAt?: any) =>
        db.select({ status: (tbl as any).status, cnt: count() })
          .from(tbl)
          .where(and(inArray(idCol, studentIds), deletedAt ? isNull(deletedAt) : undefined))
          .groupBy((tbl as any).status);

      const [caseCounts, procCounts, acadCounts, clinicalCounts] = await Promise.all([
        countByStatus(caseLogsTable, caseLogsTable.studentId, caseLogsTable.deletedAt),
        countByStatus(procedureLogsTable, procedureLogsTable.studentId, procedureLogsTable.deletedAt),
        countByStatus(academicLogsTable, academicLogsTable.studentId),
        db.select({ status: clinicalWorkLogsTable.status, cnt: count() }).from(clinicalWorkLogsTable)
          .where(and(inArray(clinicalWorkLogsTable.studentId, studentIds), isNull(clinicalWorkLogsTable.deletedAt)))
          .groupBy(clinicalWorkLogsTable.status),
      ]);

      for (const row of [...caseCounts, ...procCounts, ...acadCounts, ...clinicalCounts] as any[]) {
        const s = row.status as "pending" | "verified" | "rejected";
        logStats[s] = (logStats[s] || 0) + Number(row.cnt);
      }
    }

    // ── Top procedure types ───────────────────────────────────────────────────
    let topProcedures: { name: string; count: number }[] = [];

    if (studentIds.length > 0) {
      const procRows = await db
        .select({ name: procedureLogsTable.procedureName, cnt: count() })
        .from(procedureLogsTable)
        .where(and(inArray(procedureLogsTable.studentId, studentIds), isNull(procedureLogsTable.deletedAt)))
        .groupBy(procedureLogsTable.procedureName)
        .orderBy(sql`count(*) DESC`)
        .limit(5);

      topProcedures = (procRows as any[]).map(r => ({ name: r.name, count: Number(r.cnt) }));
    }

    // ── Per-student completion (verified only) → average ─────────────────────
    let avgCompletion = 0;

    if (studentIds.length > 0) {
      const [caseRows, procRows2, acadRows] = await Promise.all([
        db.select({ studentId: caseLogsTable.studentId, cnt: count() })
          .from(caseLogsTable)
          .where(and(inArray(caseLogsTable.studentId, studentIds), eq(caseLogsTable.status, "verified"), isNull(caseLogsTable.deletedAt)))
          .groupBy(caseLogsTable.studentId),
        db.select({ studentId: procedureLogsTable.studentId, cnt: count() })
          .from(procedureLogsTable)
          .where(and(inArray(procedureLogsTable.studentId, studentIds), eq(procedureLogsTable.status, "verified"), isNull(procedureLogsTable.deletedAt)))
          .groupBy(procedureLogsTable.studentId),
        db.select({ studentId: academicLogsTable.studentId, cnt: count() })
          .from(academicLogsTable)
          .where(and(inArray(academicLogsTable.studentId, studentIds), eq(academicLogsTable.status, "verified")))
          .groupBy(academicLogsTable.studentId),
      ]);

      const toMap = (rows: { studentId: number; cnt: number }[]) =>
        Object.fromEntries(rows.map(r => [r.studentId, Number(r.cnt)]));

      const caseMap = toMap(caseRows as any);
      const procMap = toMap(procRows2 as any);
      const acadMap = toMap(acadRows as any);

      const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId));
      const reqCases = config?.requiredCases ?? 0;
      const reqProcs = config?.requiredProcedures ?? 0;
      const reqAcad = config?.requiredAcademic ?? 0;
      const [reqClinical, clinicalMap] = await Promise.all([clinicalWorkTarget(configSourceId), verifiedClinicalWorkCounts(studentIds)]);

      const completions = studentsInDept.map(s =>
        computeCompletion(caseMap[s.studentId] ?? 0, procMap[s.studentId] ?? 0, acadMap[s.studentId] ?? 0, clinicalMap.get(s.studentId) ?? 0, reqCases, reqProcs, reqAcad, reqClinical)
      ).filter((c): c is number => c !== null);
      avgCompletion = completions.length > 0
        ? Math.round(completions.reduce((a, b) => a + b, 0) / completions.length)
        : 0;
    }

    // ── Student list for the registrations table ──────────────────────────────
    // Status field: since there's no separate registration status column yet,
    // we treat all students as "Active" (they are in the DB = admitted).
    // Future: add a status column to studentsTable.
    const students = studentsInDept.map((s, i) => ({
      number:             i + 1,
      name:               s.fullName,
      department:         deptMatch[0].name,
      registrationNumber: s.registrationNumber,
      dateOfJoining:      s.dateOfJoining,
      status:  "Active" as const,
    }));

    res.json({
      totalStudents:   studentsInDept.length,
      avgCompletion,
      logStats,
      topProcedures,
      students,
    });
  } catch (error) {
    req.log.error({ departmentId: req.params.departmentId, status: 500 }, "Error fetching department analytics");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
