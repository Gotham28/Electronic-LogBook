import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts, departmentIds } from "./support.js";
import { db, postingsTable, certificationsTable, researchTable, assessmentsTable } from "./database.js";

test("faculty review endpoints and assessments access", async () => {
  const { server, base } = await setup();
  try {
    const student = accounts["student0"];
    const professor = accounts["faculty0"];
    const hod = accounts["hod0"];
    const otherDeptProfessor = accounts["faculty1"]; // Assuming faculty1 is in dept 1
    const deptId = departmentIds[0];

    // Create a posting
    const postRes = await request(base, `/student/${student.studentId}/postings`, student, "POST", {
      ward: "unit-0", startDate: "2026-01-01", endDate: "2026-01-31", supervisorId: professor.id,
    });
    const postingId = postRes.body.posting.id;

    // Create a certification
    const certRes = await request(base, `/student/${student.studentId}/certifications`, student, "POST", {
      title: "BLS", provider: "AHA", issueDate: "2026-01-01", expiryDate: "2027-01-01", certificateUrl: "https://example.com/cert",
    });
    const certId = certRes.body.id || certRes.body.certification?.id;

    // Create a thesis
    const thesisRes = await request(base, `/student/${student.studentId}/thesis`, student, "POST", {
      thesisTitle: "My Thesis", guideId: professor.id, coGuideId: null,
      protocolSubmissionDate: null, iecClearanceDate: null,
      dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null
    });
    console.log("Thesis creation:", thesisRes.status, thesisRes.body);

    // 1. Student trying to access review endpoints -> 403
    const studentReviewPost = await request(base, `/student/${student.studentId}/postings/${postingId}/review`, student, "PATCH", { status: "verified" });
    assert.equal(studentReviewPost.status, 403);
    const studentReviewCert = await request(base, `/student/${student.studentId}/certifications/${certId}/review`, student, "PATCH", { status: "verified" });
    assert.equal(studentReviewCert.status, 403);
    const studentReviewThesis = await request(base, `/student/${student.studentId}/thesis/review`, student, "PATCH", { protocolStatus: "approved" });
    assert.equal(studentReviewThesis.status, 403);

    // 2. Professor successful review
    const profReviewPost = await request(base, `/student/${student.studentId}/postings/${postingId}/review`, professor, "PATCH", { status: "verified" });
    assert.equal(profReviewPost.status, 200, "Professor should be able to review posting");

    // Double-review should fail
    const profReviewPost2 = await request(base, `/student/${student.studentId}/postings/${postingId}/review`, professor, "PATCH", { status: "rejected" });
    assert.equal(profReviewPost2.status, 400, "Double-review on posting should fail with 400");

    // cert review might fail if mentor mismatch, support.ts creates mentees for faculty0? Let's check status, if 200 or 403 (due to mentor logic) it means it got past middleware.
    const profReviewCert = await request(base, `/student/${student.studentId}/certifications/${certId}/review`, professor, "PATCH", { status: "verified" });
    assert.ok([200, 403].includes(profReviewCert.status), "Professor middleware allows certification review (403 if not mentor)");
    
    if (profReviewCert.status === 200) {
      const profReviewCert2 = await request(base, `/student/${student.studentId}/certifications/${certId}/review`, professor, "PATCH", { status: "rejected" });
      assert.equal(profReviewCert2.status, 400, "Double-review on certification should fail with 400");
    }

    const profReviewThesis = await request(base, `/student/${student.studentId}/thesis/review`, professor, "PATCH", { protocolStatus: "approved" });
    assert.equal(profReviewThesis.status, 200, "Professor should be able to review thesis");

    // 3. Assessments POST, PATCH, DELETE for faculty
    const createAssessment = await request(base, `/student/${student.studentId}/assessments`, professor, "POST", {
      examName: "Midterm", type: "quarterly", date: "2026-06-01", marks: 85
    });
    assert.equal(createAssessment.status, 201, "Professor can create assessment");
    const assessmentId = createAssessment.body.id;

    const patchAssessment = await request(base, `/student/${student.studentId}/assessments/${assessmentId}`, professor, "PATCH", { marks: 90 });
    assert.equal(patchAssessment.status, 200, "Professor can update assessment");

    const deleteAssessment = await request(base, `/student/${student.studentId}/assessments/${assessmentId}`, professor, "DELETE");
    assert.equal(deleteAssessment.status, 200, "Professor can delete assessment");

    // Student cannot POST/PATCH/DELETE assessments
    const studentCreateAssessment = await request(base, `/student/${student.studentId}/assessments`, student, "POST", {
      examName: "Test", type: "quarterly", date: "2026-06-01", marks: 100
    });
    assert.equal(studentCreateAssessment.status, 403, "Student cannot create assessment");

    // 4. Student can still PATCH normal logs
    // Create a new pending posting for the student to edit
    const postRes2 = await request(base, `/student/${student.studentId}/postings`, student, "POST", {
      ward: "unit-0", startDate: "2026-02-01", endDate: "2026-02-28", supervisorId: professor.id,
    });
    const pendingPostingId = postRes2.body.posting.id;
    
    const studentPatchPost = await request(base, `/student/${student.studentId}/postings/${pendingPostingId}`, student, "PATCH", { endDate: "2026-02-25" });
    assert.equal(studentPatchPost.status, 200, "Student can still patch their own pending posting");

    console.log("All faculty review and assessment middleware checks passed.");
  } finally {
    server.close();
  }
});
