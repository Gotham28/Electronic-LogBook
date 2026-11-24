import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { setup, request, accounts, departmentIds, type Account } from "./support.js";
import { db, engine, auditTable, departmentsTable, departmentConfigsTable, usersTable, studentsTable, getTestCollegeId } from "./database.js";
import { DEPARTMENT_SETTING_TIERS } from "@workspace/api-zod";
import { setDepartmentSetting, DepartmentSettingError } from "../src/lib/department-settings.js";

let runtime: Awaited<ReturnType<typeof setup>>;
const endpoint = "/admin/department/config/settings";
const features = async (departmentId: number) => (await db.select().from(departmentConfigsTable)
  .where(eq(departmentConfigsTable.departmentId, departmentId)))[0]?.enabledFeatures;
const auditRows = (departmentId: number) => db.select().from(auditTable)
  .where(and(eq(auditTable.tableName, "department_configs"), eq(auditTable.recordId, String(departmentId))));
// Prints the request and the response so the §11 evidence can be pasted from this run.
async function show(label: string, path: string, caller: Account | undefined, method: string, body?: unknown) {
  const response = await request(runtime.base, path, caller, method, body);
  console.log(JSON.stringify({ case: label, request: { method, path: "/api" + path, ...(body === undefined ? {} : { body }) },
    response: { status: response.status, body: response.body } }));
  return response;
}
async function makeAccount(departmentId: number, role: "hod" | "professor" | "student", email: string): Promise<Account> {
  const [user] = await db.insert(usersTable).values({ fullName: "Synthetic " + role, email, role, status: "approved", departmentId,
    passwordHash: "test-hash" }).returning();
  return { id: user.id, email, role, departmentId, token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
}

before(async () => {
  runtime = await setup();
  // Department A (index 0) and department B (index 1) get known, different stored settings.
  await db.update(departmentConfigsTable).set({ enabledFeatures: { procedureExperience: true, hideCaseLogs: false } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
  await db.update(departmentConfigsTable).set({ enabledFeatures: { awards: true } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[1]));
});
after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

test("PATCH §11 cases: 401, wrong role 403, HOD 200 with other keys and other department untouched, unknown key 400", async () => {
  const path = `${endpoint}/academicsFirstInNav`;
  const body = { value: true, expectedValue: null };
  const departmentBBefore = await features(departmentIds[1]);
  assert.equal((await show("PATCH unauthenticated", path, undefined, "PATCH", body)).status, 401);
  assert.equal((await show("PATCH professor (wrong role)", path, accounts.faculty0, "PATCH", body)).status, 403);
  assert.equal((await show("PATCH student (wrong role)", path, accounts.student0, "PATCH", body)).status, 403);
  assert.deepEqual(await features(departmentIds[0]), { procedureExperience: true, hideCaseLogs: false }, "rejected calls wrote nothing");
  const ok = await show("PATCH HOD of department A", path, accounts.hod0, "PATCH", body);
  assert.equal(ok.status, 200);
  assert.deepEqual({ key: ok.body.key, before: ok.body.before, after: ok.body.after }, { key: "academicsFirstInNav", before: null, after: true });
  assert.equal(typeof ok.body.auditId, "string");
  assert.deepEqual(await features(departmentIds[0]), { procedureExperience: true, hideCaseLogs: false, academicsFirstInNav: true });
  assert.deepEqual(await features(departmentIds[1]), departmentBBefore, "department B row is unchanged");
  const missing = await show("PATCH nonexistent key", `${endpoint}/notAKey`, accounts.hod0, "PATCH", body);
  assert.equal(missing.status, 400);
  // The other department's HOD cannot reach department A: the department comes only from the token.
  // HOD B writes a value that DIFFERS from A's stored value for the same key (A holds true, B writes false),
  // with B's own correct expectedValue (null: B has no stored value), so a write that leaked into A would show.
  const departmentABefore = await features(departmentIds[0]);
  assert.equal(departmentABefore!.academicsFirstInNav, true);
  const other = await show("PATCH HOD of department B, same key, different value", path, accounts.hod1, "PATCH", { value: false, expectedValue: null });
  assert.equal(other.status, 200);
  assert.deepEqual({ before: other.body.before, after: other.body.after }, { before: null, after: false });
  assert.deepEqual(await features(departmentIds[0]), departmentABefore, "department A's whole row is unchanged by HOD B");
  assert.deepEqual(await features(departmentIds[1]), { ...departmentBBefore, academicsFirstInNav: false });
});

test("PATCH rejects a body departmentId, unknown fields and non-boolean values with 400", async () => {
  const path = `${endpoint}/useCaseTypeLabel`;
  const before = await features(departmentIds[0]);
  for (const [label, body] of [
    ["body departmentId", { value: true, expectedValue: null, departmentId: departmentIds[1] }],
    ["unknown field", { value: true, expectedValue: null, extra: 1 }],
    ["string value", { value: "yes", expectedValue: null }],
    ["missing expectedValue", { value: true }],
    ["numeric expectedValue", { value: true, expectedValue: 1 }],
  ] as const) assert.equal((await show(label, path, accounts.hod0, "PATCH", body)).status, 400, label);
  assert.deepEqual(await features(departmentIds[0]), before);
  assert.deepEqual(await features(departmentIds[1]), { awards: true, academicsFirstInNav: false });
});

test("GET §11 cases: 401, wrong role 403, HOD 200 returns only the caller's department values", async () => {
  assert.equal((await show("GET unauthenticated", endpoint, undefined, "GET")).status, 401);
  assert.equal((await show("GET professor (wrong role)", endpoint, accounts.faculty0, "GET")).status, 403);
  assert.equal((await show("GET student (wrong role)", endpoint, accounts.student0, "GET")).status, 403);
  const a = await request(runtime.base, endpoint, accounts.hod0);
  const b = await request(runtime.base, endpoint, accounts.hod1);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  console.log(JSON.stringify({ case: "GET HOD of department A (values that differ from B)", request: { method: "GET", path: "/api" + endpoint },
    response: { status: a.status, body: a.body.filter((row: any) => row.value !== null) } }));
  const value = (rows: any[], key: string) => rows.find((row) => row.key === key).value;
  assert.deepEqual(a.body.map((row: any) => row.key), Object.keys(DEPARTMENT_SETTING_TIERS));
  assert.ok(a.body.every((row: any) => row.valueType === "boolean" && row.tier === DEPARTMENT_SETTING_TIERS[row.key as keyof typeof DEPARTMENT_SETTING_TIERS]));
  assert.equal(value(a.body, "hideCaseLogs"), false);
  assert.equal(value(a.body, "awards"), null, "department B's awards value is not visible to department A");
  assert.equal(value(b.body, "awards"), true);
  assert.equal(value(b.body, "hideCaseLogs"), null, "department A's hideCaseLogs value is not visible to department B");
  assert.equal(a.body.some((row: any) => row.key === "keepExistingFlag"), false, "keys outside the allowlist are not listed");
});

test("a stale expectedValue returns 409 and leaves the stored value unchanged", async () => {
  const path = `${endpoint}/hideCaseLogs`;
  const stale = await show("PATCH stale expectedValue", path, accounts.hod0, "PATCH", { value: true, expectedValue: true });
  assert.equal(stale.status, 409);
  assert.equal((await features(departmentIds[0]))!.hideCaseLogs, false);
  const unsetStale = await show("PATCH expectedValue null but a value is stored", path, accounts.hod0, "PATCH", { value: true, expectedValue: null });
  assert.equal(unsetStale.status, 409);
  assert.equal((await features(departmentIds[0]))!.hideCaseLogs, false);
});

test("a change through the old whole-object POST makes a PATCH with the previous expectedValue return 409", async () => {
  const path = `${endpoint}/useCaseTypeLabel`;
  assert.equal((await request(runtime.base, endpoint, accounts.hod0)).body.find((row: any) => row.key === "useCaseTypeLabel").value, null);
  const current = await features(departmentIds[0]);
  const posted = await show("old POST /admin/department/config", "/admin/department/config", accounts.hod0, "POST",
    { enabledFeatures: { ...current, useCaseTypeLabel: true } });
  assert.equal(posted.status, 200);
  const rows = (await auditRows(departmentIds[0])).length;
  const stale = await show("PATCH carrying the previous expectedValue (null)", path, accounts.hod0, "PATCH", { value: false, expectedValue: null });
  assert.equal(stale.status, 409);
  assert.equal((await features(departmentIds[0]))!.useCaseTypeLabel, true);
  assert.equal((await auditRows(departmentIds[0])).length, rows, "a rejected write records no audit row");
  const fresh = await show("PATCH with the refreshed expectedValue", path, accounts.hod0, "PATCH", { value: false, expectedValue: true });
  assert.equal(fresh.status, 200);
  assert.equal((await features(departmentIds[0]))!.useCaseTypeLabel, false);
});

test("a successful PATCH writes exactly one audit row, and a no-op PATCH writes none", async () => {
  const path = `${endpoint}/useThesisAndPublicationsLabel`;
  // A department of its own with a late-created HOD (one approved HOD per department is enforced): its users.id is above
  // every students.id. hod0's users.id and the first students.id are both 1, so a hod0-based check could not tell the
  // two ID systems apart.
  const [auditDepartment] = await db.insert(departmentsTable).values({ name: "Synthetic audit", code: "TEST-AUDIT-SETTINGS",
    collegeId: await getTestCollegeId() }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: auditDepartment.id, enabledFeatures: { awards: false } });
  const lateHod = await makeAccount(auditDepartment.id, "hod", "audit-late-hod@example.test");
  const studentIds = (await db.select({ id: studentsTable.id }).from(studentsTable)).map((student) => student.id);
  assert.ok(studentIds.length > 0);
  assert.ok(lateHod.id > Math.max(...studentIds), "setup: the late HOD's users.id must not collide with any students.id");
  assert.equal(studentIds.includes(lateHod.id), false);
  const rows = await auditRows(auditDepartment.id);
  const ok = await show("PATCH for audit check (late-created HOD, own department)", path, lateHod, "PATCH", { value: true, expectedValue: null });
  assert.equal(ok.status, 200);
  const after = await auditRows(auditDepartment.id);
  assert.equal(after.length, rows.length + 1);
  const row = after.find((item) => item.id === ok.body.auditId)!;
  assert.equal(row.tableName, "department_configs");
  assert.equal(row.recordId, String(auditDepartment.id));
  assert.equal(row.action, "UPDATE");
  assert.equal(row.performedById, lateHod.id, "performedById is the caller's users.id");
  assert.notEqual(row.performedById, accounts.hod0.id);
  assert.equal(studentIds.includes(row.performedById!), false, "performedById is not a students.id");
  assert.deepEqual(row.beforeState, { eventType: "department_setting_change", key: "useThesisAndPublicationsLabel", value: null });
  assert.deepEqual(row.afterState, { eventType: "department_setting_change", key: "useThesisAndPublicationsLabel", value: true, actor: "hod" });
  console.log(JSON.stringify({ case: "audit row for the successful PATCH", row: { ...row, timestamp: "<omitted>" } }));

  const noop = await show("PATCH no-op (value equals stored value)", path, lateHod, "PATCH", { value: true, expectedValue: true });
  assert.equal(noop.status, 200);
  assert.deepEqual(noop.body, { key: "useThesisAndPublicationsLabel", before: true, after: true, auditId: null });
  assert.equal((await auditRows(auditDepartment.id)).length, after.length, "no audit row for a no-op");
});

test("a mirrored test department returns 403 on PATCH and reads its source department's values on GET", async () => {
  const [mirror] = await db.insert(departmentsTable).values({ name: "Synthetic mirror", code: "TEST-MIRROR-SETTINGS", isTest: true,
    configSourceDepartmentId: departmentIds[0], collegeId: await getTestCollegeId() }).returning();
  const mirrorHod = await makeAccount(mirror.id, "hod", "mirror-settings-hod@example.test");
  const before = await features(departmentIds[0]);
  const rows = (await auditRows(departmentIds[0])).length;
  const patched = await show("PATCH mirrored test department", `${endpoint}/awards`, mirrorHod, "PATCH", { value: true, expectedValue: null });
  assert.equal(patched.status, 403);
  assert.deepEqual(await features(departmentIds[0]), before);
  assert.equal((await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, mirror.id))).length, 0);
  assert.equal((await auditRows(departmentIds[0])).length, rows);
  const read = await request(runtime.base, endpoint, mirrorHod);
  assert.equal(read.status, 200);
  assert.equal(read.body.find((row: any) => row.key === "hideCaseLogs").value, false);
});

test("a missing config row is inserted with exactly { [key]: value } and audited as CREATE", async () => {
  const [bare] = await db.insert(departmentsTable).values({ name: "Synthetic bare", code: "TEST-BARE-SETTINGS", collegeId: await getTestCollegeId() }).returning();
  const bareHod = await makeAccount(bare.id, "hod", "bare-settings-hod@example.test");
  assert.equal((await features(bare.id)), undefined);
  const mismatch = await show("PATCH missing row with a non-null expectedValue", `${endpoint}/useCaseTypeLabel`, bareHod, "PATCH", { value: true, expectedValue: false });
  assert.equal(mismatch.status, 409);
  assert.equal(await features(bare.id), undefined, "a rejected write inserts nothing");
  const created = await show("PATCH missing config row", `${endpoint}/useCaseTypeLabel`, bareHod, "PATCH", { value: true, expectedValue: null });
  assert.equal(created.status, 200);
  assert.deepEqual(await features(bare.id), { useCaseTypeLabel: true }, "procedureExperience is not added");
  const [audit] = await auditRows(bare.id);
  assert.equal(audit.action, "CREATE");
  assert.equal(audit.performedById, bareHod.id);
  assert.equal(audit.id, created.body.auditId);
  const followUp = await show("PATCH the same row again", `${endpoint}/useCaseTypeLabel`, bareHod, "PATCH", { value: false, expectedValue: true });
  assert.equal(followUp.status, 200);
  assert.equal((await auditRows(bare.id)).at(-1)!.action, "UPDATE");
});

test("the service rejects every hod_only key for actor mochi with 403 before any write", async () => {
  const before = await features(departmentIds[2]);
  const rows = (await auditRows(departmentIds[2])).length;
  const hodOnly = Object.entries(DEPARTMENT_SETTING_TIERS).filter(([, tier]) => tier === "hod_only").map(([key]) => key);
  assert.ok(hodOnly.includes("freeTextPostingUnit"));
  for (const key of hodOnly) {
    await assert.rejects(
      setDepartmentSetting({ departmentId: departmentIds[2], userId: accounts.hod2.id, key, value: true, expectedValue: null, actor: "mochi" }),
      (error) => error instanceof DepartmentSettingError && error.status === 403, key);
  }
  console.log(JSON.stringify({ case: "service actor=mochi on hod_only key freeTextPostingUnit", result: "DepartmentSettingError status 403" }));
  assert.deepEqual(await features(departmentIds[2]), before);
  assert.equal((await auditRows(departmentIds[2])).length, rows);
  // A mochi-tier key still works for Mochi, and the audit row records the actor.
  const change = await setDepartmentSetting({ departmentId: departmentIds[2], userId: accounts.hod2.id, key: "academicsFirstInNav", value: true,
    expectedValue: null, actor: "mochi" });
  assert.equal(change.after, true);
  const [row] = await auditRows(departmentIds[2]);
  assert.deepEqual(row.afterState, { eventType: "department_setting_change", key: "academicsFirstInNav", value: true, actor: "mochi" });
  await assert.rejects(setDepartmentSetting({ departmentId: departmentIds[2], userId: accounts.hod2.id, key: "keepExistingFlag", value: true,
    expectedValue: null, actor: "hod" }), (error) => error instanceof DepartmentSettingError && error.status === 400);
});
