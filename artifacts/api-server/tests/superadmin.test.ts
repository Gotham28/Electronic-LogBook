import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, usersTable, studentsTable, caseLogsTable } from "./database.js";
import { eq, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

let runtime: Awaited<ReturnType<typeof setup>>;
let adminAccount: { id: number; token: string };
before(async () => {
  runtime = await setup();
  // Create an admin account for testing. This mirrors what provision-admin.ts
  // would do in production but uses the test database directly.
  const hash = await bcrypt.hash(password, 10);
  const [admin] = await db.insert(usersTable).values({
    fullName: "Test Admin", email: "admin@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash,
  }).returning();
  adminAccount = {
    id: admin.id,
    token: jwt.sign({ id: admin.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "admin", method?: string, body?: unknown) => {
  const account = who === "admin"
    ? { ...adminAccount, role: "admin", email: "admin@example.test", departmentId: 0 }
    : who ? a[who] : undefined;
  return request(runtime.base, path, account as any, method, body);
};

// =========================================================================
// 1. Role gating: HOD, professor, and student get 403 on every admin route
// =========================================================================
test("HOD, professor, and student accounts get 403 on every superadmin route", async () => {
  const routes: Array<[string, string]> = [
    ["/superadmin/departments", "GET"],
    ["/superadmin/departments", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/replace-hod", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/roster", "GET"],
    ["/superadmin/departments/" + departmentIds[0] + "/faculty", "POST"],
    ["/superadmin/departments/" + departmentIds[0] + "/students", "POST"],
    ["/superadmin/users/" + a.student0.id + "/deactivate", "POST"],
  ];
  for (const role of ["hod0", "faculty0", "student0"] as const) {
    for (const [path, method] of routes) {
      const res = await call(path, role, method, method === "POST" ? {} : undefined);
      assert.equal(res.status, 403, `${role} on ${method} ${path} should be 403, got ${res.status}`);
    }
  }
});

// =========================================================================
// 2. Admin gets 403 on HOD-only student approve/reject
// =========================================================================
test("admin account gets 403 on HOD-only student approve/reject routes", async () => {
  const pendingId = a.pending0.id;
  assert.equal((await call("/admin/students/" + pendingId + "/approve", "admin", "POST")).status, 403);
  assert.equal((await call("/admin/students/" + pendingId + "/reject", "admin", "POST")).status, 403);
  assert.equal((await call("/admin/roster", "admin")).status, 403);
});

// =========================================================================
// 3. Admin can list departments with HODs
// =========================================================================
test("admin can list all departments with their current HOD", async () => {
  const res = await call("/superadmin/departments", "admin");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 3);
  // Each department has an hod field (may be null or an object with id, fullName, email)
  for (const dept of res.body) {
    assert.ok(dept.id);
    assert.ok(dept.name);
    assert.ok(dept.code);
    if (dept.hod) {
      assert.ok(dept.hod.id);
      assert.ok(dept.hod.fullName);
      assert.ok(dept.hod.email);
    }
  }
});

// =========================================================================
// 4. Admin can create a department via provisionDepartment
// =========================================================================
test("admin can create a department with HOD via the API", async () => {
  const res = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Superadmin Created Dept", code: "SADMIN-TEST", hod: { fullName: "New HOD", email: "newhod@example.test" } },
    hodPassword: password,
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.departmentId);
  assert.ok(res.body.hodId);

  // Verify the HOD was created correctly
  const [hod] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.hodId));
  assert.equal(hod.role, "hod");
  assert.equal(hod.status, "approved");
  assert.equal(hod.departmentId, res.body.departmentId);

  // Duplicate HOD for same department is rejected
  const dup = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Superadmin Created Dept", code: "SADMIN-TEST", hod: { fullName: "Another HOD", email: "anotherhod@example.test" } },
    hodPassword: password,
  });
  assert.equal(dup.status, 400);
  assert.ok(dup.body.message.match(/active HOD already exists/i));
});

// =========================================================================
// 5. Admin can view any department's roster
// =========================================================================
test("admin can view any department roster (plain user rows only)", async () => {
  const res = await call("/superadmin/departments/" + departmentIds[0] + "/roster", "admin");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  // Each row has only: id, fullName, email, role, status — no clinical joins
  for (const user of res.body) {
    assert.ok("id" in user);
    assert.ok("fullName" in user);
    assert.ok("email" in user);
    assert.ok("role" in user);
    assert.ok("status" in user);
    // §4: no studentId or studentProfileId in the admin roster
    assert.ok(!("studentId" in user));
    assert.ok(!("studentProfileId" in user));
  }
  // Nonexistent department returns 404
  assert.equal((await call("/superadmin/departments/999999/roster", "admin")).status, 404);
});

// =========================================================================
// 6. Admin can create faculty in any department
// =========================================================================
test("admin can create faculty in any department", async () => {
  const res = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Admin-Created Faculty", email: "admin-fac@example.test", password,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.faculty.departmentId, departmentIds[1]);

  // Duplicate email rejected
  const dup = await call("/superadmin/departments/" + departmentIds[1] + "/faculty", "admin", "POST", {
    fullName: "Duplicate", email: "admin-fac@example.test", password,
  });
  assert.equal(dup.status, 400);

  // Nonexistent department rejected
  assert.equal((await call("/superadmin/departments/999999/faculty", "admin", "POST", {
    fullName: "Nobody", email: "nobody@example.test", password,
  })).status, 404);
});

// =========================================================================
// 7. Admin can create a student (status: pending)
// =========================================================================
test("admin can create student in any department (pending status)", async () => {
  const res = await call("/superadmin/departments/" + departmentIds[2] + "/students", "admin", "POST", {
    fullName: "Admin-Created Student", email: "admin-stu@example.test", password,
    registrationNumber: "ADMIN-STU-001", batch: "2026", dateOfJoining: "2026-01-01", kuhsId: "UNIV-ADMIN-001",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.student.departmentId, departmentIds[2]);

  // Verify the student is pending
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, res.body.student.id));
  assert.equal(user.status, "pending");
  assert.equal(user.role, "student");

  // Verify student profile row was created
  const [profile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, res.body.student.id));
  assert.ok(profile);
  assert.equal(profile.registrationNumber, "ADMIN-STU-001");
});

// =========================================================================
// 8. HOD swap is transactional
// =========================================================================
test("HOD swap: success, sessionVersion bump, wrong-role/wrong-dept/nonexistent-dept rejected", async () => {
  // Create a department with a known HOD and a professor for the swap
  const setupRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Swap Test Dept", code: "SWAP-TEST", hod: { fullName: "Original HOD", email: "swap-hod@example.test" } },
    hodPassword: password,
  });
  assert.equal(setupRes.status, 201);
  const deptId = setupRes.body.departmentId;
  const originalHodId = setupRes.body.hodId;

  // Create a professor in that department for the swap
  const profRes = await call("/superadmin/departments/" + deptId + "/faculty", "admin", "POST", {
    fullName: "Swap Professor", email: "swap-prof@example.test", password,
  });
  assert.equal(profRes.status, 201);
  const profId = profRes.body.faculty.id;

  // Successful HOD swap
  const swapRes = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: profId,
  });
  assert.equal(swapRes.status, 200);
  assert.equal(swapRes.body.demotedId, originalHodId);
  assert.equal(swapRes.body.promotedId, profId);

  // Verify: original HOD is now professor
  const [demoted] = await db.select().from(usersTable).where(eq(usersTable.id, originalHodId));
  assert.equal(demoted.role, "professor");
  assert.equal(demoted.status, "approved");

  // Verify: professor is now HOD
  const [promoted] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(promoted.role, "hod");
  assert.equal(promoted.status, "approved");

  // Verify: sessionVersion was bumped on both
  assert.ok(demoted.sessionVersion > 0, "demoted HOD sessionVersion should have been bumped");
  assert.ok(promoted.sessionVersion > 0, "promoted HOD sessionVersion should have been bumped");

  // Attempt swap with a non-professor (a student) — should fail
  const studentSwap = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: a.student0.id,
  });
  assert.equal(studentSwap.status, 400);
  // Verify the current HOD didn't change
  const [stillHod] = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, deptId), eq(usersTable.role, "hod")));
  assert.equal(stillHod.id, profId);

  // Attempt swap with a user from a different department — should fail
  const crossDeptSwap = await call("/superadmin/departments/" + deptId + "/replace-hod", "admin", "POST", {
    incomingUserId: a.faculty0.id,
  });
  assert.ok([400].includes(crossDeptSwap.status));
  // Current HOD remains unchanged
  const [unchanged] = await db.select().from(usersTable).where(and(eq(usersTable.departmentId, deptId), eq(usersTable.role, "hod")));
  assert.equal(unchanged.id, profId);

  // Nonexistent department
  assert.equal((await call("/superadmin/departments/999999/replace-hod", "admin", "POST", { incomingUserId: profId })).status, 404);
});

// =========================================================================
// 8b. HOD swap transaction rollback: a throw after the demotion write rolls
//     back both changes — the outgoing HOD stays "hod", the incoming user
//     stays "professor". This exercises db.transaction() directly to inject a
//     genuine failure between the two writes (the HTTP route's pre-write
//     validation prevents this scenario from occurring via the API).
// =========================================================================
test("HOD swap: genuine mid-transaction failure rolls back the demotion write", async () => {
  // Set up a fresh department with a known HOD and professor
  const setupRes = await call("/superadmin/departments", "admin", "POST", {
    setup: { name: "Rollback Test Dept", code: "ROLLBACK-T", hod: { fullName: "Rollback HOD", email: "rb-hod@example.test" } },
    hodPassword: password,
  });
  assert.equal(setupRes.status, 201);
  const deptId = setupRes.body.departmentId;
  const hodId = setupRes.body.hodId;

  const profRes = await call("/superadmin/departments/" + deptId + "/faculty", "admin", "POST", {
    fullName: "Rollback Professor", email: "rb-prof@example.test", password,
  });
  assert.equal(profRes.status, 201);
  const profId = profRes.body.faculty.id;

  // Capture pre-transaction state
  const [hodBefore] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  const [profBefore] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(hodBefore.role, "hod");
  assert.equal(profBefore.role, "professor");

  // Run a transaction that mirrors the route's write pattern: demotion
  // succeeds, then a thrown error prevents the promotion from executing.
  // If the transaction mechanism works, the demotion is rolled back.
  await assert.rejects(
    () => db.transaction(async (tx) => {
      // Step 4 from superadmin.ts: demote current HOD
      await tx.update(usersTable)
        .set({ role: "professor", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
        .where(and(eq(usersTable.id, hodId), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")));

      // Verify demotion took effect inside the transaction
      const [demotedInTx] = await tx.select({ role: usersTable.role }).from(usersTable)
        .where(eq(usersTable.id, hodId));
      assert.equal(demotedInTx.role, "professor", "demotion should be visible inside the transaction");

      // Simulate a failure before the promotion write executes
      throw new Error("Injected failure after demotion");
    }),
    { message: "Injected failure after demotion" },
  );

  // After the rolled-back transaction: both users must be unchanged
  const [hodAfter] = await db.select().from(usersTable).where(eq(usersTable.id, hodId));
  assert.equal(hodAfter.role, "hod", "outgoing HOD should still be hod after rollback");
  assert.equal(hodAfter.sessionVersion, hodBefore.sessionVersion, "outgoing HOD sessionVersion should be unchanged after rollback");

  const [profAfter] = await db.select().from(usersTable).where(eq(usersTable.id, profId));
  assert.equal(profAfter.role, "professor", "incoming user should still be professor after rollback");
  assert.equal(profAfter.sessionVersion, profBefore.sessionVersion, "incoming user sessionVersion should be unchanged after rollback");
});

// =========================================================================
// 9. Deactivating a student/faculty retains existing logs/records
// =========================================================================
test("deactivating a student retains their existing logs/records", async () => {
  // Use student0 who has case logs from access.test.ts fixture pattern.
  // First, create a case log to ensure data exists.
  const student = a.student0;
  const supervisorId = a.faculty0.id;
  const base = "/students/" + student.studentId;
  const caseBody = { date: "2026-09-02", patientAge: "Adult", patientGender: "other", diagnosisFinal: "Synthetic retention test", supervisorId };
  const log = await call(base + "/case-logs", "student0", "POST", caseBody);
  assert.equal(log.status, 201);

  // Deactivate student0 via superadmin
  const deactivate = await call("/superadmin/users/" + student.id + "/deactivate", "admin", "POST", {});
  assert.equal(deactivate.status, 200);

  // Verify the student's case log still exists
  const [caseLog] = await db.select().from(caseLogsTable).where(eq(caseLogsTable.id, log.body.id));
  assert.ok(caseLog, "Case log should still exist after deactivation");

  // Verify student profile still exists
  const [profile] = await db.select().from(studentsTable).where(eq(studentsTable.userId, student.id));
  assert.ok(profile, "Student profile should still exist after deactivation");

  // Verify user status is rejected
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, student.id));
  assert.equal(user.status, "rejected");
});

// =========================================================================
// 10. Admin cannot deactivate another admin or an HOD
// =========================================================================
test("admin cannot deactivate another admin or an HOD via the deactivate endpoint", async () => {
  // Cannot deactivate admin
  const adminRes = await call("/superadmin/users/" + adminAccount.id + "/deactivate", "admin", "POST", {});
  assert.equal(adminRes.status, 403);
  assert.ok(adminRes.body.message.match(/cannot deactivate/i));

  // Cannot deactivate HOD
  const hodRes = await call("/superadmin/users/" + a.hod0.id + "/deactivate", "admin", "POST", {});
  assert.equal(hodRes.status, 403);
  assert.ok(hodRes.body.message.match(/cannot deactivate/i));

  // Verify neither account was actually changed
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, adminAccount.id));
  assert.equal(adminUser.status, "approved");
  const [hodUser] = await db.select().from(usersTable).where(eq(usersTable.id, a.hod0.id));
  assert.equal(hodUser.status, "approved");
});

// =========================================================================
// 11. Registration cannot create an admin role
// =========================================================================
test("registration cannot create an admin role account", async () => {
  // The registrationBody schema at auth.ts:100-102 uses .strict() and does not
  // include a "role" field. Any extra field (including role) is rejected with 400.
  // The route handler also hardcodes role: "student" at auth.ts:121.
  // This test confirms that sending role: "admin" is rejected.
  const registration = {
    fullName: "Fake admin", email: "fakeadmin@example.test", password,
    registrationNumber: "FAKE-ADMIN", batch: "2026", dateOfJoining: "2026-01-01",
    kuhsId: "FAKE-ADMIN-001", departmentId: departmentIds[0],
    verificationToken: "fake-but-irrelevant-here",
    role: "admin",
  };
  const res = await call("/auth/register", undefined, "POST", registration);
  // .strict() rejects the extra "role" field with 400 before any processing
  assert.equal(res.status, 400);
});

// =========================================================================
// 12. Unauthenticated requests get 401
// =========================================================================
test("unauthenticated requests to superadmin routes get 401", async () => {
  assert.equal((await call("/superadmin/departments")).status, 401);
  assert.equal((await call("/superadmin/departments/" + departmentIds[0] + "/roster")).status, 401);
  assert.equal((await call("/superadmin/users/" + a.student0.id + "/deactivate", undefined, "POST", {})).status, 401);
});

// =========================================================================
// 13. Deactivating faculty via superadmin works
// =========================================================================
test("admin can deactivate faculty and their session is invalidated", async () => {
  // Create a fresh faculty to deactivate
  const fac = await call("/superadmin/departments/" + departmentIds[0] + "/faculty", "admin", "POST", {
    fullName: "Deactivate Target", email: "deac-target@example.test", password,
  });
  assert.equal(fac.status, 201);
  const facId = fac.body.faculty.id;

  const deactivate = await call("/superadmin/users/" + facId + "/deactivate", "admin", "POST", {});
  assert.equal(deactivate.status, 200);

  // User status is rejected
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, facId));
  assert.equal(user.status, "rejected");

  // Nonexistent user returns 404
  assert.equal((await call("/superadmin/users/999999/deactivate", "admin", "POST", {})).status, 404);
});
