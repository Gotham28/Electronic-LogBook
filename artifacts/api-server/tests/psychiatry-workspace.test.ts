import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { findIcd11Chapter06Diagnosis, icd11Chapter06Diagnoses, searchIcd11Chapter06Diagnoses, SHORT_CASE_CATEGORY, psychiatryNavigation } from "@workspace/api-zod";
import { caseLogsTable, db, departmentConfigsTable, engine, psychiatryEntriesTable } from "./database.js";
import { accounts, departmentIds, request, setup, type Account } from "./support.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => {
  runtime = await setup();
  for (const departmentId of departmentIds.slice(0, 2)) {
    await db.update(departmentConfigsTable).set({ enabledFeatures: { psychiatryWorkspace: true } }).where(eq(departmentConfigsTable.departmentId, departmentId));
  }
});
after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

async function evidence(label: string, path: string, caller: Account | undefined, body: unknown, expected: number) {
  const result = await request(runtime.base, path, caller, "PATCH", body);
  console.log(JSON.stringify({ case: label, request: `PATCH /api${path}`, response: { status: result.status, body: result.body } }));
  assert.equal(result.status, expected);
  return result;
}

const row = { diagnosisCode: "6A70", medical: "", count: 3, visit: "Fresh", tags: ["Adult psychiatry"], department: "Medicine", icu: "" };

test("all 858 Chapter 06 codes retain WHO hierarchy and are searchable", () => {
  assert.equal(icd11Chapter06Diagnoses.length, 858);
  assert.equal(new Set(icd11Chapter06Diagnoses.map(({ code }) => code)).size, 858);
  assert.equal(icd11Chapter06Diagnoses.every(({ uri, parents, title }) => uri && title && Array.isArray(parents)), true);
  assert.equal(searchIcd11Chapter06Diagnoses("6a7").length, 26);
  assert.equal(searchIcd11Chapter06Diagnoses("6A70")[0].title, "Single episode depressive disorder");
  assert.ok(searchIcd11Chapter06Diagnoses("depressive disorder").some(({ code }) => code === "6A70"));
  assert.ok(findIcd11Chapter06Diagnosis("6A01.20")!.parents.some((group) => group.startsWith("6A01.2")));
  assert.equal(findIcd11Chapter06Diagnosis("7B2Y"), undefined);
  assert.equal(psychiatryNavigation.flatMap(({ links }) => [...links]).length, 23);
});

test("monthly log is private, unique, revision-checked and signed by the assigned reviewer", async () => {
  const { base } = runtime;
  const section = "/psychiatry/entries/opd";
  const payload = { values: { month: "2026-11", reviewerId: String(accounts.faculty0.id) }, rows: [row, { ...row, diagnosisCode: "6A71", visit: "Review" }] };
  const post = await request(base, section, accounts.student0, "POST", payload);
  assert.equal(post.status, 201);
  const id = post.body.id;
  assert.equal((await request(base, section, accounts.student0, "POST", payload)).status, 409);
  assert.equal((await request(base, section, accounts.student2, "POST", payload)).status, 403);
  assert.equal((await request(base, "/psychiatry/entries", accounts.student2, "GET")).status, 403);
  for (const resident of [accounts.student1, accounts.student20]) {
    if (!resident) continue;
    const other = await request(base, "/psychiatry/entries", resident);
    assert.equal(other.status, 200);
    assert.equal(other.body.some((entry: { id: number }) => entry.id === id), false);
  }
  const own = await request(base, "/psychiatry/entries", accounts.student0);
  assert.equal(own.body.find((entry: { id: number }) => entry.id === id).diagnosisRows[0].diagnosis.uri, findIcd11Chapter06Diagnosis("6A70")!.uri);

  const change = { ...payload, revision: 1 };
  await evidence("resident unauthenticated", `${section}/${id}`, undefined, change, 401);
  await evidence("resident wrong owner", `${section}/${id}`, accounts.student20, change, 403);
  await evidence("resident correct owner", `${section}/${id}`, accounts.student0, change, 200);
  await evidence("resident nonexistent", `${section}/999999`, accounts.student0, change, 404);

  const reviewPath = `/psychiatry/reviews/${id}`;
  const review = { status: "verified", revision: 2 };
  await evidence("review unauthenticated", reviewPath, undefined, review, 401);
  await evidence("review unassigned faculty", reviewPath, accounts.faculty20, review, 403);
  await evidence("review assigned faculty", reviewPath, accounts.faculty0, review, 200);
  await evidence("review nonexistent", "/psychiatry/reviews/999999", accounts.faculty0, review, 404);
  assert.equal((await request(base, reviewPath, accounts.hod1, "PATCH", review)).status, 403);
  assert.equal((await request(base, reviewPath, accounts.hod0, "PATCH", review)).status, 409);
  const [saved] = await db.select().from(psychiatryEntriesTable).where(eq(psychiatryEntriesTable.id, id));
  assert.equal(saved.status, "verified");
});

test("shared sessions attach only to approved department participants and disclose a limited department summary", async () => {
  const { base } = runtime;
  const path = "/psychiatry/entries/a_cp";
  const payload = { values: { date: "2026-11-24", topic: "Synthetic academic session", reviewerId: String(accounts.faculty0.id), attendees: [String(accounts.student20.id)], discussion: "Synthetic discussion" } };
  assert.equal((await request(base, path, accounts.student0, "POST", { values: { ...payload.values, attendees: [String(accounts.student1.id)] } })).status, 400);
  const created = await request(base, path, accounts.student0, "POST", payload);
  assert.equal(created.status, 201);
  const id = created.body.id;
  const participant = await request(base, "/psychiatry/entries", accounts.student20);
  const attendance = participant.body.find((entry: { id: number }) => entry.id === id);
  assert.equal(attendance.own, false);
  assert.equal(attendance.values.discussion, undefined);
  assert.equal(attendance.reviewerId, undefined);
  assert.equal((await request(base, `/psychiatry/reviews/${id}`, accounts.faculty0, "PATCH", { status: "verified", revision: 1 })).status, 200);
  const summary = await request(base, `/psychiatry/sessions/a_cp/${id}`, accounts.student20);
  assert.equal(summary.status, 200);
  assert.deepEqual(Object.keys(summary.body.values).sort(), ["date", "topic"]);
  assert.equal((await request(base, `/psychiatry/sessions/a_cp/${id}`, accounts.student1)).status, 404);
});

test("short case saves a canonical Chapter 06 selection in the existing faculty workflow", async () => {
  const { base } = runtime;
  const path = `/students/${accounts.student0.studentId}/case-logs`;
  const payload = { supervisorId: accounts.faculty0.id, date: "2026-11-24", patientAge: "18", patientGender: "other", diagnosisFinal: "ignored", category: SHORT_CASE_CATEGORY,
    psychiatryShortCase: { seenIn: "OPD", diagnosisCode: "6a70", tags: ["Adult psychiatry"], activities: ["History"], referredFrom: "" } };
  const created = await request(base, path, accounts.student0, "POST", payload);
  assert.equal(created.status, 201);
  assert.equal(created.body.diagnosisFinal, "6A70 Single episode depressive disorder");
  assert.equal(created.body.customFields.psychiatryDiagnosisUri, findIcd11Chapter06Diagnosis("6A70")!.uri);
  assert.equal((await request(base, path, accounts.student0, "POST", { ...payload, psychiatryShortCase: { ...payload.psychiatryShortCase, diagnosisCode: "7B2Y" } })).status, 400);
  assert.equal(created.body.patientUhid, null);
  assert.equal((await request(base, path, accounts.student0, "POST", { ...payload, patientUhid: "SYNTHETIC" })).status, 400);
  await db.update(caseLogsTable).set({ patientUhid: "SYNTHETIC" }).where(eq(caseLogsTable.id, created.body.id));
  const edited = await request(base, `${path}/${created.body.id}`, accounts.student0, "PATCH", { ...payload, patientAge: "19" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.patientAge, "19");
  assert.equal(edited.body.patientUhid, null);
  for (const caller of [accounts.student0, accounts.faculty0, accounts.hod0]) {
    const result = await request(base, `/students/${accounts.student0.studentId}/logs`, caller);
    assert.equal(result.status, 200);
    assert.equal(result.body.caseLogs.find((entry: { id: number }) => entry.id === created.body.id).patientUhid, null);
  }
  const queue = await request(base, `/professors/${accounts.faculty0.id}/review-queue`, accounts.faculty0);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.pendingReviews.find((item: { dbId: number; logType: string }) =>
    item.logType === "case" && item.dbId === created.body.id).patientUhid, null);
  const review = await request(base, `/logs/case/${created.body.id}/review`, accounts.faculty0, "PATCH", { status: "verified" });
  assert.equal(review.status, 200);
  assert.equal(review.body.patientUhid, null);
  const [stored] = await db.select().from(caseLogsTable).where(eq(caseLogsTable.id, created.body.id));
  assert.equal(stored.patientUhid, "SYNTHETIC");
  const legacyPath = `/students/${accounts.student2.studentId}/case-logs`;
  const { psychiatryShortCase: _psychiatryShortCase, ...legacy } = payload;
  const existingCategory = await request(base, legacyPath, accounts.student2, "POST", { ...legacy, supervisorId: accounts.faculty2.id });
  assert.equal(existingCategory.status, 201);
  assert.equal((await request(base, `${legacyPath}/${existingCategory.body.id}`, accounts.student2, "PATCH", { diagnosisFinal: "Synthetic existing entry" })).status, 200);
});

test("long cases save without a patient ID and historical IDs are hidden from residents and reviewers", async () => {
  const { base } = runtime;
  const path = "/psychiatry/entries/long";
  const values = { age: "18", sex: "Other", admission: "Month and year", month: "2026-11",
    diagnosis: "6A70", unit: "Unit 1", reviewerId: String(accounts.faculty0.id) };
  assert.equal((await request(base, path, accounts.student0, "POST", { values: { ...values, recordNumber: "SYNTHETIC" } })).status, 400);
  const created = await request(base, path, accounts.student0, "POST", { values });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const [entry] = await db.select().from(psychiatryEntriesTable).where(eq(psychiatryEntriesTable.id, id));
  await db.update(psychiatryEntriesTable).set({ values: { ...entry.values, recordNumber: "SYNTHETIC" } }).where(eq(psychiatryEntriesTable.id, id));
  const edited = await request(base, `${path}/${id}`, accounts.student0, "PATCH", { values: { ...values, age: "19" }, revision: 1 });
  assert.equal(edited.status, 200);
  for (const [route, caller] of [["/psychiatry/entries", accounts.student0], ["/psychiatry/reviews", accounts.faculty0], ["/psychiatry/reviews", accounts.hod0]] as const) {
    const result = await request(base, route, caller);
    assert.equal(result.status, 200);
    const row = result.body.find((item: { id: number }) => item.id === id);
    assert.equal(row.values.age, "19");
    assert.equal(row.values.recordNumber, undefined);
  }
  const [stored] = await db.select().from(psychiatryEntriesTable).where(eq(psychiatryEntriesTable.id, id));
  assert.equal(stored.values.recordNumber, "SYNTHETIC");
});

test("production department deletion remains blocked when Psychiatry records exist", async () => {
  const { deleteDepartmentCascade } = await import("../src/routes/superadmin.js");
  await assert.rejects(db.transaction((tx) => deleteDepartmentCascade(tx, departmentIds[0])), (failure: unknown) => {
    const error = failure as { statusOverride?: number; conflictMessage?: string };
    return error.statusOverride === 409 && Boolean(error.conflictMessage?.includes("psychiatry_entries"));
  });
  assert.ok((await db.select({ id: psychiatryEntriesTable.id }).from(psychiatryEntriesTable)
    .where(eq(psychiatryEntriesTable.departmentId, departmentIds[0]))).length > 0);
});

test("uncoded diagnoses round-trip in short, long and monthly cases", async () => {
  const { base } = runtime;
  const resident = accounts.student0;
  const reviewerId = accounts.faculty0.id;
  for (const [selection, title, month] of [
    ["other", "Other", "2026-01"],
    ["evaluation", "Needs detailed evaluation", "2026-02"],
    ["text:Synthetic clinician entry", "Synthetic clinician entry", "2026-03"],
  ]) {
    const short = await request(base, `/students/${resident.studentId}/case-logs`, resident, "POST", {
      supervisorId: reviewerId, date: `${month}-01`, patientAge: "18", patientGender: "other",
      diagnosisFinal: title, category: SHORT_CASE_CATEGORY,
      psychiatryShortCase: { seenIn: "OPD", diagnosisCode: selection, tags: [], activities: [], referredFrom: "" },
    });
    assert.equal(short.status, 201);
    assert.equal(short.body.diagnosisFinal, title);
    assert.equal(short.body.customFields.psychiatryDiagnosisCode, selection);
    assert.equal(short.body.customFields.psychiatryDiagnosisUri, "");
    const editedShort = await request(base, `/students/${resident.studentId}/case-logs/${short.body.id}`, resident, "PATCH", {
      patientAge: "19",
      psychiatryShortCase: { seenIn: "OPD", diagnosisCode: selection, tags: [], activities: [], referredFrom: "" },
    });
    assert.equal(editedShort.status, 200);
    assert.equal(editedShort.body.diagnosisFinal, title);
    const queue = await request(base, `/professors/${reviewerId}/review-queue`, accounts.faculty0);
    assert.equal(queue.status, 200);
    assert.equal(queue.body.pendingReviews.find((item: { dbId: number; logType: string }) =>
      item.logType === "case" && item.dbId === short.body.id).diagnosisFinal, title);

    const longValues = { age: "18", sex: "Other", admission: "Month and year", month,
      diagnosis: selection, unit: "Unit 1", reviewerId: String(reviewerId) };
    const long = await request(base, "/psychiatry/entries/long", resident, "POST", { values: longValues });
    assert.equal(long.status, 201);
    const edited = await request(base, `/psychiatry/entries/long/${long.body.id}`, resident, "PATCH",
      { values: { ...longValues, age: "19" }, revision: 1 });
    assert.equal(edited.status, 200);
    const monthly = await request(base, "/psychiatry/entries/opd", resident, "POST", {
      values: { month, reviewerId: String(reviewerId) }, rows: [{ ...row, diagnosisCode: selection }],
    });
    assert.equal(monthly.status, 201);
    const expected = { code: selection, title, uri: "" };
    for (const [route, caller] of [["/psychiatry/entries", resident], ["/psychiatry/reviews", accounts.faculty0]] as const) {
      const list = await request(base, route, caller);
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.find((entry: { id: number }) => entry.id === long.body.id).values.diagnosis, expected);
      assert.deepEqual(list.body.find((entry: { id: number }) => entry.id === monthly.body.id).diagnosisRows[0].diagnosis, expected);
    }
  }
  const empty = await request(base, "/psychiatry/entries/opd", resident, "POST", {
    values: { month: "2026-04", reviewerId: String(reviewerId) }, rows: [{ ...row, diagnosisCode: "text:  " }],
  });
  assert.equal(empty.status, 400);
});
