import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, password } from "./support.js";
import {
  engine, db, usersTable, studentsTable, departmentsTable,
  caseLogsTable, procedureLogsTable, academicLogsTable,
  leaveRecordsTable, postingsTable, researchTable,
  assessmentsTable, attendanceLogsTable, leaveApplicationsTable,
  thesisMilestonesTable, appraisalsTable, auditTable,
  departmentCatalogTable, procedureTypesTable,
} from "./database.js";
import { eq, and } from "drizzle-orm";
import { deleteDepartmentCascade } from "../src/routes/superadmin.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string; role: string; email: string; departmentId: number };

before(async () => {
  runtime = await setup();
  const hash = await bcrypt.hash(password, 10);
  const [admin] = await db.insert(usersTable).values({
    fullName: "Test Admin", email: "admin-cascade-cov@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash,
  }).returning();
  adminAccount = {
    id: admin.id, role: "admin", email: admin.email, departmentId: 0,
    token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

const call = (path: string, method?: string, body?: unknown) =>
  request(runtime.base, path, adminAccount as any, method, body);

// =========================================================================
// 1. Mirror with rows in all 12 checked tables deletes cleanly
// =========================================================================
test("mirror department with rows in all 12 checked tables deletes cleanly via its real parent", async () => {
  // 1. Create a real department with case_category catalog and procedure_types
  const createRes = await call("/superadmin/departments", "POST", {
    setup: {
      name: "Full Cascade Dept", code: "FULL-CASC",
      hod: { fullName: "Full Cascade HOD", email: "full-casc-hod@example.test" },
    },
    hodPassword: password,
  });
  assert.equal(createRes.status, 201, `Create dept failed: ${JSON.stringify(createRes.body)}`);
  const realDeptId = createRes.body.departmentId;

  // Add case_category catalog to the source so fixtures derive from it
  await db.insert(departmentCatalogTable).values([
    { departmentId: realDeptId, kind: "case_category", name: "Test Category A", value: "test-cat-a" },
    { departmentId: realDeptId, kind: "case_category", name: "Test Category B", value: "test-cat-b" },
  ]);

  // The auto-provisioned mirror already exists from provisionDepartment().
  // It may have case_logs if the source had procedure_types or case_categories at creation time.
  // Locate the mirror.
  const [mirror] = await db.select().from(departmentsTable)
    .where(and(eq(departmentsTable.configSourceDepartmentId, realDeptId), eq(departmentsTable.isTest, true)));
  assert.ok(mirror, "Auto-provisioned mirror should exist");
  const mirrorDeptId = mirror.id;

  // Collect the mirror's user and student IDs
  const mirrorUsers = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDeptId));
  assert.ok(mirrorUsers.length >= 3, "Mirror should have HOD, prof, student");
  const mirrorStudentUser = mirrorUsers.find(u => u.role === "student")!;
  const mirrorProfUser = mirrorUsers.find(u => u.role === "professor")!;
  assert.ok(mirrorStudentUser && mirrorProfUser);

  const [mirrorStudent] = await db.select().from(studentsTable).where(eq(studentsTable.userId, mirrorStudentUser.id));
  assert.ok(mirrorStudent, "Mirror student profile should exist");

  const today = new Date().toISOString().slice(0, 10);

  // Seed rows in all 12 checked tables for the mirror's student/users.
  // Tables 1-2 (case_logs, procedure_logs) may already have rows from
  // auto-provisioning. Add more to ensure coverage.
  await db.insert(caseLogsTable).values({
    studentId: mirrorStudent.id, supervisorId: mirrorProfUser.id,
    date: today, patientAge: "99", patientGender: "other",
    diagnosisFinal: "[TEST DATA] 12-table cascade test",
  });
  await db.insert(procedureLogsTable).values({
    studentId: mirrorStudent.id, supervisorId: mirrorProfUser.id,
    procedureGroup: "Test Group", procedureName: "Test Proc",
    date: today, patientUhid: "TEST-CASCADE", patientAge: "99",
    competencyLevel: "observed",
  });
  // 3. academic_logs
  await db.insert(academicLogsTable).values({
    studentId: mirrorStudent.id, supervisorId: mirrorProfUser.id,
    activityType: "case_presentation", topic: "[TEST] Cascade test topic", date: today,
  });
  // 4. leave_records
  await db.insert(leaveRecordsTable).values({
    studentId: mirrorStudent.id, leaveType: "casual",
    startDate: today, endDate: today,
  });
  // 5. postings
  await db.insert(postingsTable).values({
    studentId: mirrorStudent.id, supervisorId: mirrorProfUser.id,
    ward: "TEST-WARD", startDate: today, endDate: today,
  });
  // 6. research
  await db.insert(researchTable).values({
    studentId: mirrorStudent.id, thesisTitle: "[TEST] Cascade thesis",
    guideId: mirrorProfUser.id,
  });
  // 7. assessments
  await db.insert(assessmentsTable).values({
    studentId: mirrorStudent.id, examName: "[TEST] Cascade exam",
    type: "quarterly", date: today, assessorId: mirrorProfUser.id,
  });
  // 8. attendance_logs
  await db.insert(attendanceLogsTable).values({
    studentId: mirrorStudent.id, date: today, status: "present",
    verifiedBy: mirrorProfUser.id,
  });
  // 9. leave_applications
  await db.insert(leaveApplicationsTable).values({
    studentId: mirrorStudent.id, fromDate: today, toDate: today,
    totalDays: 1, leaveType: "casual", reason: "[TEST] cascade leave",
  });
  // 10. thesis_milestones
  await db.insert(thesisMilestonesTable).values({
    studentId: mirrorStudent.id, topic: "[TEST] Cascade milestone",
    guideId: mirrorProfUser.id,
  });
  // 11. appraisals
  await db.insert(appraisalsTable).values({
    studentId: mirrorStudent.id, evaluatorId: mirrorProfUser.id,
    quarter: 1, year: 2026, scholasticGrade: "A", patientCareGrade: "A",
    professionalAttributesGrade: "A",
  });
  // 12. audit
  await db.insert(auditTable).values({
    tableName: "test_cascade", recordId: String(mirrorStudent.id),
    action: "CREATE", performedById: mirrorProfUser.id,
  });

  // 2. Delete the real department — should cascade through mirror and all 12 tables
  const deleteRes = await call(`/superadmin/departments/${realDeptId}`, "DELETE");
  assert.equal(deleteRes.status, 200, `Expected 200, got ${deleteRes.status}: ${JSON.stringify(deleteRes.body)}`);

  // 3. Verify mirror is gone
  const [mirrorAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, mirrorDeptId));
  assert.equal(mirrorAfter, undefined, "Mirror department should be gone");

  // 4. Verify real department is gone
  const [realAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, realDeptId));
  assert.equal(realAfter, undefined, "Real department should be gone");

  // 5. Spot-check a few of the 12 tables to confirm rows are gone
  const casesAfter = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, mirrorStudent.id));
  assert.equal(casesAfter.length, 0, "case_logs should be empty for mirror student");
  const academicAfter = await db.select().from(academicLogsTable).where(eq(academicLogsTable.studentId, mirrorStudent.id));
  assert.equal(academicAfter.length, 0, "academic_logs should be empty");
  const postingsAfter = await db.select().from(postingsTable).where(eq(postingsTable.studentId, mirrorStudent.id));
  assert.equal(postingsAfter.length, 0, "postings should be empty");
  const attendanceAfter = await db.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.studentId, mirrorStudent.id));
  assert.equal(attendanceAfter.length, 0, "attendance_logs should be empty");
  const appraisalsAfter = await db.select().from(appraisalsTable).where(eq(appraisalsTable.studentId, mirrorStudent.id));
  assert.equal(appraisalsAfter.length, 0, "appraisals should be empty");
  const auditAfter = await db.select().from(auditTable).where(eq(auditTable.performedById, mirrorProfUser.id));
  assert.equal(auditAfter.length, 0, "audit rows should be empty");
});

// =========================================================================
// 2. Non-mirror department with clinical data still 409s and deletes nothing
// =========================================================================
test("non-mirror department with clinical data returns 409 and deletes nothing", async () => {
  // 1. Create a real department
  const createRes = await call("/superadmin/departments", "POST", {
    setup: {
      name: "Non-Mirror Conflict Dept", code: "NM-CONFLICT",
      hod: { fullName: "NM HOD", email: "nm-conflict-hod@example.test" },
    },
    hodPassword: password,
  });
  assert.equal(createRes.status, 201);
  const deptId = createRes.body.departmentId;

  // 2. Create a student in the real department
  const stuRes = await call(`/superadmin/departments/${deptId}/students`, "POST", {
    fullName: "NM Conflict Student", email: "nm-conflict-stu@example.test", password,
    registrationNumber: "NM-STU-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "NM-KUHS-001",
  });
  assert.equal(stuRes.status, 201);
  const studentUserId = stuRes.body.student.id;

  const [studentProfile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, studentUserId));
  assert.ok(studentProfile);

  // 3. Seed a case_log for the real student
  await db.insert(caseLogsTable).values({
    studentId: studentProfile.id,
    date: "2026-09-15", patientAge: "Adult", patientGender: "male",
    diagnosisFinal: "[TEST DATA] NM conflict test",
  });

  // 4. Attempt delete — should 409
  const deleteRes = await call(`/superadmin/departments/${deptId}`, "DELETE");
  assert.equal(deleteRes.status, 409, `Expected 409, got ${deleteRes.status}`);
  assert.ok(deleteRes.body.message);

  // 5. Verify nothing was deleted
  const [deptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, deptId));
  assert.ok(deptAfter, "Real department should still exist");

  const [stuAfter] = await db.select().from(usersTable).where(eq(usersTable.id, studentUserId));
  assert.ok(stuAfter, "Student user should still exist");

  const casesAfter = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, studentProfile.id));
  assert.ok(casesAfter.length > 0, "Case log should still exist");

  // Mirror should also still exist (transaction rolled back)
  const mirrorAfter = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.configSourceDepartmentId, deptId));
  assert.ok(mirrorAfter.length > 0, "Mirror department should still exist after 409 rollback");
});

// =========================================================================
// 3. Fixture rows use catalog-derived taxonomy and land only in a mirror
// =========================================================================
test("fixture rows are created, land only in a mirror, and carry catalog-derived taxonomy", async () => {
  // 1. Create a real department with specific case_category catalog + procedure_types
  const createRes = await call("/superadmin/departments", "POST", {
    setup: {
      name: "Fixture Taxonomy Dept", code: "FIX-TAXO",
      hod: { fullName: "Fixture HOD", email: "fix-taxo-hod@example.test" },
    },
    hodPassword: password,
  });
  assert.equal(createRes.status, 201);
  const realDeptId = createRes.body.departmentId;

  // Add catalog entries to the source BEFORE the mirror is provisioned.
  // But the mirror was already auto-provisioned by provisionDepartment() above.
  // The test fixture data depends on what existed at provision time.
  // To test catalog-derived fixtures, we need to:
  //   a) Add case_category + procedure_types to source
  //   b) Delete the auto-provisioned mirror
  //   c) Re-provision

  // Add source catalog
  await db.insert(departmentCatalogTable).values([
    { departmentId: realDeptId, kind: "case_category", name: "Catalog Cat Alpha", value: "cat-alpha" },
  ]);
  await db.insert(procedureTypesTable).values([
    { departmentId: realDeptId, name: "Catalog Proc Beta", group: "Catalog Group Beta", required: 1 },
  ]);

  // Delete auto-provisioned mirror via API
  const [autoMirror] = await db.select().from(departmentsTable)
    .where(and(eq(departmentsTable.configSourceDepartmentId, realDeptId), eq(departmentsTable.isTest, true)));
  if (autoMirror) {
    // Delete directly through the real parent delete won't work — we'd lose the real dept.
    // Instead, manually delete the mirror's test data and department.
    const mirrorUsers = await db.select().from(usersTable).where(eq(usersTable.departmentId, autoMirror.id));
    const mirrorStudentUser = mirrorUsers.find(u => u.role === "student");
    if (mirrorStudentUser) {
      const [mirrorStu] = await db.select().from(studentsTable).where(eq(studentsTable.userId, mirrorStudentUser.id));
      if (mirrorStu) {
        // Clean any auto-provisioned logs
        await db.delete(caseLogsTable).where(eq(caseLogsTable.studentId, mirrorStu.id));
        await db.delete(procedureLogsTable).where(eq(procedureLogsTable.studentId, mirrorStu.id));
        await db.delete(studentsTable).where(eq(studentsTable.id, mirrorStu.id));
      }
    }
    for (const u of mirrorUsers) {
      await db.delete(usersTable).where(eq(usersTable.id, u.id));
    }
    await db.delete(departmentsTable).where(eq(departmentsTable.id, autoMirror.id));
  }

  // Re-provision the mirror so it picks up the catalog
  const backfillRes = await call("/superadmin/departments/backfill-test-departments", "POST", {});
  assert.equal(backfillRes.status, 200);

  // Find the newly provisioned mirror
  const [newMirror] = await db.select().from(departmentsTable)
    .where(and(eq(departmentsTable.configSourceDepartmentId, realDeptId), eq(departmentsTable.isTest, true)));
  assert.ok(newMirror, "Re-provisioned mirror should exist");

  // Find its student
  const mirrorUsers = await db.select().from(usersTable).where(eq(usersTable.departmentId, newMirror.id));
  const mirrorStudentUser = mirrorUsers.find(u => u.role === "student");
  assert.ok(mirrorStudentUser, "Mirror should have a test student");
  const [mirrorStudent] = await db.select().from(studentsTable).where(eq(studentsTable.userId, mirrorStudentUser!.id));
  assert.ok(mirrorStudent, "Mirror student profile should exist");

  // 2. Check that case_logs carry catalog-derived category
  const caseLogs = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, mirrorStudent.id));
  assert.ok(caseLogs.length > 0, "Mirror should have case_logs from fixture provisioning");
  for (const cl of caseLogs) {
    assert.equal(cl.category, "cat-alpha", "Case log category should come from source catalog");
    assert.ok(cl.diagnosisFinal!.includes("[TEST DATA]"), "Diagnosis should self-identify as test data");
    assert.ok(cl.patientUhid!.startsWith("TEST-"), "Patient UHID should have TEST- prefix");
  }

  // 3. Check that procedure_logs carry catalog-derived procedure group/name
  const procLogs = await db.select().from(procedureLogsTable).where(eq(procedureLogsTable.studentId, mirrorStudent.id));
  assert.ok(procLogs.length > 0, "Mirror should have procedure_logs from fixture provisioning");
  for (const pl of procLogs) {
    assert.equal(pl.procedureGroup, "Catalog Group Beta", "Procedure group should come from source procedure_types");
    assert.equal(pl.procedureName, "Catalog Proc Beta", "Procedure name should come from source procedure_types");
    assert.ok(pl.patientUhid.startsWith("TEST-"), "Patient UHID should have TEST- prefix");
  }

  // 4. Verify no fixture rows landed in the real department's students
  const realUsers = await db.select().from(usersTable)
    .where(and(eq(usersTable.departmentId, realDeptId), eq(usersTable.role, "student")));
  for (const ru of realUsers) {
    const [realStu] = await db.select().from(studentsTable).where(eq(studentsTable.userId, ru.id));
    if (realStu) {
      const realCases = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, realStu.id));
      const testCases = realCases.filter(c => c.diagnosisFinal?.includes("[TEST DATA]"));
      assert.equal(testCases.length, 0, "No test fixture rows should exist in the real department");
    }
  }
});

// =========================================================================
// 4. configSourceDepartmentId set but isTest=false is refused
// =========================================================================
test("department with configSourceDepartmentId set but isTest=false is refused rather than hard-deleted", async () => {
  // 1. Create a real department (used as the configSourceDepartmentId target)
  const createRes = await call("/superadmin/departments", "POST", {
    setup: {
      name: "IsTest Guard Dept", code: "ISTEST-GRD",
      hod: { fullName: "Guard HOD", email: "istest-guard-hod@example.test" },
    },
    hodPassword: password,
  });
  assert.equal(createRes.status, 201);
  const realDeptId = createRes.body.departmentId;

  // ---- Part A: the database CHECK constraint itself refuses the combination ----
  // Attempting to insert a department with configSourceDepartmentId set but
  // isTest=false must be rejected by the mirror_test_dept_source_requires_test
  // CHECK constraint — this is the schema-level defence.
  await assert.rejects(
    () => db.insert(departmentsTable).values({
      name: "Rogue Non-Test Mirror", code: "ROGUE-NTM",
      isTest: false,
      configSourceDepartmentId: realDeptId,
    }).returning(),
    (err: any) => {
      const combined = err.message + " " + (err.cause?.message ?? "");
      assert.ok(
        combined.includes("mirror_test_dept_source_requires_test"),
        `Expected CHECK constraint violation, got: ${err.message} (cause: ${err.cause?.message ?? "none"})`,
      );
      return true;
    },
    "Inserting a department with configSourceDepartmentId + isTest=false must violate the CHECK constraint",
  );

  // ---- Part B: the production deleteDepartmentCascade guard refuses isMirror ----
  // Create an ordinary real department (isTest=false, no configSourceDepartmentId)
  // and call the actual exported deleteDepartmentCascade with isMirror=true.
  // This simulates "what if a real department were mistakenly routed through the
  // mirror-delete path" — the guard must throw 403.
  const guardDeptRes = await call("/superadmin/departments", "POST", {
    setup: {
      name: "Guard Target Dept", code: "GRD-TARGET",
      hod: { fullName: "Guard Target HOD", email: "guard-target-hod@example.test" },
    },
    hodPassword: password,
  });
  assert.equal(guardDeptRes.status, 201);
  const guardDeptId = guardDeptRes.body.departmentId;

  // Confirm this department is a real, non-test department
  const [guardDept] = await db.select({ isTest: departmentsTable.isTest })
    .from(departmentsTable).where(eq(departmentsTable.id, guardDeptId)).limit(1);
  assert.equal(guardDept.isTest, false, "Guard target department should be isTest=false");

  await assert.rejects(
    () => db.transaction(async (tx: any) => {
      await deleteDepartmentCascade(tx, guardDeptId, true);
    }),
    (err: any) => {
      assert.equal(err.statusOverride, 403,
        `Expected statusOverride=403, got ${err.statusOverride}`);
      assert.ok(err.message.includes("non-test"),
        `Expected error message to mention "non-test", got: ${err.message}`);
      return true;
    },
    "deleteDepartmentCascade must throw 403 when isMirror=true targets a non-test department",
  );

  // Verify the department still exists (transaction rolled back)
  const [guardDeptAfter] = await db.select().from(departmentsTable)
    .where(eq(departmentsTable.id, guardDeptId));
  assert.ok(guardDeptAfter, "Guard target department should still exist after rejected mirror-delete");
});
