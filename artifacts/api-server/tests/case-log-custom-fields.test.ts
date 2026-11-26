import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { setup, request, accounts, departmentIds, type Account } from "./support.js";
import { caseLogsTable, db, departmentConfigsTable, departmentsTable, engine, getTestCollegeId, usersTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let mirrorHod: Account;
let bareHod: Account;

async function show(label: string, path: string, caller: Account | undefined, method: string, body?: unknown) {
  const response = await request(runtime.base, path, caller, method, body);
  console.log(JSON.stringify({
    case: label,
    request: { method, path: `/api${path}`, ...(body === undefined ? {} : { body }) },
    response: { status: response.status, body: response.body },
  }));
  return response;
}

before(async () => {
  runtime = await setup();
  const [mirror] = await db.insert(departmentsTable).values({
    name: "Pediatrics (Case Mirror)", code: "CASE-MIRROR", isTest: true, configSourceDepartmentId: departmentIds[0], collegeId: await getTestCollegeId(),
  }).returning();
  const [mirrorUser] = await db.insert(usersTable).values({
    fullName: "Mirror HOD", email: "case-mirror-hod@example.test", role: "hod", status: "approved", departmentId: mirror.id, passwordHash: "test-hash",
  }).returning();
  mirrorHod = { id: mirrorUser.id, email: mirrorUser.email, role: "hod", departmentId: mirror.id, token: jwt.sign({ id: mirrorUser.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };

  const [bare] = await db.insert(departmentsTable).values({
    name: "Bare Case Dept", code: "CASE-BARE", collegeId: await getTestCollegeId(),
  }).returning();
  const [bareUser] = await db.insert(usersTable).values({
    fullName: "Bare HOD", email: "case-bare-hod@example.test", role: "hod", status: "approved", departmentId: bare.id, passwordHash: "test-hash",
  }).returning();
  bareHod = { id: bareUser.id, email: bareUser.email, role: "hod", departmentId: bare.id, token: jwt.sign({ id: bareUser.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
});

after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

const sampleFields = [
  { key: "ward", label: "Ward", type: "select", required: true, options: ["PICU", "NICU", "General"] },
  { key: "icu_days", label: "ICU days", type: "number", required: true, min: 0, max: 365, requiredWhen: { field: "ward", value: "PICU" } },
  { key: "followup_date", label: "Follow-up date", type: "date" },
  { key: "short_note", label: "Short note", type: "text", maxLength: 100 },
  { key: "summary", label: "Summary", type: "textarea" },
];

describe("PATCH /api/admin/department/case-log-fields (AGENTS.md §11)", () => {
  it("401 unauthenticated, 403 student / professor / mirror HOD, 200 correct HOD, department B unchanged", async () => {
    const path = "/admin/department/case-log-fields";
    assert.equal((await show("case-fields unauthenticated", path, undefined, "PATCH", { fields: sampleFields })).status, 401);
    assert.equal((await show("case-fields student", path, accounts.student0, "PATCH", { fields: sampleFields })).status, 403);
    assert.equal((await show("case-fields professor", path, accounts.faculty0, "PATCH", { fields: sampleFields })).status, 403);
    assert.equal((await show("case-fields mirror HOD", path, mirrorHod, "PATCH", { fields: sampleFields })).status, 403);

    const ok = await show("case-fields HOD0", path, accounts.hod0, "PATCH", { fields: sampleFields });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.fields.length, 5);

    const dept1 = await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, accounts.hod1);
    assert.deepEqual(dept1.body.caseLogFields, []);

    const bareRes = await show("case-fields HOD with no config row", path, bareHod, "PATCH", { fields: [sampleFields[3]] });
    assert.equal(bareRes.status, 200);
    const [bareConfig] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, bareHod.departmentId!));
    assert.equal(bareConfig.caseLogFields?.length, 1);

    const bad = await show("case-fields invalid definition", path, accounts.hod0, "PATCH", {
      fields: [{ key: "bad_select", label: "Bad Select", type: "select" }],
    });
    assert.equal(bad.status, 400);
  });
});

describe("Case log POST / PATCH / GET / review with customFields (AGENTS.md §11 & §8)", () => {
  let legacyLogId: number;
  let customLogId: number;

  const baseCase = (supervisorId: number) => ({
    supervisorId,
    date: "2026-10-20",
    patientAge: "5y",
    patientGender: "female",
    diagnosisFinal: "Acute bronchiolitis",
  });

  it("unchanged rendering for pre-existing logs in a department with no custom fields", async () => {
    const created = await request(runtime.base, `/students/${accounts.student1.studentId}/case-logs`, accounts.student1, "POST", baseCase(accounts.faculty1.id));
    assert.equal(created.status, 201);
    legacyLogId = created.body.id;

    const logs = await request(runtime.base, `/students/${accounts.student1.studentId}/logs`, accounts.student1);
    assert.equal(logs.status, 200);
    const found = logs.body.caseLogs.find((item: any) => item.id === legacyLogId);
    assert.equal(found.diagnosisFinal, "Acute bronchiolitis");
    assert.deepEqual(found.customFields, {});
  });

  it("POST /api/students/:studentId/case-logs §11 cases and validation", async () => {
    const postPath = `/students/${accounts.student0.studentId}/case-logs`;
    const validBody = {
      ...baseCase(accounts.faculty0.id),
      customFields: { ward: "PICU", icu_days: "3", followup_date: "2026-11-01", short_note: "Stable" },
    };

    assert.equal((await show("case POST unauthenticated", postPath, undefined, "POST", validBody)).status, 401);
    assert.equal((await show("case POST wrong owner (student20 on student0)", postPath, accounts.student1, "POST", validBody)).status, 403);
    assert.equal((await show("case POST nonexistent studentId (collapsed 403 by studentAccess)", "/students/99999999/case-logs", accounts.student0, "POST", validBody)).status, 403);

    const created = await show("case POST owner", postPath, accounts.student0, "POST", validBody);
    assert.equal(created.status, 201);
    customLogId = created.body.id;
    assert.deepEqual(created.body.customFields, { ward: "PICU", icu_days: "3", followup_date: "2026-11-01", short_note: "Stable" });

    // Validation: required field missing -> 400 with label, never value
    const missingReq = await request(runtime.base, postPath, accounts.student0, "POST", { ...baseCase(accounts.faculty0.id), customFields: {} });
    assert.equal(missingReq.status, 400);
    assert.match(missingReq.body.message, /Ward/);

    // requiredWhen: PICU requires icu_days; General does not
    const missingConditional = await request(runtime.base, postPath, accounts.student0, "POST", {
      ...baseCase(accounts.faculty0.id),
      customFields: { ward: "PICU" },
    });
    assert.equal(missingConditional.status, 400);
    assert.match(missingConditional.body.message, /ICU days/);

    const generalOk = await request(runtime.base, postPath, accounts.student0, "POST", {
      ...baseCase(accounts.faculty0.id),
      customFields: { ward: "General", icu_days: "not-a-number-hidden" },
    });
    assert.equal(generalOk.status, 201);
    assert.equal(generalOk.body.customFields.icu_days, undefined, "hidden requiredWhen field is stripped and not persisted");

    // Bad number, bad date, bad select, unknown key -> 400 without echoing submitted values
    for (const [label, cf, sentinel] of [
      ["bad number", { ward: "PICU", icu_days: "not-a-number-sentinel" }, "not-a-number-sentinel"],
      ["bad date", { ward: "General", followup_date: "2026-02-30" }, "2026-02-30"],
      ["unknown select", { ward: "SecretWardSentinel" }, "SecretWardSentinel"],
      ["unknown key", { ward: "General", unknown_key: "SecretValSentinel" }, "SecretValSentinel"],
    ] as const) {
      const bad = await request(runtime.base, postPath, accounts.student0, "POST", { ...baseCase(accounts.faculty0.id), customFields: cf });
      assert.equal(bad.status, 400, label);
      assert.ok(!JSON.stringify(bad.body).includes(sentinel), `${label} must not echo value`);
    }
  });

  it("PATCH /api/students/:studentId/case-logs/:id §11 cases, required-on-edit, orphan preservation, null clear, and review preservation", async () => {
    const patchPath = `/students/${accounts.student0.studentId}/case-logs/${customLogId}`;

    assert.equal((await show("case PATCH unauthenticated", patchPath, undefined, "PATCH", { diagnosisFinal: "Updated" })).status, 401);
    assert.equal((await show("case PATCH wrong owner", patchPath, accounts.student1, "PATCH", { diagnosisFinal: "Updated" })).status, 403);
    assert.equal((await show("case PATCH nonexistent id", `/students/${accounts.student0.studentId}/case-logs/99999999`, accounts.student0, "PATCH", { diagnosisFinal: "Updated" })).status, 404);

    // Null clears short_note; owner gets 200
    const cleared = await show("case PATCH owner", patchPath, accounts.student0, "PATCH", { customFields: { short_note: null } });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.customFields.short_note, undefined);
    assert.equal(cleared.body.customFields.ward, "PICU");

    // Changing ward from PICU to General clears hidden dependent icu_days
    const wardChanged = await request(runtime.base, patchPath, accounts.student0, "PATCH", {
      customFields: { ward: "General" },
    });
    assert.equal(wardChanged.status, 200);
    assert.equal(wardChanged.body.customFields.ward, "General");
    assert.equal(wardChanged.body.customFields.icu_days, undefined);

    // Professor review preserves custom_fields
    const reviewed = await request(runtime.base, `/logs/case/${customLogId}/review`, accounts.faculty0, "PATCH", { status: "verified", comments: "Looks good" });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.customFields.ward, "General");

    // Orphan key survives a PATCH after HOD removes a field
    await request(runtime.base, "/admin/department/case-log-fields", accounts.hod0, "PATCH", {
      fields: sampleFields.filter((f) => f.key !== "followup_date"),
    });
    const orphanTarget = await request(runtime.base, `/students/${accounts.student0.studentId}/case-logs`, accounts.student0, "POST", {
      ...baseCase(accounts.faculty0.id),
      customFields: { ward: "General" },
    });
    await db.update(caseLogsTable).set({ customFields: { ward: "General", followup_date: "2026-12-01" } }).where(eq(caseLogsTable.id, orphanTarget.body.id));
    const afterOrphanPatch = await request(runtime.base, `/students/${accounts.student0.studentId}/case-logs/${orphanTarget.body.id}`, accounts.student0, "PATCH", {
      diagnosisFinal: "Edited after field removed",
    });
    assert.equal(afterOrphanPatch.status, 200);
    assert.equal(afterOrphanPatch.body.customFields.followup_date, "2026-12-01");

    // Required field added after log creation is enforced on resident PATCH (developer decision)
    await request(runtime.base, "/admin/department/case-log-fields", accounts.hod1, "PATCH", {
      fields: [{ key: "severity", label: "Severity", type: "text", required: true }],
    });
    const missingNewReq = await request(runtime.base, `/students/${accounts.student1.studentId}/case-logs/${legacyLogId}`, accounts.student1, "PATCH", {
      diagnosisFinal: "Updated without severity",
    });
    assert.equal(missingNewReq.status, 400);
    assert.match(missingNewReq.body.message, /Severity/);
    const withNewReq = await request(runtime.base, `/students/${accounts.student1.studentId}/case-logs/${legacyLogId}`, accounts.student1, "PATCH", {
      diagnosisFinal: "Updated with severity",
      customFields: { severity: "Moderate" },
    });
    assert.equal(withNewReq.status, 200);
    assert.equal(withNewReq.body.customFields.severity, "Moderate");
  });
});
