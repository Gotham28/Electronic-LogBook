import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, departmentIds, mail, password } from "./support.js";
import { engine, db, usersTable, assignmentsTable, assignmentRecipientsTable, auditTable } from "./database.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { provisionDepartment } from "../src/lib/department-provisioning.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown, headers?: Record<string, string>) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body, headers);

test("public directory exposes only registration metadata, never staff or student tables", async () => {
  const directory = await call("/departments");
  assert.equal(directory.status, 200);
  assert.deepEqual(directory.body.map((d: any) => d.name).sort(), ["Cardiology", "Dermatology", "Pediatrics"]);
  assert.ok(directory.body.every((d: any) => Object.keys(d).sort().join(",") === "code,id,name,programDurationMonths"));
  for (const path of ["/admin/roster", "/admin/students/pending", "/assignments", "/assignments/types",
    "/departments/1/catalog", "/departments/1/professors", "/departments/1/analytics", "/students/1/postings", "/student/1/thesis"]) {
    assert.equal((await call(path)).status, 401, path);
  }
});

test("each HOD sees only their own students, faculty and registration requests", async () => {
  for (let i = 0; i < departmentIds.length; i++) {
    const roster = await call("/admin/roster", "hod" + i);
    assert.equal(roster.status, 200);
    assert.equal(roster.body.students.length, 3);
    assert.equal(roster.body.professors.length, 2);
    assert.ok([...roster.body.students, ...roster.body.professors].every((u: any) => u.email.endsWith(i + "@example.test")));
    const pending = await call("/admin/students/pending", "hod" + i);
    assert.equal(pending.body.length, 1);
    assert.equal(pending.body[0].id, a["pending" + i].id);
  }
  assert.equal((await call("/admin/roster", "student0")).status, 403);
  assert.equal((await call("/admin/roster", "faculty0")).status, 403);
  assert.equal((await call("/admin/students/" + a.pending1.id + "/approve", "hod0", "POST")).status, 403);
  assert.equal((await call("/admin/users/" + a.faculty1.id, "hod0", "DELETE")).status, 403);
});

test("department data is dynamic and same-department only; analytics is HOD-only", async () => {
  const own = await call("/departments/" + departmentIds[1] + "/catalog", "student1");
  assert.equal(own.status, 200);
  assert.equal(own.body.hod.name, "Dermatology Test hod");
  assert.equal(own.body.config.requiredCases, 8);
  assert.equal(own.body.procedures[0].name, "Test procedure 1");
  assert.equal(own.body.academics[0].value, "discussion-1");
  assert.equal((await call("/departments/" + departmentIds[1] + "/catalog", "hod0")).status, 403);
  assert.equal((await call("/departments/" + departmentIds[0] + "/analytics", "student0")).status, 403);
});

test("student identity uses profile IDs and both route aliases are protected across all record families", async () => {
  assert.notEqual(a.student0.id, a.student0.studentId);
  for (const alias of ["student", "students"]) {
    for (const family of ["dashboard", "logs", "postings", "leave-records", "leave-balance", "assessments", "thesis", "certifications"]) {
      const ownPath = "/" + alias + "/" + a.student0.studentId + "/" + family;
      assert.equal((await call(ownPath, "student0")).status, 200, ownPath);
      assert.equal((await call(ownPath, "student20")).status, 403, ownPath);
      assert.equal((await call("/" + alias + "/" + a.student1.studentId + "/" + family, "hod0")).status, 403, family);
    }
  }
});

test("session authority comes from current database state, not role or department claims", async () => {
  const forgedClaims = { ...a.student0, token: jwt.sign({ id: a.student0.id, role: "hod", departmentId: departmentIds[1] }, process.env.JWT_SECRET!) };
  assert.equal((await request(runtime.base, "/admin/roster", forgedClaims)).status, 403);
  assert.equal((await call("/assignments", "pending0")).status, 401);
  assert.equal((await call("/students/1abc/logs", "hod0")).status, 400);
});

test("HOD-created faculty are bound to their HOD's department; client role or department overrides are rejected", async () => {
  const body = { fullName: "Additional faculty", email: "additional@example.test", password };
  assert.equal((await call("/admin/professors", "hod1", "POST", { ...body, departmentId: departmentIds[0] })).status, 400);
  assert.equal((await call("/admin/professors", "student1", "POST", body)).status, 403);
  const created = await call("/admin/professors", "hod1", "POST", body);
  assert.equal(created.status, 201);
  assert.equal(created.body.professor.departmentId, departmentIds[1]);
  assert.ok(!JSON.stringify(created.body).includes("passwordHash"));
});

test("assignment types and recipients cannot cross department boundaries; invalid batches roll back", async () => {
  const type = await call("/assignments/types", "faculty0", "POST", { name: "Evidence review", description: "Critically appraise a source." });
  const foreignType = await call("/assignments/types", "faculty1", "POST", { name: "Clinical reflection", description: "Reflect on learning." });
  assert.equal(type.status, 201);
  assert.equal((await call("/assignments/types", "student0", "POST", { name: "Fake", description: "Fake" })).status, 403);
  assert.deepEqual((await call("/assignments/types", "student1")).body.map((t: any) => t.id), [foreignType.body.id]);
  const base = { typeId: type.body.id, title: "Weekly review", instructions: "Summarize and critique the source.",
    dueAt: new Date(Date.now() + 86400000).toISOString(), studentIds: [a.student0.studentId] };
  for (const bad of [{ ...base, typeId: foreignType.body.id }, { ...base, studentIds: [a.student0.studentId, a.student1.studentId] },
    { ...base, studentIds: [a.pending0.studentId] }, { ...base, studentIds: [a.student0.studentId, a.student0.studentId] },
    { ...base, departmentId: departmentIds[1] }, { ...base, dueAt: "2020-01-01T00:00:00Z" }, { ...base, facultyId: a.faculty20.id }]) {
    assert.equal((await call("/assignments", "faculty0", "POST", bad)).status, 400);
  }
  assert.equal((await db.select().from(assignmentsTable)).length, 0);
  assert.equal((await call("/assignments", "student0", "POST", base)).status, 403);
  assert.equal((await call("/assignments", "faculty0", "POST", { ...base, studentIds: [a.student0.studentId, a.student20.studentId] })).status, 201);
  assert.equal((await call("/assignments", "faculty1")).body.items.length, 0);
  assert.equal((await call("/assignments", "faculty20")).body.items.length, 0);
  assert.equal((await call("/assignments", "hod0")).body.items.length, 2);
  assert.equal((await call("/assignments/students", "faculty0")).body.length, 2);
});

test("only the assigned student submits and the assigning faculty or department HOD reviews; transitions are atomic", async () => {
  const item = (await call("/assignments", "student0")).body.items[0];
  assert.equal((await call("/assignments/" + item.id + "/submit", "student20", "POST", { response: "Not mine" })).status, 409);
  assert.equal((await call("/assignments/" + item.id + "/submit", "student1", "POST", { response: "Not mine" })).status, 409);
  assert.equal((await call("/assignments/" + item.id + "/review", "faculty0", "POST", { status: "completed", feedback: "Premature" })).status, 409);
  const submits = await Promise.all([1, 2].map(() => call("/assignments/" + item.id + "/submit", "student0", "POST", { response: "<script>alert('escaped by React')</script> Critical review." })));
  assert.deepEqual(submits.map((r) => r.status).sort(), [200, 409]);
  for (const who of ["faculty20", "faculty1", "hod1"]) {
    assert.equal((await call("/assignments/" + item.id + "/review", who, "POST", { status: "completed", feedback: "Unauthorized" })).status, 409);
  }
  assert.equal((await call("/assignments/" + item.id + "/review", "student0", "POST", { status: "completed", feedback: "Self grade" })).status, 403);
  assert.equal((await call("/assignments/" + item.id + "/review", "faculty0", "POST", { status: "returned", feedback: "Please add limitations." })).status, 200);
  assert.equal((await call("/assignments/" + item.id + "/submit", "student0", "POST", { response: "Revised review with limitations." })).status, 200);
  assert.equal((await call("/assignments/" + item.id + "/review", "hod0", "POST", { status: "completed", feedback: "Complete." })).status, 200);
  assert.equal((await call("/assignments/" + item.id + "/submit", "student0", "POST", { response: "Overwrite." })).status, 409);
  assert.equal((await db.select().from(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.id, item.id)))[0].status, "completed");
  assert.ok((await db.select().from(auditTable)).length >= 5);
});

test("existing case, procedure, academic, posting and leave workflows work in every department", async () => {
  for (let index = 0; index < departmentIds.length; index++) {
    const student = a["student" + index];
    const base = "/students/" + student.studentId;
    const supervisorId = a["faculty" + index].id;
    const caseBody = { date: "2026-09-01", patientAge: "Adult", patientGender: "other", diagnosisFinal: "Synthetic test record", supervisorId };
    const createdCase = await call(base + "/case-logs", "student" + index, "POST", caseBody);
    assert.equal(createdCase.status, 201);
    assert.equal((await call(base + "/case-logs", "student" + index, "POST", { ...caseBody, status: "verified" })).status, 400);
    assert.equal((await call(base + "/case-logs", "student" + index, "POST", { ...caseBody, supervisorId: a["faculty" + ((index + 1) % 3)].id })).status, 400);
    assert.equal((await call(base + "/case-logs", "faculty" + index, "POST", caseBody)).status, 403);
    const procedureBody = { date: "2026-09-01", patientUhid: "SYNTHETIC-NO-PATIENT", patientAge: "Adult", supervisorId,
      procedureName: "Test procedure " + index, procedureGroup: "Test group " + index, competencyLevel: "observed" };
    const createdProcedure = await call(base + "/procedure-logs", "student" + index, "POST", procedureBody);
    assert.equal(createdProcedure.status, 201);
    assert.equal((await call(base + "/procedure-logs", "student" + index, "POST", { ...procedureBody, procedureName: "Unconfigured option" })).status, 400);
    assert.equal((await call(base + "/academic-logs", "student" + index, "POST", { supervisorId, activityType: "discussion-" + index, topic: "Synthetic learning", date: "2026-09-01" })).status, 201);
    assert.equal((await call(base + "/postings", "student" + index, "POST", { ward: "unit-" + index, supervisorId, startDate: "2026-09-01", endDate: "2026-09-03" })).status, 201);
    const leave = await call(base + "/leave-records", "student" + index, "POST", { leaveType: "Casual", startDate: "2026-09-01", endDate: "2026-09-03", reason: "Synthetic leave test" });
    assert.equal(leave.status, 201);
    const pendingLeaves = await call("/admin/leaves/pending", "hod" + index);
    assert.equal(pendingLeaves.body.length, 1);
    const leaveId = pendingLeaves.body[0].id;
    assert.equal((await call("/admin/leaves/" + leaveId + "/action", "hod" + ((index + 1) % 3), "POST", { action: "approve" })).status, 404);
    assert.equal((await call("/admin/leaves/" + leaveId + "/action", "hod" + index, "POST", { action: "approve" })).status, 200);
    const balance = await call(base + "/leave-balance", "student" + index);
    assert.equal(balance.body.casual.total, 9 + index);
    assert.equal(balance.body.casual.used, 3);
    assert.equal((await call("/logs/case/" + createdCase.body.id + "/review", "faculty2" + index, "PATCH", { status: "verified" })).status, 403);
    assert.equal((await call("/logs/case/" + createdCase.body.id + "/review", "hod" + ((index + 1) % 3), "PATCH", { status: "verified" })).status, 403);
    assert.equal((await call("/logs/case/" + createdCase.body.id + "/review", "faculty" + index, "PATCH", { status: "verified", comments: "Reviewed" })).status, 200);
    assert.equal((await call(base + "/case-logs/" + createdCase.body.id, "student" + index, "DELETE")).status, 400);
    assert.equal((await call(base + "/procedure-logs/" + createdProcedure.body.id, "student" + index, "DELETE")).status, 200);
    assert.equal((await call("/logs/procedure/" + createdProcedure.body.id + "/review", "faculty" + index, "PATCH", { status: "verified" })).status, 404);
    const assessment = { examName: "Test assessment", type: "quarterly", date: "2026-09-01", marks: 0 };
    assert.equal((await call(base + "/assessments", "student" + index, "POST", assessment)).status, 403);
    assert.equal((await call(base + "/assessments", "faculty" + index, "POST", assessment)).status, 201);
  }
});

test("thesis and certificates persist without fabricated defaults and enforce department guides", async () => {
  const base = "/students/" + a.student0.studentId;
  assert.equal((await call(base + "/thesis", "student0")).body.data, null);
  assert.deepEqual((await call(base + "/certifications", "student0")).body, []);
  const thesis = { thesisTitle: "A database-backed research topic", guideId: a.faculty0.id, coGuideId: null,
    protocolSubmissionDate: "2026-09-01", iecClearanceDate: null, dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null };
  assert.equal((await call(base + "/thesis", "student0", "POST", { ...thesis, guideId: a.faculty1.id })).status, 400);
  assert.equal((await call(base + "/thesis", "student0", "POST", thesis)).status, 200);
  assert.equal((await call(base + "/thesis", "student0")).body.data.thesisTitle, thesis.thesisTitle);
  assert.equal((await call(base + "/thesis", "student0", "POST", { ...thesis, thesisTitle: "Updated topic" })).status, 200);
  const certificate = { title: "Institutional course", provider: "Test institution", issueDate: "2026-09-01", expiryDate: "2027-09-01", certificateUrl: "https://example.test/certificate" };
  assert.equal((await call(base + "/certifications", "student0", "POST", { ...certificate, certificateUrl: "javascript:alert(1)" })).status, 400);
  assert.equal((await call(base + "/certifications", "student0", "POST", certificate)).status, 201);
  assert.equal((await call(base + "/certifications", "student0")).body[0].title, certificate.title);
});

test("HOD requirements and training catalog are database-backed and reject cross-department updates", async () => {
  const configuration = { requiredCases: 17, requiredProcedures: 21, requiredAcademic: 5,
    programDurationMonths: 31, casualLeaveAllowance: 12, academicLeaveAllowance: null };
  assert.equal((await call("/admin/department/config", "hod2", "POST", configuration)).status, 200);
  assert.equal((await call("/admin/department/config", "hod2", "POST", { ...configuration, departmentId: departmentIds[0] })).status, 400);
  assert.equal((await call("/admin/department/config", "faculty2", "POST", configuration)).status, 403);
  assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredCases, 17);
  const option = await call("/admin/department/catalog", "hod2", "POST", { kind: "academic", name: "Custom seminar", value: "custom-seminar", required: 2, period: "month" });
  assert.equal(option.status, 201);
  assert.equal((await call("/admin/department/catalog/" + option.body.id, "hod0", "PATCH", { required: 200, period: "total" })).status, 404);
});

test("student self-registration needs possession of a verified single-use proof and own HOD approval", async () => {
  const email = "newstudent@example.test";
  assert.equal((await call("/auth/send-otp", undefined, "POST", { email })).status, 200);
  const proof = await call("/auth/verify-otp", undefined, "POST", { email, otp: mail.get(email) });
  assert.equal(proof.status, 200);
  const registration = { fullName: "New student", email, password, registrationNumber: "TEST-REGISTER", batch: "2026",
    dateOfJoining: "2026-09-01", kuhsId: "UNIV-REGISTER", departmentId: departmentIds[1], verificationToken: proof.body.verificationToken };
  assert.equal((await call("/auth/register", undefined, "POST", { ...registration, verificationToken: "forged" })).status, 400);
  assert.equal((await call("/auth/register", undefined, "POST", { ...registration, role: "hod" })).status, 400);
  assert.equal((await call("/auth/register", undefined, "POST", { ...registration, departmentId: 999999 })).status, 400);
  assert.equal((await call("/auth/register", undefined, "POST", registration)).status, 201);
  assert.equal((await call("/auth/register", undefined, "POST", registration)).status, 400);
  assert.equal((await call("/auth/login", undefined, "POST", { username: email, password })).status, 403);
  const pending = (await call("/admin/students/pending", "hod1")).body.find((r: any) => r.email === email);
  assert.ok(pending);
  assert.ok(!(await call("/admin/students/pending", "hod0")).body.some((r: any) => r.email === email));
  assert.equal((await call("/admin/students/" + pending.id + "/approve", "hod0", "POST")).status, 403);
  assert.equal((await call("/admin/students/" + pending.id + "/approve", "hod1", "POST")).status, 200);
  const login = await call("/auth/login", undefined, "POST", { username: email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.role, "student");
  assert.equal(login.body.departmentName, "Dermatology");
  assert.ok(login.body.studentProfileId);
});

test("OTP attempts are bounded and password-reset proofs cannot be forged or replayed", async () => {
  const email = a.student2.email;
  assert.equal((await call("/auth/forgot-password", undefined, "POST", { email })).status, 200);
  const real = mail.get(email);
  const wrong = real === "111111" ? "222222" : "111111";
  for (let i = 0; i < 5; i++) assert.equal((await call("/auth/verify-reset-otp", undefined, "POST", { email, otp: wrong })).status, 400);
  assert.equal((await call("/auth/verify-reset-otp", undefined, "POST", { email, otp: real })).status, 400);
  const nextEmail = a.student20.email;
  assert.equal((await call("/auth/forgot-password", undefined, "POST", { email: nextEmail })).status, 200);
  const proof = await call("/auth/verify-reset-otp", undefined, "POST", { email: nextEmail, otp: mail.get(nextEmail) });
  assert.equal(proof.status, 200);
  const reset = { email: nextEmail, newPassword: "A-new-test-password!", verificationToken: proof.body.verificationToken };
  assert.equal((await call("/auth/reset-password", undefined, "POST", { ...reset, verificationToken: "forged" })).status, 400);
  assert.equal((await call("/auth/reset-password", undefined, "POST", reset)).status, 200);
  assert.equal((await call("/auth/reset-password", undefined, "POST", reset)).status, 400);
  assert.equal((await call("/auth/me", "student20")).status, 401);
  assert.equal((await call("/auth/login", undefined, "POST", { username: nextEmail, password: reset.newPassword })).status, 200);
});

test("deactivation revokes live sessions and reactivation never restores an old token", async () => {
  assert.equal((await call("/admin/users/" + a.faculty2.id, "hod2", "DELETE")).status, 200);
  assert.equal((await call("/assignments", "faculty2")).status, 401);
  assert.equal((await call("/admin/users/" + a.faculty2.id + "/reactivate", "hod0", "POST", {})).status, 404);
  assert.equal((await call("/admin/users/" + a.faculty2.id + "/reactivate", "hod2", "POST", {})).status, 200);
  assert.equal((await call("/assignments", "faculty2")).status, 401);
  assert.equal((await call("/auth/login", undefined, "POST", { username: a.faculty2.email, password })).status, 200);
});

test("write requests reject untrusted origins and non-JSON input", async () => {
  assert.equal((await call("/assignments/types", "faculty0", "POST", { name: "CSRF", description: "Blocked" }, { Origin: "https://untrusted.example.test" })).status, 403);
  assert.equal((await call("/assignments/types", "faculty0", "POST", { name: "CSRF", description: "Blocked" }, { "Content-Type": "text/plain" })).status, 415);
  const noOrigin = await request(runtime.base, "/auth/logout", undefined, "POST", {}, { Cookie: "token=" + a.student0.token });
  assert.equal(noOrigin.status, 403);
});

test("backend provisioning creates generic department/HOD records and refuses duplicate HODs", async () => {
  const input = { name: "Additional test department", code: "ADDITIONAL-TEST", hod: { fullName: "Provisioned HOD", email: "provisioned@example.test" } };
  const result = await provisionDepartment(input, password);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, result.hodId));
  assert.equal(user.role, "hod");
  assert.equal(user.status, "approved");
  assert.equal(user.departmentId, result.departmentId);
  assert.notEqual(user.passwordHash, password);
  await assert.rejects(provisionDepartment(input, password), /active HOD already exists/);
  await assert.rejects(db.insert(usersTable).values({ fullName: "Duplicate HOD", email: "duplicate@example.test", role: "hod", status: "approved", departmentId: result.departmentId }));
  await assert.rejects(db.insert(usersTable).values({ fullName: "Unassigned student", email: "null@example.test", role: "student", departmentId: null }));
});
