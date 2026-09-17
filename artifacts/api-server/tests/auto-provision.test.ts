import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, mail } from "./support.js";
import { db, departmentsTable, usersTable, departmentConfigsTable, procedureTypesTable, studentsTable } from "./database.js";
import { provisionDepartment } from "../src/lib/department-provisioning.js";
import { eq, and } from "drizzle-orm";

describe("Auto-provision Mirror Department", () => {
  let server: any;

  before(async () => {
    const initialized = await setup();
    server = initialized.server;
  });

  after(() => {
    if (server) server.close();
  });

  it("provisionDepartment creates a real department and an auto-provisioned test mirror", async () => {
    const input = {
      name: "New Real Dept",
      code: "NEWREAL123",
      description: "Real dept description",
      hod: {
        fullName: "Real HOD",
        email: "real-hod@example.com"
      },
      procedures: [{ name: "Proc A", group: "Group A", required: 10 }]
    };

    const result = await provisionDepartment(input, "SecurePass123!");
    const realDeptId = result.departmentId;

    // 1. Verify real department created
    const [realDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, realDeptId));
    assert.ok(realDept);
    assert.equal(realDept.isTest, false);
    
    // 2. Verify mirror department created
    const [mirrorDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(mirrorDept);
    assert.equal(mirrorDept.isTest, true);
    assert.equal(mirrorDept.name, "New Real Dept (Test)");
    assert.equal(mirrorDept.code, `TEST-${realDeptId}`);

    // 3. Verify exactly 3 test accounts exist for the mirror
    const testAccounts = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDept.id));
    assert.equal(testAccounts.length, 3);
    
    const testHod = testAccounts.find(u => u.role === "hod");
    const testProf = testAccounts.find(u => u.role === "professor");
    const testStudentUser = testAccounts.find(u => u.role === "student");

    assert.ok(testHod);
    assert.ok(testProf);
    assert.ok(testStudentUser);

    assert.equal(testHod.status, "approved");
    assert.equal(testProf.status, "approved");
    assert.equal(testStudentUser.status, "approved");

    assert.equal(testHod.email.endsWith("@elogbook.invalid"), true);
    assert.equal(testProf.email.endsWith("@elogbook.invalid"), true);
    assert.equal(testStudentUser.email.endsWith("@elogbook.invalid"), true);

    assert.equal(mail.has(testHod.email), false);
    assert.equal(mail.has(testProf.email), false);
    assert.equal(mail.has(testStudentUser.email), false);

    // 4. Verify test student profile
    const [testStudent] = await db.select().from(studentsTable).where(eq(studentsTable.userId, testStudentUser.id!));
    assert.ok(testStudent);
    assert.equal(testStudent.specialty, mirrorDept.name);

    // 5. Verify mirror department has no config or procedures of its own
    const mirrorConfigs = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, mirrorDept.id));
    assert.equal(mirrorConfigs.length, 0);

    const mirrorProcedures = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, mirrorDept.id));
    assert.equal(mirrorProcedures.length, 0);
  });

  it("Calling provisionDepartment again with same real code does not duplicate mirror", async () => {
    // We already have NEWREAL123 from previous test.
    const [realDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.code, "NEWREAL123"));
    assert.ok(realDept);

    // Demote HOD so we can re-run
    await db.update(usersTable).set({ status: "pending" }).where(and(eq(usersTable.departmentId, realDept.id), eq(usersTable.role, "hod")));

    const input = {
      name: "New Real Dept",
      code: "NEWREAL123",
      hod: {
        fullName: "Real HOD 2",
        email: "real-hod2@example.com"
      },
    };

    await provisionDepartment(input, "SecurePass123!");

    // Verify still exactly one mirror
    const mirrors = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDept.id));
    assert.equal(mirrors.length, 1);

    // Verify still exactly 3 test accounts
    const testAccounts = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrors[0].id));
    assert.equal(testAccounts.length, 3);
  });
});
