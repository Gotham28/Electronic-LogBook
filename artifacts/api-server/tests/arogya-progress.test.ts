// 404 N/A: this route has no URL parameter.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";
import { _arogya } from "../src/lib/arogya.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("401 unauthenticated", async () => {
  const response = await call("/arogya/progress-coach", undefined, "POST");
  console.log("EVIDENCE 401 Request:", JSON.stringify({ path: "/api/arogya/progress-coach", auth: "none" }));
  console.log("EVIDENCE 401 Response:", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 401);
});

test("403 wrong role", async () => {
  const response = await call("/arogya/progress-coach", "faculty0", "POST");
  console.log("EVIDENCE 403 Request:", JSON.stringify({ path: "/api/arogya/progress-coach", auth: "faculty0" }));
  console.log("EVIDENCE 403 Response:", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "Progress coach is only available for residents.");
});

test("200 success", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: JSON.stringify(["Tip one", "Tip two", "Tip three"]), tokenCount: 15 });
  try {
    const response = await call("/arogya/progress-coach", "student0", "POST");
    console.log("EVIDENCE 200 Request:", JSON.stringify({ path: "/api/arogya/progress-coach", auth: "student0" }));
    console.log("EVIDENCE 200 Response:", response.status, JSON.stringify(response.body));
    assert.equal(response.status, 200);
    assert.equal(response.body.tips.length, 3);
    assert.equal(response.body.tips[0], "Tip one");
    assert.equal(response.body.tips[1], "Tip two");
    assert.equal(response.body.tips[2], "Tip three");
  } finally {
    _arogya.call = orig;
  }
});
