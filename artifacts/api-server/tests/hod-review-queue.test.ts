import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("HOD review queue visibility rules", async () => {
  // 1. Create a Case Log assigned to Professor A
  const pA = await request(runtime.base, `/students/${a.student0.studentId}/case-logs`, a.student0, "POST",
    { supervisorId: a.faculty0.id, date: "2026-03-01", patientAge: "30", patientGender: "female", diagnosisFinal: "Assigned to Prof" });
  assert.equal(pA.status, 201);
    
  // 2. Create a Procedure Log assigned to Professor A
  const procA = await request(runtime.base, `/students/${a.student0.studentId}/procedure-logs`, a.student0, "POST",
    { supervisorId: a.faculty0.id, procedureGroup: "Test group 0", procedureName: "Test procedure 0", date: "2026-03-01", patientUhid: "123", patientAge: "30", competencyLevel: "observed" });
  assert.equal(procA.status, 201);
    
  // 3. Create an Academic Log assigned to HOD
  const acadHOD = await request(runtime.base, `/students/${a.student0.studentId}/academic-logs`, a.student0, "POST",
    { supervisorId: a.hod0.id, activityType: "discussion-0", topic: "Assigned to HOD", date: "2026-03-01" });
  assert.equal(acadHOD.status, 201);
    
  // 4. Create a Conference Log with NULL supervisor
  const confNULL = await request(runtime.base, `/students/${a.student0.studentId}/conference-logs`, a.student0, "POST",
    { supervisorId: null, conferenceName: "No Supervisor Conf", date: "2026-03-01", conferenceType: "conference", level: "state", category: "cme", location: "Local", role: "attended" });
  assert.equal(confNULL.status, 201);

  // (a) Logs assigned to Professor A do NOT appear for HOD
  const hodQueue = await request(runtime.base, `/professors/${a.hod0.id}/review-queue`, a.hod0);
  assert.equal(hodQueue.body.pendingReviews.some((l: any) => l.dbId === pA.body.id && l.logType === "case"), false);
  assert.equal(hodQueue.body.pendingReviews.some((l: any) => l.dbId === procA.body.id && l.logType === "procedure"), false);
  
  // (b) Log assigned to HOD DOES appear for HOD
  assert.equal(hodQueue.body.pendingReviews.some((l: any) => l.dbId === acadHOD.body.id && l.logType === "academic"), true);
  
  // (c) NULL-supervisor log DOES appear for HOD
  assert.equal(hodQueue.body.pendingReviews.some((l: any) => l.dbId === confNULL.body.id && l.logType === "conference"), true);

  // (d) Professor A behavior unchanged (Prof sees their assigned logs, but not HOD's log or NULL log)
  const profQueue = await request(runtime.base, `/professors/${a.faculty0.id}/review-queue`, a.faculty0);
  assert.equal(profQueue.body.pendingReviews.some((l: any) => l.dbId === pA.body.id && l.logType === "case"), true);
  assert.equal(profQueue.body.pendingReviews.some((l: any) => l.dbId === procA.body.id && l.logType === "procedure"), true);
  assert.equal(profQueue.body.pendingReviews.some((l: any) => l.dbId === acadHOD.body.id && l.logType === "academic"), false);
  assert.equal(profQueue.body.pendingReviews.some((l: any) => l.dbId === confNULL.body.id && l.logType === "conference"), false);

  // (e) HOD in another department (hod1) sees nothing from student0
  const hod1Queue = await request(runtime.base, `/professors/${a.hod1.id}/review-queue`, a.hod1);
  assert.equal(hod1Queue.body.pendingReviews.some((l: any) => l.dbId === confNULL.body.id && l.logType === "conference"), false);
  assert.equal(hod1Queue.body.pendingReviews.some((l: any) => l.dbId === acadHOD.body.id && l.logType === "academic"), false);
});
