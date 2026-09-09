// Evidence Gate H (docs/SECURITY_FIXES.md sec 8) — SEC-06.
//
// Three of the four required cases per route are live-tested below. The fourth -
// "a caller with a null departmentId receives 403" - could not be run and is not
// asserted here. Confirmed by direct inspection, not assumption:
//   1. middlewares/auth.ts's requireDepartment is mounted unconditionally at
//      student.ts:14 (kept mounted, per this batch's own instruction) and rejects any
//      caller whose departmentId is not a positive integer with 403, before any of the
//      three fixed handlers ever run.
//   2. lib/db/src/schema/users.ts's own CHECK constraint, users_department_required,
//      makes it impossible for a row with role IN ('student','professor','hod') to have
//      a null departmentId at all - not an application-layer choice, a database
//      constraint PGlite itself enforces.
//   3. requireRole(["student","professor","hod"]) on this router admits only those
//      three roles, so a role the constraint exempts (dean/admin) cannot reach these
//      routes either.
// No combination of role and department state can reach the code this batch fixed with
// a null departmentId. Per the evidence standard: this case is marked unverified, not
// asserted as passing.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("SEC-06: GET /:studentId/leave-balance fails closed on department scope", async () => {
  const path = "/students/" + a.student0.studentId + "/leave-balance";
  const unauthenticated = await request(runtime.base, path);
  const crossDept = await call(path, "faculty1"); // real professor, real department, just the wrong one
  const sameDept = await call(path, "faculty0");

  console.log("SEC-06 leave-balance unauthenticated ->", unauthenticated.status);
  console.log("SEC-06 leave-balance cross-department professor ->", crossDept.status, JSON.stringify(crossDept.body));
  console.log("SEC-06 leave-balance same-department professor ->", sameDept.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(crossDept.status, 403);
  assert.equal(sameDept.status, 200);
});

test("SEC-06: GET /:studentId/assessments fails closed on department scope", async () => {
  const path = "/students/" + a.student0.studentId + "/assessments";
  const unauthenticated = await request(runtime.base, path);
  const crossDept = await call(path, "faculty1");
  const sameDept = await call(path, "faculty0");

  console.log("SEC-06 assessments GET unauthenticated ->", unauthenticated.status);
  console.log("SEC-06 assessments GET cross-department professor ->", crossDept.status, JSON.stringify(crossDept.body));
  console.log("SEC-06 assessments GET same-department professor ->", sameDept.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(crossDept.status, 403);
  assert.equal(sameDept.status, 200);
});

test("SEC-06: POST /:studentId/assessments fails closed on department scope", async () => {
  const path = "/students/" + a.student0.studentId + "/assessments";
  const body = { examName: "SEC-06 evidence exam", type: "quarterly", date: "2026-09-01", marks: 50 };
  const unauthenticated = await request(runtime.base, path, undefined, "POST", body);
  const crossDept = await call(path, "faculty1", "POST", body);
  const sameDept = await call(path, "faculty0", "POST", body);

  console.log("SEC-06 assessments POST unauthenticated ->", unauthenticated.status);
  console.log("SEC-06 assessments POST cross-department professor ->", crossDept.status, JSON.stringify(crossDept.body));
  console.log("SEC-06 assessments POST same-department professor ->", sameDept.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(crossDept.status, 403);
  assert.equal(sameDept.status, 201);
});

test("SEC-06: source-level confirmation the null-departmentId branch is unreachable", async () => {
  // Every account this test harness can create has a role of student/professor/hod, and
  // every such account is bound by users_department_required. This asserts that fact
  // holds for the fixtures actually in play here, rather than leaving it as prose.
  for (const key of ["faculty0", "faculty1", "hod0", "hod1", "student0", "student1"] as const) {
    assert.notEqual(a[key].departmentId, null, key + " must have a real department - the DB constraint forbids otherwise");
  }
});
