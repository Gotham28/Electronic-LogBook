import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, password } from "./support.js";
import { engine, db, usersTable, studentsTable } from "./database.js";
import { _arogya } from "../src/lib/arogya.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
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

async function createAccount(role: string, departmentId: number | null, kind: string): Promise<any> {
  const hash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    fullName: "Test " + kind,
    email: kind + "@example.test",
    role,
    status: "approved",
    departmentId,
    passwordHash: hash
  }).returning();
  
  if (role === "student" && departmentId !== null && kind !== "no-student-profile") {
    await db.insert(studentsTable).values({
      userId: user.id,
      batch: "2026",
      registrationNumber: "REG-" + kind,
      paymentStatus: "paid",
    });
  }
  
  const token = jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  return { id: user.id, email: user.email, role, departmentId, token };
}

test("A. POST /arogya/appraisal-draft/:studentId access controls", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: JSON.stringify({ facultyRemarks: "Good", remediationSuggestions: "Read" }), tokenCount: 15 });

  const studentBase = "/arogya/appraisal-draft/" + a.student0.studentId;
  
  const unauthenticated = await call(studentBase, undefined, "POST");
  const residentCaller = await call(studentBase, "student0", "POST");
  const wrongDeptProfessor = await call(studentBase, "faculty1", "POST");
  const wrongDeptHod = await call(studentBase, "hod1", "POST");
  const sameDeptProfessor = await call(studentBase, "faculty0", "POST");
  const nonexistent = await call("/arogya/appraisal-draft/" + NONEXISTENT_STUDENT_ID, "faculty0", "POST");

  const nullDeptProf = await createAccount("admin", null, "admin-null-dept");
  const nullDept = await request(runtime.base, studentBase, nullDeptProf, "POST");

  console.log("Appraisal Draft 401 unauthenticated ->", unauthenticated.status);
  console.log("Appraisal Draft 403 resident ->", residentCaller.status);
  console.log("Appraisal Draft 403 wrong dept prof ->", wrongDeptProfessor.status);
  console.log("Appraisal Draft 403 wrong dept hod ->", wrongDeptHod.status);
  console.log("Appraisal Draft 200 correct dept prof ->", sameDeptProfessor.status);
  console.log("Appraisal Draft 404 nonexistent student ->", nonexistent.status);
  console.log("Appraisal Draft 403 null department ->", nullDept.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(residentCaller.status, 403);
  assert.equal(wrongDeptProfessor.status, 403);
  assert.equal(wrongDeptHod.status, 403);
  assert.equal(sameDeptProfessor.status, 200);
  assert.equal(nonexistent.status, 404);
  assert.equal(nullDept.status, 403);

  _arogya.call = orig;
});

test("B. POST /arogya/department-report access controls", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: "AI reply", tokenCount: 10 });

  const unauthenticated = await call("/arogya/department-report", undefined, "POST", { type: "report" });
  const professorCaller = await call("/arogya/department-report", "faculty0", "POST", { type: "report" });
  const residentCaller = await call("/arogya/department-report", "student0", "POST", { type: "report" });
  
  const nullDeptHodAcc = await createAccount("admin", null, "admin-null-dept2");
  const nullDept = await request(runtime.base, "/arogya/department-report", nullDeptHodAcc, "POST", { type: "report" });

  const hodReport = await call("/arogya/department-report", "hod0", "POST", { type: "report" });
  const hodFallingBehind = await call("/arogya/department-report", "hod0", "POST", { type: "falling_behind" });

  // 404 is N/A because this route has no path parameter (scope is intrinsically req.user.departmentId).
  
  console.log("Dept Report 401 unauthenticated ->", unauthenticated.status);
  console.log("Dept Report 403 professor ->", professorCaller.status);
  console.log("Dept Report 403 resident ->", residentCaller.status);
  console.log("Dept Report 403 null department ->", nullDept.status);
  console.log("Dept Report 200 HOD report ->", hodReport.status);
  console.log("Dept Report 200 HOD falling-behind ->", hodFallingBehind.status);

  assert.equal(unauthenticated.status, 401);
  assert.equal(professorCaller.status, 403);
  assert.equal(residentCaller.status, 403);
  assert.equal(nullDept.status, 403);
  assert.equal(hodReport.status, 200);
  assert.equal(hodFallingBehind.status, 200);

  _arogya.call = orig;
});

test("C. Missing 403 and 404 coverage for ask and progress-coach", async () => {
  const nullDeptStudentAcc = await createAccount("admin", null, "admin-null-dept3");
  const studentNoProfileAcc = await createAccount("student", 1, "no-student-profile"); // No studentsTable row!

  // /arogya/ask (404 is N/A: no URL parameters)
  const askNullDept = await request(runtime.base, "/arogya/ask", nullDeptStudentAcc, "POST", { question: "Q" });
  console.log("Ask 403 null department ->", askNullDept.status);
  assert.equal(askNullDept.status, 403);

  // /arogya/progress-coach (404 for nonexistent student row is simulated by a user without a student profile)
  const coachNullDept = await request(runtime.base, "/arogya/progress-coach", nullDeptStudentAcc, "POST");
  console.log("Progress Coach 403 null department ->", coachNullDept.status);
  assert.equal(coachNullDept.status, 403);

  const coachNoProfile = await request(runtime.base, "/arogya/progress-coach", studentNoProfileAcc, "POST");
  console.log("Progress Coach 404 no student profile ->", coachNoProfile.status);
  assert.equal(coachNoProfile.status, 404);
});

async function captureConsole<T>(run: () => Promise<T>): Promise<{ result: T; output: string }> {
  const chunks: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: any, ...rest: any[]) => { chunks.push(String(chunk)); return out(chunk, ...rest); }) as any;
  process.stderr.write = ((chunk: any, ...rest: any[]) => { chunks.push(String(chunk)); return err(chunk, ...rest); }) as any;
  
  // also capture req.log (handled by pino typically, but we catch stdout)
  try { return { result: await run(), output: chunks.join("") }; }
  finally { process.stdout.write = out; process.stderr.write = err; }
}

test("F & G: SEC-11 (appraisal-draft) leak test", async () => {
  const orig = _arogya.call;
  let interceptedFacts: any;
  
  _arogya.call = async (message, factsPack) => {
    interceptedFacts = factsPack;
    return { reply: JSON.stringify({ facultyRemarks: "Safe remark", remediationSuggestions: "Safe suggestion" }), tokenCount: 10 };
  };

  const { result: draftRes, output } = await captureConsole(() => 
    call("/arogya/appraisal-draft/" + a.student0.studentId, "faculty0", "POST")
  );
  
  console.log("SEC-11 200 ->", draftRes.status);
  assert.equal(draftRes.status, 200);
  
  const scoreFields = [
    "journalRecentAdvancesLearningScore", "patientLabSkillLearningScore", "selfDirectedLearningTeachingScore",
    "departmentalInterdepartmentalLearningScore", "externalOutreachCmeScore", "thesisResearchScore",
    "logbookMaintenanceScore", "patientCareScore", "communicationSkillScore", "professionalismScore"
  ];
  const stringifiedRes = JSON.stringify(draftRes.body);
  for (const field of scoreFields) {
    assert.ok(!stringifiedRes.includes(field), `Response should not contain score field: ${field}`);
  }
  
  const promptText = "Draft facultyRemarks and remediationSuggestions for a quarterly appraisal";
  assert.ok(!output.includes(promptText), "System prompt text leaked");
  assert.ok(!output.includes("Safe remark"), "Reply text leaked");
  assert.ok(!output.includes(a.student0.fullName || "Student 0"), "Resident name leaked in logs");
  assert.ok(!output.includes(a.faculty0.fullName || "Faculty 0"), "Professor name leaked in logs");

  const packString = JSON.stringify(interceptedFacts);
  assert.ok(!packString.includes(a.student0.fullName || "Student 0"), "Resident name in facts pack");
  assert.ok(!packString.includes("Log A"), "Log notes in facts pack");
  assert.ok(!packString.includes("Good work"), "Faculty remarks in facts pack");
  
  _arogya.call = orig;
});

test("F: SEC-12 (department-report) leak test", async () => {
  const orig = _arogya.call;
  let interceptedFacts: any;
  let interceptedNameMap: any;
  
  _arogya.call = async (message, factsPack, nameMap) => {
    interceptedFacts = factsPack;
    interceptedNameMap = nameMap;
    return { reply: "Safe report reply", tokenCount: 10 };
  };

  const { result: reportRes, output } = await captureConsole(() => 
    call("/arogya/department-report", "hod0", "POST", { type: "report" })
  );
  
  console.log("SEC-12 200 ->", reportRes.status);
  assert.equal(reportRes.status, 200);
  
  const promptText = "Write a short department progress report";
  assert.ok(!output.includes(promptText), "System prompt text leaked");
  assert.ok(!output.includes("Safe report reply"), "Reply text leaked");
  assert.ok(!output.includes(a.student0.fullName || "Student 0"), "Resident name leaked in logs");
  assert.ok(!output.includes(a.faculty0.fullName || "Faculty 0"), "Professor name leaked in logs");

  const packString = JSON.stringify(interceptedFacts);
  assert.ok(!packString.includes(a.student0.fullName || "Student 0"), "Resident name in facts pack");
  assert.ok(!packString.includes("Log A"), "Log notes in facts pack");
  assert.ok(!packString.includes("Good work"), "Faculty remarks in facts pack");
  
  _arogya.call = orig;
});
