import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("case review queue returns every submitted detail to authorized faculty only", async () => {
  const submitted = {
    supervisorId: a.faculty0.id,
    date: "2026-03-01",
    patientAge: "30 years",
    patientGender: "female",
    patientUhid: "SYNTHETIC-UHID-742",
    category: "Synthetic category",
    chiefComplaints: "Synthetic complaint text",
    history: "Synthetic history\nSecond line",
    examination: "Synthetic examination",
    investigations: "Synthetic investigations",
    diagnosisProvisional: "Synthetic provisional diagnosis",
    diagnosisFinal: "Synthetic final diagnosis",
    differentialDiagnosis: "Synthetic differential diagnosis",
    managementPlan: "Synthetic management plan",
    outcome: "Synthetic outcome",
    learningPoints: "Synthetic learning points",
  };
  const created = await request(runtime.base, `/students/${a.student0.studentId}/case-logs`, a.student0, "POST", submitted);
  assert.equal(created.status, 201);

  const unauthenticatedQueue = await request(runtime.base, `/professors/${a.faculty0.id}/review-queue`);
  assert.equal(unauthenticatedQueue.status, 401);

  const professorQueue = await request(runtime.base, `/professors/${a.faculty0.id}/review-queue`, a.faculty0);
  assert.equal(professorQueue.status, 200);
  const queuedCase = professorQueue.body.pendingReviews.find((item: any) => item.logType === "case" && item.dbId === created.body.id);
  assert.ok(queuedCase);
  for (const field of ["date", "attemptNumber", "patientUhid", "patientAge", "patientGender", "category", "chiefComplaints", "history", "examination", "investigations", "diagnosisProvisional", "differentialDiagnosis", "diagnosisFinal", "managementPlan", "outcome", "learningPoints", "status"]) {
    assert.equal(queuedCase[field], field === "attemptNumber" ? 1 : field === "status" ? "pending" : submitted[field as keyof typeof submitted]);
  }

  const wrongProfessorQueue = await request(runtime.base, `/professors/${a.faculty1.id}/review-queue`, a.faculty1);
  assert.equal(wrongProfessorQueue.status, 200);
  assert.equal(wrongProfessorQueue.body.pendingReviews.some((item: any) => item.dbId === created.body.id), false);

  const wrongDepartmentQueue = await request(runtime.base, `/professors/${a.hod1.id}/review-queue`, a.hod1);
  assert.equal(wrongDepartmentQueue.status, 200);
  assert.equal(wrongDepartmentQueue.body.pendingReviews.some((item: any) => item.dbId === created.body.id), false);

  const reviewPath = `/logs/case/${created.body.id}/review`;
  const unauthenticatedReview = await request(runtime.base, reviewPath, undefined, "PATCH", { status: "verified" });
  assert.equal(unauthenticatedReview.status, 401);

  const wrongOwnerReview = await request(runtime.base, reviewPath, a.faculty1, "PATCH", { status: "verified" });
  assert.equal(wrongOwnerReview.status, 403);

  const correctOwnerReview = await request(runtime.base, reviewPath, a.faculty0, "PATCH", { status: "verified" });
  assert.equal(correctOwnerReview.status, 200);
  assert.equal(correctOwnerReview.body.id, created.body.id);

  const nonexistentReview = await request(runtime.base, "/logs/case/999999/review", a.faculty0, "PATCH", { status: "verified" });
  assert.equal(nonexistentReview.status, 403);
  assert.equal(nonexistentReview.body.message, wrongOwnerReview.body.message);
});
