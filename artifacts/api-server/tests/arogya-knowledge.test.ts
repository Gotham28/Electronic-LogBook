import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { knowledgeSources, publicWorkflow, retrieveWorkflows, roleWorkflows, workflowActions } from "../src/lib/arogya/knowledge/index.js";
import { containsSensitiveClinicalInput } from "../src/lib/arogya/input-privacy.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("HOD resident acceptance questions retrieve the self-registration and approval workflow", () => {
  const questions = [
    "I was confused about student acceptance. Are students automatically added after sign up, or am I involved?",
    "Student acceptance procedure: are they automatically accepted or does the HOD have to do it?",
    "Student acceptance proceduree: are they automatically accepted or does the HOD have to do it?",
  ];
  for (const query of questions) {
    const result = retrieveWorkflows({ query, role: "hod", features: {} });
    const approval = result.matches.find((entry) => entry.id === "student-approval");
    assert.ok(approval, `expected student-approval workflow for: ${query}`);
    assert.ok(approval.steps.some((step) => step.includes("pending status")));
    assert.ok(approval.steps.some((step) => step.includes("payment must be completed")));
    assert.ok(approval.steps.some((step) => step.includes("created directly by an HOD")));
  }
});

test("HOD progress questions retrieve the configured department classification workflow", () => {
  for (const query of [
    "Which approved residents are currently classified below their configured progress targets?",
    "Who's falling behind?",
    "Which residents are bellow target?",
  ]) {
    const result = retrieveWorkflows({ query, role: "hod", features: {} });
    assert.ok(result.matches.some((entry) => entry.id === "department-report"), `expected department-report workflow for: ${query}`);
  }
});

test("role and feature filtering removes disabled workflow instructions and actions", () => {
  const studentWorkflows = roleWorkflows("student", { hideCaseLogs: true });
  assert.ok(!studentWorkflows.some((entry) => entry.id === "evaluation-queue"));
  const cases = studentWorkflows.find((entry) => entry.id === "cases");
  assert.ok(cases);
  const exposed = publicWorkflow(cases);
  assert.equal(exposed.available, false);
  assert.deepEqual(exposed.steps, []);
  assert.deepEqual(exposed.rules, []);
  assert.ok(exposed.blockers[0].includes("not enabled"));
  assert.ok(!workflowActions([cases]).some((action) => action.id === "cases"));
});

test("privacy screening permits field-navigation questions and blocks clinical values", () => {
  assert.equal(containsSensitiveClinicalInput("Where is the diagnosis field on the case form?"), false);
  assert.equal(containsSensitiveClinicalInput("diagnosis: synthetic clinical value"), true);
  assert.equal(containsSensitiveClinicalInput("patient presented with synthetic symptoms"), true);
});

test("all curated knowledge source references still exist", () => {
  assert.ok(knowledgeSources.length > 0);
  const missing = knowledgeSources.filter((source) => !existsSync(resolve(repositoryRoot, source)));
  assert.deepEqual(missing, []);
});
