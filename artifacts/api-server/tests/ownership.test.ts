// Evidence Gate B (docs/SECURITY_FIXES.md sec 2, CORRECTED) — SEC-01, SEC-02, SEC-05.
//
// Six routes behind studentAccess, four cases each:
//   1. unauthenticated                          -> 401
//   2. authenticated, wrong owner                -> 403
//   3. authenticated, correct owner               -> 200
//   4. authenticated, nonexistent studentId       -> 403, body byte-identical to case 2
//
// studentAccess (middlewares/student-access.ts) resolves existence and access in one
// query and returns the same 403 body for both, by design (sec 1b): splitting them would
// let any faculty account enumerate the resident roster by walking student ids. Case 4
// proves that collapse holds for each route, not that a distinct 404 exists.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

// Guaranteed absent from every department's numeric id range (support.ts's fixtures use
// small sequential ids from a fresh PGlite instance).
const NONEXISTENT_STUDENT_ID = 999999999;

test("SEC-01: GET /:studentId/leave-records — owning student and department HOD only", async () => {
  const base = "/students/" + a.student0.studentId + "/leave-records";
  const created = await call(base, "student0", "POST",
    { startDate: "2026-09-01", endDate: "2026-09-03", leaveType: "Casual", reason: "Batch B evidence - leave" });
  assert.equal(created.status, 201, "fixture: create a leave record for student0");

  const unauthenticated = await call(base);
  // The actual bug (SEC-01): a same-department professor, who has no supervisory
  // relationship to leave records at all, must be rejected exactly like a nonexistent
  // student - not merely "assigned elsewhere".
  const wrongOwnerProfessor = await call(base, "faculty0");
  const wrongOwnerStudent = await call(base, "student20");
  const correctOwnerStudent = await call(base, "student0");
  const correctOwnerHod = await call(base, "hod0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/leave-records", "hod0");

  console.log("SEC-01 unauthenticated ->", unauthenticated.status);
  console.log("SEC-01 wrong-owner (professor, same dept, no leave relationship) ->", wrongOwnerProfessor.status, JSON.stringify(wrongOwnerProfessor.body));
  console.log("SEC-01 wrong-owner (different student, same dept) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-01 correct-owner (student) ->", correctOwnerStudent.status);
  console.log("SEC-01 correct-owner (department HOD) ->", correctOwnerHod.status);
  console.log("SEC-01 nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerProfessor.status, 403);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.ok(correctOwnerStudent.body.data.some((r: any) => r.reason === "Batch B evidence - leave"));
  assert.equal(correctOwnerHod.status, 200);
  assert.equal(nonexistent.status, 403);
  // Case 4: body byte-identical to case 2 (both flavours of wrong-owner collapse to the
  // same body studentAccess already produces, so nonexistence is indistinguishable from
  // either "wrong student" or "professors are wholly excluded here").
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);
  assert.deepEqual(nonexistent.body, wrongOwnerProfessor.body);
  assert.deepEqual(wrongOwnerProfessor.body, wrongOwnerStudent.body);
});

test("SEC-02: GET /:studentId/dashboard (recentLogs) — professor scoping, soft-delete exclusion", async () => {
  const studentBase = "/students/" + a.student0.studentId;
  const supervised = await call(studentBase + "/case-logs", "student0", "POST",
    { date: "2026-09-01", patientAge: "Adult", patientGender: "other", diagnosisFinal: "Batch B evidence - supervised", supervisorId: a.faculty0.id });
  assert.equal(supervised.status, 201, "fixture: case log supervised by faculty0");

  const unauthenticated = await request(runtime.base, studentBase + "/dashboard");
  const wrongOwnerStudent = await call("/students/" + a.student1.studentId + "/dashboard", "student0");
  const correctOwnerStudent = await call(studentBase + "/dashboard", "student0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/dashboard", "hod0");

  console.log("SEC-02 unauthenticated ->", unauthenticated.status);
  console.log("SEC-02 wrong-owner (different student's dashboard) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-02 correct-owner ->", correctOwnerStudent.status);
  console.log("SEC-02 nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);

  // Additional required case: a same-department professor who does NOT supervise this
  // student's logs. This route mirrors /logs (student.ts:165-173), which never rejects
  // a same-department professor outright - it filters the DATA to what they supervise,
  // exactly like /logs does today. So this case is 200, not 403: the assertion that
  // matters is that recentLogs excludes the entry faculty20 does not supervise.
  const nonSupervisingProfessor = await call(studentBase + "/dashboard", "faculty20");
  console.log("SEC-02 wrong-owner (professor, same dept, does not supervise) ->", nonSupervisingProfessor.status,
    JSON.stringify(nonSupervisingProfessor.body.recentLogs));
  assert.equal(nonSupervisingProfessor.status, 200, "mirrors /logs: same-department professors are never route-rejected, only data-filtered");
  assert.ok(!nonSupervisingProfessor.body.recentLogs.some((log: any) => log.id === supervised.body.id),
    "a non-supervising professor must not see faculty0's supervised case in recentLogs");

  // Additional required case: a soft-deleted log must not appear.
  const del = await call(studentBase + "/case-logs/" + supervised.body.id, "student0", "DELETE");
  assert.equal(del.status, 200, "fixture: soft-delete the case log (status was pending)");
  const afterDelete = await call(studentBase + "/dashboard", "student0");
  console.log("SEC-02 after soft-delete, recentLogs ->", JSON.stringify(afterDelete.body.recentLogs));
  assert.ok(!afterDelete.body.recentLogs.some((log: any) => log.id === supervised.body.id),
    "a soft-deleted case log must not appear in recentLogs");

  // No clinical fields leak through the narrowed projection.
  assert.ok(afterDelete.body.recentLogs.every((log: any) =>
    !("patientUhid" in log) && !("chiefComplaints" in log) && !("history" in log) &&
    !("examination" in log) && !("diagnosisFinal" in log) && !("diagnosisProvisional" in log)));
});

test("SEC-05: GET /:studentId/postings — owner / supervising professor only", async () => {
  const studentBase = "/students/" + a.student0.studentId;
  const posting = await call(studentBase + "/postings", "student0", "POST",
    { ward: "unit-0", supervisorId: a.faculty0.id, startDate: "2026-09-01", endDate: "2026-09-05" });
  assert.equal(posting.status, 201, "fixture: posting supervised by faculty0");

  const unauthenticated = await request(runtime.base, studentBase + "/postings");
  const wrongOwnerStudent = await call(studentBase + "/postings", "student20");
  const correctOwnerStudent = await call(studentBase + "/postings", "student0");
  const correctOwnerHod = await call(studentBase + "/postings", "hod0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/postings", "hod0");
  const nonSupervisingProfessor = await call(studentBase + "/postings", "faculty20");

  console.log("SEC-05 unauthenticated ->", unauthenticated.status);
  console.log("SEC-05 wrong-owner (different student) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-05 correct-owner (student) ->", correctOwnerStudent.status);
  console.log("SEC-05 correct-owner (HOD) ->", correctOwnerHod.status);
  console.log("SEC-05 nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-05 non-supervising professor, same dept ->", nonSupervisingProfessor.status, JSON.stringify(nonSupervisingProfessor.body.data));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.ok(correctOwnerStudent.body.data.some((p: any) => p.id === posting.body.posting.id));
  assert.equal(correctOwnerHod.status, 200);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);
  assert.equal(nonSupervisingProfessor.status, 200);
  assert.ok(!nonSupervisingProfessor.body.data.some((p: any) => p.id === posting.body.posting.id),
    "a non-supervising professor must not see faculty0's posting");
});

test("SEC-05: GET /:studentId/assessments — owner / supervising professor only", async () => {
  const studentBase = "/students/" + a.student0.studentId;
  const assessment = await call(studentBase + "/assessments", "faculty0", "POST",
    { examName: "Batch B evidence exam", type: "quarterly", date: "2026-09-01", marks: 70 });
  assert.equal(assessment.status, 201, "fixture: assessment recorded by faculty0");

  const unauthenticated = await request(runtime.base, studentBase + "/assessments");
  const wrongOwnerStudent = await call(studentBase + "/assessments", "student20");
  const correctOwnerStudent = await call(studentBase + "/assessments", "student0");
  const correctOwnerHod = await call(studentBase + "/assessments", "hod0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/assessments", "hod0");
  const nonSupervisingProfessor = await call(studentBase + "/assessments", "faculty20");

  console.log("SEC-05 (assessments) unauthenticated ->", unauthenticated.status);
  console.log("SEC-05 (assessments) wrong-owner (different student) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-05 (assessments) correct-owner (student) ->", correctOwnerStudent.status);
  console.log("SEC-05 (assessments) correct-owner (HOD) ->", correctOwnerHod.status);
  console.log("SEC-05 (assessments) nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-05 (assessments) non-assessing professor, same dept ->", nonSupervisingProfessor.status, JSON.stringify(nonSupervisingProfessor.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.ok(correctOwnerStudent.body.some((r: any) => r.id === assessment.body.id));
  assert.equal(correctOwnerHod.status, 200);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);
  assert.equal(nonSupervisingProfessor.status, 200);
  assert.ok(!nonSupervisingProfessor.body.some((r: any) => r.id === assessment.body.id),
    "a professor who did not record this assessment must not see it");
});

test("SEC-05: GET /:studentId/thesis — owner / supervising professor (guide or co-guide) only", async () => {
  const studentBase = "/students/" + a.student0.studentId;
  const thesis = await call(studentBase + "/thesis", "student0", "POST",
    { thesisTitle: "Batch B evidence thesis", guideId: a.faculty0.id, coGuideId: null,
      protocolSubmissionDate: null, iecClearanceDate: null, dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null });
  assert.equal(thesis.status, 200, "fixture: thesis guided by faculty0");

  const unauthenticated = await request(runtime.base, studentBase + "/thesis");
  const wrongOwnerStudent = await call(studentBase + "/thesis", "student20");
  const correctOwnerStudent = await call(studentBase + "/thesis", "student0");
  const correctOwnerHod = await call(studentBase + "/thesis", "hod0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/thesis", "hod0");
  const nonGuidingProfessor = await call(studentBase + "/thesis", "faculty20");

  console.log("SEC-05 (thesis) unauthenticated ->", unauthenticated.status);
  console.log("SEC-05 (thesis) wrong-owner (different student) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-05 (thesis) correct-owner (student) ->", correctOwnerStudent.status);
  console.log("SEC-05 (thesis) correct-owner (HOD) ->", correctOwnerHod.status);
  console.log("SEC-05 (thesis) nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  console.log("SEC-05 (thesis) non-guiding professor, same dept ->", nonGuidingProfessor.status, JSON.stringify(nonGuidingProfessor.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.equal(correctOwnerStudent.body.data.thesisTitle, "Batch B evidence thesis");
  assert.equal(correctOwnerHod.status, 200);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);
  assert.equal(nonGuidingProfessor.status, 200);
  assert.equal(nonGuidingProfessor.body.data, null, "a professor who is neither guide nor co-guide must not see the thesis");
});

test("SEC-01/SEC-05 shape: GET /:studentId/certifications — owning student and department HOD only", async () => {
  const studentBase = "/students/" + a.student0.studentId;
  const cert = await call(studentBase + "/certifications", "student0", "POST",
    { title: "Batch B evidence certificate", provider: "Test institution", issueDate: "2026-09-01", expiryDate: "2027-09-01",
      certificateUrl: "https://example.test/certificate" });
  assert.equal(cert.status, 201, "fixture: certification for student0");

  const unauthenticated = await request(runtime.base, studentBase + "/certifications");
  const wrongOwnerProfessor = await call(studentBase + "/certifications", "faculty0");
  const wrongOwnerStudent = await call(studentBase + "/certifications", "student20");
  const correctOwnerStudent = await call(studentBase + "/certifications", "student0");
  const correctOwnerHod = await call(studentBase + "/certifications", "hod0");
  const nonexistent = await call("/students/" + NONEXISTENT_STUDENT_ID + "/certifications", "hod0");

  console.log("SEC-cert unauthenticated ->", unauthenticated.status);
  console.log("SEC-cert wrong-owner (professor, same dept) ->", wrongOwnerProfessor.status, JSON.stringify(wrongOwnerProfessor.body));
  console.log("SEC-cert wrong-owner (different student, same dept) ->", wrongOwnerStudent.status, JSON.stringify(wrongOwnerStudent.body));
  console.log("SEC-cert correct-owner (student) ->", correctOwnerStudent.status);
  console.log("SEC-cert correct-owner (HOD) ->", correctOwnerHod.status);
  console.log("SEC-cert nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));

  assert.equal(unauthenticated.status, 401);
  assert.equal(wrongOwnerProfessor.status, 403);
  assert.equal(wrongOwnerStudent.status, 403);
  assert.equal(correctOwnerStudent.status, 200);
  assert.ok(correctOwnerStudent.body.some((c: any) => c.id === cert.body.id));
  assert.equal(correctOwnerHod.status, 200);
  assert.equal(nonexistent.status, 403);
  assert.deepEqual(nonexistent.body, wrongOwnerStudent.body);
  assert.deepEqual(nonexistent.body, wrongOwnerProfessor.body);
  assert.deepEqual(wrongOwnerProfessor.body, wrongOwnerStudent.body);
});

test("SEC-01/SEC-02/SEC-05: fail-closed - a caller whose owning id cannot be resolved never sees an unfiltered query", async () => {
  // A forged claim (role/department in the JWT itself, not the database) must not grant
  // access - session authority comes from current DB state (auth.ts:48-50), same property
  // access.test.ts already asserts for other routes.
  const jwt = await import("jsonwebtoken");
  const forged = { ...a.student1, token: jwt.default.sign({ id: a.student1.id, role: "hod", departmentId: a.student0.departmentId },
    process.env.JWT_SECRET!) };
  const attempt = await request(runtime.base, "/students/" + a.student0.studentId + "/leave-records", forged);
  console.log("Fail-closed: forged hod/department claim on JWT ->", attempt.status, JSON.stringify(attempt.body));
  assert.equal(attempt.status, 403);
});
