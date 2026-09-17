import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts, departmentIds, Account } from "./support.js";
import { db, departmentsTable, departmentConfigsTable, studentsTable } from "./database.js";
import { resolveConfigDepartmentId } from "../src/lib/department-config-source.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

describe("Mirror Test Department (AGENTS.md §3, §6, §11)", () => {
  let server: any;
  let base: string;
  let sourceDepartmentId: number;
  let mirrorDepartmentId: number;
  let realHod: Account;
  let mirrorHod: Account;
  let testStudent: Account;

  before(async () => {
    const initialized = await setup();
    server = initialized.server;
    base = initialized.base;

    // We'll use Pediatrics (index 0) as the source
    sourceDepartmentId = departmentIds[0];
    realHod = accounts["hod0"];

    // Create the mirror department
    const [mirror] = await db.insert(departmentsTable).values({
      name: "Pediatrics (Test)",
      code: "TEST-MIRROR",
      isTest: true,
      configSourceDepartmentId: sourceDepartmentId
    }).returning();
    mirrorDepartmentId = mirror.id;

    // Insert mirror HOD
    const [user] = await db.insert((await import("./database.js")).usersTable).values({
      fullName: "Mirror HOD",
      email: "mirror-hod@example.test",
      role: "hod",
      status: "approved",
      departmentId: mirrorDepartmentId,
      passwordHash: "test-hash"
    }).returning();
    
    mirrorHod = {
      id: user.id,
      email: user.email,
      role: "hod",
      departmentId: mirrorDepartmentId,
      token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" })
    };

    // Insert mirror student
    const [sUser] = await db.insert((await import("./database.js")).usersTable).values({
      fullName: "Mirror Student",
      email: "mirror-student@example.test",
      role: "student",
      status: "approved",
      departmentId: mirrorDepartmentId,
      passwordHash: "test-hash"
    }).returning();
    const [student] = await db.insert(studentsTable).values({ userId: sUser.id, batch: "2026",
      registrationNumber: "TEST-" + sUser.id, kuhsId: "UNIV-" + sUser.id, specialty: "Pediatrics (Test)", dateOfJoining: "2026-01-01" }).returning();
    testStudent = {
      id: sUser.id,
      email: sUser.email,
      role: "student",
      departmentId: mirrorDepartmentId,
      token: jwt.sign({ id: sUser.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" })
    };
  });

  after(() => {
    if (server) server.close();
  });

  it("Settings write - 401 unauthenticated", async () => {
    const response = await request(base, "/admin/department/procedures/999", undefined, "PATCH", { required: 15 });
    assert.equal(response.status, 401);
  });

  it("Settings write - 403 test HOD on mirror department", async () => {
    const procedureTypesTable = (await import("./database.js")).procedureTypesTable;
    const [proc] = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, sourceDepartmentId));
    const beforeReq = proc.required;

    const response = await request(base, `/admin/department/procedures/${proc.id}`, mirrorHod, "PATCH", { required: 15 });
    
    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Test departments cannot modify mirrored settings");

    const [afterProc] = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.id, proc.id));
    assert.equal(beforeReq, afterProc.required);
  });

  it("Settings write - 200 real HOD on own department", async () => {
    const procedureTypesTable = (await import("./database.js")).procedureTypesTable;
    const [proc] = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, sourceDepartmentId));

    const response = await request(base, `/admin/department/procedures/${proc.id}`, realHod, "PATCH", { required: 15 });
    assert.equal(response.status, 200);
    assert.equal(response.body.required, 15);
  });

  it("Settings write - 404 nonexistent procedure", async () => {
    const response = await request(base, `/admin/department/procedures/999999`, realHod, "PATCH", { required: 15 });
    assert.equal(response.status, 404);
  });

  it("/:departmentId/analytics as test HOD -> only test-department students", async () => {
    const response = await request(base, `/departments/${mirrorDepartmentId}/analytics`, mirrorHod);
    assert.equal(response.status, 200);
    assert.equal(response.body.totalStudents, 1);
    assert.equal(response.body.students[0].name, "Mirror Student");
  });

  it("Mirror department read returns source settings without leaking test fields", async () => {
    const response = await request(base, `/departments/${mirrorDepartmentId}/catalog`, testStudent);
    assert.equal(response.status, 200);
    
    assert.equal(response.body.department.isTest, undefined);
    assert.equal(response.body.department.configSourceDepartmentId, undefined);

    const realResponse = await request(base, `/departments/${sourceDepartmentId}/catalog`, accounts["student0"]);
    
    assert.deepEqual(response.body.config, realResponse.body.config);
    assert.deepEqual(response.body.procedures, realResponse.body.procedures);
    assert.deepEqual(response.body.postings, realResponse.body.postings);
  });

  it("Registering into a mirror department is rejected", async () => {
    const response = await request(base, "/auth/register", undefined, "POST", {
      fullName: "Gap Test", email: "gap-test@example.com", password: "Test-only-pass-492!",
      registrationNumber: "GAP-123", batch: "2026", dateOfJoining: "2026-01-01",
      kuhsId: "KUHS-GAP", departmentId: mirrorDepartmentId, verificationToken: "dummy"
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Choose an available department");
  });

  it("resolveConfigDepartmentId fails closed", async () => {
    await assert.rejects(async () => {
      await resolveConfigDepartmentId(999999);
    }, /not found/);

    // Create a chain (mirror of a mirror)
    const [chainMirror] = await db.insert(departmentsTable).values({
      name: "Chain Mirror", code: "CHAIN", isTest: true, configSourceDepartmentId: mirrorDepartmentId
    }).returning();

    await assert.rejects(async () => {
      await resolveConfigDepartmentId(chainMirror.id);
    }, /is itself a test department/);
  });

  it("GET /api/departments excludes isTest=true departments", async () => {
    const response = await request(base, "/departments");
    assert.equal(response.status, 200);
    
    const body = response.body as { id: number }[];
    const hasSource = body.some(d => d.id === sourceDepartmentId);
    const hasMirror = body.some(d => d.id === mirrorDepartmentId);
    
    assert.equal(hasSource, true);
    assert.equal(hasMirror, false);
  });
});
