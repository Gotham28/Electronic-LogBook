import { eq, and, count, isNull, inArray } from "drizzle-orm";
import { usersTable, studentsTable, caseLogsTable, procedureLogsTable, academicLogsTable } from "@workspace/db";
import { resolveConfigDepartmentId } from "./department-config-source.js";
import { buildProgressFacts } from "./arogya.js";

export type DepartmentReportFacts = {
  fieldGuide: string;
  department: { totalStudents: number; totalVerifiedLogs: number; totalPendingLogs: number; totalRejectedLogs: number };
  students: Array<{
    placeholder: string;
    overallPct: number;
    belowTarget: boolean;
    caseVerified: number;
    caseRequired: number;
    procedureVerified: number;
    procedureRequired: number;
    academicVerified: number;
    academicRequired: number;
  }>;
  professors: Array<{
    placeholder: string;
    pendingReviews: number;
  }>;
};

export async function buildDepartmentReportFacts(
  departmentId: number,
  db: any
): Promise<{ facts: DepartmentReportFacts; nameMap: Record<string, string> }> {
  await resolveConfigDepartmentId(departmentId); // Validates department config

  const nameMap: Record<string, string> = {};

  // 2b. Fetch approved students
  const students = await db.select({
    id: studentsTable.id,
    fullName: usersTable.fullName,
  }).from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "student"), eq(usersTable.status, "approved")))
    .orderBy(studentsTable.id);

  const studentFacts = [];
  let deptVerified = 0, deptPending = 0, deptRejected = 0;

  // 2c & 2d. Compute completions & placeholders
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const placeholder = `Resident ${i + 1}`;
    nameMap[placeholder] = student.fullName;

    let facts;
    try {
      facts = await buildProgressFacts(student.id, departmentId, db);
    } catch (err) {
      // Handle graceful empty state if something throws
      facts = { caseCategories: [], procedures: [], academics: [], departmentTargets: null, procedureRequirements: [], academicRequirements: [] };
    }

    let caseVerified = 0, casePending = 0;
    for (const c of facts.caseCategories) { caseVerified += c.verified; casePending += c.pending; }
    
    let procVerified = 0, procPending = 0;
    for (const p of facts.procedures) { procVerified += p.verified; procPending += p.pending; }
    
    let acadVerified = 0, acadPending = 0;
    for (const a of facts.academics) { acadVerified += a.verified; acadPending += a.pending; }

    // Adding to dept totals
    deptVerified += caseVerified + procVerified + acadVerified;
    deptPending += casePending + procPending + acadPending;

    const reqCases = facts.departmentTargets?.requiredCases || 0;
    const reqProcs = facts.departmentTargets?.requiredProcedures || 0;
    const reqAcad = facts.departmentTargets?.requiredAcademic || 0;

    const casePct = (caseVerified / Math.max(reqCases, 1)) * 100;
    const procPct = (procVerified / Math.max(reqProcs, 1)) * 100;
    const acadPct = (acadVerified / Math.max(reqAcad, 1)) * 100;
    const overallPct = Math.round(((casePct + procPct + acadPct) / 3) * 10) / 10;

    studentFacts.push({
      placeholder,
      overallPct,
      belowTarget: overallPct < 75,
      caseVerified, caseRequired: reqCases,
      procedureVerified: procVerified, procedureRequired: reqProcs,
      academicVerified: acadVerified, academicRequired: reqAcad,
    });
  }

  // 2e. Fetch professor review backlog
  const professors = await db.select({
    userId: usersTable.id,
    fullName: usersTable.fullName,
  }).from(usersTable)
    .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "professor"), eq(usersTable.status, "approved")))
    .orderBy(usersTable.id);

  const professorFacts = [];
  for (let i = 0; i < professors.length; i++) {
    const prof = professors[i];
    const placeholder = `Professor ${i + 1}`;
    nameMap[placeholder] = prof.fullName;

    const [caseRows] = await db.select({ cnt: count() }).from(caseLogsTable).where(and(eq(caseLogsTable.supervisorId, prof.userId), eq(caseLogsTable.status, "pending"), isNull(caseLogsTable.deletedAt)));
    const [procRows] = await db.select({ cnt: count() }).from(procedureLogsTable).where(and(eq(procedureLogsTable.supervisorId, prof.userId), eq(procedureLogsTable.status, "pending"), isNull(procedureLogsTable.deletedAt)));
    const [acadRows] = await db.select({ cnt: count() }).from(academicLogsTable).where(and(eq(academicLogsTable.supervisorId, prof.userId), eq(academicLogsTable.status, "pending")));

    const pendingReviews = Number(caseRows?.cnt || 0) + Number(procRows?.cnt || 0) + Number(acadRows?.cnt || 0);
    professorFacts.push({ placeholder, pendingReviews });
  }

  // 2f. Fetch department-level aggregate stats
  const studentIds = students.map((s: any) => s.id);
  
  let totalRejected = 0;
  if (studentIds.length > 0) {
    const [caseRej] = await db.select({ cnt: count() }).from(caseLogsTable).where(and(inArray(caseLogsTable.studentId, studentIds), eq(caseLogsTable.status, "rejected"), isNull(caseLogsTable.deletedAt)));
    const [procRej] = await db.select({ cnt: count() }).from(procedureLogsTable).where(and(inArray(procedureLogsTable.studentId, studentIds), eq(procedureLogsTable.status, "rejected"), isNull(procedureLogsTable.deletedAt)));
    const [acadRej] = await db.select({ cnt: count() }).from(academicLogsTable).where(and(inArray(academicLogsTable.studentId, studentIds), eq(academicLogsTable.status, "rejected")));
    totalRejected = Number(caseRej?.cnt || 0) + Number(procRej?.cnt || 0) + Number(acadRej?.cnt || 0);
  }

  return {
    facts: {
      fieldGuide: "totalStudents counts resident profiles. totalVerifiedLogs, totalPendingLogs, and totalRejectedLogs count clinical work entries (cases, procedures, academics), NOT residents.",
      department: { totalStudents: students.length, totalVerifiedLogs: deptVerified, totalPendingLogs: deptPending, totalRejectedLogs: totalRejected },
      students: studentFacts,
      professors: professorFacts,
    },
    nameMap
  };
}
