import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { writeAcademicRecord, type AcademicLogbookSection } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { academicLogsTable, caseLogsTable, clinicalWorkLogsTable, conferencesTable, db, departmentCatalogTable, departmentConfigsTable, engine, postingsTable, procedureLogsTable, procedureTypesTable, studentsTable } from "./database.js";
import { accounts, request, setup, type Account } from "./support.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("resident progress gaps use the account's own profile and configured department targets", async () => {
  const resident = accounts.student0;
  const path = "/arogya/progress-gaps";
  await db.insert(procedureTypesTable).values({
    departmentId: resident.departmentId, group: "Test training", name: "Fixture procedure", required: 2,
  });
  await db.insert(procedureLogsTable).values({
    studentId: accounts.student1.studentId!, supervisorId: accounts.faculty1.id,
    procedureGroup: "Test training", procedureName: "Fixture procedure", date: "2026-05-01",
    patientUhid: "SYNTHETIC-FOREIGN", patientAge: "fixture", competencyLevel: "observed", status: "verified",
  });

  async function check(actor: Account | undefined, label: string, status: number) {
    const response = await request(runtime.base, path, actor);
    console.log(`EVIDENCE GET /api${path} (${label}) -> ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.status, status);
    return response.body;
  }

  await check(undefined, "unauthenticated", 401);
  await check(accounts.faculty1, "professor outside the resident role", 403);
  const own = await check(resident, "resident with own profile", 200);
  assert.deepEqual(own.gaps.find((gap: { label: string }) => gap.label === "Test training: Fixture procedure"), {
    label: "Test training: Fixture procedure", verified: 0, target: 2,
  });
  assert.deepEqual(own.gaps.find((gap: { label: string }) => gap.label === "Procedures"), {
    label: "Procedures", verified: 0, target: 11,
  });
  const another = await check(accounts.student1, "resident of a different department", 200);
  assert.ok(!another.gaps.some((gap: { label: string }) => gap.label === "Test training: Fixture procedure"));
  assert.deepEqual(another.gaps.find((gap: { label: string }) => gap.label === "Procedures"), {
    label: "Procedures", verified: 1, target: 12,
  });

  const missing = accounts.student2;
  await db.delete(studentsTable).where(eq(studentsTable.userId, missing.id));
  await check(missing, "resident account without a profile", 404);
});

test("professor review flags use assigned logs and verified posting dates", async () => {
  const reviewer = accounts.faculty0;
  const otherReviewer = accounts.faculty20;
  const studentId = accounts.student0.studentId!;
  await db.insert(postingsTable).values({
    studentId, supervisorId: reviewer.id, status: "verified", ward: "Fixture posting",
    startDate: "2026-05-01", endDate: "2026-05-31",
  });
  const base = {
    studentId, supervisorId: reviewer.id, status: "pending" as const,
    date: "2026-04-30", patientUhid: "SYNTHETIC-KEY", patientAge: "test value",
    patientGender: "other", diagnosisFinal: "test value",
  };
  const [missing, duplicate, otherAssignment, inside] = await db.insert(caseLogsTable).values([
    { ...base, diagnosisFinal: " " },
    { ...base, patientUhid: ` ${base.patientUhid} ` },
    { ...base, supervisorId: otherReviewer.id },
    { ...base, date: "2026-05-01" },
  ]).returning({ id: caseLogsTable.id });
  const path = `/professors/${reviewer.id}/review-queue`;
  const authorized = await request(runtime.base, path, reviewer);
  assert.equal(authorized.status, 200);
  const find = (id: number) => authorized.body.pendingReviews.find((item: { id: string }) => item.id === `case-${id}`);
  assert.deepEqual(find(missing.id)?.reviewFlags, ["missing_required_fields", "outside_posting_dates", "duplicate_uhid_date"]);
  assert.deepEqual(find(duplicate.id)?.reviewFlags, ["outside_posting_dates", "duplicate_uhid_date"]);
  assert.deepEqual(find(inside.id)?.reviewFlags, []);
  assert.equal(find(otherAssignment.id), undefined);

  const scopedElsewhere = await request(runtime.base, `/professors/${otherReviewer.id}/review-queue`, otherReviewer);
  assert.equal(scopedElsewhere.status, 200);
  const otherRecord = scopedElsewhere.body.pendingReviews.find((item: { id: string }) => item.id === `case-${otherAssignment.id}`);
  assert.deepEqual(otherRecord?.reviewFlags, []);
  assert.equal((await request(runtime.base, path, otherReviewer)).status, 403);
});

test("professor review flags respect legacy procedure fields and configured academic and clinical requirements", async () => {
  const reviewer = accounts.faculty0;
  const departmentId = reviewer.departmentId;
  const base = { studentId: accounts.student20.studentId!, supervisorId: reviewer.id, date: "2026-05-01" };
  await db.insert(postingsTable).values({
    studentId: base.studentId, supervisorId: reviewer.id, status: "verified", ward: "Fixture posting",
    startDate: "2026-05-01", endDate: "2026-05-31",
  });
  const procedure = {
    ...base, procedureGroup: "Test group 0", procedureName: "Test procedure 0",
    patientUhid: "SYNTHETIC-LEGACY", patientAge: "fixture", competencyLevel: "N/A",
  };
  const [needsUhid, needsAge, needsCompetency, completeProcedure] = await db.insert(procedureLogsTable).values([
    { ...procedure, patientUhid: " " },
    { ...procedure, patientUhid: "SYNTHETIC-AGE", patientAge: "" },
    { ...procedure, patientUhid: "SYNTHETIC-COMPETENCY", competencyLevel: "" },
    procedure,
  ]).returning({ id: procedureLogsTable.id });

  const section: AcademicLogbookSection = {
    value: "fixture-session", topicLabel: "Topic", years: [1], fields: [
      { key: "mode", label: "Mode", type: "text", required: true },
      { key: "detail", label: "Detail", type: "text", requiredWhen: { field: "mode", value: "guided" } },
    ],
  };
  const academic = { ...base, activityType: section.value, topic: "Fixture topic" };
  const [needsMode, needsDetail, completeAcademic, genericAcademic] = await db.insert(academicLogsTable).values([
    { ...academic, description: writeAcademicRecord(1, {}, "", section) },
    { ...academic, description: writeAcademicRecord(1, { mode: "guided" }, "", section) },
    { ...academic, description: writeAcademicRecord(1, { mode: "independent" }, "", section) },
    { ...academic, activityType: "discussion-0", description: "A legacy plain description" },
  ]).returning({ id: academicLogsTable.id });
  const conference = { ...base, conferenceName: "Fixture conference" };
  const [needsRole, completeConference] = await db.insert(conferencesTable).values([
    { ...conference, role: "" as never }, // An incomplete legacy row predates submission validation.
    { ...conference, role: "attended" },
  ]).returning({ id: conferencesTable.id });

  await db.insert(departmentCatalogTable).values([
    { departmentId, kind: "clinical_work_category", name: "Fixture A", value: "fixture-a" },
    { departmentId, kind: "clinical_work_category", name: "Fixture B", value: "fixture-b" },
    { departmentId, kind: "clinical_work_subtype", name: "Fixture subtype", value: "fixture-subtype", parentValue: "fixture-a" },
  ]);
  const clinical = {
    ...base, category: "fixture-a", subType: "fixture-subtype", caseNumber: "SYNTHETIC-CASE",
    patientAge: "fixture", patientSex: "other" as const, competency: "observed",
  };
  const [needsSubtype, needsClinicalCompetency, outside, completeClinical] = await db.insert(clinicalWorkLogsTable).values([
    { ...clinical, subType: null },
    { ...clinical, competency: null },
    { ...clinical, date: "2026-06-01" },
    { ...clinical, category: "fixture-b", subType: null },
  ]).returning({ id: clinicalWorkLogsTable.id });

  const response = await request(runtime.base, `/professors/${reviewer.id}/review-queue`, reviewer);
  assert.equal(response.status, 200);
  const flags = (type: string, id: number) => response.body.pendingReviews
    .find((item: { id: string }) => item.id === `${type}-${id}`)?.reviewFlags;
  for (const { id } of [needsUhid, needsAge, needsCompetency]) {
    assert.deepEqual(flags("procedure", id), ["missing_required_fields"]);
  }
  assert.deepEqual(flags("procedure", completeProcedure.id), []);
  assert.deepEqual(flags("academic", needsMode.id), ["missing_required_fields"]);
  assert.deepEqual(flags("academic", needsDetail.id), ["missing_required_fields"]);
  assert.deepEqual(flags("academic", completeAcademic.id), []);
  assert.deepEqual(flags("academic", genericAcademic.id), []);
  assert.deepEqual(flags("conference", needsRole.id), ["missing_required_fields"]);
  assert.deepEqual(flags("conference", completeConference.id), []);
  assert.deepEqual(flags("clinical_work", needsSubtype.id), ["missing_required_fields"]);
  assert.deepEqual(flags("clinical_work", needsClinicalCompetency.id), ["missing_required_fields"]);
  assert.deepEqual(flags("clinical_work", outside.id), ["outside_posting_dates"]);
  assert.deepEqual(flags("clinical_work", completeClinical.id), []);
});

test("free-text procedures ignore requirements from a retained procedure catalog", async () => {
  const reviewer = accounts.faculty1;
  await db.update(departmentConfigsTable).set({ enabledFeatures: { freeTextProcedures: true } })
    .where(eq(departmentConfigsTable.departmentId, reviewer.departmentId));
  await db.update(procedureTypesTable).set({ requiredLogFields: ["sex"] })
    .where(eq(procedureTypesTable.departmentId, reviewer.departmentId));
  const [saved] = await db.insert(procedureLogsTable).values({
    studentId: accounts.student1.studentId!, supervisorId: reviewer.id,
    procedureGroup: "Test group 1", procedureName: "Test procedure 1", date: "2026-05-01",
    patientUhid: "SYNTHETIC-FREE-TEXT", patientAge: "fixture", competencyLevel: "N/A",
  }).returning({ id: procedureLogsTable.id });

  const response = await request(runtime.base, `/professors/${reviewer.id}/review-queue`, reviewer);
  assert.equal(response.status, 200);
  const item = response.body.pendingReviews.find((item: { id: string }) => item.id === `procedure-${saved.id}`);
  assert.deepEqual(item?.reviewFlags, []);
});
