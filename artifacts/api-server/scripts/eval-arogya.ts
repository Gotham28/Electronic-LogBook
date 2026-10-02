import assert from "node:assert/strict";
import { coreQuestions, edgeQuestions } from "../tests/fixtures/arogya-questions.js";
import { containsSensitiveClinicalInput } from "../src/lib/arogya/input-privacy.js";
import { publicWorkflow, retrieveWorkflows, roleWorkflows } from "../src/lib/arogya/knowledge/index.js";

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
  for (const item of examples) {
    const retrieval = retrieveWorkflows({ query: item.question, role: item.role, features: item.features ?? {} });
    const candidates = retrieval.matches.slice(0, 4);
    if (!candidates.some((entry) => entry.id === item.expectedWorkflowId)) throw new Error(`${item.id}: no expected workflow evidence for live evaluation.`);
    const allowedIds = candidates.map((entry) => entry.id);
    const payload = {
      model,
      max_tokens: 500,
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
    assert.equal(answer.workflowId, item.expectedWorkflowId, `${item.id}: model selected the wrong workflow`);
    assert.equal(typeof answer.reply, "string");
    assert.ok(Array.isArray(answer.steps));
    const answerText = `${answer.reply} ${answer.steps.join(" ")}`.toLocaleLowerCase();
    for (const term of item.mustMention ?? []) assert.ok(answerText.includes(term.toLocaleLowerCase()), `${item.id}: answer omitted required idea "${term}"`);
    if (/\b\d+\b/.test(answerText)) throw new Error(`${item.id}: answer introduced an unsupported numeric claim.`);
    passed++;
  }
  process.stdout.write(`Arogya live synthetic evaluation passed: ${passed}/${examples.length} role-specific responses. No project database or user records were used.\n`);
}

offlineEvaluation();
if (process.env.AROGYA_EVAL_LIVE === "true") await liveEvaluation();
else process.stdout.write("Live provider evaluation skipped; set AROGYA_EVAL_LIVE=true to send the curated synthetic examples to the configured model.\n");
