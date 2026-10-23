import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setup, request, accounts, departmentIds } from "./support.js";
import { db, engine, departmentsTable, academicLogsTable } from "./database.js";
import { academicRecordText, readAcademicRecord, writeAcademicRecord, logbookSectionSettingsSchema,
  type LogbookSectionSettings } from "@workspace/api-zod";
import { categorySections, filterAcademicLogs } from "../../mockup-sandbox/src/lib/academic-navigation.js";

let runtime: Awaited<ReturnType<typeof setup>>;
const endpoint = "/admin/department/logbook-sections";
const settings = (): LogbookSectionSettings => ({ name: "Synthetic teaching section", categoryId: "teaching-learning", sortOrder: 4,
  years: [1, 2], topicLabel: "Teaching topic", multilineTopic: true, archived: false, required: 3, period: "total",
  participation: ["Attended", "Presented"], fields: [
    { key: "format", label: "Session format", type: "select", required: true, options: ["Group", "Individual"], group: "Session" },
    { key: "details", label: "Group details", type: "textarea", maxLength: 100, requiredWhen: { field: "format", value: "Group" } },
    { key: "total", label: "Total", type: "number", min: 0, required: true },
    { key: "count", label: "Count", type: "number", min: 0, max: 20, maximumField: "total", required: true },
    { key: "endDate", label: "End date", type: "date", notBeforeLogDate: true, required: true },
  ] });
const details = { format: "Group", details: "Synthetic detail", total: "10", count: "5", endDate: "2026-10-25" };
let value: string;
let revision: number;
let logId: number;
const logPath = () => `/students/${accounts.student2.studentId}/academic-logs`;
const entry = (values = details) => ({ activityType: value, topic: "Synthetic activity", date: "2026-10-23", presentationType: "Presented",
  supervisorId: accounts.faculty2.id, description: writeAcademicRecord(1, values, "Synthetic notes") });

before(async () => {
  runtime = await setup();
  await db.update(departmentsTable).set({ name: "Physiology", code: "PSI" }).where(eq(departmentsTable.id, departmentIds[2]));
});
after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

test("only HODs can read or change section settings", async () => {
  assert.equal((await request(runtime.base, endpoint)).status, 401);
  for (const caller of [accounts.faculty2, accounts.student2]) {
    assert.equal((await request(runtime.base, endpoint, caller)).status, 403);
    assert.equal((await request(runtime.base, endpoint, caller, "POST", settings())).status, 403);
  }
  const result = await request(runtime.base, endpoint, accounts.hod2);
  assert.equal(result.status, 200);
  assert.equal(result.body.sections.length, 22);
  assert.equal(result.body.categories.length, 5);
});

test("HOD creation persists every setting, maps navigation and updates targets", async () => {
  const created = await request(runtime.base, endpoint, accounts.hod2, "POST", settings());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  ({ value, revision } = created.body);
  const result = await request(runtime.base, endpoint, accounts.hod2);
  assert.deepEqual(result.body.sections.find((section: any) => section.value === value), { ...settings(), value, revision });
  const catalog = await request(runtime.base, `/departments/${departmentIds[2]}/catalog`, accounts.student2);
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.academicLogbook.navigationCategories.find((item: any) => item.id === "teaching-learning").sectionValues.includes(value));
  assert.equal(catalog.body.config.requiredAcademic, 8);
  assert.equal(catalog.body.config.requiredCases, 9);
  assert.equal(catalog.body.academics.find((item: any) => item.value === value).required, 3);
  assert.equal((await request(runtime.base, endpoint, accounts.hod2, "POST", settings())).status, 400);
});

test("section edits enforce authentication, actual department, successful owner and nonexistent value", async () => {
  const path = `${endpoint}/${value}`;
  const body = { definition: settings(), revision };
  for (const [label, caller, route, expected] of [
    ["unauthenticated", undefined, path, 401], ["wrong department", accounts.hod1, path, 403],
    ["correct department", accounts.hod2, path, 200], ["nonexistent", accounts.hod2, `${endpoint}/logbook-missing`, 404],
  ] as const) {
    const response = await request(runtime.base, route, caller, "PATCH", body);
    assert.equal(response.status, expected, label);
    console.log(JSON.stringify({ case: label, request: { method: "PATCH", path: route, body }, response: { status: response.status, body: response.body } }));
    if (expected === 200) revision = response.body.revision;
  }
  assert.equal((await request(runtime.base, path, accounts.hod2, "PATCH", body)).status, 409);
});

test("definition validation rejects broken rules, unknown settings and invalid years", async () => {
  for (const definition of [
    { ...settings(), years: [] }, { ...settings(), years: [4] }, { ...settings(), departmentId: departmentIds[1] },
    { ...settings(), fields: [{ key: "format", label: "Format", type: "select" }] },
    { ...settings(), fields: [{ key: "count", label: "Count", type: "number", min: 4, max: 2 }] },
    { ...settings(), fields: [{ key: "count", label: "Count", type: "number", maximumField: "missing" }] },
    { ...settings(), fields: [{ key: "details", label: "Details", type: "text", requiredWhen: { field: "missing", value: "Yes" } }] },
    { ...settings(), fields: [{ key: "count", label: "Count", type: "text", min: 1 }] },
  ]) assert.equal((await request(runtime.base, endpoint, accounts.hod2, "POST", definition)).status, 400);
  assert.equal((await request(runtime.base, endpoint, accounts.hod2, "POST", { ...settings(), name: "Other section", categoryId: "missing" })).status, 400);
  assert.equal(logbookSectionSettingsSchema.safeParse({ ...settings(), fields: [{ key: "offset", label: "Offset", type: "number", min: -10, max: 10 }] }).success, true);
});

test("resident submissions use server definitions, validate every rule and reject invalid reviewers", async () => {
  const created = await request(runtime.base, logPath(), accounts.student2, "POST", entry());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  logId = created.body.id;
  assert.equal(readAcademicRecord(created.body.description)?.sectionSnapshot?.name, settings().name);
  for (const changed of [ { ...details, details: "" }, { ...details, format: " Group ", details: "" }, { ...details, count: "11" }, { ...details, count: "21" },
    { ...details, count: "-1" }, { ...details, endDate: "2026-10-01" }, { ...details, format: "Unknown" },
    { ...details, details: "x".repeat(101) }, { ...details, unexpected: "value" } ]) {
    assert.equal((await request(runtime.base, logPath(), accounts.student2, "POST", entry(changed))).status, 400);
  }
  assert.equal((await request(runtime.base, logPath(), accounts.student2, "POST", { ...entry(), description: writeAcademicRecord(3, details, "") })).status, 400);
  assert.equal((await request(runtime.base, logPath(), accounts.student2, "POST", { ...entry(), supervisorId: accounts.faculty1.id })).status, 400);
  const forged = writeAcademicRecord(1, { ...details, details: "" }, "", { value, years: [1], topicLabel: "Forged", fields: [] });
  assert.equal((await request(runtime.base, logPath(), accounts.student2, "POST", { ...entry(), description: forged })).status, 400);
});

test("renaming and removing fields preserve historical form labels and editable pending entries", async () => {
  const changed = { ...settings(), name: "Renamed teaching section", fields: [], participation: undefined, years: [3] };
  const response = await request(runtime.base, `${endpoint}/${value}`, accounts.hod2, "PATCH", { definition: changed, revision });
  assert.equal(response.status, 200);
  revision = response.body.revision;
  const updated = await request(runtime.base, `${logPath()}/${logId}`, accounts.student2, "PATCH", { topic: "Updated synthetic activity" });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.match(academicRecordText(updated.body.description), /Session format: Group/);
  assert.match(academicRecordText(updated.body.description), /Group details: Synthetic detail/);
  const queue = await request(runtime.base, `/professors/${accounts.faculty2.id}/review-queue`, accounts.faculty2);
  const item = queue.body.pendingReviews.find((item: any) => item.dbId === logId && item.logType === "academic");
  assert.match(item.title, /^Renamed teaching section:/);
  assert.equal((await request(runtime.base, `/logs/academic/${logId}/review`, accounts.faculty2, "PATCH", { status: "verified" })).status, 200);
  assert.equal((await request(runtime.base, `${logPath()}/${logId}`, accounts.student2, "PATCH", { topic: "Cannot edit" })).status, 400);
});

test("archive stops new submissions, retains visible history and removes targets", async () => {
  const response = await request(runtime.base, `${endpoint}/${value}`, accounts.hod2, "PATCH", { definition: { ...settings(), archived: true }, revision });
  assert.equal(response.status, 200);
  revision = response.body.revision;
  assert.equal((await request(runtime.base, logPath(), accounts.student2, "POST", entry())).status, 400);
  const catalog = await request(runtime.base, `/departments/${departmentIds[2]}/catalog`, accounts.student2);
  assert.equal(catalog.body.config.requiredAcademic, 5);
  assert.ok(!categorySections(catalog.body.academicLogbook, "teaching-learning").some((section) => section.value === value));
  assert.equal(filterAcademicLogs([{ activityType: value }], catalog.body.academicLogbook, "teaching-learning").length, 1);
  const option = catalog.body.academics.find((item: any) => item.value === value);
  assert.equal((await request(runtime.base, `/admin/department/catalog/${option.id}`, accounts.hod2, "DELETE")).status, 409);
  assert.equal((await request(runtime.base, `/admin/department/catalog/${option.id}`, accounts.hod2, "PATCH", { required: 99, period: "total" })).status, 409);
  const unarchived = await request(runtime.base, `${endpoint}/${value}`, accounts.hod2, "PATCH", { definition: settings(), revision });
  assert.equal(unarchived.status, 200);
  revision = unarchived.body.revision;
});

test("concurrent updates detect stale revisions", async () => {
  const results = await Promise.all([1, 2].map((sortOrder) => request(runtime.base, `${endpoint}/${value}`, accounts.hod2, "PATCH", { definition: { ...settings(), sortOrder }, revision })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
});

test("mirrored departments inherit definitions and cannot change them", async () => {
  await db.update(departmentsTable).set({ configSourceDepartmentId: departmentIds[2], isTest: true }).where(eq(departmentsTable.id, departmentIds[0]));
  const mirrored = await request(runtime.base, endpoint, accounts.hod0);
  assert.equal(mirrored.body.readOnly, true);
  assert.ok(mirrored.body.sections.some((section: any) => section.value === value));
  assert.equal((await request(runtime.base, endpoint, accounts.hod0, "POST", settings())).status, 403);
  assert.equal((await request(runtime.base, `${endpoint}/${value}`, accounts.hod0, "PATCH", { definition: settings(), revision })).status, 403);
  assert.equal((await request(runtime.base, `/students/${accounts.student0.studentId}/academic-logs`, accounts.student0, "POST", { ...entry(), supervisorId: accounts.faculty0.id })).status, 201);
});

test("departments without a built-in profile can add sections without losing their existing academic choices", async () => {
  const created = await request(runtime.base, endpoint, accounts.hod1, "POST", settings());
  assert.equal(created.status, 201);
  const catalog = await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, accounts.student1);
  assert.equal(catalog.body.academicLogbook.sections.length, 1);
  assert.ok(catalog.body.academicLogbook.navigationCategories[0].sectionValues.includes("discussion-1"));
  const other = await request(runtime.base, endpoint, accounts.hod2);
  assert.ok(!other.body.sections.some((section: any) => section.value === created.body.value));
});

test("built-in sections with slashes can be edited while old snapshotless entries retain their original form", async () => {
  const builtinValue = "Practical procedures / classes in the department";
  const [legacy] = await db.insert(academicLogsTable).values({ studentId: accounts.student2.studentId!, supervisorId: accounts.faculty2.id,
    activityType: builtinValue, topic: "Synthetic legacy activity", date: "2026-10-23", presentationType: "Attended", description: writeAcademicRecord(1, {}, "Legacy notes"), status: "pending" }).returning();
  const list = await request(runtime.base, endpoint, accounts.hod2);
  const { value: originalValue, revision: originalRevision, ...definition } = list.body.sections.find((section: any) => section.value === builtinValue);
  const saved = await request(runtime.base, `${endpoint}/${encodeURIComponent(builtinValue)}`, accounts.hod2, "PATCH", {
    definition: { ...definition, name: "Renamed practical section", years: [3], fields: [{ key: "newDetail", label: "New required detail", type: "text", required: true }] }, revision: originalRevision,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.value, builtinValue);
  const edited = await request(runtime.base, `${logPath()}/${legacy.id}`, accounts.student2, "PATCH", { topic: "Updated legacy activity" });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual(readAcademicRecord(edited.body.description)?.sectionSnapshot?.fields, []);
  assert.equal(readAcademicRecord(edited.body.description)?.trainingYear, 1);
});

test("malformed client snapshots are ignored when reading records", () => {
  for (const invalid of [{ participation: {} }, { participation: false }, { fields: [{ key: "details", label: "Details", type: "select", options: false }] }]) {
    const malformed = JSON.stringify({ format: "department-logbook-v1", trainingYear: 1, notes: "", values: { details: "Preserved value" },
      sectionSnapshot: { value: "custom", topicLabel: "Topic", years: [1], fields: [], ...invalid } });
    assert.equal(readAcademicRecord(malformed)?.sectionSnapshot, undefined);
    assert.match(academicRecordText(malformed), /details: Preserved value/);
  }
});
