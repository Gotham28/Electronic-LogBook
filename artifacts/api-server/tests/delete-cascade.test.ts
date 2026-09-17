import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, request, password } from "./support.js";
import { db, departmentsTable, usersTable, studentsTable } from "./database.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

describe("Delete cascade for mirror test department", () => {
  let runtime: Awaited<ReturnType<typeof setup>>;
  let adminAccount: { id: number; token: string; role: string; email: string; departmentId: number };

  before(async () => {
    runtime = await setup();
    const hash = await bcrypt.hash(password, 10);
    const [admin] = await db.insert(usersTable).values({
      fullName: "Test Admin", email: "admin-delete@example.test",
      role: "admin", status: "approved", departmentId: null, passwordHash: hash,
    }).returning();
    adminAccount = {
      id: admin.id,
      role: "admin",
      email: admin.email,
      departmentId: 0,
      token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
    };
  });

  after(async () => {
    if (runtime) {
      await new Promise<void>((done) => runtime.server.close(() => done()));
    }
  });

  it("admin can delete a real department and it cascades to the auto-provisioned mirror completely", async () => {
    // 1. Create a real department via API (auto-provisions mirror)
    const createRes = await request(runtime.base, "/superadmin/departments", adminAccount, "POST", {
      setup: { name: "Cascade Test Dept", code: "CASCADETEST1", hod: { fullName: "Cascade HOD", email: "cascade-hod@example.test" } },
      hodPassword: password,
    });
    assert.equal(createRes.status, 201);
    const realDeptId = createRes.body.departmentId;

    // Verify mirror exists
    const mirrors = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.equal(mirrors.length, 1);
    const mirrorDeptId = mirrors[0].id;

    // Verify test accounts exist for mirror
    const testAccountsBefore = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDeptId));
    assert.equal(testAccountsBefore.length, 3);
    const testStudentUser = testAccountsBefore.find((u) => u.role === "student")!;
    const [testStudentProfileBefore] = await db.select().from(studentsTable).where(eq(studentsTable.userId, testStudentUser.id));
    assert.ok(testStudentProfileBefore);

    // 2. Delete the real department
    const deleteRes = await request(runtime.base, `/superadmin/departments/${realDeptId}`, adminAccount, "DELETE");
    assert.equal(deleteRes.status, 200, `Expected 200, got ${deleteRes.status}`);

    // 3. Assert real department is gone
    const [realDeptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, realDeptId));
    assert.equal(realDeptAfter, undefined);

    // 4. Assert mirror department is gone
    const [mirrorDeptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, mirrorDeptId));
    assert.equal(mirrorDeptAfter, undefined);

    // 5. Assert test accounts are gone
    const testAccountsAfter = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDeptId));
    assert.equal(testAccountsAfter.length, 0);

    // 6. Assert test student profile is gone
    const [testStudentProfileAfter] = await db.select().from(studentsTable).where(eq(studentsTable.userId, testStudentUser.id));
    assert.equal(testStudentProfileAfter, undefined);
  });

  it("admin cannot delete a real department when there is a clinical data conflict, and nothing is deleted (including the mirror)", async () => {
    // 1. Create a real department (auto-provisions mirror)
    const createRes = await request(runtime.base, "/superadmin/departments", adminAccount, "POST", {
      setup: { name: "Conflict Test Dept", code: "CONFLICTTEST1", hod: { fullName: "Conflict HOD", email: "conflict-hod@example.test" } },
      hodPassword: password,
    });
    assert.equal(createRes.status, 201);
    const realDeptId = createRes.body.departmentId;

    // Verify mirror exists
    const mirrors = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.equal(mirrors.length, 1);
    const mirrorDeptId = mirrors[0].id;

    // 2. Create a student in the REAL department
    const stuRes = await request(runtime.base, `/superadmin/departments/${realDeptId}/students`, adminAccount, "POST", {
      fullName: "Real FK Student", email: "real-fk-student@example.test", password,
      registrationNumber: "REAL-FK-STU-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "REAL-FK-KUHS-001",
    });
    assert.equal(stuRes.status, 201);
    const studentUserId = stuRes.body.student.id;

    const [studentProfile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, studentUserId));
    assert.ok(studentProfile);

    // 3. Insert a case log referencing the REAL student to cause a conflict
    const { caseLogsTable } = await import("./database.js");
    await db.insert(caseLogsTable).values({
      studentId: studentProfile.id,
      date: "2026-09-10",
      patientAge: "Adult",
      patientGender: "male",
      diagnosisFinal: "Real Dept Conflict Test",
    });

    // 4. Attempt to delete the real department
    const deleteRes = await request(runtime.base, `/superadmin/departments/${realDeptId}`, adminAccount, "DELETE");
    
    // 5. Assert 409 error
    assert.equal(deleteRes.status, 409, `Expected 409 due to clinical data conflict, got ${deleteRes.status}`);

    // 6. Assert real department still exists
    const [realDeptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, realDeptId));
    assert.ok(realDeptAfter, "Real department should still exist after 409 rollback");

    // 7. Assert mirror department still exists
    const [mirrorDeptAfter] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, mirrorDeptId));
    assert.ok(mirrorDeptAfter, "Mirror department should still exist after 409 rollback");
  });
});
