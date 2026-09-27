import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { setup, departmentIds } from "./support.js";
import { engine, db, departmentsTable, departmentConfigsTable, departmentCatalogTable, departmentPostingScheduleTable } from "./database.js";
import { applyDepartmentTemplate, departmentTemplateSchema } from "../src/lib/department-template.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let radiology: ReturnType<typeof departmentTemplateSchema.parse>;
let radiologyId: number;

before(async () => {
  runtime = await setup();
  radiology = departmentTemplateSchema.parse(JSON.parse(await readFile(new URL("../scripts/department-templates/radiology.json", import.meta.url), "utf8")));
  const [department] = await db.insert(departmentsTable).values({ name: "Radiology", code: "TEST-RAD" }).returning();
  radiologyId = department.id;
  await db.insert(departmentConfigsTable).values({ departmentId: radiologyId, enabledFeatures: { procedureExperience: true, keepMe: true } });
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const catalogCount = (kind: "posting" | "academic" | "clinical_work_category") => db.select().from(departmentCatalogTable)
  .where(and(eq(departmentCatalogTable.departmentId, radiologyId), eq(departmentCatalogTable.kind, kind))).then((rows) => rows.length);

test("the radiology template matches the requested lists", () => {
  const names = (kind: string) => radiology.catalog.filter((item) => item.kind === kind).map((item) => item.name);
  assert.equal(names("clinical_work_category").length, 13);
  assert.equal(names("academic").length, 10);
  assert.equal(names("posting").length, 7);
  const months = (year: number) => radiology.postingSchedule.filter((row) => row.trainingYear === year).reduce((sum, row) => sum + row.months, 0);
  assert.deepEqual([months(1), months(2), months(3)], [12, 12, 12]);
  assert.deepEqual(radiology.features, { hideCaseLogs: true, hideProcedureLogs: true, clinicalWorks: true });
});

test("a template whose schedule names a posting it does not define is rejected", () => {
  const bad = departmentTemplateSchema.safeParse({ catalog: [{ kind: "posting", name: "A" }], postingSchedule: [{ trainingYear: 1, posting: "B", months: 1 }] });
  assert.equal(bad.success, false);
});

test("a dry run reports the changes and saves nothing", async () => {
  const result = await applyDepartmentTemplate({ departmentId: radiologyId, expectName: "Radiology", template: radiology, apply: false });
  assert.equal(result.applied, false);
  assert.equal(result.catalogAdded, 30);
  assert.equal(result.scheduleRowsWritten, 12);
  assert.equal(result.featuresAfter.clinicalWorks, true);
  assert.equal(await catalogCount("posting"), 0);
  const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, radiologyId));
  assert.deepEqual(config.enabledFeatures, { procedureExperience: true, keepMe: true });
});

test("applying merges flags without dropping existing ones and loads the catalog and schedule", async () => {
  const result = await applyDepartmentTemplate({ departmentId: radiologyId, expectName: "Radiology", template: radiology, apply: true });
  assert.equal(result.applied, true);
  assert.deepEqual(result.featuresAfter, { procedureExperience: true, keepMe: true, hideCaseLogs: true, hideProcedureLogs: true, clinicalWorks: true });
  assert.equal(await catalogCount("clinical_work_category"), 13);
  assert.equal(await catalogCount("academic"), 10);
  assert.equal(await catalogCount("posting"), 7);
  const schedule = await db.select().from(departmentPostingScheduleTable).where(eq(departmentPostingScheduleTable.departmentId, radiologyId));
  assert.equal(schedule.length, 12);
});

test("applying twice changes nothing more", async () => {
  const result = await applyDepartmentTemplate({ departmentId: radiologyId, expectName: "Radiology", template: radiology, apply: true });
  assert.equal(result.catalogAdded, 0);
  assert.equal(result.catalogAlreadyPresent, 30);
  assert.equal(await catalogCount("posting"), 7);
  const schedule = await db.select().from(departmentPostingScheduleTable).where(eq(departmentPostingScheduleTable.departmentId, radiologyId));
  assert.equal(schedule.length, 12);
});

test("a single flag can be set for another department, keeping its other flags", async () => {
  const [before] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
  const result = await applyDepartmentTemplate({ departmentId: departmentIds[0], expectName: "Pediatrics", set: { splitThesisAndCertifications: true }, apply: true });
  assert.deepEqual(result.featuresAfter, { ...(before.enabledFeatures as object), splitThesisAndCertifications: true });
  assert.equal(result.catalogAdded, 0);
});

test("a wrong expected name aborts and changes nothing", async () => {
  await assert.rejects(applyDepartmentTemplate({ departmentId: departmentIds[1], expectName: "Radiology", set: { clinicalWorks: true }, apply: true }), /not "Radiology"/);
  const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentIds[1]));
  assert.equal((config.enabledFeatures as Record<string, boolean>).clinicalWorks, undefined);
});

test("a test department that mirrors another is refused", async () => {
  const [mirror] = await db.insert(departmentsTable).values({ name: "Radiology Test", code: "TEST-RAD-M", isTest: true, configSourceDepartmentId: radiologyId }).returning();
  await assert.rejects(applyDepartmentTemplate({ departmentId: mirror.id, expectName: "Radiology Test", template: radiology, apply: true }), /mirrors another/);
});

test("a nonexistent department is refused", async () => {
  await assert.rejects(applyDepartmentTemplate({ departmentId: 999999, expectName: "Radiology", template: radiology, apply: true }), /does not exist/);
});
