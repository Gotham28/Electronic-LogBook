// A resident's delete sets deletedAt on a pending case or procedure log. From then on the entry
// is gone for every count a person sees: the resident's dashboard and the HOD's analytics.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

const category = (body: any, id: string) => body.categories.find((item: any) => item.id === id);

test("deleted case and procedure logs drop out of the dashboard and HOD analytics", async () => {
  const base = "/students/" + a.student2.studentId;
  const dashboardBefore = await call(base + "/dashboard", "student2");
  const analyticsBefore = await call("/departments/" + a.hod2.departmentId + "/analytics", "hod2");
  assert.equal(dashboardBefore.status, 200);
  assert.equal(analyticsBefore.status, 200);

  const caseLog = await call(base + "/case-logs", "student2", "POST", { supervisorId: a.faculty2.id, date: "2026-03-01",
    patientAge: "30", patientGender: "female", diagnosisFinal: "Synthetic diagnosis" });
  const procedureLog = await call(base + "/procedure-logs", "student2", "POST", { supervisorId: a.faculty2.id,
    procedureGroup: "Test group 2", procedureName: "Test procedure 2", date: "2026-03-01", patientUhid: "SYNTHETIC-1",
    patientAge: "30", competencyLevel: "observed" });
  assert.equal(caseLog.status, 201);
  assert.equal(procedureLog.status, 201);

  const dashboardWith = await call(base + "/dashboard", "student2");
  assert.equal(category(dashboardWith.body, "cases").logged, category(dashboardBefore.body, "cases").logged + 1);
  assert.equal(category(dashboardWith.body, "procedures").logged, category(dashboardBefore.body, "procedures").logged + 1);

  assert.equal((await call(base + "/case-logs/" + caseLog.body.id, "student2", "DELETE")).status, 200);
  assert.equal((await call(base + "/procedure-logs/" + procedureLog.body.id, "student2", "DELETE")).status, 200);

  const dashboardAfter = await call(base + "/dashboard", "student2");
  assert.equal(category(dashboardAfter.body, "cases").logged, category(dashboardBefore.body, "cases").logged);
  assert.equal(category(dashboardAfter.body, "procedures").logged, category(dashboardBefore.body, "procedures").logged);

  const analyticsAfter = await call("/departments/" + a.hod2.departmentId + "/analytics", "hod2");
  assert.deepEqual(analyticsAfter.body.logStats, analyticsBefore.body.logStats);
  assert.ok(!analyticsAfter.body.topProcedures.some((row: any) => row.name === "Test procedure 2"),
    "a deleted procedure log is still listed in the HOD's top procedures");
});
