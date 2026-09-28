import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds } from "./support.js";
import { engine, db, caseLogsTable, procedureLogsTable } from "./database.js";

// Completion counts verified entries only, and never deleted ones. Fixture department 0 has
// requiredCases 7 and requiredProcedures 11 (support.ts).
let runtime: Awaited<ReturnType<typeof setup>>;

before(async () => {
  runtime = await setup();
  const student = a.student0.studentId!;
  const caseRow = (deletedAt: Date | null) => ({ studentId: student, supervisorId: a.faculty0.id, date: "2026-09-01",
    patientAge: "7", patientGender: "male" as const, diagnosisFinal: "Test diagnosis", status: "verified" as const, deletedAt });
  const procRow = (deletedAt: Date | null) => ({ studentId: student, supervisorId: a.faculty0.id, procedureGroup: "Test group 0",
    procedureName: "Test procedure 0", date: "2026-09-01", patientUhid: "TEST-CC", patientAge: "7", competencyLevel: "observed",
    status: "verified" as const, deletedAt });
  await db.insert(caseLogsTable).values([caseRow(null), caseRow(null), caseRow(new Date())]);
  await db.insert(procedureLogsTable).values([procRow(null), procRow(new Date()), procRow(new Date())]);
  // A verified entry of a student in another department must not change department 0's numbers.
  await db.insert(caseLogsTable).values({ ...caseRow(null), studentId: a.student1.studentId!, supervisorId: a.faculty1.id });
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("the HOD roster leaves out deleted entries", async () => {
  const res = await request(runtime.base, "/admin/roster", a.hod0);
  assert.equal(res.status, 200);
  const student = res.body.students.find((s: any) => s.studentProfileId === a.student0.studentId);
  assert.equal(student.verified.cases, 2, "3 verified case entries, 1 deleted");
  assert.equal(student.verified.procedures, 1, "3 verified procedure entries, 2 deleted");
});

test("the review queue leaves out deleted entries", async () => {
  const res = await request(runtime.base, `/professors/${a.faculty0.id}/review-queue`, a.faculty0);
  assert.equal(res.status, 200);
  const mentee = res.body.assignedMentees.find((m: any) => m.id === a.student0.studentId);
  assert.deepEqual({ cases: mentee.logCounts.cases, procs: mentee.logCounts.procs }, { cases: 2, procs: 1 });
});

test("analytics completion leaves out deleted entries", async () => {
  const res = await request(runtime.base, `/departments/${departmentIds[0]}/analytics`, a.hod0);
  assert.equal(res.status, 200);
  // student0: cases 2/7, procedures 1/11, academics 0/3 -> round((2/7 + 1/11 + 0) / 3 * 100) = 13.
  // The department's other approved student has nothing verified -> 0. Average: round(13 / 2) = 7.
  // Counting the deleted entries would give cases 3/7, procedures 3/11 -> 23, average 12.
  assert.equal(res.body.avgCompletion, 7);
});
