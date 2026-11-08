import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { PROCEDURE_LOG_FIELDS } from "@workspace/api-zod";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { setup, request, accounts, departmentIds } from "./support.js";
import { db, engine, migrationConnection, departmentsTable, departmentConfigsTable, procedureTypesTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let procedureId: number;
let logId: number;
let setupSql: string;
const path = () => `/students/${accounts.student0.studentId}/procedure-logs`;
const valid = () => ({ procedureName: "Synthetic procedure", procedureGroup: "Synthetic group", date: "2026-11-07",
  patientAge: "30 years", sex: "Male", patientUhid: "DEIDENTIFIED-FIXTURE-001", diagnosis: "Synthetic indication",
  setting: "OT", competencyLevel: "PS", supervisorId: accounts.faculty0.id });

before(async () => {
  runtime = await setup();
  setupSql = await readFile(new URL("../scripts/department-templates/surgery-setup.sql", import.meta.url), "utf8");
  await db.update(departmentsTable).set({ name: "Surgery", code: "SURG" }).where(eq(departmentsTable.id, departmentIds[0]));
  await db.update(departmentsTable).set({ name: "Surgery (Test)", code: "TEST-SURG", isTest: true,
    configSourceDepartmentId: departmentIds[0] }).where(eq(departmentsTable.id, departmentIds[2]));
  await db.update(departmentConfigsTable).set({ enabledFeatures: { keepExistingFlag: true } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
  await engine.exec(setupSql);
  await engine.exec(setupSql);
  const created = await request(runtime.base, "/admin/department/procedures", accounts.hod0, "POST", {
    name: "Synthetic procedure", group: "Synthetic group", required: 0,
  });
  assert.equal(created.status, 200);
  procedureId = created.body.id;
  const logged = await request(runtime.base, path(), accounts.student0, "POST", valid());
  assert.equal(logged.status, 201);
  logId = logged.body.id;
});

after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

test("the supplied SQL creates Surgery, its config and exactly the four requested role codes", async () => {
  const isolated = new PGlite();
  try {
    await applyMigrations(migrationConnection(isolated));
    await isolated.exec(setupSql);
    await isolated.exec(setupSql);
    const departments = await isolated.query<{ name: string; code: string }>("SELECT name, code FROM departments WHERE code = 'SURG'");
    assert.deepEqual(departments.rows, [{ name: "Surgery", code: "SURG" }]);
    const roles = await isolated.query<{ value: string }>("SELECT value FROM department_catalog WHERE kind = 'competency_level' ORDER BY value");
    assert.deepEqual(roles.rows.map((row) => row.value), ["A", "O", "PI", "PS"]);
  } finally { await isolated.close(); }
});

test("setup can be rerun and preserves other configuration flags", async () => {
  const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
  assert.equal(config.enabledFeatures.keepExistingFlag, true);
  assert.equal(config.enabledFeatures.procedureClinicalDetails, true);
});

test("HOD creation defaults to all six required fields and the resident catalog includes them", async () => {
  const catalog = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, accounts.student0);
  assert.equal(catalog.status, 200);
  const procedure = catalog.body.procedures.find((row: { id: number }) => row.id === procedureId);
  assert.deepEqual(procedure.requiredLogFields, [...PROCEDURE_LOG_FIELDS]);
  assert.deepEqual(catalog.body.competencyLevels.map((row: { value: string }) => row.value).sort(), ["A", "O", "PI", "PS"]);
});

test("each required field rejects an omitted, empty or N/A value", async () => {
  for (const field of PROCEDURE_LOG_FIELDS) {
    for (const value of [undefined, "", "N/A"]) {
      const body = { ...valid(), [field]: value };
      const result = await request(runtime.base, path(), accounts.student0, "POST", body);
      assert.equal(result.status, 400, `${field} must reject an incomplete entry`);
    }
  }
});

test("all four settings and role codes can be logged; invalid codes are rejected", async () => {
  for (const [index, setting] of ["Ward", "Casualty", "OT", "NICU"].entries()) {
    const body = { ...valid(), setting, competencyLevel: ["O", "A", "PS", "PI"][index] };
    const result = await request(runtime.base, path(), accounts.student0, "POST", body);
    assert.equal(result.status, 201);
    assert.equal(result.body.setting, setting);
    assert.equal(result.body.competencyLevel, body.competencyLevel);
  }
  for (const body of [{ ...valid(), setting: "Unknown" }, { ...valid(), competencyLevel: "observed" }, { ...valid(), sex: "Unknown" }]) {
    assert.equal((await request(runtime.base, path(), accounts.student0, "POST", body)).status, 400);
  }
});

test("HOD checkboxes configure each procedure separately and unchecked fields can be omitted", async () => {
  const created = await request(runtime.base, "/admin/department/procedures", accounts.hod0, "POST", {
    name: "Synthetic optional procedure", group: "Synthetic group", required: 0, requiredLogFields: ["sex", "setting"],
  });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body.requiredLogFields, ["sex", "setting"]);
  const result = await request(runtime.base, path(), accounts.student0, "POST", {
    ...valid(), procedureName: "Synthetic optional procedure", patientAge: "N/A", patientUhid: "N/A", diagnosis: "", competencyLevel: "N/A",
  });
  assert.equal(result.status, 201);
  const updated = await request(runtime.base, `/admin/department/procedures/${created.body.id}`, accounts.hod0, "PATCH", { requiredLogFields: ["diagnosis"] });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body.requiredLogFields, ["diagnosis"]);
  assert.equal((await request(runtime.base, "/admin/department/procedures", accounts.hod0, "POST", {
    name: "Invalid option", group: "Synthetic group", required: 0, requiredLogFields: ["inventedField"],
  })).status, 400);
});

test("partial edits validate the resulting entry and cannot clear a required setting", async () => {
  const edited = await request(runtime.base, `${path()}/${logId}`, accounts.student0, "PATCH", { setting: "Ward" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.patientUhid, valid().patientUhid);
  assert.equal(edited.body.setting, "Ward");
  assert.equal((await request(runtime.base, `${path()}/${logId}`, accounts.student0, "PATCH", { setting: null })).status, 400);
  assert.equal((await request(runtime.base, `${path()}/${logId}`, accounts.student0, "PATCH", { diagnosis: " " })).status, 400);
});

test("student procedure edit: unauthenticated 401", async () => {
  assert.equal((await request(runtime.base, `${path()}/${logId}`, undefined, "PATCH", { setting: "OT" })).status, 401);
});
test("student procedure edit: wrong owner 403", async () => {
  assert.equal((await request(runtime.base, `${path()}/${logId}`, accounts.student20, "PATCH", { setting: "OT" })).status, 403);
});
test("student procedure edit: correct owner 200", async () => {
  assert.equal((await request(runtime.base, `${path()}/${logId}`, accounts.student0, "PATCH", { setting: "OT" })).status, 200);
});
test("student procedure edit: nonexistent row 404", async () => {
  assert.equal((await request(runtime.base, `${path()}/99999999`, accounts.student0, "PATCH", { setting: "OT" })).status, 404);
});

test("HOD requirement edits cannot reach another department or be performed by a resident", async () => {
  const route = `/admin/department/procedures/${procedureId}`;
  assert.equal((await request(runtime.base, route, undefined, "PATCH", { requiredLogFields: [] })).status, 401);
  assert.equal((await request(runtime.base, route, accounts.hod1, "PATCH", { requiredLogFields: [] })).status, 404);
  assert.equal((await request(runtime.base, route, accounts.student0, "PATCH", { requiredLogFields: [] })).status, 403);
  assert.equal((await request(runtime.base, "/admin/department/procedures/99999999", accounts.hod0, "PATCH", { requiredLogFields: [] })).status, 404);
});

test("test departments inherit requirements but use their own reviewing faculty", async () => {
  const catalog = await request(runtime.base, `/departments/${departmentIds[2]}/catalog`, accounts.student2);
  assert.deepEqual(catalog.body.procedures.find((row: { id: number }) => row.id === procedureId).requiredLogFields, [...PROCEDURE_LOG_FIELDS]);
  assert.equal((await request(runtime.base, `/students/${accounts.student2.studentId}/procedure-logs`, accounts.student2, "POST", {
    ...valid(), supervisorId: accounts.faculty2.id,
  })).status, 201);
  assert.equal((await request(runtime.base, `/admin/department/procedures/${procedureId}`, accounts.hod2, "PATCH", { requiredLogFields: [] })).status, 403);
});

test("other departments keep their existing procedure entry requirements", async () => {
  const created = await request(runtime.base, "/admin/department/procedures", accounts.hod1, "POST", {
    name: "Legacy synthetic procedure", group: "Legacy group", required: 0,
  });
  assert.deepEqual(created.body.requiredLogFields, []);
  const body = { procedureName: "Legacy synthetic procedure", procedureGroup: "Legacy group", date: "2026-11-07",
    patientAge: "40 years", patientUhid: "N/A", competencyLevel: "observed", supervisorId: accounts.faculty1.id };
  const result = await request(runtime.base, `/students/${accounts.student1.studentId}/procedure-logs`, accounts.student1, "POST", body);
  assert.equal(result.status, 201);
  assert.equal(result.body.setting, null);
});

test("the HOD review queue includes all required patient/procedure details and review preserves them", async () => {
  const queue = await request(runtime.base, `/professors/${accounts.faculty0.id}/review-queue`, accounts.faculty0);
  assert.equal(queue.status, 200);
  const row = queue.body.pendingReviews.find((item: { dbId: number; logType: string }) => item.logType === "procedure" && item.dbId === logId);
  assert.equal(row.patientAge, valid().patientAge);
  assert.equal(row.sex, valid().sex);
  assert.equal(row.patientUhid, valid().patientUhid);
  assert.equal(row.diagnosis, valid().diagnosis);
  assert.equal(row.setting, "OT");
  const invalid = await request(runtime.base, `/logs/procedure/${logId}/review`, accounts.faculty0, "PATCH", { status: "verified", facultyVerifiedLevel: "observed" });
  assert.equal(invalid.status, 400);
  const review = await request(runtime.base, `/logs/procedure/${logId}/review`, accounts.faculty0, "PATCH", { status: "verified", facultyVerifiedLevel: "PI" });
  assert.equal(review.status, 200);
  assert.equal(review.body.setting, "OT");
  assert.equal(review.body.facultyVerifiedLevel, "PI");
});
