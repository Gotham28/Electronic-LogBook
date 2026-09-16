import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds } from "./support.js";
import { engine, db, usersTable, studentsTable, caseLogsTable, assignmentTypesTable, assignmentsTable, assignmentRecipientsTable } from "./database.js";
import { eq } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("Unauthenticated request gets 401", async () => {
  const res = await call(`/admin/users/${a.student0.id}/hard`, undefined, "DELETE");
  assert.equal(res.status, 401);
});

test("Non-HOD gets 403", async () => {
  const roles = ["student0", "faculty0"] as const;
  for (const role of roles) {
    const res = await call(`/admin/users/${a.student0.id}/hard`, role, "DELETE");
    assert.equal(res.status, 403);
  }
});

test("HOD trying to delete user from another department gets 403", async () => {
  const res = await call(`/admin/users/${a.student1.id}/hard`, "hod0", "DELETE");
  assert.equal(res.status, 403);
});

test("HOD trying to delete nonexistent user gets 403 (fails closed to avoid probing)", async () => {
  const res = await call(`/admin/users/99999/hard`, "hod0", "DELETE");
  assert.equal(res.status, 403);
});

test("HOD can permanently delete a student and cascade their records", async () => {
  // Create a case log for student0
  await db.insert(caseLogsTable).values({
    studentId: a.student0.studentId!,
    date: "2026-09-01",
    patientUhid: "JD",
    patientAge: "30",
    patientGender: "male",
    diagnosisProvisional: "Test",
    diagnosisFinal: "Test",
    status: "pending"
  });

  const res = await call(`/admin/users/${a.student0.id}/hard`, "hod0", "DELETE");
  assert.equal(res.status, 200);
  assert.ok(res.body.message.includes("permanently deleted"));
  assert.ok(res.body.deletedRecords);
  assert.equal(res.body.deletedRecords.caseLogs, 1);
  assert.equal(res.body.deletedRecords.students, 1);
  assert.equal(res.body.deletedRecords.users, 1);

  // Verify DB
  const cases = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, a.student0.studentId!));
  assert.equal(cases.length, 0);

  const students = await db.select().from(studentsTable).where(eq(studentsTable.id, a.student0.studentId!));
  assert.equal(students.length, 0);

  const users = await db.select().from(usersTable).where(eq(usersTable.id, a.student0.id));
  assert.equal(users.length, 0);
});

test("HOD can permanently delete a professor and cascade across student records", async () => {
  // Use faculty2 and student2 in department 2
  // Create case log for student2 where faculty2 is reviewer
  await db.insert(caseLogsTable).values({
    studentId: a.student2.studentId!,
    reviewedBy: a.faculty2.id,
    date: "2026-09-01",
    patientUhid: "JD",
    patientAge: "30",
    patientGender: "male",
    diagnosisProvisional: "Test",
    diagnosisFinal: "Test",
    status: "verified"
  });

  // Create assignment type and assignment for faculty2
  const [at] = await db.insert(assignmentTypesTable).values({
    departmentId: departmentIds[2],
    name: "Test Assignment Type",
    description: "Test description",
    createdBy: a.faculty2.id
  }).returning();

  const [assign] = await db.insert(assignmentsTable).values({
    departmentId: departmentIds[2],
    typeId: at.id,
    facultyId: a.faculty2.id,
    title: "Test Assignment",
    instructions: "Test instructions",
    dueAt: new Date("2026-10-01T00:00:00Z")
  }).returning();

  await db.insert(assignmentRecipientsTable).values({
    assignmentId: assign.id,
    studentId: a.student2.studentId!,
    status: "assigned"
  });

  const res = await call(`/admin/users/${a.faculty2.id}/hard`, "hod2", "DELETE");
  assert.equal(res.status, 200);
  assert.ok(res.body.message.includes("permanently deleted"));
  assert.equal(res.body.deletedRecords.caseLogs, 1);
  assert.equal(res.body.deletedRecords.assignments, 1);
  assert.equal(res.body.deletedRecords.assignmentRecipients, 1);
  assert.equal(res.body.deletedRecords.users, 1);

  // Verify case log of student2 was deleted
  const cases = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, a.student2.studentId!));
  assert.equal(cases.length, 0, "Other student's clinical record should be deleted");

  // Verify assignments deleted, but assignment types preserved and reassigned to HOD
  const types = await db.select().from(assignmentTypesTable).where(eq(assignmentTypesTable.id, at.id));
  assert.equal(types.length, 1, "Assignment types created by professor should be preserved");
  assert.equal(types[0].createdBy, a.hod2.id, "Assignment type should be reassigned to the HOD");

  const assigns = await db.select().from(assignmentsTable).where(eq(assignmentsTable.facultyId, a.faculty2.id));
  assert.equal(assigns.length, 0);

  const recipients = await db.select().from(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.assignmentId, assign.id));
  assert.equal(recipients.length, 0);

  // Verify user deleted
  const users = await db.select().from(usersTable).where(eq(usersTable.id, a.faculty2.id));
  assert.equal(users.length, 0);

  // Verify student2 still exists
  const students = await db.select().from(studentsTable).where(eq(studentsTable.id, a.student2.studentId!));
  assert.equal(students.length, 1, "The student themselves should NOT be deleted");
});
