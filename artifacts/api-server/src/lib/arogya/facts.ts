import { and, count, eq, isNull, or } from "drizzle-orm";
import {
  appraisalsTable, academicLogsTable, caseLogsTable, clinicalWorkLogsTable,
  conferencesTable, db, departmentConfigsTable, departmentCatalogTable,
  procedureLogsTable, studentsTable, usersTable,
} from "@workspace/db";
import { resolveConfigDepartmentId } from "../department-config-source.js";
import { clinicalWorkTarget } from "../clinical-work-progress.js";
import { completionPercent } from "../validation.js";
import { buildDepartmentReportFacts } from "../department-report.js";
import { assertAuthorizedStudent, type ArogyaActor } from "./policy.js";

export class ArogyaScopeError extends Error {
  constructor(readonly status: 403 | 404) { super("AROGYA_SCOPE"); }
}

export async function getProgressSummary(actor: ArogyaActor, studentId?: number) {
  let student;
  try { student = await assertAuthorizedStudent(actor, studentId); }
  catch (error: any) { throw new ArogyaScopeError(error.message === "AROGYA_SCOPE_404" ? 404 : 403); }
  const configSourceId = await resolveConfigDepartmentId(actor.departmentId!);
  const [config] = await db.select({ requiredCases: departmentConfigsTable.requiredCases,
    requiredProcedures: departmentConfigsTable.requiredProcedures, requiredAcademic: departmentConfigsTable.requiredAcademic,
    enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  const features = (config?.enabledFeatures ?? {}) as Record<string, boolean>;
  type CountRow = { status: string | null; amount: number };
  const caseQuery = features.hideCaseLogs ? Promise.resolve([] as CountRow[]) : db.select({ status: caseLogsTable.status, amount: count() }).from(caseLogsTable)
    .where(and(eq(caseLogsTable.studentId, student.id), isNull(caseLogsTable.deletedAt))).groupBy(caseLogsTable.status);
  const procedureQuery = features.hideProcedureLogs ? Promise.resolve([] as CountRow[]) : db.select({ status: procedureLogsTable.status, amount: count() }).from(procedureLogsTable)
    .where(and(eq(procedureLogsTable.studentId, student.id), isNull(procedureLogsTable.deletedAt))).groupBy(procedureLogsTable.status);
  const clinicalQuery = !features.clinicalWorks ? Promise.resolve([] as CountRow[]) : db.select({ status: clinicalWorkLogsTable.status, amount: count() }).from(clinicalWorkLogsTable)
    .where(and(eq(clinicalWorkLogsTable.studentId, student.id), isNull(clinicalWorkLogsTable.deletedAt))).groupBy(clinicalWorkLogsTable.status);
  const [caseRows, procedureRows, academicRows, clinicalRows] = await Promise.all([
    caseQuery,
    procedureQuery,
    db.select({ status: academicLogsTable.status, amount: count() }).from(academicLogsTable)
      .where(eq(academicLogsTable.studentId, student.id)).groupBy(academicLogsTable.status),
    clinicalQuery,
  ]);

  const tally = (rows: Array<{ status: string | null; amount: number }>) => rows.reduce((result, row) => {
    const amount = Number(row.amount);
    if (row.status === "verified") result.verified += amount;
    else if (row.status === "pending" || row.status === null) result.pending += amount;
    else if (row.status === "rejected") result.rejected += amount;
    return result;
  }, { verified: 0, pending: 0, rejected: 0 });
  const cases = tally(caseRows), procedures = tally(procedureRows), academics = tally(academicRows), clinicalWork = tally(clinicalRows);
  const clinicalRequired = features.clinicalWorks ? await clinicalWorkTarget(configSourceId) : 0;
  const trackedTarget = (value: number | null | undefined, enabled = true) => enabled && value != null && value > 0 ? value : null;
  const targets = {
    cases: trackedTarget(config?.requiredCases, !features.hideCaseLogs),
    procedures: trackedTarget(config?.requiredProcedures, !features.hideProcedureLogs),
    academics: trackedTarget(config?.requiredAcademic),
    clinicalWork: trackedTarget(clinicalRequired, features.clinicalWorks === true),
  };
  const completion = completionPercent([
    [cases.verified, targets.cases], [procedures.verified, targets.procedures],
    [academics.verified, targets.academics], [clinicalWork.verified, targets.clinicalWork],
  ]);
  return {
    categories: [
      ...(!features.hideCaseLogs ? [{ id: "cases", label: "Cases", ...cases, target: targets.cases }] : []),
      ...(!features.hideProcedureLogs ? [{ id: "procedures", label: "Procedures", ...procedures, target: targets.procedures }] : []),
      { id: "academics", label: "Academic activities", ...academics, target: targets.academics },
      ...(features.clinicalWorks ? [{ id: "clinicalWork", label: "Clinical Work", ...clinicalWork, target: targets.clinicalWork }] : []),
    ],
    completionPercent: completion,
    untrackedCategories: [...(!features.hideCaseLogs ? ["cases"] : []), ...(!features.hideProcedureLogs ? ["procedures"] : []), "academics", ...(features.clinicalWorks ? ["clinicalWork"] : [])]
      .filter((key) => targets[key as keyof typeof targets] === null),
  };
}

export async function checkAppraisalPeriod(actor: ArogyaActor, studentId: number | undefined, quarter: number | undefined, year: number | undefined) {
  if (!Number.isInteger(quarter) || quarter! < 1 || quarter! > 4 || !Number.isInteger(year) || year! < 2000 || year! > 2200) {
    return { needsPeriod: true } as const;
  }
  let student;
  try { student = await assertAuthorizedStudent(actor, studentId); }
  catch (error: any) { throw new ArogyaScopeError(error.message === "AROGYA_SCOPE_404" ? 404 : 403); }
  const [existing] = await db.select({ id: appraisalsTable.id, createdAt: appraisalsTable.createdAt })
    .from(appraisalsTable).where(and(eq(appraisalsTable.studentId, student.id),
      eq(appraisalsTable.quarter, quarter!), eq(appraisalsTable.year, year!))).limit(1);
  return {
    needsPeriod: false as const,
    quarter,
    year,
    exists: Boolean(existing),
    mayCreate: actor.role !== "student" && !existing,
    savedAt: existing?.createdAt?.toISOString() ?? null,
  };
}

const logTables = {
  case: { table: caseLogsTable, deleted: true },
  procedure: { table: procedureLogsTable, deleted: true },
  academic: { table: academicLogsTable, deleted: false },
  "clinical-work": { table: clinicalWorkLogsTable, deleted: true },
  conference: { table: conferencesTable, deleted: false },
} as const;
export type ArogyaLogType = keyof typeof logTables;

export async function getLogState(actor: ArogyaActor, type: ArogyaLogType, id: number) {
  const spec = logTables[type];
  if (!spec || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(actor.departmentId) || actor.departmentId! <= 0) {
    throw new ArogyaScopeError(403);
  }
  const table = spec.table as any;
  const [row] = await db.select({
    id: table.id,
    studentId: table.studentId,
    status: table.status,
    supervisorId: table.supervisorId,
    deletedAt: spec.deleted ? table.deletedAt : table.id,
    ownerUserId: usersTable.id,
    ownerRole: usersTable.role,
    ownerStatus: usersTable.status,
    departmentId: usersTable.departmentId,
  }).from(table)
    .innerJoin(studentsTable, eq(table.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(eq(table.id, id)).limit(1);
  if (!row || row.ownerRole !== "student" || row.ownerStatus !== "approved" || row.deletedAt && spec.deleted) {
    throw new ArogyaScopeError(403);
  }
  if (row.departmentId !== actor.departmentId) throw new ArogyaScopeError(403);
  if (actor.role === "student" && row.ownerUserId !== actor.id) throw new ArogyaScopeError(403);
  if (actor.role === "professor" && row.supervisorId !== actor.id) throw new ArogyaScopeError(403);
  if (actor.role !== "student" && actor.role !== "professor" && actor.role !== "hod") throw new ArogyaScopeError(403);
  const pending = row.status === "pending";
  const queueMember = actor.role === "hod" && pending && (row.supervisorId === actor.id || row.supervisorId === null);
  return {
    type,
    status: row.status ?? "pending",
    assignedToCaller: row.supervisorId === actor.id,
    inHodQueue: actor.role === "hod" ? queueMember : undefined,
    canReview: actor.role === "professor" ? pending && row.supervisorId === actor.id : actor.role === "hod" && pending,
  };
}

async function groupedCount(table: any, departmentId: number, reviewerId?: number, hodQueueUserId?: number) {
  const deletedCondition = "deletedAt" in table ? isNull(table.deletedAt) : undefined;
  const reviewerCondition = reviewerId !== undefined
    ? eq(table.supervisorId, reviewerId)
    : hodQueueUserId !== undefined && table.supervisorId
      ? or(eq(table.supervisorId, hodQueueUserId), isNull(table.supervisorId))
      : undefined;
  const query = db.select({ status: table.status, amount: count() }).from(table)
    .innerJoin(studentsTable, eq(table.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "student"), eq(usersTable.status, "approved"),
      eq(table.status, "pending"), deletedCondition, reviewerCondition))
    .groupBy(table.status);
  const rows = await query;
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

export async function getReviewSummary(actor: ArogyaActor) {
  if (!Number.isSafeInteger(actor.departmentId) || actor.departmentId! <= 0) throw new ArogyaScopeError(403);
  if (actor.role !== "professor" && actor.role !== "hod") throw new ArogyaScopeError(403);
  const configSourceId = await resolveConfigDepartmentId(actor.departmentId!);
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  const features = (config?.enabledFeatures ?? {}) as Record<string, boolean>;
  const emptyCount = Promise.resolve(0);
  const reviewerId = actor.role === "professor" ? actor.id : undefined;
  const hodQueueUserId = actor.role === "hod" ? actor.id : undefined;
  const [cases, procedures, academics, clinicalWork, conferences] = await Promise.all([
    features.hideCaseLogs ? emptyCount : groupedCount(caseLogsTable, actor.departmentId!, reviewerId, hodQueueUserId),
    features.hideProcedureLogs ? emptyCount : groupedCount(procedureLogsTable, actor.departmentId!, reviewerId, hodQueueUserId),
    groupedCount(academicLogsTable, actor.departmentId!, reviewerId, hodQueueUserId),
    features.clinicalWorks ? groupedCount(clinicalWorkLogsTable, actor.departmentId!, reviewerId, hodQueueUserId) : emptyCount,
    features.attendedConferences ? groupedCount(conferencesTable, actor.departmentId!, reviewerId, hodQueueUserId) : emptyCount,
  ]);
  return { pendingByType: { cases, procedures, academics, clinicalWork, conferences }, total: cases + procedures + academics + clinicalWork + conferences };
}

export async function getDepartmentSummary(actor: ArogyaActor) {
  if (actor.role !== "hod" || !Number.isSafeInteger(actor.departmentId) || actor.departmentId! <= 0) throw new ArogyaScopeError(403);
  const review = await getReviewSummary(actor);
  const configSourceId = await resolveConfigDepartmentId(actor.departmentId!);
  const [config] = await db.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
    .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1);
  const features = (config?.enabledFeatures ?? {}) as Record<string, boolean>;
  const [catalog] = await db.select({ amount: count() }).from(departmentCatalogTable)
    .where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "case_category")));
  const enabledWorkflows = [
    ...(!features.hideCaseLogs ? ["Case Logs"] : []),
    ...(!features.hideProcedureLogs ? ["Procedure Logs"] : []),
    "Academic Activities",
    ...(features.clinicalWorks ? ["Clinical Work"] : []),
    ...(features.attendedConferences ? ["Conferences and CME"] : []),
    ...(features.splitThesisAndCertifications ? [features.publicationsOnly ? "Publications" : "Thesis and Publications"] : ["Thesis and Certifications"]),
    ...(features.awards ? ["Awards and Achievements"] : []),
  ];
  const report = await buildDepartmentReportFacts(actor.departmentId!, db);
  const residentNames = Object.fromEntries(report.facts.students.map((student) => [student.placeholder, report.nameMap[student.placeholder]]));
  return {
    approvedResidents: report.facts.department.totalStudents,
    pendingReviews: review.total,
    configuredCaseCategories: Number(catalog?.amount ?? 0),
    enabledWorkflows,
    logTotals: report.facts.department,
    residentProgress: report.facts.students,
    residentNames,
  };
}
