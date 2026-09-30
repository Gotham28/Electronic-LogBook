import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, studentsTable } from "./database.js";
import { eq } from "drizzle-orm";

const NONEXISTENT_STUDENT_ID = 99999;

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

const validAppraisalBody = {
  quarter: 1, year: 2026, appraisalDate: "2026-01-01",
  journalRecentAdvancesLearningScore: 5, patientLabSkillLearningScore: 5,
  selfDirectedLearningTeachingScore: 5, departmentalInterdepartmentalLearningScore: 5,
  externalOutreachCmeScore: 5, thesisResearchScore: 5, logbookMaintenanceScore: 5,
  patientCareScore: 5, communicationSkillScore: 5, professionalismScore: 5,
  publications: true, remediationSuggestions: "", facultyRemarks: "Good work"
};

test("D. POST /appraisals/students/:studentId access controls", async () => {
  const studentBase = "/appraisals/students/" + a.student0.studentId;
  
  const unauthenticated = await call(studentBase, undefined, "POST", validAppraisalBody);
  const residentCaller = await call(studentBase, "student0", "POST", validAppraisalBody);
  const wrongDeptProfessor = await call(studentBase, "faculty1", "POST", validAppraisalBody);
  const nonexistent = await call("/appraisals/students/" + NONEXISTENT_STUDENT_ID, "faculty0", "POST", validAppraisalBody);

  // Clear mentor ID for student0 so faculty0 has NO mentor relationship
  await db.update(studentsTable).set({ mentorId: null }).where(eq(studentsTable.id, a.student0.studentId!));
  const sameDeptNoMentor = await call(studentBase, "faculty0", "POST", validAppraisalBody);
  
  const duplicate = await call(studentBase, "faculty0", "POST", validAppraisalBody);

  console.log("Appraisal Create 401 unauthenticated ->", unauthenticated.status);
  console.log("Appraisal Create 403 resident ->", residentCaller.status);
  console.log("Appraisal Create 403 wrong dept ->", wrongDeptProfessor.status);
  console.log("Appraisal Create 404 nonexistent student ->", nonexistent.status);
  console.log("Appraisal Create 201 same dept prof (no mentor check) ->", sameDeptNoMentor.status);
  console.log("Appraisal Create 409 duplicate ->", duplicate.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(residentCaller.status, 403);
  assert.equal(wrongDeptProfessor.status, 403);
  assert.equal(nonexistent.status, 404);
  assert.equal(sameDeptNoMentor.status, 201);
  assert.equal(duplicate.status, 409);
});

test("E. GET /appraisals/students access controls", async () => {
  const unauthenticated = await call("/appraisals/students", undefined, "GET");
  const residentCaller = await call("/appraisals/students", "student0", "GET");
  const professorCaller = await call("/appraisals/students", "faculty0", "GET");

  // 404 is N/A (no path parameters in this route)
  
  console.log("Appraisal Students List 401 unauthenticated ->", unauthenticated.status);
  console.log("Appraisal Students List 403 resident ->", residentCaller.status);
  console.log("Appraisal Students List 200 professor ->", professorCaller.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(residentCaller.status, 403);
  assert.equal(professorCaller.status, 200);

  const roster = professorCaller.body;
  assert.ok(Array.isArray(roster));
  assert.ok(roster.length > 0);
  assert.ok(roster.some((s: any) => s.id === a.student0.studentId));
  assert.ok(!roster.some((s: any) => s.id === a.student1.studentId)); // Student from another dept
});
