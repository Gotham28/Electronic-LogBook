import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds } from "./support.js";
import { engine, db, departmentConfigsTable, departmentCatalogTable, clinicalWorkLogsTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
// Fixture index 2 has Clinical Works switched on; index 0 does not.
const on = 2;
const off = 0;

before(async () => {
  runtime = await setup();
  await db.update(departmentConfigsTable).set({ enabledFeatures: { procedureExperience: true, clinicalWorks: true, hideCaseLogs: true, hideProcedureLogs: true } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[on]));
  await db.insert(departmentCatalogTable).values([
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "CT scan", value: "ct_scan" },
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "Mammogram", value: "mammogram" },
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "MRI scan", value: "mri_scan" },
    { departmentId: departmentIds[on], kind: "clinical_work_subtype", name: "Chest", value: "ct_scan::chest", parentValue: "ct_scan" },
    { departmentId: departmentIds[on], kind: "clinical_work_subtype", name: "Brain", value: "mri_scan::brain", parentValue: "mri_scan" },
    { departmentId: departmentIds[off], kind: "clinical_work_category", name: "CT scan", value: "ct_scan" },
  ]);
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a, method = "GET", body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

// Evidence for AGENTS.md §11: request line, status and response message/id only. No patient fields.
function evidence(t: TestContext, label: string, method: string, path: string, who: string, res: { status: number; body: any }) {
  const summary = res.body?.message !== undefined ? { message: res.body.message } : { id: res.body?.id, status: res.body?.status };
  t.diagnostic(`${label}: ${method} /api${path} as ${who} -> ${res.status} ${JSON.stringify(summary)}`);
}

const entry = (overrides: Record<string, unknown> = {}) => ({ supervisorId: a[`faculty${on}`].id, date: "2026-09-01",
  category: "ct_scan", subType: "ct_scan::chest", patientAge: "54", patientSex: "female", caseNumber: "TEST-CW-1", ...overrides });

async function createEntry(overrides: Record<string, unknown> = {}) {
  const res = await call(`/students/${a[`student${on}`].studentId}/clinical-works`, `student${on}`, "POST", entry(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as number;
}

test("POST clinical-works: 401 / 403 / 201 / nonexistent student", async (t) => {
  const own = `/students/${a[`student${on}`].studentId}/clinical-works`;
  let res = await call(own, undefined, "POST", entry());
  evidence(t, "unauthenticated", "POST", own, "nobody", res);
  assert.equal(res.status, 401);

  res = await call(own, `student2${on}` as any, "POST", entry());
  evidence(t, "wrong owner (another student, same department)", "POST", own, `student2${on}`, res);
  assert.equal(res.status, 403);

  res = await call(own, `faculty${on}`, "POST", entry());
  evidence(t, "wrong owner (faculty writing a student's log)", "POST", own, `faculty${on}`, res);
  assert.equal(res.status, 403);

  res = await call(own, `student${on}`, "POST", entry());
  evidence(t, "correct owner", "POST", own, `student${on}`, res);
  assert.equal(res.status, 201);
  assert.equal(res.body.status, "pending");
  assert.equal(res.body.subType, "ct_scan::chest");

  // A nonexistent student id returns 403 from studentAccess, the same as another department's
  // student, so ids cannot be probed. There is no row to 404 on for a create.
  const missing = "/students/999999/clinical-works";
  res = await call(missing, `student${on}`, "POST", entry());
  evidence(t, "nonexistent student (403 by design)", "POST", missing, `student${on}`, res);
  assert.equal(res.status, 403);
});

test("POST clinical-works is refused when the department has not switched it on", async () => {
  const res = await call(`/students/${a[`student${off}`].studentId}/clinical-works`, `student${off}`, "POST",
    entry({ supervisorId: a[`faculty${off}`].id, subType: undefined }));
  assert.equal(res.status, 403);
});

test("category and sub-type rules", async () => {
  const path = `/students/${a[`student${on}`].studentId}/clinical-works`;
  const post = (body: Record<string, unknown>) => call(path, `student${on}`, "POST", entry(body));
  assert.equal((await post({ subType: undefined })).status, 400, "sub-type required when the category has sub-types");
  assert.equal((await post({ subType: "mri_scan::brain" })).status, 400, "sub-type from another category");
  assert.equal((await post({ category: "mammogram", subType: undefined })).status, 201, "category without sub-types saves without one");
  assert.equal((await post({ category: "mammogram", subType: "ct_scan::chest" })).status, 400, "category without sub-types rejects one");
  assert.equal((await post({ category: "not_a_category" })).status, 400, "unknown category");
  assert.equal((await post({ supervisorId: a[`faculty${off}`].id })).status, 400, "supervisor from another department");
  for (const field of ["date", "category", "patientAge", "patientSex", "caseNumber", "supervisorId"]) {
    assert.equal((await post({ [field]: undefined })).status, 400, `${field} is required`);
  }
});

test("PATCH clinical-works: 401 / 403 / 200 / 404", async (t) => {
  const id = await createEntry();
  const path = `/students/${a[`student${on}`].studentId}/clinical-works/${id}`;
  let res = await call(path, undefined, "PATCH", { caseNumber: "TEST-CW-2" });
  evidence(t, "unauthenticated", "PATCH", path, "nobody", res);
  assert.equal(res.status, 401);

  res = await call(path, `student2${on}` as any, "PATCH", { caseNumber: "TEST-CW-2" });
  evidence(t, "wrong owner", "PATCH", path, `student2${on}`, res);
  assert.equal(res.status, 403);

  res = await call(path, `student${on}`, "PATCH", { caseNumber: "TEST-CW-2", category: "mri_scan", subType: "mri_scan::brain" });
  evidence(t, "correct owner", "PATCH", path, `student${on}`, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.caseNumber, "TEST-CW-2");
  assert.equal(res.body.subType, "mri_scan::brain");

  const missing = `/students/${a[`student${on}`].studentId}/clinical-works/999999`;
  res = await call(missing, `student${on}`, "PATCH", { caseNumber: "TEST-CW-3" });
  evidence(t, "nonexistent row", "PATCH", missing, `student${on}`, res);
  assert.equal(res.status, 404);
});

test("PATCH changing the category clears a stale sub-type and re-checks it", async () => {
  const id = await createEntry();
  const path = `/students/${a[`student${on}`].studentId}/clinical-works/${id}`;
  const toMammogram = await call(path, `student${on}`, "PATCH", { category: "mammogram" });
  assert.equal(toMammogram.status, 200);
  assert.equal(toMammogram.body.subType, null);
  const toMriWithoutSubtype = await call(path, `student${on}`, "PATCH", { category: "mri_scan" });
  assert.equal(toMriWithoutSubtype.status, 400);
});

test("DELETE clinical-works: 401 / 403 / 200 / 404, and a deleted row cannot be edited", async (t) => {
  const id = await createEntry();
  const path = `/students/${a[`student${on}`].studentId}/clinical-works/${id}`;
  let res = await call(path, undefined, "DELETE");
  evidence(t, "unauthenticated", "DELETE", path, "nobody", res);
  assert.equal(res.status, 401);

  res = await call(path, `student2${on}` as any, "DELETE");
  evidence(t, "wrong owner", "DELETE", path, `student2${on}`, res);
  assert.equal(res.status, 403);

  res = await call(path, `student${on}`, "DELETE");
  evidence(t, "correct owner", "DELETE", path, `student${on}`, res);
  assert.equal(res.status, 200);

  res = await call(path, `student${on}`, "DELETE");
  evidence(t, "nonexistent row (already deleted)", "DELETE", path, `student${on}`, res);
  assert.equal(res.status, 404);

  assert.equal((await call(path, `student${on}`, "PATCH", { caseNumber: "TEST-CW-4" })).status, 404);
});

test("faculty review: only the named supervisor or the HOD can verify, and verified rows are locked", async (t) => {
  const id = await createEntry();
  const path = `/logs/clinical_work/${id}/review`;
  let res = await call(path, undefined, "PATCH", { status: "verified" });
  evidence(t, "unauthenticated", "PATCH", path, "nobody", res);
  assert.equal(res.status, 401);

  res = await call(path, `faculty2${on}` as any, "PATCH", { status: "verified" });
  evidence(t, "wrong reviewer (not the named supervisor)", "PATCH", path, `faculty2${on}`, res);
  assert.equal(res.status, 403);

  res = await call(path, `faculty${off}`, "PATCH", { status: "verified" });
  evidence(t, "wrong reviewer (other department)", "PATCH", path, `faculty${off}`, res);
  assert.equal(res.status, 403);

  res = await call(path, `faculty${on}`, "PATCH", { status: "verified", comments: "Good" });
  evidence(t, "named supervisor", "PATCH", path, `faculty${on}`, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "verified");

  // SEC-34: a nonexistent id answers exactly like a row the reviewer does not own.
  const missing = "/logs/clinical_work/999999/review";
  res = await call(missing, `faculty${on}`, "PATCH", { status: "verified" });
  evidence(t, "nonexistent row (403 by design, SEC-34)", "PATCH", missing, `faculty${on}`, res);
  assert.equal(res.status, 403);

  const studentPath = `/students/${a[`student${on}`].studentId}/clinical-works/${id}`;
  assert.equal((await call(studentPath, `student${on}`, "PATCH", { caseNumber: "TEST-CW-5" })).status, 400);
  assert.equal((await call(studentPath, `student${on}`, "DELETE")).status, 400);
});

test("rejected entries can be edited and go back to pending with remarks cleared", async () => {
  const id = await createEntry();
  assert.equal((await call(`/logs/clinical_work/${id}/review`, `hod${on}`, "PATCH", { status: "rejected", comments: "Fix case number" })).status, 200);
  const res = await call(`/students/${a[`student${on}`].studentId}/clinical-works/${id}`, `student${on}`, "PATCH", { caseNumber: "TEST-CW-6" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "pending");
  assert.equal(res.body.facultyRemarks, null);
});

test("logbook read: owner and HOD see all entries, a professor sees only entries they supervise", async () => {
  const mine = await createEntry();
  const other = await createEntry({ supervisorId: a[`faculty2${on}`].id });
  const path = `/students/${a[`student${on}`].studentId}/logs`;
  const ids = (res: any) => res.body.clinicalWorkLogs.map((row: any) => row.id);
  const owner = await call(path, `student${on}`);
  assert.equal(owner.status, 200);
  assert.ok(ids(owner).includes(mine) && ids(owner).includes(other));
  const hod = await call(path, `hod${on}`);
  assert.ok(ids(hod).includes(mine) && ids(hod).includes(other));
  const prof = await call(path, `faculty${on}`);
  assert.ok(ids(prof).includes(mine));
  assert.ok(!ids(prof).includes(other));
  assert.equal((await call(path, `student${off}`)).status, 403);
});

test("review queue lists pending clinical works with category names", async () => {
  const id = await createEntry();
  const res = await call(`/professors/${a[`faculty${on}`].id}/review-queue`, `faculty${on}`);
  assert.equal(res.status, 200);
  const item = res.body.pendingReviews.find((row: any) => row.logType === "clinical_work" && row.dbId === id);
  assert.ok(item);
  assert.equal(item.title, "CT scan — Chest");
});

test("dashboard follows the department switches", async () => {
  const flagged = await call(`/students/${a[`student${on}`].studentId}/dashboard`, `student${on}`);
  assert.equal(flagged.status, 200);
  const flaggedIds = flagged.body.categories.map((c: any) => c.id);
  assert.deepEqual(flaggedIds, ["clinicalWorks", "academics"]);
  const plain = await call(`/students/${a[`student${off}`].studentId}/dashboard`, `student${off}`);
  assert.deepEqual(plain.body.categories.map((c: any) => c.id), ["cases", "procedures", "academics"]);
});

test("department catalog returns clinical work categories and sub-types", async () => {
  const res = await call(`/departments/${departmentIds[on]}/catalog`, `student${on}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.clinicalWorkCategories.length, 3);
  assert.equal(res.body.clinicalWorkSubtypes.length, 2);
  assert.equal(res.body.clinicalWorkSubtypes[0].parentValue !== undefined, true);
});

test("HOD adds sub-types under a category; bad parents, wrong kinds and in-use categories are refused", async () => {
  const add = (body: Record<string, unknown>, who: keyof typeof a = `hod${on}`) =>
    call("/admin/department/catalog", who, "POST", { required: 0, period: "total", ...body });
  const created = await add({ kind: "clinical_work_subtype", name: "Abdomen", value: "abdomen", parentValue: "ct_scan" });
  assert.equal(created.status, 201);
  assert.equal(created.body.value, "ct_scan::abdomen");
  assert.equal(created.body.parentValue, "ct_scan");
  const sameNameOtherCategory = await add({ kind: "clinical_work_subtype", name: "Abdomen", value: "abdomen", parentValue: "mri_scan" });
  assert.equal(sameNameOtherCategory.status, 201);
  assert.equal((await add({ kind: "clinical_work_subtype", name: "X", value: "x" })).status, 400, "missing parent");
  assert.equal((await add({ kind: "clinical_work_subtype", name: "X", value: "x", parentValue: "nope" })).status, 400, "unknown parent");
  assert.equal((await add({ kind: "clinical_work_subtype", name: "X", value: "x", parentValue: "mri_scan" }, `hod${off}`)).status, 400,
    "parent that exists only in another department");
  assert.equal((await add({ kind: "academic", name: "X", value: "x", parentValue: "ct_scan" })).status, 400, "parent on a non-sub-type");
  assert.equal((await add({ kind: "clinical_work_subtype", name: "X", value: "x", parentValue: "ct_scan" }, `faculty${on}`)).status, 403);

  const [category] = await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.value, "ct_scan"))
    .then((rows) => rows.filter((row) => row.departmentId === departmentIds[on]));
  const blocked = await call(`/admin/department/catalog/${category.id}`, `hod${on}`, "DELETE");
  assert.equal(blocked.status, 409);

  const usage = await call(`/admin/department/catalog/${category.id}/usage-count`, `hod${on}`);
  assert.equal(usage.status, 200);
  assert.ok(Number(usage.body.count) > 0);
});

test("the database refuses a sub-type without a parent and a parent on any other kind", async () => {
  await assert.rejects(db.insert(departmentCatalogTable).values({ departmentId: departmentIds[on], kind: "clinical_work_subtype", name: "Bad", value: "bad" }));
  await assert.rejects(db.insert(departmentCatalogTable).values({ departmentId: departmentIds[on], kind: "posting", name: "Bad", value: "bad", parentValue: "ct_scan" }));
});

test("HOD hard-delete of a student removes their clinical work logs", async () => {
  const studentUser = a[`student2${on}` as keyof typeof a];
  const res = await call(`/students/${studentUser.studentId}/clinical-works`, `student2${on}` as any, "POST",
    entry({ caseNumber: "TEST-CW-DEL" }));
  assert.equal(res.status, 201);
  const del = await call(`/admin/users/${studentUser.id}/hard`, `hod${on}`, "DELETE");
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.deletedRecords.clinicalWorkLogs, 1);
  const left = await db.select().from(clinicalWorkLogsTable).where(eq(clinicalWorkLogsTable.studentId, studentUser.studentId!));
  assert.equal(left.length, 0);
});
