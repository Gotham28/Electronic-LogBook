import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts, departmentIds } from "./support.js";
import { db, caseLogsTable, procedureLogsTable, postingsTable, certificationsTable, academicLogsTable, conferencesTable } from "./database.js";
import { eq } from "drizzle-orm";

test("student logs comprehensive PATCH verification scenarios", async () => {
  const { server, base } = await setup();
  try {
    const student = accounts["student0"];
    const supervisorId = accounts["faculty0"].id;
    const departmentId = departmentIds[0];

    // Create logs of various types
    const createCaseRes = await request(base, `/student/${student.studentId}/case-logs`, student, "POST", {
      date: "2026-01-01", patientAge: "25 Years", patientGender: "male", diagnosisFinal: "Case Diagnosis", supervisorId,
    });
    const caseId = createCaseRes.body.id;

    const createProcRes = await request(base, `/student/${student.studentId}/procedure-logs`, student, "POST", {
      date: "2026-01-01", procedureGroup: "Test group 0", procedureName: "Test procedure 0", patientUhid: "UHID123", patientAge: "30", competencyLevel: "observed", supervisorId,
    });
    const procId = createProcRes.body.id;

    const createPostRes = await request(base, `/student/${student.studentId}/postings`, student, "POST", {
      ward: "unit-0", startDate: "2026-01-01", endDate: "2026-01-31", supervisorId,
    });
    const postId = createPostRes.body.posting.id;

    const createCertRes = await request(base, `/student/${student.studentId}/certifications`, student, "POST", {
      title: "BLS", provider: "AHA", issueDate: "2026-01-01", expiryDate: "2027-01-01", certificateUrl: "https://example.com/cert",
    });
    const certId = createCertRes.body?.id || createCertRes.body?.certification?.id;

    const createAcadRes = await request(base, `/student/${student.studentId}/academic-logs`, student, "POST", {
      activityType: "discussion-0", topic: "Test Topic", date: "2026-01-01", supervisorId,
    });
    console.log("createAcadRes:", createAcadRes.status, createAcadRes.body);
    const acadId = createAcadRes.body?.id || createAcadRes.body?.academicLog?.id || createAcadRes.body?.log?.id;

    const createConfRes = await request(base, `/student/${student.studentId}/conference-logs`, student, "POST", {
      conferenceName: "MedConf", role: "attended", date: "2026-01-01", supervisorId,
    });
    const confId = createConfRes.body?.id || createConfRes.body?.conference?.id;

    console.log("--- START NEW VERIFICATION SCENARIOS ---");

    // 3a. PATCH log with status="verified" (or "rejected") - must return 400
    await db.update(caseLogsTable).set({ status: "verified" }).where(eq(caseLogsTable.id, caseId));
    const case1 = await request(base, `/student/${student.studentId}/case-logs/${caseId}`, student, "PATCH", { diagnosisFinal: "Updated verified" });
    console.log(`\nScenario 3a (Case Log verified): HTTP ${case1.status}`);
    console.log(JSON.stringify(case1.body));

    await db.update(procedureLogsTable).set({ status: "rejected" }).where(eq(procedureLogsTable.id, procId));
    const case2 = await request(base, `/student/${student.studentId}/procedure-logs/${procId}`, student, "PATCH", { patientUhid: "UHID999" });
    console.log(`\nScenario 3a (Procedure Log rejected): HTTP ${case2.status}`);
    console.log(JSON.stringify(case2.body));

    // 3b. Successful PATCH on a Postings row that changes only endDate
    const case3 = await request(base, `/student/${student.studentId}/postings/${postId}`, student, "PATCH", { endDate: "2026-02-15" });
    console.log(`\nScenario 3b (Postings endDate success): HTTP ${case3.status}`);
    console.log(JSON.stringify(case3.body));

    // 3c. A Postings PATCH that would violate the date rule
    const case4 = await request(base, `/student/${student.studentId}/postings/${postId}`, student, "PATCH", { endDate: "2025-12-01" });
    console.log(`\nScenario 3c (Postings date violation): HTTP ${case4.status}`);
    console.log(JSON.stringify(case4.body));

    // 3d. One successful pending-edit + one non-pending-rejection scenario for Certifications
    const certPatchSuccess = await request(base, `/student/${student.studentId}/certifications/${certId}`, student, "PATCH", { provider: "Red Cross" });
    console.log(`\nScenario 3d (Certifications pending success): HTTP ${certPatchSuccess.status}`);
    console.log(JSON.stringify(certPatchSuccess.body));

    await db.update(certificationsTable).set({ status: "verified" }).where(eq(certificationsTable.id, certId));
    const certPatchFail = await request(base, `/student/${student.studentId}/certifications/${certId}`, student, "PATCH", { provider: "Should Fail" });
    console.log(`\nScenario 3d (Certifications verified fail): HTTP ${certPatchFail.status}`);
    console.log(JSON.stringify(certPatchFail.body));

    // 3d. Academic Logs
    const acadPatchSuccess = await request(base, `/student/${student.studentId}/academic-logs/${acadId}`, student, "PATCH", { topic: "Updated Topic" });
    console.log(`\nScenario 3d (Academic Logs pending success): HTTP ${acadPatchSuccess.status}`);
    console.log(JSON.stringify(acadPatchSuccess.body));

    await db.update(academicLogsTable).set({ status: "rejected" }).where(eq(academicLogsTable.id, acadId));
    const acadPatchFail = await request(base, `/student/${student.studentId}/academic-logs/${acadId}`, student, "PATCH", { topic: "Should Fail" });
    console.log(`\nScenario 3d (Academic Logs rejected fail): HTTP ${acadPatchFail.status}`);
    console.log(JSON.stringify(acadPatchFail.body));

    // 3d. Conference Logs
    const confPatchSuccess = await request(base, `/student/${student.studentId}/conference-logs/${confId}`, student, "PATCH", { role: "presented" });
    console.log(`\nScenario 3d (Conference Logs pending success): HTTP ${confPatchSuccess.status}`);
    console.log(JSON.stringify(confPatchSuccess.body));

    await db.update(conferencesTable).set({ status: "verified" }).where(eq(conferencesTable.id, confId));
    const confPatchFail = await request(base, `/student/${student.studentId}/conference-logs/${confId}`, student, "PATCH", { role: "attended" });
    console.log(`\nScenario 3d (Conference Logs verified fail): HTTP ${confPatchFail.status}`);
    console.log(JSON.stringify(confPatchFail.body));

    console.log("--- END NEW VERIFICATION SCENARIOS ---");
  } finally {
    server.close();
  }
});
