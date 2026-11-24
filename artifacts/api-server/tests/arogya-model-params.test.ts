import { test } from "node:test";
import assert from "node:assert/strict";
import { callOpenAI } from "../src/lib/arogya.js";
import { answerArogya } from "../src/lib/arogya/provider.js";

const KEYS = ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_REASONING_EFFORT"] as const;

async function captureBodies(effort: string | undefined, run: () => Promise<unknown>): Promise<Array<Record<string, unknown>>> {
  const prior = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  process.env.OPENAI_MODEL = "synthetic-test-model";
  if (effort === undefined) delete process.env.OPENAI_REASONING_EFFORT; else process.env.OPENAI_REASONING_EFFORT = effort;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
    bodies.push(JSON.parse(init?.body as string));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ reply: "Synthetic reply.", steps: [] }) } }],
      usage: { total_tokens: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    for (const key of KEYS) {
      if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    }
  }
  return bodies;
}

const v1 = () => callOpenAI("How do I add a case?", { synthetic: true });
const v2 = () => answerArogya({
  question: "How do I add a new case log?",
  history: [],
  context: {},
  actor: { role: "student" } as any,
  features: {},
  configSourceId: 1,
  departmentLabel: "Synthetic department",
});

for (const [label, run, tokens] of [["v1 callOpenAI", v1, 400], ["v2 providerRequest", v2, 800]] as const) {
  test(`${label}: unset env sends max_completion_tokens and neither max_tokens nor reasoning_effort`, async () => {
    const bodies = await captureBodies(undefined, run);
    assert.ok(bodies.length >= 1);
    for (const body of bodies) {
      assert.equal(body.max_completion_tokens, tokens);
      assert.ok(!("max_tokens" in body));
      assert.ok(!("reasoning_effort" in body));
      assert.equal(body.model, "synthetic-test-model");
    }
  });

  test(`${label}: blank env does not send reasoning_effort`, async () => {
    const bodies = await captureBodies("   ", run);
    assert.ok(bodies.length >= 1);
    for (const body of bodies) assert.ok(!("reasoning_effort" in body));
  });

  test(`${label}: OPENAI_REASONING_EFFORT=none sends reasoning_effort "none"`, async () => {
    const bodies = await captureBodies("none", run);
    assert.ok(bodies.length >= 1);
    for (const body of bodies) {
      assert.equal(body.reasoning_effort, "none");
      assert.equal(body.max_completion_tokens, tokens);
      assert.ok(!("max_tokens" in body));
      assert.equal(body.model, "synthetic-test-model");
    }
  });
}
