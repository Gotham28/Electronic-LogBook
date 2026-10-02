import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, accounts as a } from "./support.js";
import { engine, db, caseLogsTable, studentsTable, usersTable, departmentConfigsTable } from "./database.js";
import { buildDepartmentReportFacts } from "../src/lib/department-report.js";
import { eq, and } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("buildDepartmentReportFacts returns correct shape, counts and anonymised names", async () => {
  // Use the setup accounts. We know student0 and faculty0 belong to dept 1 usually.
  const deptId = a.student0.departmentId;

  // Let's ensure student0 has a student record
  const [studentRow] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, a.student0.id));
  
  if (!studentRow) {
    await db.insert(studentsTable).values({
      userId: a.student0.id,
      batch: "2026",
      registrationNumber: "REG999",
      paymentStatus: "paid",
    });
  }
  const sId = studentRow ? studentRow.id : (await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, a.student0.id)))[0].id;

  // Update their full names to be distinct so we can test the placeholder logic
  await db.update(usersTable).set({ fullName: "Dr. Real Professor" }).where(eq(usersTable.id, a.faculty0.id));
  await db.update(usersTable).set({ fullName: "Real Resident" }).where(eq(usersTable.id, a.student0.id));

  // Seed two verified case logs
  await db.insert(caseLogsTable).values([
    {
      studentId: sId,
      category: "TestCat",
      date: "2026-01-01",
      supervisorId: a.faculty0.id,
      status: "verified",
      notes: "Log A",
      patientAge: "25",
      patientGender: "female",
      diagnosisFinal: "Test Diagnosis",
    },
    {
      studentId: sId,
      category: "TestCat",
      date: "2026-01-02",
      supervisorId: a.faculty0.id,
      status: "verified",
      notes: "Log B",
      patientAge: "30",
      patientGender: "male",
      diagnosisFinal: "Test Diagnosis",
    }
  ]);

  const { facts, nameMap } = await buildDepartmentReportFacts(deptId, db);

  // a. fieldGuide and counts
  assert.equal(typeof facts.fieldGuide, "string");
  assert.ok(facts.fieldGuide.length > 0);
  assert.ok(facts.fieldGuide.includes("case, procedure and academic log entries"));
  assert.equal(typeof facts.department.totalVerifiedLogs, "number");
  assert.equal(typeof facts.department.totalPendingLogs, "number");
  assert.equal(typeof facts.department.totalRejectedLogs, "number");

  // Count approved resident users in department for exact totalStudents assertion
  const deptApprovedStudents = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(and(eq(usersTable.departmentId, deptId), eq(usersTable.role, "student"), eq(usersTable.status, "approved")));

  // b. old keys NOT present
  const deptAny = facts.department as any;
  assert.equal(deptAny.totalVerified, undefined);
  assert.equal(deptAny.totalPending, undefined);
  assert.equal(deptAny.totalRejected, undefined);

  // c. Check names are stripped
  const packString = JSON.stringify(facts);
  assert.ok(!packString.includes("Dr. Real Professor"));
  assert.ok(!packString.includes("Real Resident"));
  assert.ok(!packString.includes("Test Diagnosis"));
  assert.ok(!packString.includes("Log A"));
  assert.ok(packString.includes("Professor 1"));
  assert.ok(packString.includes("Resident 1"));

  // Check nameMap maps them back correctly
  let foundProf = false;
  let foundRes = false;
  for (const [placeholder, realName] of Object.entries(nameMap)) {
    if (realName === "Dr. Real Professor") foundProf = true;
    if (realName === "Real Resident") foundRes = true;
  }
  assert.ok(foundProf);
  assert.ok(foundRes);

  // d. totalVerifiedLogs equals seeded verified logs count, totalStudents equals dept approved residents count
  assert.equal(facts.department.totalVerifiedLogs, 2);
  assert.equal(facts.department.totalStudents, deptApprovedStudents.length);
});

test("department report leaves residents unclassified when no positive targets are configured", async () => {
  const deptId = a.student0.departmentId;
  await db.update(departmentConfigsTable).set({ requiredCases: null, requiredProcedures: null, requiredAcademic: null })
    .where(eq(departmentConfigsTable.departmentId, deptId));

  const { facts } = await buildDepartmentReportFacts(deptId, db);
  assert.ok(facts.students.length > 0);
  for (const resident of facts.students) {
    assert.equal(resident.overallPct, null);
    assert.equal(resident.belowTarget, null);
    assert.ok(resident.untrackedCategories.includes("cases"));
    assert.ok(resident.untrackedCategories.includes("procedures"));
    assert.ok(resident.untrackedCategories.includes("academics"));
  }
});
