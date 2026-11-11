import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { PROCEDURE_LOG_FIELDS, getDefaultProcedureFieldDefinitions } from "@workspace/api-zod";
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

// Evidence helper for AGENTS.md §11: status + safe metadata only (no patient text per §8).
function evidence(t: TestContext, label: string, method: string, apiPath: string, who: string, res: { status: number; body: any }) {
  const safeBody = res.body?.message !== undefined
    ? { message: res.body.message }
    : res.body?.fields !== undefined
      ? { enabled: res.body.enabled, fieldCount: Array.isArray(res.body.fields) ? res.body.fields.length : 0 }
      : { id: res.body?.id, status: res.body?.status };
  t.diagnostic(`${label}: ${method} /api${apiPath} as ${who} -> ${res.status} ${JSON.stringify(safeBody)}`);
}

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
  assert.equal(config.enabledFeatures.dynamicProcedureFields, true);
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

test("student procedure edit: unauthenticated 401", async (t) => {
  const route = `${path()}/${logId}`;
  const res = await request(runtime.base, route, undefined, "PATCH", { setting: "OT" });
  evidence(t, "unauthenticated", "PATCH", route, "nobody", res);
  assert.equal(res.status, 401);
});
test("student procedure edit: wrong owner 403", async (t) => {
  const route = `${path()}/${logId}`;
  const res = await request(runtime.base, route, accounts.student20, "PATCH", { setting: "OT" });
  evidence(t, "wrong owner", "PATCH", route, "student20", res);
  assert.equal(res.status, 403);
});
test("student procedure edit: correct owner 200", async (t) => {
  const route = `${path()}/${logId}`;
  const res = await request(runtime.base, route, accounts.student0, "PATCH", { setting: "OT" });
  evidence(t, "correct owner", "PATCH", route, "student0", res);
  assert.equal(res.status, 200);
});
test("student procedure edit: nonexistent row 404", async (t) => {
  const route = `${path()}/99999999`;
  const res = await request(runtime.base, route, accounts.student0, "PATCH", { setting: "OT" });
  evidence(t, "nonexistent row", "PATCH", route, "student0", res);
  assert.equal(res.status, 404);
});

test("HOD requirement edits cannot reach another department or be performed by a resident", async (t) => {
  const route = `/admin/department/procedures/${procedureId}`;
  const unauth = await request(runtime.base, route, undefined, "PATCH", { requiredLogFields: [] });
  evidence(t, "unauthenticated", "PATCH", route, "nobody", unauth);
  assert.equal(unauth.status, 401);

  const wrongDept = await request(runtime.base, route, accounts.hod1, "PATCH", { requiredLogFields: [] });
  evidence(t, "wrong department (fails closed as 404)", "PATCH", route, "hod1", wrongDept);
  assert.equal(wrongDept.status, 404);

  const wrongRole = await request(runtime.base, route, accounts.student0, "PATCH", { requiredLogFields: [] });
  evidence(t, "wrong role", "PATCH", route, "student0", wrongRole);
  assert.equal(wrongRole.status, 403);

  const missingRoute = "/admin/department/procedures/99999999";
  const missing = await request(runtime.base, missingRoute, accounts.hod0, "PATCH", { requiredLogFields: [] });
  evidence(t, "nonexistent row", "PATCH", missingRoute, "hod0", missing);
  assert.equal(missing.status, 404);
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

test("Surgery procedure-fields authorization enforces unauthenticated 401, non-HOD/mirror/non-dynamic 403, HOD 200", async (t) => {
  const fields = getDefaultProcedureFieldDefinitions();
  const route = "/admin/department/procedure-fields";
  const unauth = await request(runtime.base, route, undefined, "PATCH", { fields });
  evidence(t, "unauthenticated", "PATCH", route, "nobody", unauth);
  assert.equal(unauth.status, 401);

  const student = await request(runtime.base, route, accounts.student0, "PATCH", { fields });
  evidence(t, "wrong role (student)", "PATCH", route, "student0", student);
  assert.equal(student.status, 403);

  const faculty = await request(runtime.base, route, accounts.faculty0, "PATCH", { fields });
  evidence(t, "wrong role (faculty)", "PATCH", route, "faculty0", faculty);
  assert.equal(faculty.status, 403);

  const mirror = await request(runtime.base, route, accounts.hod2, "PATCH", { fields });
  evidence(t, "wrong owner (mirror test dept HOD)", "PATCH", route, "hod2", mirror);
  assert.equal(mirror.status, 403);

  const nonDynamic = await request(runtime.base, route, accounts.hod1, "PATCH", { fields });
  evidence(t, "wrong department (non-dynamic dept HOD)", "PATCH", route, "hod1", nonDynamic);
  assert.equal(nonDynamic.status, 403);

  const hodGet = await request(runtime.base, route, accounts.hod0, "GET");
  evidence(t, "correct owner GET", "GET", route, "hod0", hodGet);
  assert.equal(hodGet.status, 200);
  assert.equal(hodGet.body.enabled, true);
  assert.equal(hodGet.body.fields.length, 6);

  const hodPatch = await request(runtime.base, route, accounts.hod0, "PATCH", { fields });
  evidence(t, "correct owner PATCH", "PATCH", route, "hod0", hodPatch);
  assert.equal(hodPatch.status, 200);
  assert.equal(hodPatch.body.fields.length, 6);
});

test("Surgery HOD can rename options (NICU -> SICU), add custom fields, toggle required/optional, and residents & faculty see them", async () => {
  const defaults = getDefaultProcedureFieldDefinitions();
  const customized = defaults.map((f) => {
    if (f.id === "setting") {
      return { ...f, label: "Hospital Unit", options: ["Ward", "Casualty", "OT", "SICU", "PICU"] };
    }
    if (f.id === "patientUhid") {
      return { ...f, isRequired: false };
    }
    if (f.id === "competencyLevel") {
      return { ...f, options: ["O", "A", "PS", "PI", "FO"] };
    }
    return f;
  });
  customized.push(
    { id: "cf_anesthesia", label: "Anesthesia type", type: "radio", isRequired: true, isCustom: true, options: ["General", "Regional", "Local"] },
    { id: "cf_blood_loss", label: "Estimated blood loss", type: "text", isRequired: false, isCustom: true },
  );

  // Create a historical pending log BEFORE changing NICU -> SICU to verify backward-compat partial edits
  const historical = await request(runtime.base, path(), accounts.student0, "POST", {
    ...valid(),
    setting: "NICU",
  });
  assert.equal(historical.status, 201);

  const patchRes = await request(runtime.base, "/admin/department/procedure-fields", accounts.hod0, "PATCH", {
    fields: customized,
    applyRequiredToExisting: true,
    toggledRequiredIds: ["patientUhid"],
  });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.fields.find((f: { id: string }) => f.id === "setting").label, "Hospital Unit");

  // Catalog exposes customized fields + updated competencyLevels including "FO"
  const catalog = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, accounts.student0);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.procedureFields.some((f: { id: string }) => f.id === "cf_anesthesia"), true);
  assert.equal(catalog.body.competencyLevels.some((c: { value: string }) => c.value === "FO"), true);
  const proc = catalog.body.procedures.find((row: { id: number }) => row.id === procedureId);
  assert.equal(proc.requiredLogFields.includes("cf_anesthesia"), true);
  assert.equal(proc.requiredLogFields.includes("patientUhid"), false);

  // Old option NICU rejected for new entries; new option SICU + custom field accepted; optional UHID omitted -> stored "N/A"
  const rejectedNicu = await request(runtime.base, path(), accounts.student0, "POST", {
    ...valid(),
    setting: "NICU",
    customFields: { cf_anesthesia: "General" },
  });
  assert.equal(rejectedNicu.status, 400);

  const missingCustomReq = await request(runtime.base, path(), accounts.student0, "POST", {
    ...valid(),
    setting: "SICU",
    patientUhid: "",
  });
  assert.equal(missingCustomReq.status, 400);

  const createdDyn = await request(runtime.base, path(), accounts.student0, "POST", {
    ...valid(),
    setting: "SICU",
    patientUhid: "",
    competencyLevel: "FO",
    customFields: { cf_anesthesia: "Regional", cf_blood_loss: "150 mL" },
  });
  assert.equal(createdDyn.status, 201);
  assert.equal(createdDyn.body.setting, "SICU");
  assert.equal(createdDyn.body.patientUhid, "N/A");
  assert.deepEqual(createdDyn.body.customFields, { cf_anesthesia: "Regional", cf_blood_loss: "150 mL" });

  // Historical entry preserving untouched "NICU" can still be edited (e.g., adding cf_anesthesia + diagnosis)
  const histPatch = await request(runtime.base, `${path()}/${historical.body.id}`, accounts.student0, "PATCH", {
    diagnosis: "Updated indication",
    customFields: { cf_anesthesia: "General" },
  });
  assert.equal(histPatch.status, 200);
  assert.equal(histPatch.body.setting, "NICU");

  // Partial PATCH clearing an optional custom field via null preserves required custom fields
  const clearOptCustom = await request(runtime.base, `${path()}/${createdDyn.body.id}`, accounts.student0, "PATCH", {
    customFields: { cf_blood_loss: null },
  });
  assert.equal(clearOptCustom.status, 200);
  assert.deepEqual(clearOptCustom.body.customFields, { cf_anesthesia: "Regional" });

  // Faculty review queue exposes customFields & accepts new dynamic role code "FO"
  const queue = await request(runtime.base, `/professors/${accounts.faculty0.id}/review-queue`, accounts.faculty0);
  assert.equal(queue.status, 200);
  const queuedItem = queue.body.pendingReviews.find((item: { dbId: number; logType: string }) => item.logType === "procedure" && item.dbId === createdDyn.body.id);
  assert.deepEqual(queuedItem.customFields, { cf_anesthesia: "Regional" });
  const reviewFo = await request(runtime.base, `/logs/procedure/${createdDyn.body.id}/review`, accounts.faculty0, "PATCH", {
    status: "verified",
    facultyVerifiedLevel: "FO",
  });
  assert.equal(reviewFo.status, 200);
  assert.equal(reviewFo.body.facultyVerifiedLevel, "FO");

  // Non-Surgery department rejects customFields
  const nonSurgRes = await request(runtime.base, `/students/${accounts.student1.studentId}/procedure-logs`, accounts.student1, "POST", {
    procedureName: "Legacy synthetic procedure",
    procedureGroup: "Legacy group",
    date: "2026-11-07",
    patientAge: "40 years",
    patientUhid: "N/A",
    competencyLevel: "observed",
    customFields: { cf_anesthesia: "General" },
    supervisorId: accounts.faculty1.id,
  });
  assert.equal(nonSurgRes.status, 400);
});

test("Deleting a field removes it from procedure requirements and omits it for future logs", async () => {
  const current = await request(runtime.base, "/admin/department/procedure-fields", accounts.hod0, "GET");
  const withoutSexAndLoss = (current.body.fields as Array<{ id: string }>).filter((f) => f.id !== "sex" && f.id !== "cf_blood_loss");
  const patchRes = await request(runtime.base, "/admin/department/procedure-fields", accounts.hod0, "PATCH", {
    fields: withoutSexAndLoss,
  });
  assert.equal(patchRes.status, 200);

  const [procRow] = await db.select({ requiredLogFields: procedureTypesTable.requiredLogFields })
    .from(procedureTypesTable)
    .where(eq(procedureTypesTable.id, procedureId));
  assert.equal(procRow.requiredLogFields.includes("sex"), false);
  assert.equal(procRow.requiredLogFields.includes("cf_blood_loss"), false);

  const afterDelete = await request(runtime.base, path(), accounts.student0, "POST", {
    procedureName: "Synthetic procedure",
    procedureGroup: "Synthetic group",
    date: "2026-11-08",
    patientAge: "22 years",
    diagnosis: "Post-op check",
    setting: "SICU",
    competencyLevel: "O",
    customFields: { cf_anesthesia: "Local" },
    supervisorId: accounts.faculty0.id,
  });
  assert.equal(afterDelete.status, 201);
  assert.equal(afterDelete.body.sex, null);
  assert.equal(afterDelete.body.customFields.cf_blood_loss, undefined);
});
