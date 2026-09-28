import { before, after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds } from "./support.js";
import { engine, db, departmentConfigsTable, departmentCatalogTable, clinicalWorkLogsTable } from "./database.js";

// Clinical work counts in /progress, the HOD roster, the review queue, analytics and the
// student dashboard. Fixture index 2 is set up like Radiology: case and procedure logs off,
// clinical work on, no case/procedure/academic totals, and one category with a minimum.
let runtime: Awaited<ReturnType<typeof setup>>;
const on = 2;
const off = 0;

before(async () => {
  runtime = await setup();
  await db.update(departmentConfigsTable).set({ requiredCases: null, requiredProcedures: null, requiredAcademic: null,
    enabledFeatures: { procedureExperience: true, clinicalWorks: true, hideCaseLogs: true, hideProcedureLogs: true } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[on]));
  await db.insert(departmentCatalogTable).values([
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "CT scan", value: "ct_scan", required: 4 },
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "MRI scan", value: "mri_scan", required: 0 },
    // A per-month minimum is not part of the total, as for case and academic targets.
    { departmentId: departmentIds[on], kind: "clinical_work_category", name: "Mammogram", value: "mammogram", required: 5, period: "month" },
    // Clinical work is off in this department, so this minimum must not count.
    { departmentId: departmentIds[off], kind: "clinical_work_category", name: "CT scan", value: "ct_scan", required: 6 },
  ]);
  const student = a[`student${on}`].studentId!;
  const row = (category: string, status: "pending" | "verified" | "rejected", deletedAt: Date | null = null) => ({
    studentId: student, supervisorId: a[`faculty${on}`].id, date: "2026-09-01", category, patientAge: "40",
    patientSex: "female" as const, caseNumber: "TEST-CWP", status, deletedAt });
  await db.insert(clinicalWorkLogsTable).values([
    row("ct_scan", "verified"), row("ct_scan", "verified"), row("ct_scan", "pending"),
    row("ct_scan", "rejected"), row("ct_scan", "verified", new Date()),
    row("mri_scan", "verified"),
  ]);
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const call = (path: string, who?: keyof typeof a) => request(runtime.base, path, who ? a[who] : undefined);

// Evidence for AGENTS.md §11: request line, status and message or counts only. No patient fields.
function evidence(t: TestContext, label: string, path: string, who: string, res: { status: number; body: any }) {
  const summary = res.body?.message !== undefined ? { message: res.body.message } : { clinicalWorks: res.body?.clinicalWorks };
  t.diagnostic(`${label}: GET /api${path} as ${who} -> ${res.status} ${JSON.stringify(summary)}`);
}

test("GET /progress: 401 / 403 / 200 / nonexistent student", async (t) => {
  const own = `/students/${a[`student${on}`].studentId}/progress`;
  let res = await call(own);
  evidence(t, "unauthenticated", own, "nobody", res);
  assert.equal(res.status, 401);

  res = await call(own, `faculty${off}`);
  evidence(t, "wrong owner (faculty of another department)", own, `faculty${off}`, res);
  assert.equal(res.status, 403);

  res = await call(own, `student2${on}` as keyof typeof a);
  evidence(t, "wrong owner (another student, same department)", own, `student2${on}`, res);
  assert.equal(res.status, 403);

  for (const who of [`student${on}`, `faculty${on}`, `hod${on}`] as const) {
    res = await call(own, who);
    evidence(t, "correct owner", own, who, res);
    assert.equal(res.status, 200);
  }

  // studentAccess answers 403 for an id outside the caller's scope, including one that does
  // not exist, so ids cannot be probed (same as clinical-works.test.ts).
  const missing = "/students/999999/progress";
  res = await call(missing, `hod${on}`);
  evidence(t, "nonexistent student (403 by design)", missing, `hod${on}`, res);
  assert.equal(res.status, 403);
});

test("/progress counts clinical work per category, leaving out rejected and deleted entries", async () => {
  const res = await call(`/students/${a[`student${on}`].studentId}/progress`, `faculty${on}`);
  assert.equal(res.status, 200);
  const byCategory = Object.fromEntries(res.body.clinicalWorks.map((row: any) => [row.value, row]));
  assert.deepEqual(byCategory.ct_scan, { value: "ct_scan", verified: 2, pending: 1 });
  assert.deepEqual(byCategory.mri_scan, { value: "mri_scan", verified: 1, pending: 0 });
  assert.deepEqual(Object.keys(res.body.clinicalWorks[0]).sort(), ["pending", "value", "verified"], "counts only, no patient fields");
});

test("the HOD roster counts clinical work toward completion", async () => {
  const res = await call("/admin/roster", `hod${on}`);
  assert.equal(res.status, 200);
  const student = res.body.students.find((s: any) => s.studentProfileId === a[`student${on}`].studentId);
  // Target: CT scan 4 + MRI 0 (the per-month mammogram minimum is not in the total).
  // Verified: 3 (2 CT + 1 MRI; the rejected and deleted entries do not count).
  assert.equal(student.targets.clinicalWork, 4);
  assert.equal(student.verified.clinicalWork, 3);
  assert.equal(student.completion, 75, "clinical work is the only target, 3 of 4 verified");
});

test("the review queue and analytics use the same completion", async () => {
  const queue = await call(`/professors/${a[`faculty${on}`].id}/review-queue`, `faculty${on}`);
  assert.equal(queue.status, 200);
  const mentee = queue.body.assignedMentees.find((m: any) => m.id === a[`student${on}`].studentId);
  assert.equal(mentee.overallCompletion, 75);
  assert.equal(mentee.shortfallStatus, "on_track");
  assert.equal(mentee.logCounts.clinical, 3);

  const analytics = await call(`/departments/${departmentIds[on]}/analytics`, `hod${on}`);
  assert.equal(analytics.status, 200);
  assert.ok(analytics.body.avgCompletion > 0, "without clinical work every target is empty and the average is 0");
});

test("the student dashboard shows the clinical work target", async () => {
  const res = await call(`/students/${a[`student${on}`].studentId}/dashboard`, `student${on}`);
  assert.equal(res.status, 200);
  const clinical = res.body.categories.find((c: any) => c.id === "clinicalWorks");
  assert.equal(clinical.required, 4);
  assert.equal(clinical.verified, 3);
  assert.equal(clinical.percentage, 75);
});

test("a department with clinical work switched off gets no clinical work target", async () => {
  const res = await call("/admin/roster", `hod${off}`);
  assert.equal(res.status, 200);
  const student = res.body.students.find((s: any) => s.studentProfileId === a[`student${off}`].studentId);
  assert.equal(student.targets.clinicalWork, 0);
});
