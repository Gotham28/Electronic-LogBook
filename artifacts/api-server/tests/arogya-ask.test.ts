// 404 N/A: this route has no URL parameter.
// 403 N/A: all authenticated users are permitted to call this route.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";
import { _arogya, DAILY_LIMIT } from "../src/lib/arogya.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});
const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("401 unauthenticated", async () => {
  const response = await call("/arogya/ask", undefined, "POST", { question: "Hello" });
  console.log("EVIDENCE 401 Request:", JSON.stringify({ path: "/api/arogya/ask", auth: "none", body: { question: "Hello" } }));
  console.log("EVIDENCE 401 Response:", response.status, JSON.stringify(response.body));
  assert.equal(response.status, 401);
});

test("200 success", async () => {
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: "Your postings are listed in the app.", tokenCount: 15 });
  try {
    const response = await call("/arogya/ask", "student0", "POST", { question: "Where are my postings?" });
    console.log("EVIDENCE 200 Request:", JSON.stringify({ path: "/api/arogya/ask", auth: "student0", body: { question: "Where are my postings?" } }));
    console.log("EVIDENCE 200 Response:", response.status, JSON.stringify(response.body));
    assert.equal(response.status, 200);
    assert.equal(response.body.reply, "Your postings are listed in the app.");
  } finally {
    _arogya.call = orig;
  }
});

test("503 OPENAI_API_KEY unset", async () => {
  // Do NOT mock _arogya.call here — we want the real callOpenAI to run and throw AROGYA_UNAVAILABLE
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  try {
    const response = await call("/arogya/ask", "student0", "POST", { question: "Hello" });
    console.log("EVIDENCE 503 Request:", JSON.stringify({ path: "/api/arogya/ask", auth: "student0", body: { question: "Hello" } }));
    console.log("EVIDENCE 503 Response:", response.status, JSON.stringify(response.body));
    assert.equal(response.status, 503);
    assert.equal(response.body.error, "Arogya is not available right now.");
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    if (originalModel) process.env.OPENAI_MODEL = originalModel;
  }
});

test("429 daily limit exceeded", async () => {
  // Use a dedicated account that has not been used in this test run
  // to avoid bleed from the 200 test's count.
  // Use "hod0" here; "student0" and "student2" may be used elsewhere.
  const orig = _arogya.call;
  _arogya.call = async () => ({ reply: "Spam reply.", tokenCount: 5 });
  try {
    let lastResponse: any;
    for (let i = 0; i <= DAILY_LIMIT; i++) {
      lastResponse = await call("/arogya/ask", "hod0", "POST", { question: "Spam" });
    }
    assert.equal(lastResponse?.status, 429);
    assert.equal(lastResponse?.body.error, "You've reached today's Arogya limit. Try again tomorrow.");
  } finally {
    _arogya.call = orig;
  }
});

test("500 invented number", async () => {
  const orig = _arogya.call;
  // Simulate callOpenAI throwing AROGYA_NUMBER_CHECK_FAILED (as it would for an invented number)
  _arogya.call = async () => { throw new Error("AROGYA_NUMBER_CHECK_FAILED"); };
  try {
    const response = await call("/arogya/ask", "student0", "POST", { question: "How many cases?" });
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Arogya couldn't answer right now.");
  } finally {
    _arogya.call = orig;
  }
});

test("400 question too long", async () => {
  const response = await call("/arogya/ask", "student0", "POST", { question: "a".repeat(501) });
  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Invalid question");
});
