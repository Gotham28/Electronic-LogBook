import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { setup, mail, simulateFailure, sentEmails } from "./support.js";
import { db, collegesTable, departmentsTable, usersTable, departmentConfigsTable, procedureTypesTable, studentsTable, getTestCollegeId } from "./database.js";
import { buildCanonicalMirrorEmails, buildMirrorSafeName, provisionDepartment, resetMirrorTestCredentials, restoreMirrorTestFaculty } from "../src/lib/department-provisioning.js";
import { eq, and, inArray, DrizzleQueryError } from "drizzle-orm";

const generatedTestPassword = () => randomBytes(18).toString("base64url");

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
      collegeId: await getTestCollegeId(),
      name: "New Real Dept",
      code: "NEWREAL123",
      description: "Real dept description",
      hod: {
        fullName: "Real HOD",
        email: "real-hod@example.com"
      },
      procedures: [{ name: "Proc A", group: "Group A", required: 10 }]
    };

    const emailStart = sentEmails.length;
    const result = await provisionDepartment(input, "SecurePass123!");
    const realDeptId = result.departmentId;
    assert.equal(result.emailAccepted, true);
    const welcome = sentEmails.slice(emailStart).find((email) => email.to === input.hod.email);
    assert.equal(welcome?.subject, "Your E-LogBook Account Has Been Created");
    assert.match(welcome?.text ?? "", /Role:\s+HOD, New Real Dept/);

    // 0. Totals are summed from the targets given, not left empty
    const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, realDeptId));
    assert.equal(config.requiredProcedures, 10);

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

    assert.equal(testHod.email.endsWith(".test"), true);
    assert.equal(testProf.email.endsWith(".test"), true);
    assert.equal(testStudentUser.email.endsWith(".test"), true);

    assert.equal(mail.has(testHod.email), false);
    assert.equal(mail.has(testProf.email), false);
    assert.equal(mail.has(testStudentUser.email), false);

    const collegeId = await getTestCollegeId();
    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
    const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDeptId, college.code, mirrorDept.code));
    assert.equal(testHod.email, canonical.hod);
    assert.equal(testProf.email, canonical.professor);
    assert.equal(testStudentUser.email, canonical.student);

    // 4. Verify test student profile
    const [testStudent] = await db.select().from(studentsTable).where(eq(studentsTable.userId, testStudentUser.id!));
    assert.ok(testStudent);
    assert.equal(testStudent.specialty, mirrorDept.name);

    // 5. Verify mirror department has no config or procedures of its own
    const mirrorConfigs = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, mirrorDept.id));
    assert.equal(mirrorConfigs.length, 0);

    const mirrorProcedures = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, mirrorDept.id));
    assert.equal(mirrorProcedures.length, 0);

    // 6. Calling restoreMirrorTestFaculty when professor already exists returns already_present without duplicating
    const restoreCheck = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(restoreCheck.status, "already_present");
    assert.equal(restoreCheck.mirrorDepartmentId, mirrorDept.id);
    assert.equal(restoreCheck.professor.id, testProf.id);
    assert.equal((await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDept.id))).length, 3);
  });

  it("Calling provisionDepartment again with same real code does not duplicate mirror", async () => {
    // We already have NEWREAL123 from previous test.
    const [realDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.code, "NEWREAL123"));
    assert.ok(realDept);

    // Demote HOD so we can re-run
    await db.update(usersTable).set({ status: "pending" }).where(and(eq(usersTable.departmentId, realDept.id), eq(usersTable.role, "hod")));

    const input = {
      collegeId: await getTestCollegeId(),
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

  it("a failed HOD welcome email is logged without the HOD's email address", async () => {
    simulateFailure.enabled = true;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
    try {
      const result = await provisionDepartment({ collegeId: await getTestCollegeId(), name: "Mail Fail Dept", code: "MAILFAIL1",
        hod: { fullName: "Mail Fail HOD", email: "mail-fail-hod@example.com" } }, "SecurePass123!");
      assert.equal(result.emailAccepted, false);
      const line = warnings.find((w) => w.includes("welcome email"));
      assert.ok(line, "the failure is still logged");
      assert.ok(!line!.includes("mail-fail-hod@example.com"), "the email address is not in the log");
      assert.ok(line!.includes(String(result.departmentId)), "the department id is");
    } finally {
      simulateFailure.enabled = false;
      console.warn = originalWarn;
    }
  });

  it("restoreMirrorTestFaculty creates an approved default professor when missing and handles retries safely", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Restore Target Dept",
      code: "RESTORE1",
      hod: { fullName: "Restore Real HOD", email: "restore-real-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(mirrorDept);
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));

    const beforeAccounts = await db.select().from(usersTable).where(eq(usersTable.departmentId, mirrorDept.id));
    assert.equal(beforeAccounts.length, 2);

    const created = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(created.status, "created");
    assert.equal(created.mirrorDepartmentId, mirrorDept.id);
    assert.equal(created.professor.fullName, "Test Professor");
    assert.equal(created.professor.status, "approved");

    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
    const expectedEmail = buildCanonicalMirrorEmails(buildMirrorSafeName(realDeptId, college.code, mirrorDept.code)).professor;
    assert.equal(created.professor.email, expectedEmail);

    const [restoredRow] = await db.select().from(usersTable).where(eq(usersTable.id, created.professor.id));
    assert.ok(restoredRow?.passwordHash);
    assert.equal(await bcrypt.compare(mirrorDept.code, restoredRow.passwordHash!), true);

    const retry = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(retry.status, "already_present");
    assert.equal(retry.professor.id, created.professor.id);

    const professors = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
    assert.equal(professors.length, 1);
  });

  it("restoreMirrorTestFaculty handles concurrent calls safely via unique email and scope-checked re-read", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Concurrent Restore Dept",
      code: "CONCUR1",
      hod: { fullName: "Concur Real HOD", email: "concur-real-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));

    const results = await Promise.all([
      restoreMirrorTestFaculty(realDeptId, collegeId),
      restoreMirrorTestFaculty(realDeptId, collegeId),
    ]);

    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, ["already_present", "created"]);
    const professors = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
    assert.equal(professors.length, 1);
  });

  it("restoreMirrorTestFaculty preserves existing custom and deactivated faculty", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Preserve Faculty Dept",
      code: "PRESERVE1",
      hod: { fullName: "Preserve Real HOD", email: "preserve-real-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));

    const hash = await bcrypt.hash(generatedTestPassword(), 10);
    const [customProf] = await db.insert(usersTable).values({
      fullName: "Custom Mirror Professor",
      email: "custom-mirror-prof@example.test",
      passwordHash: hash,
      role: "professor",
      status: "approved",
      departmentId: mirrorDept.id,
    }).returning();

    const activeResult = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(activeResult.status, "already_present");
    assert.equal(activeResult.professor.id, customProf.id);
    assert.equal(activeResult.professor.email, "custom-mirror-prof@example.test");

    await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, customProf.id));

    const deactivatedResult = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(deactivatedResult.status, "already_present");
    assert.equal(deactivatedResult.professor.id, customProf.id);
    assert.equal(deactivatedResult.professor.status, "rejected");

    const professors = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
    assert.equal(professors.length, 1);
    assert.equal(professors[0].status, "rejected");
  });

  it("restoreMirrorTestFaculty rejects cross-college calls, missing mirrors, and external email collisions", async () => {
    const collegeId = await getTestCollegeId();
    const [otherCollege] = await db.insert(collegesTable).values({
      name: "Other Test College",
      code: "other-test-college",
      acceptingRegistrations: false,
    }).returning();

    const [noMirrorDept] = await db.insert(departmentsTable).values({
      name: "No Mirror Dept",
      code: "NOMIRROR1",
      collegeId,
      isTest: false,
    }).returning();

    const { departmentId: collideDeptId } = await provisionDepartment({
      collegeId,
      name: "Collide Dept",
      code: "COLLIDE1",
      hod: { fullName: "Collide Real HOD", email: "collide-real-hod@example.com" },
    }, generatedTestPassword());

    const [collideMirror] = await db.select().from(departmentsTable).where(eq(departmentsTable.configSourceDepartmentId, collideDeptId));
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, collideMirror.id), eq(usersTable.role, "professor")));

    assert.equal((await restoreMirrorTestFaculty(collideDeptId, otherCollege.id)).status, "missing_department");
    assert.equal((await restoreMirrorTestFaculty(noMirrorDept.id, collegeId)).status, "missing_mirror");

    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
    const collidingEmail = buildCanonicalMirrorEmails(buildMirrorSafeName(collideDeptId, college.code, collideMirror.code)).professor;
    const hash = await bcrypt.hash(generatedTestPassword(), 10);
    await db.insert(usersTable).values({
      fullName: "External Conflicting User",
      email: collidingEmail,
      passwordHash: hash,
      role: "professor",
      status: "approved",
      departmentId: noMirrorDept.id,
    });

    const collision = await restoreMirrorTestFaculty(collideDeptId, collegeId);
    assert.equal(collision.status, "collision");
    assert.equal(collision.mirrorDepartmentId, collideMirror.id);
    const mirrorProfs = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, collideMirror.id), eq(usersTable.role, "professor")));
    assert.equal(mirrorProfs.length, 0);
  });

  it("restoreMirrorTestFaculty fails closed on ambiguous duplicate mirrors without creating faculty", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Ambiguous Mirror Dept",
      code: "AMBIG1",
      hod: { fullName: "Ambig Real HOD", email: "ambig-real-hod@example.com" },
    }, generatedTestPassword());

    const [firstMirror] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(firstMirror);
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, firstMirror.id), eq(usersTable.role, "professor")));

    const [secondMirror] = await db.insert(departmentsTable).values({
      name: "Ambiguous Mirror Dept (Test 2)",
      code: `TEST-DUP-${realDeptId}`,
      collegeId,
      isTest: true,
      configSourceDepartmentId: realDeptId,
    }).returning();

    const res = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(res.status, "ambiguous_mirror");

    const profsFirst = await db.select().from(usersTable)
      .where(and(eq(usersTable.departmentId, firstMirror.id), eq(usersTable.role, "professor")));
    const profsSecond = await db.select().from(usersTable)
      .where(and(eq(usersTable.departmentId, secondMirror.id), eq(usersTable.role, "professor")));
    assert.equal(profsFirst.length, 0);
    assert.equal(profsSecond.length, 0);
  });

  it("restoreMirrorTestFaculty observes a custom professor inserted before the locking transaction re-read", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Race Custom Prof Dept",
      code: "RACECUST1",
      hod: { fullName: "Race Custom HOD", email: "race-custom-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(mirrorDept);
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));

    const customHash = await bcrypt.hash(generatedTestPassword(), 10);
    let insertedCustomId = 0;

    // Deterministically models an ordinary faculty insert committing after the pre-check
    // and password hash, before restoreMirrorTestFaculty enters its locking transaction
    // and re-reads the mirror roster. (Does not claim to prove multi-connection PG locks
    // on PGlite's single-connection scheduler.)
    const result = await restoreMirrorTestFaculty(realDeptId, collegeId, {
      onBeforeLockTransaction: async () => {
        const [custom] = await db.insert(usersTable).values({
          fullName: "Concurrent Custom Professor",
          email: "concurrent-custom-prof@example.test",
          passwordHash: customHash,
          role: "professor",
          status: "approved",
          departmentId: mirrorDept.id,
        }).returning({ id: usersTable.id });
        insertedCustomId = custom.id;
      },
    });

    assert.equal(result.status, "already_present");
    assert.equal(result.mirrorDepartmentId, mirrorDept.id);
    assert.equal(result.professor.id, insertedCustomId);
    assert.equal(result.professor.email, "concurrent-custom-prof@example.test");

    const professors = await db.select().from(usersTable)
      .where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
    assert.equal(professors.length, 1);
    assert.equal(professors[0].email, "concurrent-custom-prof@example.test");
  });

  async function removeMirrorDepartment(mirrorId: number) {
    const mirrorUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.departmentId, mirrorId));
    const userIds = mirrorUsers.map((u) => u.id);
    if (userIds.length) {
      await db.delete(studentsTable).where(inArray(studentsTable.userId, userIds));
      await db.delete(usersTable).where(eq(usersTable.departmentId, mirrorId));
    }
    await db.delete(departmentsTable).where(eq(departmentsTable.id, mirrorId));
  }

  it("restoreMirrorTestFaculty rejects stale displayed mirror IDs without mutating a replacement mirror", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Stale Display Restore Dept",
      code: "STALEDISP1",
      hod: { fullName: "Stale Display HOD", email: "stale-disp-hod@example.com" },
    }, generatedTestPassword());

    const [originalMirror] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(originalMirror);

    await removeMirrorDepartment(originalMirror.id);
    const missingDisplayed = await restoreMirrorTestFaculty(realDeptId, collegeId, {
      expectedMirrorDepartmentId: originalMirror.id,
    });
    assert.equal(missingDisplayed.status, "stale_mirror");

    const [replacementMirror] = await db.insert(departmentsTable).values({
      name: "Stale Display Restore Dept (Replacement)",
      code: `TEST-REPL-${realDeptId}`,
      collegeId,
      isTest: true,
      configSourceDepartmentId: realDeptId,
    }).returning();

    const staleEmpty = await restoreMirrorTestFaculty(realDeptId, collegeId, {
      expectedMirrorDepartmentId: originalMirror.id,
    });
    assert.equal(staleEmpty.status, "stale_mirror");
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, replacementMirror.id), eq(usersTable.role, "professor")))).length, 0);

    const profHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
    await db.insert(usersTable).values({
      fullName: "Replacement Prof",
      email: `repl-prof-${realDeptId}@example.test`,
      passwordHash: profHash,
      role: "professor",
      status: "approved",
      departmentId: replacementMirror.id,
    });

    const staleWithExistingProf = await restoreMirrorTestFaculty(realDeptId, collegeId, {
      expectedMirrorDepartmentId: originalMirror.id,
    });
    assert.equal(staleWithExistingProf.status, "stale_mirror");
  });

  it("restoreMirrorTestFaculty rejects replacement or ambiguity occurring between pre-check and locked re-read", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: replDeptId } = await provisionDepartment({
      collegeId,
      name: "Midflight Replace Dept",
      code: "MIDREPL1",
      hod: { fullName: "Midflight Replace HOD", email: "midflight-repl-hod@example.com" },
    }, generatedTestPassword());

    const [replOriginal] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, replDeptId));
    assert.ok(replOriginal);
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, replOriginal.id), eq(usersTable.role, "professor")));

    let replacementMirrorId = 0;
    const replacedResult = await restoreMirrorTestFaculty(replDeptId, collegeId, {
      expectedMirrorDepartmentId: replOriginal.id,
      onBeforeLockTransaction: async () => {
        await removeMirrorDepartment(replOriginal.id);
        const [replacement] = await db.insert(departmentsTable).values({
          name: "Midflight Replace Dept (Replacement)",
          code: `TEST-MIDREPL-${replDeptId}`,
          collegeId,
          isTest: true,
          configSourceDepartmentId: replDeptId,
        }).returning();
        replacementMirrorId = replacement.id;
      },
    });
    assert.equal(replacedResult.status, "stale_mirror");
    assert.ok(replacementMirrorId > 0);
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, replacementMirrorId), eq(usersTable.role, "professor")))).length, 0);

    const { departmentId: ambigDeptId } = await provisionDepartment({
      collegeId,
      name: "Midflight Ambig Dept",
      code: "MIDAMBIG1",
      hod: { fullName: "Midflight Ambig HOD", email: "midflight-ambig-hod@example.com" },
    }, generatedTestPassword());

    const [ambigOriginal] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, ambigDeptId));
    assert.ok(ambigOriginal);
    await db.delete(usersTable).where(and(eq(usersTable.departmentId, ambigOriginal.id), eq(usersTable.role, "professor")));

    let secondMirrorId = 0;
    const ambigResult = await restoreMirrorTestFaculty(ambigDeptId, collegeId, {
      onBeforeLockTransaction: async () => {
        const [second] = await db.insert(departmentsTable).values({
          name: "Midflight Ambig Dept (Test 2)",
          code: `TEST-MIDAMBIG-${ambigDeptId}`,
          collegeId,
          isTest: true,
          configSourceDepartmentId: ambigDeptId,
        }).returning();
        secondMirrorId = second.id;
      },
    });
    assert.equal(ambigResult.status, "ambiguous_mirror");
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, ambigOriginal.id), eq(usersTable.role, "professor")))).length, 0);
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, secondMirrorId), eq(usersTable.role, "professor")))).length, 0);
  });

  it("resetMirrorTestCredentials rejects stale IDs and midflight replacement or ambiguity without modifying accounts", async () => {
    const collegeId = await getTestCollegeId();
    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));

    const { departmentId: replDeptId } = await provisionDepartment({
      collegeId,
      name: "Reset Midflight Replace Dept",
      code: "RSTMIDREPL1",
      hod: { fullName: "Reset Midflight HOD", email: "rst-midflight-hod@example.com" },
    }, generatedTestPassword());
    const [origMirror] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, replDeptId));
    assert.ok(origMirror);

    const replSentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
    let replacementMirrorId = 0;
    let replacementHodId = 0;

    const midflightReplaced = await resetMirrorTestCredentials(replDeptId, collegeId, {
      expectedMirrorDepartmentId: origMirror.id,
      onBeforeLockTransaction: async () => {
        await removeMirrorDepartment(origMirror.id);
        const replacementCode = `TEST-RSTMID-${replDeptId}`;
        const [replacement] = await db.insert(departmentsTable).values({
          name: "Reset Midflight Replace Dept (Replacement)",
          code: replacementCode,
          collegeId,
          isTest: true,
          configSourceDepartmentId: replDeptId,
        }).returning();
        replacementMirrorId = replacement.id;
        const replEmails = buildCanonicalMirrorEmails(buildMirrorSafeName(replDeptId, college.code, replacementCode));
        const [hod] = await db.insert(usersTable).values({
          fullName: "Test HOD",
          email: replEmails.hod,
          passwordHash: replSentinelHash,
          role: "hod",
          status: "approved",
          departmentId: replacement.id,
        }).returning({ id: usersTable.id });
        replacementHodId = hod.id;
      },
    });
    assert.equal(midflightReplaced.status, "stale_mirror");
    assert.ok(replacementMirrorId > 0);
    const [afterMidflightReplace] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, replacementHodId));
    assert.equal(afterMidflightReplace.passwordHash, replSentinelHash);

    const staleCall = await resetMirrorTestCredentials(replDeptId, collegeId, {
      expectedMirrorDepartmentId: origMirror.id,
    });
    assert.equal(staleCall.status, "stale_mirror");
    const [afterStaleCall] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, replacementHodId));
    assert.equal(afterStaleCall.passwordHash, replSentinelHash);

    const { departmentId: ambigDeptId } = await provisionDepartment({
      collegeId,
      name: "Reset Midflight Ambig Dept",
      code: "RSTMIDAMBIG1",
      hod: { fullName: "Reset Ambig HOD", email: "rst-midambig-hod@example.com" },
    }, generatedTestPassword());
    const [ambigFirst] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, ambigDeptId));
    assert.ok(ambigFirst);
    const ambigFirstEmails = buildCanonicalMirrorEmails(buildMirrorSafeName(ambigDeptId, college.code, ambigFirst.code));
    const firstSentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
    await db.update(usersTable).set({ passwordHash: firstSentinelHash }).where(eq(usersTable.email, ambigFirstEmails.hod));

    const secondSentinelHash = await bcrypt.hash(randomBytes(18).toString("base64url"), 10);
    let secondHodId = 0;
    const midflightAmbig = await resetMirrorTestCredentials(ambigDeptId, collegeId, {
      onBeforeLockTransaction: async () => {
        const secondCode = `TEST-RSTAMBIG-${ambigDeptId}`;
        const [second] = await db.insert(departmentsTable).values({
          name: "Reset Midflight Ambig Dept (Test 2)",
          code: secondCode,
          collegeId,
          isTest: true,
          configSourceDepartmentId: ambigDeptId,
        }).returning();
        const [secondHod] = await db.insert(usersTable).values({
          fullName: "Test HOD",
          email: `dup-reset-hod-${ambigDeptId}@example.test`,
          passwordHash: secondSentinelHash,
          role: "hod",
          status: "approved",
          departmentId: second.id,
        }).returning({ id: usersTable.id });
        secondHodId = secondHod.id;
      },
    });
    assert.equal(midflightAmbig.status, "ambiguous_mirror");
    const [firstAfter] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.email, ambigFirstEmails.hod));
    assert.equal(firstAfter.passwordHash, firstSentinelHash);
    const [secondAfter] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, secondHodId));
    assert.equal(secondAfter.passwordHash, secondSentinelHash);
  });

  it("restoreMirrorTestFaculty detects same-mirror non-professor canonical email collision safely", async () => {
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Same Mirror Collision Dept",
      code: "SAMEMIRCOL1",
      hod: { fullName: "Same Mirror Collision HOD", email: "same-mir-col-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(mirrorDept);

    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
    const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDeptId, college.code, mirrorDept.code));

    await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
    await db.update(usersTable)
      .set({ email: canonical.professor })
      .where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "hod")));

    const collision = await restoreMirrorTestFaculty(realDeptId, collegeId);
    assert.equal(collision.status, "collision");
    assert.equal(collision.mirrorDepartmentId, mirrorDept.id);
    assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")))).length, 0);
  });

  it("resetMirrorTestCredentials and restoreMirrorTestFaculty pre-lock users with FOR UPDATE NOWAIT and return lock_conflict on SQLSTATE 55P03", async () => {
    // Synthetic PGlite unit simulation of PostgreSQL SQLSTATE 55P03 (lock_not_available):
    // PGlite runs a single-connection WASM engine, so multi-connection lock contention proof
    // requires PostgreSQL; this unit test verifies the generated FOR UPDATE NOWAIT SQL clause,
    // DrizzleQueryError cause extraction, transaction rollback, and safe lock_conflict return.
    const collegeId = await getTestCollegeId();
    const { departmentId: realDeptId } = await provisionDepartment({
      collegeId,
      name: "Nowait Conflict Dept",
      code: "NOWAIT1",
      hod: { fullName: "Nowait Real HOD", email: "nowait-real-hod@example.com" },
    }, generatedTestPassword());

    const [mirrorDept] = await db.select().from(departmentsTable)
      .where(eq(departmentsTable.configSourceDepartmentId, realDeptId));
    assert.ok(mirrorDept);
    const [college] = await db.select({ code: collegesTable.code }).from(collegesTable).where(eq(collegesTable.id, collegeId));
    const canonical = buildCanonicalMirrorEmails(buildMirrorSafeName(realDeptId, college.code, mirrorDept.code));

    const sentinelHash = await bcrypt.hash(generatedTestPassword(), 10);
    await db.update(usersTable).set({ passwordHash: sentinelHash }).where(eq(usersTable.email, canonical.hod));

    const originalTransaction = db.transaction.bind(db);
    let nowaitCount = 0;

    const installNoWait55P03Interceptor = () => {
      (db as any).transaction = async (callback: (tx: any) => Promise<any>, config?: any) =>
        originalTransaction(async (tx: any) => {
          const originalSelect = tx.select.bind(tx);
          const wrappedTx = new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop !== "select") return Reflect.get(target, prop, receiver);
              return (...selectArgs: any[]) => {
                const qb = originalSelect(...selectArgs);
                const originalFrom = qb.from.bind(qb);
                qb.from = (table: any) => {
                  const fromBuilder = originalFrom(table);
                  if (table !== usersTable) return fromBuilder;
                  const originalFor = fromBuilder.for.bind(fromBuilder);
                  fromBuilder.for = (strength: string, lockConfig?: { noWait?: boolean }) => {
                    const lockedBuilder = originalFor(strength, lockConfig);
                    if (strength === "update" && lockConfig?.noWait === true) {
                      nowaitCount += 1;
                      const sqlText = lockedBuilder.toSQL().sql;
                      assert.match(sqlText, /for update nowait/i);
                      const rejectNowait = () => {
                        const pgErr = Object.assign(new Error('could not obtain lock on row in relation "users"'), { code: "55P03" });
                        return Promise.reject(new DrizzleQueryError(sqlText, [], pgErr));
                      };
                      return new Proxy(lockedBuilder, {
                        get(lockTarget, lockProp) {
                          if (lockProp === "then") {
                            return (onFulfilled: any, onRejected: any) => rejectNowait().then(onFulfilled, onRejected);
                          }
                          if (lockProp === "limit") {
                            return () => ({
                              then: (onFulfilled: any, onRejected: any) => rejectNowait().then(onFulfilled, onRejected),
                            });
                          }
                          return Reflect.get(lockTarget, lockProp);
                        },
                      });
                    }
                    return lockedBuilder;
                  };
                  return fromBuilder;
                };
                return qb;
              };
            },
          });
          return callback(wrappedTx);
        }, config);
    };

    try {
      installNoWait55P03Interceptor();
      const resetConflict = await resetMirrorTestCredentials(realDeptId, collegeId, {
        expectedMirrorDepartmentId: mirrorDept.id,
      });
      assert.equal(resetConflict.status, "lock_conflict");
      assert.equal(nowaitCount, 1);

      const [hodAfterResetConflict] = await db.select({ passwordHash: usersTable.passwordHash })
        .from(usersTable).where(eq(usersTable.email, canonical.hod));
      assert.equal(hodAfterResetConflict.passwordHash, sentinelHash);

      await db.delete(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")));
      const restoreConflict = await restoreMirrorTestFaculty(realDeptId, collegeId, {
        expectedMirrorDepartmentId: mirrorDept.id,
      });
      assert.equal(restoreConflict.status, "lock_conflict");
      assert.equal(nowaitCount, 2);
      assert.equal((await db.select().from(usersTable).where(and(eq(usersTable.departmentId, mirrorDept.id), eq(usersTable.role, "professor")))).length, 0);
    } finally {
      (db as any).transaction = originalTransaction;
    }
  });
});
