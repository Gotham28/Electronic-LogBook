import { and, count, eq, inArray, isNull } from "drizzle-orm";
import {
  usersTable, studentsTable, caseLogsTable, procedureLogsTable, academicLogsTable,
  clinicalWorkLogsTable, conferencesTable, departmentConfigsTable, departmentCatalogTable,
} from "@workspace/db";
import { resolveConfigDepartmentId } from "./department-config-source.js";
import { clinicalWorkTarget } from "./clinical-work-progress.js";
import { completionPercent } from "./validation.js";

type Status = "verified" | "pending" | "rejected";
type CategoryCounts = Record<Status, number>;
const emptyCounts = (): CategoryCounts => ({ verified: 0, pending: 0, rejected: 0 });

export type DepartmentReportFacts = {
  fieldGuide: string;
  department: { totalStudents: number; totalVerifiedLogs: number; totalPendingLogs: number; totalRejectedLogs: number };
  students: Array<{
    placeholder: string;
    overallPct: number | null;
    belowTarget: boolean | null;
    untrackedCategories: string[];
    caseVerified: number;
    caseRequired: number | null;
    procedureVerified: number;
    procedureRequired: number | null;
    academicVerified: number;
    academicRequired: number | null;
    clinicalWorkVerified: number;
    clinicalWorkRequired: number | null;
  }>;
  professors: Array<{ placeholder: string; pendingReviews: number }>;
};

/**
 * Build department progress using count/status projections only. Clinical text,
 * patient identifiers, faculty comments and record descriptions are never read.
 * A failed count query rejects the report so the caller can show an error instead
 * of presenting a false empty/zero-progress report.
 */
export async function buildDepartmentReportFacts(
  departmentId: number,
  db: any,
): Promise<{ facts: DepartmentReportFacts; nameMap: Record<string, string> }> {
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  const [config] = await db.select({
    requiredCases: departmentConfigsTable.requiredCases,
    requiredProcedures: departmentConfigsTable.requiredProcedures,
    requiredAcademic: departmentConfigsTable.requiredAcademic,
    enabledFeatures: departmentConfigsTable.enabledFeatures,
  }).from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  const features = (config?.enabledFeatures ?? {}) as Record<string, boolean>;
  const casesEnabled = !features.hideCaseLogs;
  const proceduresEnabled = !features.hideProcedureLogs;
  const clinicalEnabled = features.clinicalWorks === true;
  const conferencesEnabled = features.attendedConferences === true;
  const clinicalRequired = clinicalEnabled ? await clinicalWorkTarget(configSourceId) : 0;
  const target = (value: number | null | undefined, enabled = true) => enabled && value != null && value > 0 ? value : null;
  const targets = {
    cases: target(config?.requiredCases, casesEnabled),
    procedures: target(config?.requiredProcedures, proceduresEnabled),
    academics: target(config?.requiredAcademic),
    clinicalWork: target(clinicalRequired, clinicalEnabled),
  };

  const students = await db.select({
    id: studentsTable.id,
    fullName: usersTable.fullName,
  }).from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "student"), eq(usersTable.status, "approved")))
    .orderBy(studentsTable.id);
  const studentIds: number[] = students.map((student: { id: number }) => student.id);

  const countsByStudent = new Map<number, Record<string, CategoryCounts>>();
  for (const studentId of studentIds) countsByStudent.set(studentId, {
    cases: emptyCounts(), procedures: emptyCounts(), academics: emptyCounts(),
    clinicalWork: emptyCounts(), conferences: emptyCounts(),
  });

  const queryCounts = async (table: any, category: string, includeDeletedFilter: boolean) => {
    if (studentIds.length === 0) return [] as Array<{ studentId: number; status: Status | null; amount: number }>;
    return db.select({ studentId: table.studentId, status: table.status, amount: count() })
      .from(table)
      .where(and(inArray(table.studentId, studentIds), includeDeletedFilter ? isNull(table.deletedAt) : undefined))
      .groupBy(table.studentId, table.status)
      .then((rows: Array<{ studentId: number; status: Status | null; amount: number }>) => {
        for (const row of rows) {
          const status = row.status === "verified" || row.status === "rejected" ? row.status : "pending";
          const counts = countsByStudent.get(row.studentId)?.[category];
          if (counts) counts[status] += Number(row.amount);
        }
        return rows;
      });
  };

  const [caseRows, procedureRows, academicRows, clinicalRows, conferenceRows] = await Promise.all([
    casesEnabled ? queryCounts(caseLogsTable, "cases", true) : Promise.resolve([]),
    proceduresEnabled ? queryCounts(procedureLogsTable, "procedures", true) : Promise.resolve([]),
    queryCounts(academicLogsTable, "academics", false),
    clinicalEnabled ? queryCounts(clinicalWorkLogsTable, "clinicalWork", true) : Promise.resolve([]),
    conferencesEnabled ? queryCounts(conferencesTable, "conferences", false) : Promise.resolve([]),
  ]);

  const countRows = [...caseRows, ...procedureRows, ...academicRows, ...clinicalRows, ...conferenceRows];
  const deptTotals = emptyCounts();
  for (const row of countRows) {
    const status: Status = row.status === "verified" || row.status === "rejected" ? row.status : "pending";
    deptTotals[status] += Number(row.amount);
  }

  const nameMap: Record<string, string> = {};
  const studentFacts = students.map((student: { id: number; fullName: string }, index: number) => {
    const placeholder = `Resident ${index + 1}`;
    nameMap[placeholder] = student.fullName;
    const categories = countsByStudent.get(student.id)!;
    const caseVerified = categories.cases.verified;
    const procedureVerified = categories.procedures.verified;
    const academicVerified = categories.academics.verified;
    const clinicalWorkVerified = categories.clinicalWork.verified;
    const overallPct = completionPercent([
      [caseVerified, targets.cases], [procedureVerified, targets.procedures],
      [academicVerified, targets.academics], [clinicalWorkVerified, targets.clinicalWork],
    ]);
    const untrackedCategories = [
      ...(casesEnabled && targets.cases === null ? ["cases"] : []),
      ...(proceduresEnabled && targets.procedures === null ? ["procedures"] : []),
      ...(targets.academics === null ? ["academics"] : []),
      ...(clinicalEnabled && targets.clinicalWork === null ? ["clinicalWork"] : []),
    ];
    return {
      placeholder,
      overallPct,
      belowTarget: overallPct === null ? null : overallPct < 75,
      untrackedCategories,
      caseVerified,
      caseRequired: targets.cases,
      procedureVerified,
      procedureRequired: targets.procedures,
      academicVerified,
      academicRequired: targets.academics,
      clinicalWorkVerified,
      clinicalWorkRequired: targets.clinicalWork,
    };
  });

  const professors = await db.select({
    userId: usersTable.id,
    fullName: usersTable.fullName,
  }).from(usersTable)
    .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "professor"), eq(usersTable.status, "approved")))
    .orderBy(usersTable.id);
  const professorIds: number[] = professors.map((professor: { userId: number }) => professor.userId);
  const pendingByProfessor = new Map<number, number>();
  if (professorIds.length) {
    const pendingRows = await Promise.all([
      ...(casesEnabled ? [db.select({ supervisorId: caseLogsTable.supervisorId, amount: count() }).from(caseLogsTable)
        .innerJoin(studentsTable, eq(caseLogsTable.studentId, studentsTable.id)).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(caseLogsTable.supervisorId, professorIds), eq(caseLogsTable.status, "pending"), isNull(caseLogsTable.deletedAt),
          eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student")))
        .groupBy(caseLogsTable.supervisorId)] : []),
      ...(proceduresEnabled ? [db.select({ supervisorId: procedureLogsTable.supervisorId, amount: count() }).from(procedureLogsTable)
        .innerJoin(studentsTable, eq(procedureLogsTable.studentId, studentsTable.id)).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(procedureLogsTable.supervisorId, professorIds), eq(procedureLogsTable.status, "pending"), isNull(procedureLogsTable.deletedAt),
          eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student")))
        .groupBy(procedureLogsTable.supervisorId)] : []),
      db.select({ supervisorId: academicLogsTable.supervisorId, amount: count() }).from(academicLogsTable)
        .innerJoin(studentsTable, eq(academicLogsTable.studentId, studentsTable.id)).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(academicLogsTable.supervisorId, professorIds), eq(academicLogsTable.status, "pending"),
          eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student")))
        .groupBy(academicLogsTable.supervisorId),
      ...(clinicalEnabled ? [db.select({ supervisorId: clinicalWorkLogsTable.supervisorId, amount: count() }).from(clinicalWorkLogsTable)
        .innerJoin(studentsTable, eq(clinicalWorkLogsTable.studentId, studentsTable.id)).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(clinicalWorkLogsTable.supervisorId, professorIds), eq(clinicalWorkLogsTable.status, "pending"), isNull(clinicalWorkLogsTable.deletedAt),
          eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student")))
        .groupBy(clinicalWorkLogsTable.supervisorId)] : []),
      ...(conferencesEnabled ? [db.select({ supervisorId: conferencesTable.supervisorId, amount: count() }).from(conferencesTable)
        .innerJoin(studentsTable, eq(conferencesTable.studentId, studentsTable.id)).innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(inArray(conferencesTable.supervisorId, professorIds), eq(conferencesTable.status, "pending"),
          eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student")))
        .groupBy(conferencesTable.supervisorId)] : []),
    ]);
    for (const rows of pendingRows) for (const row of rows) {
      if (row.supervisorId != null) pendingByProfessor.set(row.supervisorId, (pendingByProfessor.get(row.supervisorId) ?? 0) + Number(row.amount));
    }
  }

  const professorFacts = professors.map((professor: { userId: number; fullName: string }, index: number) => {
    const placeholder = `Professor ${index + 1}`;
    nameMap[placeholder] = professor.fullName;
    return { placeholder, pendingReviews: pendingByProfessor.get(professor.userId) ?? 0 };
  });

  return {
    facts: {
      fieldGuide: "totalStudents counts approved resident profiles. Log totals count case, procedure and academic log entries, plus enabled Clinical Work and Conference/CME records. Completion uses configured positive targets only; unconfigured categories are untracked, and below-target is a completion classification, not a time-adjusted training pace.",
      department: {
        totalStudents: students.length,
        totalVerifiedLogs: deptTotals.verified,
        totalPendingLogs: deptTotals.pending,
        totalRejectedLogs: deptTotals.rejected,
      },
      students: studentFacts,
      professors: professorFacts,
    },
    nameMap,
  };
}
