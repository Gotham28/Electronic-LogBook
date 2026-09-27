// Certification ids are UUIDs. A malformed id names no row, so it is a 404, not a database error.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("a malformed certification id returns 404 on edit and on review", async () => {
  const base = "/students/" + a.student0.studentId + "/certifications/not-a-uuid";
  const edit = await request(runtime.base, base, a.student0, "PATCH", { title: "BLS" });
  assert.equal(edit.status, 404, JSON.stringify(edit.body));
  const review = await request(runtime.base, base + "/review", a.hod0, "PATCH", { status: "verified" });
  assert.equal(review.status, 404, JSON.stringify(review.body));
});
