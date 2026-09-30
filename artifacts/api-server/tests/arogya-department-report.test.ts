import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, accounts as a } from "./support.js";
import { engine, db, caseLogsTable, studentsTable, usersTable } from "./database.js";
import { buildDepartmentReportFacts } from "../src/lib/department-report.js";
import { eq } from "drizzle-orm";

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
    },
    {
      studentId: sId,
      category: "TestCat",
      date: "2026-01-02",
      supervisorId: a.faculty0.id,
      status: "verified",
      notes: "Log B",
    }
  ]);

  const { facts, nameMap } = await buildDepartmentReportFacts(deptId, db);

  // a. fieldGuide and counts
  assert.equal(typeof facts.fieldGuide, "string");
  assert.ok(facts.fieldGuide.length > 0);
  assert.equal(typeof facts.department.totalVerifiedLogs, "number");
  assert.equal(typeof facts.department.totalPendingLogs, "number");
  assert.equal(typeof facts.department.totalRejectedLogs, "number");

  // b. old keys NOT present
  const deptAny = facts.department as any;
  assert.equal(deptAny.totalVerified, undefined);
  assert.equal(deptAny.totalPending, undefined);
  assert.equal(deptAny.totalRejected, undefined);

  // c. Check names are stripped
  const packString = JSON.stringify(facts);
  assert.ok(!packString.includes("Dr. Real Professor"));
  assert.ok(!packString.includes("Real Resident"));
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

  // d. totalVerifiedLogs equals log count, totalStudents equals resident count
  assert.ok(facts.department.totalVerifiedLogs >= 2);
  assert.ok(facts.department.totalStudents >= 1);
  assert.notEqual(facts.department.totalVerifiedLogs, facts.department.totalStudents);
});
