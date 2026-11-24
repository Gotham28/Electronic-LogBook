import assert from "node:assert/strict";
import { coreQuestions, edgeQuestions } from "../tests/fixtures/arogya-questions.js";
import { containsSensitiveClinicalInput } from "../src/lib/arogya/input-privacy.js";
import { publicWorkflow, retrieveWorkflows, roleWorkflows } from "../src/lib/arogya/knowledge/index.js";
import { reasoningEffortParam } from "../src/lib/arogya/model-params.js";

function offlineEvaluation() {
  assert.equal(coreQuestions.length, 90, "the acceptance corpus must contain 30 core questions per role");
  assert.equal(edgeQuestions.length, 30, "the edge corpus must contain 30 questions");

  const failures: string[] = [];
  let matched = 0;
  let sensitiveBlocked = 0;
  let unsupportedHandled = 0;
  for (const item of coreQuestions) {
    const result = retrieveWorkflows({ query: item.question, role: item.role, features: item.features ?? {} });
    if (!result.matches.some((workflow) => workflow.id === item.expectedWorkflowId)) {
      failures.push(`${item.id}: expected ${item.expectedWorkflowId}, got ${result.ambiguous ? `ambiguous ${result.choices.map((choice) => choice.id).join(",")}` : result.matches.map((workflow) => workflow.id).join(",") || "no match"}`);
    } else matched++;
  }
  for (const item of edgeQuestions) {
    if (item.sensitive) {
      if (!containsSensitiveClinicalInput(item.question)) failures.push(`${item.id}: sensitive example was not blocked locally`);
      else sensitiveBlocked++;
      continue;
    }
    const result = retrieveWorkflows({ query: item.question, role: item.role, features: item.features ?? {} });
    if (item.expectedWorkflowId && !result.matches.some((workflow) => workflow.id === item.expectedWorkflowId)) {
      failures.push(`${item.id}: expected ${item.expectedWorkflowId}, got ${result.ambiguous ? `ambiguous ${result.choices.map((choice) => choice.id).join(",")}` : result.matches.map((workflow) => workflow.id).join(",") || "no match"}`);
    } else if (item.unsupported && (result.matches.length > 0 || result.ambiguous)) {
      failures.push(`${item.id}: unsupported question matched a workflow`);
    } else if (item.unsupported) unsupportedHandled++;
  }

  const disabled = roleWorkflows("student", { hideCaseLogs: true }).find((workflow) => workflow.id === "cases");
  if (!disabled || disabled.available || publicWorkflow(disabled).steps.length || publicWorkflow(disabled).href) {
    failures.push("feature-disabled case workflow exposed steps or navigation");
  }

  if (failures.length) {
    for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
    throw new Error(`Arogya offline evaluation failed (${failures.length} of ${coreQuestions.length + edgeQuestions.length} examples)`);
  }
  process.stdout.write(`Arogya offline evaluation passed: ${matched}/90 core retrievals, ${sensitiveBlocked} sensitive-input blocks, ${unsupportedHandled} unsupported prompts, 30 edge cases total.\n`);
}

async function liveEvaluation() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) throw new Error("Live evaluation requires OPENAI_API_KEY and OPENAI_MODEL in the process environment.");
  const examples = coreQuestions.filter((item) => item.liveCheck);
  if (examples.length < 3) throw new Error("Live evaluation needs at least three curated role examples.");

  let passed = 0;
  const failures: string[] = [];
  const recordFailure = (id: string, error: unknown, shown?: string) => {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(id);
    process.stderr.write(`FAIL ${id}: ${message}\n`);
    if (shown) process.stderr.write(`  rejected answer (synthetic eval output, no patient data): ${shown}\n`);
  };
  for (const item of examples) {
    let shown = "";
    try {
    const retrieval = retrieveWorkflows({ query: item.question, role: item.role, features: item.features ?? {} });
    const candidates = retrieval.matches.slice(0, 4);
    if (!candidates.some((entry) => entry.id === item.expectedWorkflowId)) throw new Error(`${item.id}: no expected workflow evidence for live evaluation.`);
    const allowedIds = candidates.map((entry) => entry.id);
    const payload = {
      model,
      max_completion_tokens: 500,
      ...reasoningEffortParam(),
      messages: [
        { role: "system", content: `Answer only from these current ELogbook workflow entries for a ${item.role} user. Do not invent permissions, facts, routes, or numbers. Keep the answer concise. Return the best matching workflow ID, a concise reply and ordered steps. Evidence: ${JSON.stringify(candidates.map(publicWorkflow))}` },
        { role: "user", content: item.question },
      ],
      response_format: { type: "json_schema", json_schema: {
        name: "arogya_eval_reply", strict: true,
        schema: { type: "object", properties: {
          workflowId: { type: "string", enum: allowedIds },
          reply: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        }, required: ["workflowId", "reply", "steps"], additionalProperties: false },
      } },
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${item.id}: provider returned HTTP ${response.status}.`);
    const body: any = await response.json();
    let answer: any;
    try { answer = JSON.parse(body?.choices?.[0]?.message?.content ?? ""); }
    catch { throw new Error(`${item.id}: provider returned invalid structured output.`); }
    shown = JSON.stringify(answer);
    assert.equal(answer.workflowId, item.expectedWorkflowId, `${item.id}: model selected the wrong workflow`);
    assert.equal(typeof answer.reply, "string");
    assert.ok(Array.isArray(answer.steps));
    const answerText = `${answer.reply} ${answer.steps.join(" ")}`.toLocaleLowerCase();
    for (const term of item.mustMention ?? []) assert.ok(answerText.includes(term.toLocaleLowerCase()), `${item.id}: answer omitted required idea "${term}"`);
    if (/\b\d+\b/.test(answerText)) throw new Error(`${item.id}: answer introduced an unsupported numeric claim.`);
    passed++;
    } catch (error) { recordFailure(item.id, error, shown); }
  }
  process.stdout.write(`Arogya live synthetic evaluation: ${passed}/${examples.length} role-specific responses passed. No project database or user records were used.\n`);

  const post = async (label: string, body: Record<string, unknown>) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, ...reasoningEffortParam(), ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${label}: provider returned HTTP ${response.status}.`);
    return (await response.json() as any)?.choices?.[0]?.message;
  };

  // Tool-call round trip, matching the v2 request shape (strict tool, one call at a time, strict JSON final answer).
  const evalTool = { type: "function", function: { name: "get_synthetic_status", description: "Look up the status label for a synthetic example topic.", strict: true,
    parameters: { type: "object", properties: { topic: { type: "string", enum: ["alpha", "beta"] } }, required: ["topic"], additionalProperties: false } } };
  const finalFormat = { type: "json_schema", json_schema: { name: "arogya_reply", strict: true,
    schema: { type: "object", properties: { reply: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["reply", "steps"], additionalProperties: false } } };
  try {
  const toolMessages: Array<Record<string, unknown>> = [
    { role: "system", content: "You are a test assistant. You must call the get_synthetic_status tool for topic alpha before answering. After the tool result, answer with JSON containing a short reply and an empty steps array." },
    { role: "user", content: "What is the status of alpha?" },
  ];
  const toolTurn = await post("tool-call check", { max_completion_tokens: 500, messages: toolMessages, tools: [evalTool], tool_choice: "auto", parallel_tool_calls: false, response_format: finalFormat });
  const calls = toolTurn?.tool_calls;
  assert.ok(Array.isArray(calls) && calls.length === 1, "tool-call check: expected exactly one tool call");
  assert.equal(calls[0].function.name, "get_synthetic_status");
  const toolArgs = JSON.parse(calls[0].function.arguments);
  assert.equal(toolArgs.topic, "alpha");
  toolMessages.push({ role: "assistant", content: null, tool_calls: [calls[0]] });
  toolMessages.push({ role: "tool", tool_call_id: calls[0].id, content: JSON.stringify({ topic: "alpha", status: "ready" }) });
  const toolFinal = await post("tool-call follow-up", { max_completion_tokens: 500, messages: toolMessages, tools: [evalTool], tool_choice: "auto", parallel_tool_calls: false, response_format: finalFormat });
  assert.ok(!toolFinal?.tool_calls?.length, "tool-call follow-up: unexpected second tool call");
  const toolAnswer = JSON.parse(toolFinal?.content ?? "");
  assert.equal(typeof toolAnswer.reply, "string");
  assert.ok(Array.isArray(toolAnswer.steps));
  process.stdout.write("Arogya live tool-call round trip passed: one strict tool call with valid arguments, then valid strict-schema JSON.\n");
  } catch (error) { recordFailure("tool-call round trip", error); }

  // Plain-text check, matching the v1 callOpenAI request shape (no tools, no response_format).
  try {
  const plain = await post("plain-text check", { max_completion_tokens: 400, messages: [
    { role: "system", content: "Reply in one short plain sentence using only the facts provided. Facts: {\"status\":\"ready\"}" },
    { role: "user", content: "What is the status?" },
  ] });
  assert.equal(typeof plain?.content, "string");
  assert.ok(plain.content.trim().length > 0, "plain-text check: empty reply");
  process.stdout.write("Arogya live plain-text check passed: non-empty plain reply.\n");
  } catch (error) { recordFailure("plain-text check", error); }

  if (failures.length) throw new Error(`Arogya live evaluation failed: ${failures.join(", ")}`);
}

offlineEvaluation();
if (process.env.AROGYA_EVAL_LIVE === "true") await liveEvaluation();
else process.stdout.write("Live provider evaluation skipped; set AROGYA_EVAL_LIVE=true to send the curated synthetic examples to the configured model.\n");
