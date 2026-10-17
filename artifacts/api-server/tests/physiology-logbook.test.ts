import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { physiologyLogbook, readAcademicRecord, writeAcademicRecord, validateAcademicRecord, academicRecordText,
  type AcademicLogbookSection } from "@workspace/api-zod";
import { setup, request, accounts, departmentIds } from "./support.js";
import { db, engine, departmentsTable } from "./database.js";

// The repository's @workspace/db alias uses an in-memory PGlite database only.
let runtime: Awaited<ReturnType<typeof setup>>;
let editableLogId: number;
const owner = () => accounts.student2;
const path = () => `/students/${owner().studentId}/academic-logs`;

function payload(section: AcademicLogbookSection) {
  const values: Record<string, string> = {};
  for (const field of section.fields) {
    if (!field.required) continue;
    values[field.key] = field.type === "select" ? field.options![0]
      : field.type === "date" ? "2026-10-17"
      : field.type === "number" ? "50" : "Synthetic training activity";
  }
  return { activityType: section.value, topic: "Synthetic training activity", date: "2026-10-10",
    supervisorId: accounts.faculty2.id, presentationType: section.participation?.[0] ?? null,
    description: writeAcademicRecord(section.years[0], values, "Synthetic notes") };
}

before(async () => {
  runtime = await setup();
  await db.update(departmentsTable).set({ name: "Physiology", code: "PHYS" }).where(eq(departmentsTable.id, departmentIds[2]));
  await db.update(departmentsTable).set({ name: "Physiology (Test)", code: "TEST-PHYS", isTest: true,
    configSourceDepartmentId: departmentIds[2] }).where(eq(departmentsTable.id, departmentIds[0]));
  const result = await request(runtime.base, path(), owner(), "POST", payload(physiologyLogbook.sections[0]));
  assert.equal(result.status, 201);
  editableLogId = result.body.id;
});

after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

test("the document's 15, 15 and 18 sections are available in the corresponding years", () => {
  assert.equal(physiologyLogbook.sections.length, 22);
  assert.deepEqual([1, 2, 3].map((year) => physiologyLogbook.sections.filter((section) => section.years.includes(year)).length), [15, 15, 18]);
  const appraisal = physiologyLogbook.sections.find((section) => section.value.startsWith("Student appraisal"))!;
  assert.equal(appraisal.fields.filter((field) => field.key.startsWith("rating_")).length, 14);
});

test("Physiology and its test department get identical forms without catalog seeding or flags", async () => {
  const real = await request(runtime.base, `/departments/${departmentIds[2]}/catalog`, owner());
  const mirror = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, accounts.student0);
  assert.equal(real.status, 200);
  assert.equal(mirror.status, 200);
  assert.deepEqual(real.body.academicLogbook, physiologyLogbook);
  assert.deepEqual(mirror.body.academicLogbook, real.body.academicLogbook);
  assert.ok(!real.body.academics.some((option: { value: string }) => option.value === physiologyLogbook.sections[0].value));
});

test("other departments retain their academic options and plain-text descriptions", async () => {
  const catalog = await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, accounts.student1);
  assert.equal(catalog.body.academicLogbook, null);
  const result = await request(runtime.base, `/students/${accounts.student1.studentId}/academic-logs`, accounts.student1, "POST", {
    activityType: "discussion-1", topic: "Synthetic discussion", date: "2026-10-10", supervisorId: accounts.faculty1.id,
    description: "Synthetic description",
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.description, "Synthetic description");
  const forbidden = await request(runtime.base, `/students/${accounts.student1.studentId}/academic-logs`, accounts.student1, "POST", {
    ...payload(physiologyLogbook.sections[0]), supervisorId: accounts.faculty1.id,
  });
  assert.equal(forbidden.status, 400, "a different department cannot use the Physiology profile");
});

test("every document section can be saved and read back with its typed details", async () => {
  const ids: number[] = [];
  for (const section of physiologyLogbook.sections) {
    const body = payload(section);
    const result = await request(runtime.base, path(), owner(), "POST", body);
    assert.equal(result.status, 201, section.value);
    assert.equal(result.body.description, body.description);
    assert.equal(result.body.status, "pending");
    ids.push(result.body.id);
  }
  const logs = await request(runtime.base, `/students/${owner().studentId}/logs`, owner());
  assert.equal(logs.status, 200);
  assert.ok(ids.every((id) => logs.body.academicLogs.some((log: { id: number }) => log.id === id)));
});

test("mirrored students can save the same sections using their own department's faculty", async () => {
  const result = await request(runtime.base, `/students/${accounts.student0.studentId}/academic-logs`, accounts.student0, "POST", {
    ...payload(physiologyLogbook.sections[0]), supervisorId: accounts.faculty0.id,
  });
  assert.equal(result.status, 201);
  const crossDepartment = await request(runtime.base, `/students/${accounts.student0.studentId}/academic-logs`, accounts.student0, "POST", payload(physiologyLogbook.sections[0]));
  assert.equal(crossDepartment.status, 400);
});

test("PATCH an academic entry without authentication returns 401", async () => {
  const result = await request(runtime.base, `${path()}/${editableLogId}`, undefined, "PATCH", { topic: "Updated synthetic activity" });
  assert.equal(result.status, 401);
});

test("PATCH another student's academic entry returns 403", async () => {
  const result = await request(runtime.base, `${path()}/${editableLogId}`, accounts.student22, "PATCH", { topic: "Updated synthetic activity" });
  assert.equal(result.status, 403);
});

test("PATCH one's own academic entry returns 200 and preserves its structured details", async () => {
  const result = await request(runtime.base, `${path()}/${editableLogId}`, owner(), "PATCH", { topic: "Updated synthetic activity" });
  assert.equal(result.status, 200);
  assert.equal(readAcademicRecord(result.body.description)?.trainingYear, 1);
});

test("PATCH a nonexistent academic entry returns 404", async () => {
  const result = await request(runtime.base, `${path()}/99999999`, owner(), "PATCH", { topic: "Updated synthetic activity" });
  assert.equal(result.status, 404);
});

test("assessment marks are validated on both create and partial edit", async () => {
  const section = physiologyLogbook.sections.find((item) => item.value === "Test paper marks")!;
  const valid = payload(section);
  const created = await request(runtime.base, path(), owner(), "POST", valid);
  assert.equal(created.status, 201);
  for (const values of [{ marks: "101", maximumMarks: "100" }, { marks: "-1" }, { marks: "not a number" }]) {
    const description = writeAcademicRecord(3, values, "");
    assert.equal((await request(runtime.base, path(), owner(), "POST", { ...valid, description })).status, 400);
    assert.equal((await request(runtime.base, `${path()}/${created.body.id}`, owner(), "PATCH", { description })).status, 400);
  }
  const description = writeAcademicRecord(3, { marks: "87.5", maximumMarks: "100" }, "");
  const updated = await request(runtime.base, `${path()}/${created.body.id}`, owner(), "PATCH", { description });
  assert.equal(updated.status, 200);
  assert.equal(readAcademicRecord(updated.body.description)?.values.marks, "87.5");
  assert.match(academicRecordText(description, section), /Marks obtained: 87.5/);
});

test("validation covers participation, year, date ranges, attendance, appraisal ratings and discussion", () => {
  const seminar = physiologyLogbook.sections.find((item) => item.value === "Seminars")!;
  assert.ok(validateAcademicRecord(seminar, payload(seminar).description, "2026-10-10", ""));
  const attendance = physiologyLogbook.sections.find((item) => item.value === "Attendance")!;
  for (const percentage of ["-1", "101", "NaN"]) {
    assert.ok(validateAcademicRecord(attendance, writeAcademicRecord(3, { attendanceYear: "First year", endDate: "2026-10-17", percentage }, ""), "2026-10-10"));
  }
  const posting = physiologyLogbook.sections.find((item) => item.value === "Postings in allied departments")!;
  assert.ok(validateAcademicRecord(posting, writeAcademicRecord(1, { department: "Synthetic department", endDate: "2026-10-17" }, ""), "2026-10-10"));
  for (const endDate of ["2026-02-30", "2026-10-01"]) {
    assert.ok(validateAcademicRecord(posting, writeAcademicRecord(3, { department: "Synthetic department", endDate }, ""), "2026-10-10"));
  }
  const appraisal = physiologyLogbook.sections.find((item) => item.value.startsWith("Student appraisal"))!;
  const record = readAcademicRecord(payload(appraisal).description)!;
  assert.ok(validateAcademicRecord(appraisal, writeAcademicRecord(3, { ...record.values, "rating_1.1": "10" }, ""), "2026-10-10"));
  assert.ok(validateAcademicRecord(appraisal, writeAcademicRecord(3, { ...record.values, discussed: "No" }, ""), "2026-10-10"));
  assert.equal(validateAcademicRecord(appraisal, writeAcademicRecord(3, { ...record.values, discussed: "No", discussionExplanation: "Synthetic explanation" }, ""), "2026-10-10"), null);
  assert.equal(readAcademicRecord("Legacy plain text"), null);
  assert.equal(academicRecordText("Legacy plain text"), "Legacy plain text");
});

test("faculty review receives readable field metadata and retains details after verification", async () => {
  const queue = await request(runtime.base, `/professors/${accounts.faculty2.id}/review-queue`, accounts.faculty2);
  assert.equal(queue.status, 200);
  const item = queue.body.pendingReviews.find((log: { dbId: number; logType: string }) => log.dbId === editableLogId && log.logType === "academic");
  assert.equal(item.activityType, physiologyLogbook.sections[0].value);
  const review = await request(runtime.base, `/logs/academic/${editableLogId}/review`, accounts.faculty2, "PATCH", { status: "verified" });
  assert.equal(review.status, 200);
  assert.equal(readAcademicRecord(review.body.description)?.trainingYear, 1);
  assert.equal((await request(runtime.base, `${path()}/${editableLogId}`, owner(), "PATCH", { topic: "Changed after review" })).status, 400);
});
