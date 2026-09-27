// A case log needs only a final diagnosis. The review queue title must not print "null" when the
// optional provisional diagnosis is missing.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("review queue titles a case log by its final diagnosis when no provisional diagnosis was given", async () => {
  const created = await request(runtime.base, "/students/" + a.student0.studentId + "/case-logs", a.student0, "POST",
    { supervisorId: a.faculty0.id, date: "2026-03-01", patientAge: "30", patientGender: "female", diagnosisFinal: "Synthetic final diagnosis" });
  assert.equal(created.status, 201);
  const queue = await request(runtime.base, "/professors/" + a.faculty0.id + "/review-queue", a.faculty0);
  const item = queue.body.pendingReviews.find((review: any) => review.dbId === created.body.id && review.logType === "case");
  assert.equal(item.title, "Synthetic final diagnosis — 30, female");
});
