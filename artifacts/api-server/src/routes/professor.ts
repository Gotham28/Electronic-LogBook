import { Router, type IRouter } from "express";
import { db, caseLogsTable, procedureLogsTable, academicLogsTable, studentsTable, usersTable, departmentsTable, departmentConfigsTable, conferencesTable, clinicalWorkLogsTable, departmentCatalogTable, attendanceLogsTable, postingsTable, procedureTypesTable } from "@workspace/db";
import { eq, and, inArray, count, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { z } from "zod";
import { completionPercent, dateSchema, validate } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { clinicalWorkTarget, verifiedClinicalWorkCounts } from "../lib/clinical-work-progress.js";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { getAcademicLogbook } from "../lib/academic-logbook.js";
import { academicFieldVisible, academicSectionForRecord, academicSectionName, isBuiltInProcedureField, isPsychiatryShortCase, PROCEDURE_LOG_FIELDS, readAcademicRecord, resolveProcedureFieldDefinitions } from "@workspace/api-zod";

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

// Daily Attendance - list department students and their status for a date
router.get("/attendance", async (req, res) => {
  try {
    const caller = req.user!;
    const deptId = caller.departmentId!;
    const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().split("T")[0];

    const deptStudents = await db
      .select({
        studentId: studentsTable.id,
        name: usersTable.fullName,
        registrationNumber: studentsTable.registrationNumber,
        batch: studentsTable.batch,
      })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved")))
      .orderBy(usersTable.fullName);

    if (deptStudents.length === 0) {
      res.json({ date, students: [] });
      return;
    }

    const studentIds = deptStudents.map((s) => s.studentId);
    const existingLogs = await db
      .select({
        id: attendanceLogsTable.id,
        studentId: attendanceLogsTable.studentId,
        date: attendanceLogsTable.date,
        status: attendanceLogsTable.status,
        clockIn: attendanceLogsTable.clockIn,
        clockOut: attendanceLogsTable.clockOut,
        verifiedBy: attendanceLogsTable.verifiedBy,
      })
      .from(attendanceLogsTable)
      .where(and(inArray(attendanceLogsTable.studentId, studentIds), eq(attendanceLogsTable.date, date)));

    const logMap = new Map(existingLogs.map((log) => [log.studentId, log]));

    const result = deptStudents.map((s) => {
      const log = logMap.get(s.studentId);
      return {
        studentId: s.studentId,
        name: s.name,
        rollNumber: s.registrationNumber,
        joinedYear: parseInt(s.batch, 10) || 2025,
        status: log?.status ?? null,
        clockIn: log?.clockIn ?? null,
        clockOut: log?.clockOut ?? null,
        attendanceId: log?.id ?? null,
      };
    });

    res.json({ date, students: result });
  } catch (error) {
    req.log.error({ status: 500 }, "Error fetching professor attendance list");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Daily Attendance - mark attendance for department students
router.post(
  "/attendance",
  validate(
    z.object({
      date: dateSchema,
      records: z.array(
        z.object({
          studentId: z.number().int().positive(),
          status: z.enum(["present", "absent", "half_day", "leave"]),
          clockIn: z.string().optional().nullable(),
          clockOut: z.string().optional().nullable(),
        })
      ).min(1),
    })
  ),
  async (req, res) => {
    try {
      const caller = req.user!;
      const deptId = caller.departmentId!;
      const { date, records } = req.body;

      const studentIds = records.map((r: any) => r.studentId);

      // Verify all studentIds belong to caller's department (AGENTS.md sec 3)
      const validStudents = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(studentsTable.id, studentIds), eq(usersTable.departmentId, deptId)));

      const validIdSet = new Set(validStudents.map((s) => s.id));
      const hasUnauthorizedStudent = studentIds.some((id: number) => !validIdSet.has(id));
      if (hasUnauthorizedStudent) {
        res.status(403).json({ message: "Cannot mark attendance for students outside your department" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const record of records) {
          const [existing] = await tx
            .select({ id: attendanceLogsTable.id })
            .from(attendanceLogsTable)
            .where(and(eq(attendanceLogsTable.studentId, record.studentId), eq(attendanceLogsTable.date, date)))
            .limit(1);

          if (existing) {
            await tx
              .update(attendanceLogsTable)
              .set({
                status: record.status,
                clockIn: record.clockIn ?? null,
                clockOut: record.clockOut ?? null,
                verifiedBy: caller.id,
              })
              .where(eq(attendanceLogsTable.id, existing.id));
          } else {
            await tx.insert(attendanceLogsTable).values({
              studentId: record.studentId,
              date,
              status: record.status,
              clockIn: record.clockIn ?? null,
              clockOut: record.clockOut ?? null,
              verifiedBy: caller.id,
            });
          }
        }
      });

      res.json({ success: true, count: records.length });
    } catch (error) {
      req.log.error({ status: 500 }, "Error saving professor attendance");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Yearly Attendance - list department students and their Year 1, 2, 3 attendance percentages
router.get("/yearly-attendance", async (req, res) => {
  try {
    const caller = req.user!;
    const deptId = caller.departmentId;
    if (!deptId) {
      res.status(403).json({ message: "No department assigned" });
      return;
    }

    const deptStudents = await db
      .select({
        studentId: studentsTable.id,
        name: usersTable.fullName,
        registrationNumber: studentsTable.registrationNumber,
        batch: studentsTable.batch,
      })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved")))
      .orderBy(usersTable.fullName);

    if (deptStudents.length === 0) {
      res.json({ students: [] });
      return;
    }

    const studentIds = deptStudents.map((s) => s.studentId);
    const existingLogs = await db
      .select({
        id: attendanceLogsTable.id,
        studentId: attendanceLogsTable.studentId,
        date: attendanceLogsTable.date,
        clockIn: attendanceLogsTable.clockIn,
        verifiedBy: attendanceLogsTable.verifiedBy,
        verifierName: usersTable.fullName,
      })
      .from(attendanceLogsTable)
      .leftJoin(usersTable, eq(attendanceLogsTable.verifiedBy, usersTable.id))
      .where(and(
        inArray(attendanceLogsTable.studentId, studentIds),
        inArray(attendanceLogsTable.date, ["YEAR_1", "YEAR_2", "YEAR_3"])
      ));

    const logMap = new Map<string, typeof existingLogs[0]>();
    for (const log of existingLogs) {
      logMap.set(`${log.studentId}:${log.date}`, log);
    }

    const result = deptStudents.map((s) => {
      const y1 = logMap.get(`${s.studentId}:YEAR_1`);
      const y2 = logMap.get(`${s.studentId}:YEAR_2`);
      const y3 = logMap.get(`${s.studentId}:YEAR_3`);

      return {
        studentId: s.studentId,
        name: s.name,
        rollNumber: s.registrationNumber,
        year1: y1 ? { percentage: parseFloat(y1.clockIn || "0"), verifierName: y1.verifierName } : null,
        year2: y2 ? { percentage: parseFloat(y2.clockIn || "0"), verifierName: y2.verifierName } : null,
        year3: y3 ? { percentage: parseFloat(y3.clockIn || "0"), verifierName: y3.verifierName } : null,
      };
    });

    res.json({ students: result });
  } catch (error) {
    req.log.error({ status: 500 }, "Error fetching professor yearly attendance list");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Yearly Attendance - save Year 1, 2, 3 attendance percentages for department students
router.post(
  "/yearly-attendance",
  validate(
    z.object({
      records: z.array(
        z.object({
          studentId: z.number().int().positive(),
          year: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal("1"), z.literal("2"), z.literal("3")]),
          percentage: z.number().min(0).max(100).nullable().optional(),
        })
      ).min(1),
    })
  ),
  async (req, res) => {
    try {
      const caller = req.user!;
      const deptId = caller.departmentId;
      if (!deptId) {
        res.status(403).json({ message: "No department assigned" });
        return;
      }

      const { records } = req.body;
      const studentIds = Array.from(new Set(records.map((r: any) => r.studentId))) as number[];

      // Verify all studentIds belong to caller's department (AGENTS.md sec 3)
      const validStudents = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(studentsTable.id, studentIds), eq(usersTable.departmentId, deptId)));

      const validIdSet = new Set(validStudents.map((s) => s.id));
      const hasUnauthorizedStudent = studentIds.some((id: number) => !validIdSet.has(id));
      if (hasUnauthorizedStudent) {
        res.status(403).json({ message: "Cannot mark attendance for students outside your department" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const record of records) {
          const dateKey = `YEAR_${record.year}`;
          const [existing] = await tx
            .select({ id: attendanceLogsTable.id })
            .from(attendanceLogsTable)
            .where(and(eq(attendanceLogsTable.studentId, record.studentId), eq(attendanceLogsTable.date, dateKey)))
            .limit(1);

          if (record.percentage === null || record.percentage === undefined) {
            if (existing) {
              await tx.delete(attendanceLogsTable).where(eq(attendanceLogsTable.id, existing.id));
            }
          } else {
            const pctStr = String(record.percentage);
            if (existing) {
              await tx
                .update(attendanceLogsTable)
                .set({
                  status: "present",
                  clockIn: pctStr,
                  verifiedBy: caller.id,
                })
                .where(eq(attendanceLogsTable.id, existing.id));
            } else {
              await tx.insert(attendanceLogsTable).values({
                studentId: record.studentId,
                date: dateKey,
                status: "present",
                clockIn: pctStr,
                verifiedBy: caller.id,
              });
            }
          }
        }
      });

      res.json({ success: true, count: records.length });
    } catch (error) {
      req.log.error({ status: 500 }, "Error saving professor yearly attendance");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

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
    const { features, configSourceId, procedureLogFields } = await getDepartmentFeatures(deptId);
    const logbook = await getAcademicLogbook(configSourceId);

    // For HOD: show pending logs assigned to them or unassigned (department-scoped below via join).
    // For professor: show only logs where they are the named supervisor.
    const caseWhere = isHod && deptId != null
      ? and(or(eq(caseLogsTable.supervisorId, professorId), isNull(caseLogsTable.supervisorId)), eq(caseLogsTable.status, "pending"))
      : and(eq(caseLogsTable.supervisorId, professorId), eq(caseLogsTable.status, "pending"));

    const procWhere = isHod && deptId != null
      ? and(or(eq(procedureLogsTable.supervisorId, professorId), isNull(procedureLogsTable.supervisorId)), eq(procedureLogsTable.status, "pending"))
      : and(eq(procedureLogsTable.supervisorId, professorId), eq(procedureLogsTable.status, "pending"));

    const acadWhere = isHod && deptId != null
      ? and(or(eq(academicLogsTable.supervisorId, professorId), isNull(academicLogsTable.supervisorId)), eq(academicLogsTable.status, "pending"))
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
      ? and(or(eq(conferencesTable.supervisorId, professorId), isNull(conferencesTable.supervisorId)), eq(conferencesTable.status, "pending"))
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
      ? and(or(eq(clinicalWorkLogsTable.supervisorId, professorId), isNull(clinicalWorkLogsTable.supervisorId)), eq(clinicalWorkLogsTable.status, "pending"))
      : and(eq(clinicalWorkLogsTable.supervisorId, professorId), eq(clinicalWorkLogsTable.status, "pending"));
    const clinicalWorks = await db.select({ log: clinicalWorkLogsTable, student: studentsTable, user: usersTable, department: departmentsTable })
      .from(clinicalWorkLogsTable)
      .innerJoin(studentsTable, eq(clinicalWorkLogsTable.studentId, studentsTable.id))
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .where(and(clinicalWhere, eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved"), isNull(clinicalWorkLogsTable.deletedAt)));
    const clinicalNames = new Map<string, string>();
    const categoriesWithSubtypes = new Set<string>();
    let clinicalCompetencyRequired = false;
    if (clinicalWorks.length > 0) {
      const rows = await db.select({
        value: departmentCatalogTable.value, name: departmentCatalogTable.name,
        kind: departmentCatalogTable.kind, parentValue: departmentCatalogTable.parentValue,
      }).from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, configSourceId),
          inArray(departmentCatalogTable.kind, isHod
            ? ["clinical_work_category", "clinical_work_subtype"]
            : ["clinical_work_category", "clinical_work_subtype", "competency_level"])));
      for (const row of rows) {
        if (row.kind === "competency_level") {
          clinicalCompetencyRequired = true;
          continue;
        }
        clinicalNames.set(row.value, row.name);
        if (row.kind === "clinical_work_subtype" && row.parentValue !== null) {
          categoriesWithSubtypes.add(row.parentValue);
        }
      }
    }

    type ReviewFlag = "missing_required_fields" | "outside_posting_dates" | "duplicate_uhid_date";
    const reviewFlags = new Map<string, ReviewFlag[]>();
    const isBlank = (value: unknown) => typeof value !== "string" || value.trim() === "";
    const missingAcademicFields = (log: typeof academicLogsTable.$inferSelect) => {
      if ([log.date, log.activityType, log.topic].some(isBlank)) return true;
      const section = academicSectionForRecord(logbook, log.activityType, log.description);
      if (!section) return false;
      const record = readAcademicRecord(log.description);
      if (!record || (section.participation && isBlank(log.presentationType))) return true;
      return section.fields.some((field) => (field.required || field.requiredWhen) &&
        academicFieldVisible(field, record.values) && isBlank(record.values[field.key]));
    };
    if (!isHod) {
      const clinicalRows = [
        ...cases.map(({ log }) => ({ kind: "case" as const, log })),
        ...procedures.map(({ log }) => ({ kind: "procedure" as const, log })),
      ];
      const ids = [...new Set([
        ...clinicalRows.map(({ log }) => log.studentId),
        ...clinicalWorks.map(({ log }) => log.studentId),
      ])];
      const [postings, procedureTypes] = await Promise.all([
        ids.length > 0 ? db.select({ studentId: postingsTable.studentId, start: postingsTable.startDate, end: postingsTable.endDate })
          .from(postingsTable)
          .innerJoin(studentsTable, eq(postingsTable.studentId, studentsTable.id))
          .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
          .where(and(inArray(postingsTable.studentId, ids), eq(postingsTable.supervisorId, professorId),
            eq(postingsTable.status, "verified"), eq(usersTable.departmentId, deptId), eq(usersTable.status, "approved"))) : [],
        procedures.length > 0 && !features.freeTextProcedures
          ? db.select({ group: procedureTypesTable.group, name: procedureTypesTable.name, required: procedureTypesTable.requiredLogFields })
          .from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId)) : [],
      ]);
      const postingRanges = new Map<number, Array<{ start: string; end: string }>>();
      for (const { studentId, start, end } of postings) {
        if (!dateSchema.safeParse(start).success || !dateSchema.safeParse(end).success || start > end) continue;
        const ranges = postingRanges.get(studentId) ?? [];
        ranges.push({ start, end });
        postingRanges.set(studentId, ranges);
      }
      const outsidePostingDates = (studentId: number, date: string) => {
        const ranges = postingRanges.get(studentId);
        return !!ranges && dateSchema.safeParse(date).success &&
          !ranges.some(({ start, end }) => start <= date && date <= end);
      };

      const duplicateKey = ({ kind, log }: typeof clinicalRows[number]) => {
        if (kind === "case" && isPsychiatryShortCase(log)) return null;
        const uhid = log.patientUhid?.trim();
        if (!uhid || uhid.toUpperCase() === "N/A" || !dateSchema.safeParse(log.date).success) return null;
        return JSON.stringify([kind, log.studentId, log.date, uhid]);
      };
      const duplicateCounts = new Map<string, number>();
      for (const item of clinicalRows) {
        const key = duplicateKey(item);
        if (key !== null) duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
      }

      const activeFields: ReadonlySet<string> = new Set(features.dynamicProcedureFields
        ? resolveProcedureFieldDefinitions(procedureLogFields, true).map(({ id }) => id) : PROCEDURE_LOG_FIELDS);
      const requiredByProcedure = new Map(procedureTypes.map(({ group, name, required }) => [`${group}\0${name}`, required]));
      for (const item of clinicalRows) {
        const { log } = item;
        const flags: ReviewFlag[] = [];
        const foundMissing = item.kind === "case"
          ? [item.log.date, item.log.patientAge, item.log.patientGender, item.log.diagnosisFinal].some(isBlank)
          : [item.log.date, item.log.procedureName].some(isBlank) ||
            (!features.freeTextProcedures && isBlank(item.log.procedureGroup)) ||
            (!features.dynamicProcedureFields &&
              [item.log.patientUhid, item.log.patientAge, item.log.competencyLevel].some(isBlank)) ||
            (requiredByProcedure.get(`${item.log.procedureGroup}\0${item.log.procedureName}`) ?? []).some((field) => {
              if (!activeFields.has(field)) return false;
              const value = isBuiltInProcedureField(field) ? item.log[field] : item.log.customFields?.[field];
              return isBlank(value) || String(value).trim().toUpperCase() === "N/A";
            });
        if (foundMissing) flags.push("missing_required_fields");
        if (outsidePostingDates(log.studentId, log.date)) flags.push("outside_posting_dates");
        const key = duplicateKey(item);
        if (key !== null && (duplicateCounts.get(key) ?? 0) > 1) flags.push("duplicate_uhid_date");
        reviewFlags.set(`${item.kind}-${log.id}`, flags);
      }
      for (const { log } of clinicalWorks) {
        const flags: ReviewFlag[] = [];
        if ([log.date, log.category, log.caseNumber, log.patientAge, log.patientSex].some(isBlank) ||
          (categoriesWithSubtypes.has(log.category) && isBlank(log.subType)) ||
          (clinicalCompetencyRequired && isBlank(log.competency))) flags.push("missing_required_fields");
        if (outsidePostingDates(log.studentId, log.date)) flags.push("outside_posting_dates");
        reviewFlags.set(`clinical_work-${log.id}`, flags);
      }
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
        reviewFlags: reviewFlags.get(`case-${c.log.id}`) ?? [],
        patientUhid: isPsychiatryShortCase(c.log) ? null : c.log.patientUhid,
        patientInfo: `${c.log.patientAge} / ${c.log.patientGender}`,
        patientAge: c.log.patientAge,
        patientGender: c.log.patientGender,
        detail: c.log.chiefComplaints,
        diagnosis: c.log.diagnosisProvisional,
        attemptNumber: c.log.attemptNumber,
        chiefComplaints: c.log.chiefComplaints,
        history: c.log.history,
        examination: c.log.examination,
        investigations: c.log.investigations,
        diagnosisProvisional: c.log.diagnosisProvisional,
        differentialDiagnosis: c.log.differentialDiagnosis,
        diagnosisFinal: c.log.diagnosisFinal,
        managementPlan: c.log.managementPlan,
        outcome: c.log.outcome,
        learningPoints: c.log.learningPoints,
        category: c.log.category,
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
        reviewFlags: reviewFlags.get(`procedure-${p.log.id}`) ?? [],
        patientUhid: p.log.patientUhid,
        patientInfo: p.log.patientAge,
        patientAge: p.log.patientAge,
        setting: p.log.setting,
        detail: features.freeTextProcedures ? ((p.log as any).diagnosis ? `${p.log.procedureName} - ${(p.log as any).diagnosis}` : p.log.procedureName) : `${p.log.procedureGroup} procedure`,
        declaredCompetency: p.log.competencyLevel,
        diagnosis: (p.log as any).diagnosis,
        sex: (p.log as any).sex,
        customFields: (p.log as any).customFields ?? {},
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
        title: `${academicSectionName(logbook, a.log.activityType)}: ${a.log.topic}`,
        activityType: a.log.activityType,
        date: a.log.date,
        reviewFlags: !isHod && missingAcademicFields(a.log) ? ["missing_required_fields"] : [],
        detail: a.log.presentationType || academicSectionName(logbook, a.log.activityType),
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
        reviewFlags: !isHod && [c.log.date, c.log.conferenceName, c.log.conferenceType, c.log.role].some(isBlank)
          ? ["missing_required_fields"] : [],
        conferenceType: c.log.conferenceType,
        level: c.log.level,
        category: c.log.category,
        location: c.log.location,
        certificateUrl: c.log.certificateUrl,
        detail: c.log.role === "presented" ? "Presented" : "Attended",
        status: c.log.status
      })),
      ...clinicalWorks.map(c => {
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
          reviewFlags: reviewFlags.get(`clinical_work-${c.log.id}`) ?? [],
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
