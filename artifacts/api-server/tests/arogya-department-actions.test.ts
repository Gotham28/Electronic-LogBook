import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { setup, request, accounts as a, departmentIds, type Account } from "./support.js";
import { auditTable, db, departmentConfigsTable, departmentLabelOverridesTable, departmentsTable, engine, getTestCollegeId, usersTable } from "./database.js";
import { DEPARTMENT_SETTING_TIERS } from "@workspace/api-zod";

// Task 4: Mochi makes HOD-requested department edits. Every case prints its request and response so the
// AGENTS.md §11 evidence can be pasted from this run. Synthetic data only.
let runtime: Awaited<ReturnType<typeof setup>>;
let mirrorHod: Account;
const auditTables = ["department_label_overrides", "department_configs"];
const auditFor = (departmentId: number) => db.select().from(auditTable)
  .where(and(inArray(auditTable.tableName, auditTables), eq(auditTable.recordId, String(departmentId)))).orderBy(auditTable.timestamp);
const overridesFor = (departmentId: number) => db.select().from(departmentLabelOverridesTable)
  .where(eq(departmentLabelOverridesTable.departmentId, departmentId)).orderBy(departmentLabelOverridesTable.key);
const featuresFor = async (departmentId: number) => (await db.select().from(departmentConfigsTable)
  .where(eq(departmentConfigsTable.departmentId, departmentId)))[0]?.enabledFeatures as Record<string, unknown>;

async function show(label: string, path: string, caller: Account | undefined, method: string, body?: unknown) {
  const response = await request(runtime.base, path, caller, method, body);
  console.log(JSON.stringify({ case: label, request: { method, path: "/api" + path, ...(body === undefined ? {} : { body }) },
    response: { status: response.status, body: response.body } }));
  return response;
}
async function makeHod(departmentId: number, email: string): Promise<Account> {
  const [user] = await db.insert(usersTable).values({ fullName: "Synthetic HOD", email, role: "hod", status: "approved", departmentId,
    passwordHash: "test-hash" }).returning();
  return { id: user.id, email, role: "hod", departmentId, token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
}

// OpenAI stub: each /ask pops the next scripted assistant message. Every request body is kept for inspection.
const providerBodies: any[] = [];
const script: any[] = [];
const toolCall = (name: string, args: unknown) => ({ role: "assistant", content: null,
  tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const finalReply = () => ({ role: "assistant", content: JSON.stringify({ reply: "Here is how that works.", steps: [] }) });
const originalFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};
const envKeys = ["AROGYA_ASSISTANT_V2_ENABLED", "AROGYA_HOD_EDITS_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL"];
const setEnv = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
const toolNames = (body: any): string[] => (body.tools ?? []).map((tool: any) => tool.function.name);
const ask = (caller: Account | undefined, question: string, message?: any) => {
  if (message) script.push(message);
  return show("ask", "/arogya/ask", caller, "POST", { question });
};

before(async () => {
  for (const key of envKeys) saved[key] = process.env[key];
  setEnv("AROGYA_ASSISTANT_V2_ENABLED", "true");
  setEnv("AROGYA_HOD_EDITS_ENABLED", "true");
  setEnv("OPENAI_API_KEY", "synthetic-test-key");
  setEnv("OPENAI_MODEL", "synthetic-test-model");
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.openai.com/v1/chat/completions") {
      providerBodies.push(JSON.parse(init?.body as string));
      const message = script.shift() ?? finalReply();
      return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  runtime = await setup();
  const [mirror] = await db.insert(departmentsTable).values({ name: "Pediatrics (Test)", code: "ACTIONS-MIRROR", isTest: true,
    configSourceDepartmentId: departmentIds[0], collegeId: await getTestCollegeId() }).returning();
  mirrorHod = await makeHod(mirror.id, "actions-mirror-hod@example.test");
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) setEnv(key, saved[key]);
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

const applyPath = "/arogya/actions/apply";
const undoPath = (id: string) => `/arogya/actions/${id}/undo`;
const labelBody = { type: "label_set", key: "nav.postings", value: "Rotations", expected: 0 };

describe("POST /api/arogya/actions/apply (AGENTS.md §11)", () => {
  it("401 unauthenticated, 403 student / professor / mirrored-department HOD, 200 correct HOD, 404 unknown key and unknown action", async () => {
    const own = await overridesFor(departmentIds[0]);
    const other = await overridesFor(departmentIds[1]);
    assert.deepEqual([own.length, other.length], [0, 0]);
    for (const [label, caller, body, expected] of [
      ["unauthenticated", undefined, labelBody, 401],
      ["student", a.student0, labelBody, 403],
      ["professor", a.faculty0, labelBody, 403],
      ["HOD of a mirrored test department", mirrorHod, labelBody, 403],
    ] as const) {
      const response = await show(label, applyPath, caller, "POST", body);
      assert.equal(response.status, expected, label);
    }
    assert.deepEqual(await overridesFor(departmentIds[0]), [], "nothing written by a refused caller");
    assert.deepEqual(await overridesFor(mirrorHod.departmentId), [], "the mirrored department wrote nothing");

    const correct = await show("correct HOD", applyPath, a.hod0, "POST", labelBody);
    assert.equal(correct.status, 200);
    assert.equal(correct.body.before, "Postings & Rotations");
    assert.equal(correct.body.after, "Rotations");
    assert.equal(correct.body.undoable, true);
    assert.match(correct.body.auditId, /^[0-9a-f-]{36}$/);

    // The department is the caller's own: the other department's HOD changes only their own wording.
    const otherHod = await show("HOD of another department (own department only)", applyPath, a.hod1, "POST", { ...labelBody, value: "Other rotations" });
    assert.equal(otherHod.status, 200);
    assert.deepEqual((await overridesFor(departmentIds[0])).map((row) => [row.key, row.value]), [["nav.postings", "Rotations"]]);
    assert.deepEqual((await overridesFor(departmentIds[1])).map((row) => [row.key, row.value]), [["nav.postings", "Other rotations"]]);

    for (const [label, body] of [
      ["unknown label key", { type: "label_set", key: "nav.nonexistent", value: "X", expected: 0 }],
      ["unknown action type", { type: "delete_everything", key: "nav.postings", expected: 0 }],
      ["unknown setting key", { type: "setting_set", key: "notARealSetting", value: true, expected: null }],
    ] as const) {
      const response = await show(label, applyPath, a.hod0, "POST", body);
      assert.equal(response.status, 404, label);
    }
    // A department in the body is not an option: the shape is strict.
    const padded = await show("departmentId in body", applyPath, a.hod0, "POST", { ...labelBody, departmentId: departmentIds[1] });
    assert.equal(padded.status, 400);
    assert.deepEqual((await overridesFor(departmentIds[1])).map((row) => row.value), ["Other rotations"]);
  });

  it("writes one audit row for the apply: before, after, actor mochi, performedById (usersTable.id), recordId", async () => {
    const rows = (await auditFor(departmentIds[0])).filter((row) => row.tableName === "department_label_overrides");
    assert.equal(rows.length, 1);
    console.log(JSON.stringify({ case: "audit row for one apply", row: { tableName: rows[0].tableName, recordId: rows[0].recordId, action: rows[0].action,
      performedById: rows[0].performedById, beforeState: rows[0].beforeState, afterState: rows[0].afterState } }));
    assert.equal(rows[0].recordId, String(departmentIds[0]));
    assert.equal(rows[0].performedById, a.hod0.id);
    assert.equal(rows[0].action, "CREATE");
    assert.deepEqual(rows[0].beforeState, { eventType: "department_label_change", key: "nav.postings", value: null });
    assert.deepEqual(rows[0].afterState, { eventType: "department_label_change", key: "nav.postings", value: "Rotations", actor: "mochi" });
  });

  it("a label value that reads like clinical text is refused with 400 and writes nothing", async () => {
    const before = await auditFor(departmentIds[0]);
    const response = await show("clinical text in label", applyPath, a.hod0, "POST",
      { type: "label_set", key: "caseLog.caseId", value: "patient is a child with fever", expected: 0 });
    assert.equal(response.status, 400);
    assert.deepEqual(await auditFor(departmentIds[0]), before);
    assert.equal((await overridesFor(departmentIds[0])).some((row) => row.key === "caseLog.caseId"), false);
  });

  it("a HOD-only setting is refused with 403: no value change and no audit row", async () => {
    assert.equal(DEPARTMENT_SETTING_TIERS.yearlyAttendance, "hod_only");
    const before = { features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length };
    const response = await show("hod_only key refused", applyPath, a.hod0, "POST", { type: "setting_set", key: "yearlyAttendance", value: true, expected: null });
    assert.equal(response.status, 403);
    assert.deepEqual({ features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length }, before);
  });
});

describe("POST /api/arogya/actions/:auditId/undo (AGENTS.md §11)", () => {
  it("401, 403 student / professor / other department's HOD, 400 not a uuid, 404 nonexistent and non-Mochi rows, 200 correct HOD", async () => {
    const [mochiRow] = (await auditFor(departmentIds[0])).filter((row) => row.tableName === "department_label_overrides");
    for (const [label, caller, expected] of [
      ["unauthenticated", undefined, 401],
      ["student", a.student0, 403],
      ["professor", a.faculty0, 403],
      ["HOD of another department on this department's audit row", a.hod1, 403],
      ["HOD of a mirrored department on this department's audit row", mirrorHod, 403],
    ] as const) {
      const response = await show(label, undoPath(mochiRow.id), caller, "POST", {});
      assert.equal(response.status, expected, label);
    }
    assert.equal((await overridesFor(departmentIds[0])).length, 1, "refused callers restored nothing");

    assert.equal((await show("not a uuid", undoPath("not-a-uuid"), a.hod0, "POST", {})).status, 400);
    assert.equal((await show("nonexistent uuid", undoPath("00000000-0000-4000-8000-000000000000"), a.hod0, "POST", {})).status, 404);

    // A change the HOD made directly (actor "hod") is not a Mochi action and cannot be undone through Mochi.
    const direct = await request(runtime.base, "/admin/department/labels/caseLog.caseId", a.hod0, "PATCH", { value: "Record ID" });
    assert.equal(direct.status, 200);
    const [hodRow] = (await auditFor(departmentIds[0])).filter((row) => (row.afterState as any).actor === "hod");
    assert.ok(hodRow, "a direct HOD label write now writes an audit row (actor hod)");
    assert.equal((await show("audit row that is not a Mochi action", undoPath(hodRow.id), a.hod0, "POST", {})).status, 404);
    assert.equal((await overridesFor(departmentIds[0])).find((row) => row.key === "caseLog.caseId")?.value, "Record ID");

    const undone = await show("correct HOD", undoPath(mochiRow.id), a.hod0, "POST", {});
    assert.equal(undone.status, 200);
    assert.equal(undone.body.before, "Rotations");
    assert.equal(undone.body.after, "Postings & Rotations");
    assert.deepEqual((await overridesFor(departmentIds[0])).map((row) => row.key), ["caseLog.caseId"], "the nav override is gone: the default is back");
    const rows = await auditFor(departmentIds[0]);
    const undoRow = rows.find((row) => (row.afterState as any).undoOf === mochiRow.id)!;
    console.log(JSON.stringify({ case: "audit row for one undo", row: { tableName: undoRow.tableName, recordId: undoRow.recordId, action: undoRow.action,
      performedById: undoRow.performedById, beforeState: undoRow.beforeState, afterState: undoRow.afterState } }));
    assert.equal(undoRow.performedById, a.hod0.id);
    assert.equal(undoRow.action, "DELETE");
    assert.deepEqual(undoRow.beforeState, { eventType: "department_label_change", key: "nav.postings", value: "Rotations" });
    assert.deepEqual(undoRow.afterState, { eventType: "department_label_change", key: "nav.postings", value: null, actor: "mochi", undoOf: mochiRow.id });

    // The same change cannot be undone twice.
    assert.equal((await show("already undone", undoPath(mochiRow.id), a.hod0, "POST", {})).status, 409);
  });

  it("a mochi-tier setting: apply, then undo restores the previous value and links the new audit row with undoOf", async () => {
    assert.equal(DEPARTMENT_SETTING_TIERS.useCaseTypeLabel, "mochi");
    const hod = await request(runtime.base, "/admin/department/config/settings/useCaseTypeLabel", a.hod0, "PATCH", { value: false, expectedValue: null });
    assert.equal(hod.status, 200);
    const applied = await show("setting apply", applyPath, a.hod0, "POST", { type: "setting_set", key: "useCaseTypeLabel", value: true, expected: false });
    assert.equal(applied.status, 200);
    assert.deepEqual([applied.body.before, applied.body.after, applied.body.undoable], ["Off", "On", true]);
    assert.equal((await featuresFor(departmentIds[0])).useCaseTypeLabel, true);
    const undone = await show("setting undo", undoPath(applied.body.auditId), a.hod0, "POST", {});
    assert.equal(undone.status, 200);
    assert.equal((await featuresFor(departmentIds[0])).useCaseTypeLabel, false);
    const row = (await db.select().from(auditTable).where(eq(auditTable.id, undone.body.auditId)))[0];
    console.log(JSON.stringify({ case: "audit row for a setting undo", row: { tableName: row.tableName, recordId: row.recordId, performedById: row.performedById,
      beforeState: row.beforeState, afterState: row.afterState } }));
    assert.deepEqual(row.afterState, { eventType: "department_setting_change", key: "useCaseTypeLabel", value: false, actor: "mochi", undoOf: applied.body.auditId });
  });

  it("a setting that was unset before the change reports undoable false, and undo says so with 409", async () => {
    const applied = await show("setting apply from unset", applyPath, a.hod0, "POST", { type: "setting_set", key: "academicsFirstInNav", value: true, expected: null });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.undoable, false);
    const undone = await show("undo of an unset-before setting", undoPath(applied.body.auditId), a.hod0, "POST", {});
    assert.equal(undone.status, 409);
    assert.equal((await featuresFor(departmentIds[0])).academicsFirstInNav, true, "nothing was changed by the refused undo");
  });
});

describe("stale previews and stale undo", () => {
  it("apply with an out-of-date preview is 409 and writes nothing", async () => {
    // Mochi previews a change to nav.milestones; then another session changes the same wording.
    const proposalAnswer = await ask(a.hod0, "Rename the thesis page in the sidebar to Research",
      toolCall("propose_label_change", { key: "nav.milestones", value: "Research" }));
    assert.equal(proposalAnswer.status, 200);
    const proposal = proposalAnswer.body.proposal;
    assert.equal(proposal.expected, 0);
    const other = await request(runtime.base, "/admin/department/labels/nav.milestones", a.hod0, "PATCH", { value: "Someone else's wording" });
    assert.equal(other.status, 200);
    const before = await auditFor(departmentIds[0]);
    const response = await show("stale preview", applyPath, a.hod0, "POST",
      { type: proposal.type, key: proposal.key, value: proposal.value, expected: proposal.expected });
    assert.equal(response.status, 409);
    assert.deepEqual(await auditFor(departmentIds[0]), before);
    assert.equal((await overridesFor(departmentIds[0])).find((row) => row.key === "nav.milestones")?.value, "Someone else's wording");

    const staleSettingBefore = { features: await featuresFor(departmentIds[0]), audit: await auditFor(departmentIds[0]) };
    const stale = await show("stale setting preview", applyPath, a.hod0, "POST", { type: "setting_set", key: "useThesisAndPublicationsLabel", value: true, expected: true });
    assert.equal(stale.status, 409);
    assert.notEqual((await featuresFor(departmentIds[0])).useThesisAndPublicationsLabel, true);
    assert.deepEqual({ features: await featuresFor(departmentIds[0]), audit: await auditFor(departmentIds[0]) }, staleSettingBefore);
  });

  it("undo after the value changed again is 409 and restores nothing", async () => {
    const applied = await show("apply", applyPath, a.hod0, "POST", { type: "label_set", key: "postings.unitTitle", value: "Clinical unit", expected: 0 });
    assert.equal(applied.status, 200);
    const changed = await request(runtime.base, "/admin/department/labels/postings.unitTitle", a.hod0, "PATCH", { value: "Changed by the HOD" });
    assert.equal(changed.status, 200);
    const before = await auditFor(departmentIds[0]);
    const undone = await show("stale undo", undoPath(applied.body.auditId), a.hod0, "POST", {});
    assert.equal(undone.status, 409);
    assert.deepEqual(await auditFor(departmentIds[0]), before);
    assert.equal((await overridesFor(departmentIds[0])).find((row) => row.key === "postings.unitTitle")?.value, "Changed by the HOD");
  });
});

describe("/api/arogya/ask: the model proposes, never writes", () => {
  it("a proposal leaves the database and the audit table unchanged, and the preview is server-built", async () => {
    const snapshot = async () => JSON.stringify({ overrides: await overridesFor(departmentIds[0]), audit: await auditFor(departmentIds[0]),
      features: await featuresFor(departmentIds[0]) });
    const before = await snapshot();
    const response = await ask(a.hod0, "Please rename Postings & Rotations to Rotations only",
      toolCall("propose_label_change", { key: "nav.postings", value: "Rotations only" }));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.proposal, { type: "label_set", key: "nav.postings", title: response.body.proposal.title, before: "Postings & Rotations",
      after: "Rotations only", value: "Rotations only", expected: 0 });
    assert.equal(await snapshot(), before, "/ask changed nothing");
    const tools = toolNames(providerBodies.at(-1));
    for (const name of ["propose_label_change", "propose_label_reset", "propose_setting_change", "report_unsupported_change"]) assert.ok(tools.includes(name), name);
    const settingTool = providerBodies.at(-1).tools.find((tool: any) => tool.function.name === "propose_setting_change");
    assert.ok(settingTool.function.parameters.properties.key.enum.includes("yearlyAttendance"), "every setting key is in the enum so the refusal is server-side");
    const prompt = JSON.stringify(providerBodies.at(-1));
    assert.ok(!prompt.includes("Test unit") && !prompt.includes(a.student0.email), "no resident or catalog data in the edit tools");
  });

  it("a reset proposal and a mochi-tier setting proposal carry the stored value to quote back", async () => {
    const reset = await ask(a.hod0, "Put the Postings sidebar wording back to the default", toolCall("propose_label_reset", { key: "nav.milestones" }));
    assert.equal(reset.body.proposal.type, "label_reset");
    assert.equal(reset.body.proposal.after, "Thesis & Certifications");
    assert.equal(reset.body.proposal.expected, 1, "the revision of the override written earlier in this file");
    const setting = await ask(a.hod0, "Say case type instead of case category", toolCall("propose_setting_change", { key: "useCaseTypeLabel", value: true }));
    assert.deepEqual([setting.body.proposal.type, setting.body.proposal.before, setting.body.proposal.after, setting.body.proposal.expected],
      ["setting_set", "Off", "On", false]);
  });

  it("a HOD-only setting becomes a refusal with the settings link, and nothing is written", async () => {
    const before = { features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length };
    const response = await ask(a.hod0, "Turn on yearly attendance", toolCall("propose_setting_change", { key: "yearlyAttendance", value: true }));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.refusal, { type: "hod_only", key: "yearlyAttendance", title: "Yearly attendance", settingsHref: "/requirements" });
    assert.equal(response.body.proposal, undefined);
    assert.deepEqual({ features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length }, before);
  });

  it("anything outside the allowlist is an unsupported answer with no write", async () => {
    const before = { features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length, overrides: await overridesFor(departmentIds[0]) };
    const noTool = await ask(a.hod0, "Please delete all the case logs for my department", toolCall("report_unsupported_change", {}));
    assert.equal(noTool.status, 200);
    assert.equal(noTool.body.kind, "unsupported");
    assert.deepEqual(noTool.body.refusal, { type: "unsupported" });
    const badKey = await ask(a.hod0, "Rename the secret page to Whatever", toolCall("propose_label_change", { key: "nav.nonexistent", value: "Whatever" }));
    assert.equal(badKey.status, 200);
    assert.deepEqual(badKey.body.refusal, { type: "unsupported" });
    const extraArg = await ask(a.hod0, "Rename the Postings sidebar entry to Rotations", toolCall("propose_label_change", { key: "nav.postings", value: "Rotations", departmentId: 2 }));
    assert.deepEqual(extraArg.body.refusal, { type: "unsupported" });
    const clinical = await ask(a.hod0, "Rename Case ID to something clinical", toolCall("propose_label_change", { key: "caseLog.caseId", value: "patient has a fever" }));
    assert.deepEqual(clinical.body.refusal, { type: "unsupported" });
    const badSetting = await ask(a.hod0, "Turn the secret setting on", toolCall("propose_setting_change", { key: "notARealSetting", value: true }));
    assert.equal(badSetting.status, 200);
    assert.deepEqual(badSetting.body.refusal, { type: "unsupported" });
    assert.deepEqual({ features: await featuresFor(departmentIds[0]), audit: (await auditFor(departmentIds[0])).length, overrides: await overridesFor(departmentIds[0]) }, before);
  });

  it("an edit request that matches no workflow still reaches the model so it can be proposed", async () => {
    const response = await ask(a.hod0, "Please call the Case ID column Sample reference", toolCall("propose_label_change", { key: "caseLog.caseId", value: "Sample reference" }));
    assert.equal(response.status, 200);
    assert.equal(response.body.proposal?.after, "Sample reference");
  });

  it("professors, residents, and ordinary HOD questions never get the edit tools, even with the switch on", async () => {
    for (const [caller, question] of [
      [a.faculty0, "How do I review a pending log and rename it?"],
      [a.student0, "How do I add a case log and rename it?"],
      [a.hod0, "How do I review a pending log?"],
    ] as const) {
      const sent = providerBodies.length;
      const response = await ask(caller, question);
      assert.equal(response.status, 200);
      assert.equal(providerBodies.length, sent + 1, `${caller.role}: the question reached the model`);
      assert.ok(!toolNames(providerBodies.at(-1)).some((name) => name.startsWith("propose_") || name === "report_unsupported_change"), caller.role);
    }
  });
});

describe("AROGYA_HOD_EDITS_ENABLED", () => {
  it("off unless exactly \"true\": apply and undo are 403 and the provider request carries none of the new tools", async () => {
    const [mochiRow] = (await auditFor(departmentIds[0])).filter((row) => (row.afterState as any).actor === "mochi" && row.tableName === "department_label_overrides");
    const snapshot = async () => JSON.stringify({ overrides: await overridesFor(departmentIds[0]), audit: await auditFor(departmentIds[0]), features: await featuresFor(departmentIds[0]) });
    for (const value of [undefined, "", "false", "1", "TRUE"]) {
      setEnv("AROGYA_HOD_EDITS_ENABLED", value);
      const before = await snapshot();
      const apply = await show(`flag ${JSON.stringify(value)}: apply`, applyPath, a.hod0, "POST", labelBody);
      const undo = await show(`flag ${JSON.stringify(value)}: undo`, undoPath(mochiRow.id), a.hod0, "POST", {});
      assert.deepEqual([apply.status, undo.status], [403, 403], String(value));
      assert.equal(await snapshot(), before, String(value));
      const sent = providerBodies.length;
      const answer = await ask(a.hod0, "How do I review a pending log and rename it?");
      assert.equal(answer.status, 200);
      assert.equal(providerBodies.length, sent + 1, String(value));
      assert.deepEqual(toolNames(providerBodies.at(-1)).filter((name) => name.startsWith("propose_") || name === "report_unsupported_change"), [], String(value));
    }
    setEnv("AROGYA_HOD_EDITS_ENABLED", "true");
  });
});

describe("daily limit", () => {
  it("/ask counts against the limit; apply and undo do not", async () => {
    const hod = a.hod2; // nothing else in this file asks as the department-2 HOD, so its daily count starts at 0
    for (let i = 0; i < 19; i++) {
      const response = await request(runtime.base, "/arogya/ask", hod, "POST", { question: "How do I review a pending log?" });
      assert.equal(response.status, 200, `ask ${i + 1}`);
    }
    const applied = await show("apply", applyPath, hod, "POST", { type: "label_set", key: "nav.postings", value: "Rotations", expected: 0 });
    assert.equal(applied.status, 200);
    const undone = await show("undo", undoPath(applied.body.auditId), hod, "POST", {});
    assert.equal(undone.status, 200);
    const twentieth = await show("20th ask", "/arogya/ask", hod, "POST", { question: "How do I review a pending log?" });
    assert.equal(twentieth.status, 200, "apply and undo did not use up an ask");
    const limited = await show("21st ask", "/arogya/ask", hod, "POST", { question: "How do I review a pending log?" });
    assert.equal(limited.status, 429);
  });
});
