import { eq, or, inArray } from "drizzle-orm";
import { usersTable, studentsTable, caseLogsTable, procedureLogsTable, academicLogsTable, paymentsTable, leaveRecordsTable, leaveApplicationsTable, assessmentsTable, appraisalsTable, assignmentRecipientsTable, attendanceLogsTable, certificationsTable, postingsTable, thesisMilestonesTable, researchTable, auditTable, assignmentsTable, assignmentTypesTable, clinicalWorkLogsTable, conferencesTable, awardsTable } from "@workspace/db";

// Permanently deletes a student or professor and every row tied to them, inside
// the caller's transaction. Shared by the HOD route (DELETE /api/admin/users/:id/hard)
// and the admin route (DELETE /api/superadmin/users/:id/hard).
//
// targetUserId is a usersTable.id. For a student, the studentsTable.id is resolved
// from it here, never taken from the caller (AGENTS.md §4).
// reassignTo is the usersTable.id that takes over assignment types the target created
// (assignment_types.created_by is NOT NULL).
// The caller must already have checked that the target is a student or professor the
// acting user is allowed to delete.
export async function hardDeleteUserCascade(tx: any, targetUserId: number, role: "student" | "professor", reassignTo: number): Promise<Record<string, number>> {
  const deletedCounts: Record<string, number> = {};
  if (role === "student") {
    const [student] = await tx.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, targetUserId)).limit(1);
    if (student) {
      const studentId = student.id;

      const _cases = await tx.delete(caseLogsTable).where(eq(caseLogsTable.studentId, studentId)).returning({ id: caseLogsTable.id });
      deletedCounts.caseLogs = _cases.length;

      const _procs = await tx.delete(procedureLogsTable).where(eq(procedureLogsTable.studentId, studentId)).returning({ id: procedureLogsTable.id });
      deletedCounts.procedureLogs = _procs.length;

      const _clinical = await tx.delete(clinicalWorkLogsTable).where(eq(clinicalWorkLogsTable.studentId, studentId)).returning({ id: clinicalWorkLogsTable.id });
      deletedCounts.clinicalWorkLogs = _clinical.length;

      const _acad = await tx.delete(academicLogsTable).where(eq(academicLogsTable.studentId, studentId)).returning({ id: academicLogsTable.id });
      deletedCounts.academicLogs = _acad.length;

      const _conf = await tx.delete(conferencesTable).where(eq(conferencesTable.studentId, studentId)).returning({ id: conferencesTable.id });
      deletedCounts.conferences = _conf.length;

      const _awards = await tx.delete(awardsTable).where(eq(awardsTable.studentId, studentId)).returning({ id: awardsTable.id });
      deletedCounts.awards = _awards.length;

      const _leave = await tx.delete(leaveRecordsTable).where(eq(leaveRecordsTable.studentId, studentId)).returning({ id: leaveRecordsTable.id });
      deletedCounts.leaveRecords = _leave.length;

      const _leaveApp = await tx.delete(leaveApplicationsTable).where(eq(leaveApplicationsTable.studentId, studentId)).returning({ id: leaveApplicationsTable.id });
      deletedCounts.leaveApplications = _leaveApp.length;

      const _ass = await tx.delete(assessmentsTable).where(eq(assessmentsTable.studentId, studentId)).returning({ id: assessmentsTable.id });
      deletedCounts.assessments = _ass.length;

      const _appr = await tx.delete(appraisalsTable).where(eq(appraisalsTable.studentId, studentId)).returning({ id: appraisalsTable.id });
      deletedCounts.appraisals = _appr.length;

      const _asRec = await tx.delete(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.studentId, studentId)).returning({ id: assignmentRecipientsTable.id });
      deletedCounts.assignmentRecipients = _asRec.length;

      const _att = await tx.delete(attendanceLogsTable).where(eq(attendanceLogsTable.studentId, studentId)).returning({ id: attendanceLogsTable.id });
      deletedCounts.attendanceLogs = _att.length;

      const _cert = await tx.delete(certificationsTable).where(eq(certificationsTable.studentId, studentId)).returning({ id: certificationsTable.id });
      deletedCounts.certifications = _cert.length;

      const _post = await tx.delete(postingsTable).where(eq(postingsTable.studentId, studentId)).returning({ id: postingsTable.id });
      deletedCounts.postings = _post.length;

      const _thes = await tx.delete(thesisMilestonesTable).where(eq(thesisMilestonesTable.studentId, studentId)).returning({ id: thesisMilestonesTable.id });
      deletedCounts.thesisMilestones = _thes.length;

      const _res = await tx.delete(researchTable).where(eq(researchTable.studentId, studentId)).returning({ id: researchTable.id });
      deletedCounts.research = _res.length;

      const _stud = await tx.delete(studentsTable).where(eq(studentsTable.id, studentId)).returning({ id: studentsTable.id });
      deletedCounts.students = _stud.length;
    }
  } else {
    const _cases = await tx.delete(caseLogsTable).where(or(eq(caseLogsTable.supervisorId, targetUserId), eq(caseLogsTable.reviewedBy, targetUserId))).returning({ id: caseLogsTable.id });
    deletedCounts.caseLogs = _cases.length;

    const _procs = await tx.delete(procedureLogsTable).where(or(eq(procedureLogsTable.supervisorId, targetUserId), eq(procedureLogsTable.reviewedBy, targetUserId))).returning({ id: procedureLogsTable.id });
    deletedCounts.procedureLogs = _procs.length;

    const _clinical = await tx.delete(clinicalWorkLogsTable).where(or(eq(clinicalWorkLogsTable.supervisorId, targetUserId), eq(clinicalWorkLogsTable.reviewedBy, targetUserId))).returning({ id: clinicalWorkLogsTable.id });
    deletedCounts.clinicalWorkLogs = _clinical.length;

    const _acad = await tx.delete(academicLogsTable).where(or(eq(academicLogsTable.supervisorId, targetUserId), eq(academicLogsTable.reviewedBy, targetUserId))).returning({ id: academicLogsTable.id });
    deletedCounts.academicLogs = _acad.length;

    const _conf = await tx.delete(conferencesTable).where(or(eq(conferencesTable.supervisorId, targetUserId), eq(conferencesTable.reviewedBy, targetUserId))).returning({ id: conferencesTable.id });
    deletedCounts.conferences = _conf.length;

    // A former HOD demoted to professor can still be the supervisor on awards.
    const _awards = await tx.delete(awardsTable).where(eq(awardsTable.supervisorId, targetUserId)).returning({ id: awardsTable.id });
    deletedCounts.awards = _awards.length;

    const _leave = await tx.delete(leaveRecordsTable).where(eq(leaveRecordsTable.reviewedBy, targetUserId)).returning({ id: leaveRecordsTable.id });
    deletedCounts.leaveRecords = _leave.length;

    const _leaveApp = await tx.delete(leaveApplicationsTable).where(eq(leaveApplicationsTable.approvedBy, targetUserId)).returning({ id: leaveApplicationsTable.id });
    deletedCounts.leaveApplications = _leaveApp.length;

    const _ass = await tx.delete(assessmentsTable).where(eq(assessmentsTable.assessorId, targetUserId)).returning({ id: assessmentsTable.id });
    deletedCounts.assessments = _ass.length;

    const _appr = await tx.delete(appraisalsTable).where(eq(appraisalsTable.evaluatorId, targetUserId)).returning({ id: appraisalsTable.id });
    deletedCounts.appraisals = _appr.length;

    let totalAssignmentRecipients = 0;
    const _asRec = await tx.delete(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.reviewedBy, targetUserId)).returning({ id: assignmentRecipientsTable.id });
    totalAssignmentRecipients += _asRec.length;

    const _att = await tx.delete(attendanceLogsTable).where(eq(attendanceLogsTable.verifiedBy, targetUserId)).returning({ id: attendanceLogsTable.id });
    deletedCounts.attendanceLogs = _att.length;

    const _post = await tx.delete(postingsTable).where(eq(postingsTable.supervisorId, targetUserId)).returning({ id: postingsTable.id });
    deletedCounts.postings = _post.length;

    const _thes = await tx.delete(thesisMilestonesTable).where(or(eq(thesisMilestonesTable.guideId, targetUserId), eq(thesisMilestonesTable.coGuideId, targetUserId))).returning({ id: thesisMilestonesTable.id });
    deletedCounts.thesisMilestones = _thes.length;

    const _res = await tx.delete(researchTable).where(or(eq(researchTable.guideId, targetUserId), eq(researchTable.coGuideId, targetUserId))).returning({ id: researchTable.id });
    deletedCounts.research = _res.length;

    await tx.update(studentsTable).set({ mentorId: null }).where(eq(studentsTable.mentorId, targetUserId));

    const _assignTypes = await tx.update(assignmentTypesTable).set({ createdBy: reassignTo }).where(eq(assignmentTypesTable.createdBy, targetUserId)).returning({ id: assignmentTypesTable.id });
    deletedCounts.assignmentTypesReassigned = _assignTypes.length;

    const assignments = await tx.select({ id: assignmentsTable.id }).from(assignmentsTable).where(eq(assignmentsTable.facultyId, targetUserId));
    const assignmentIds = assignments.map((a: { id: number }) => a.id);
    if (assignmentIds.length > 0) {
      const _asRec2 = await tx.delete(assignmentRecipientsTable).where(inArray(assignmentRecipientsTable.assignmentId, assignmentIds)).returning({ id: assignmentRecipientsTable.id });
      totalAssignmentRecipients += _asRec2.length;
    }
    deletedCounts.assignmentRecipients = totalAssignmentRecipients;

    const _assignments = await tx.delete(assignmentsTable).where(eq(assignmentsTable.facultyId, targetUserId)).returning({ id: assignmentsTable.id });
    deletedCounts.assignments = _assignments.length;
  }

  const _audit = await tx.delete(auditTable).where(eq(auditTable.performedById, targetUserId)).returning({ id: auditTable.id });
  deletedCounts.audit = _audit.length;

  const _payments = await tx.delete(paymentsTable).where(eq(paymentsTable.userId, targetUserId)).returning({ id: paymentsTable.id });
  deletedCounts.payments = _payments.length;

  const _users = await tx.delete(usersTable).where(eq(usersTable.id, targetUserId)).returning({ id: usersTable.id });
  deletedCounts.users = _users.length;

  return deletedCounts;
}
