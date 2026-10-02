import { createHash } from "node:crypto";
import { commonWorkflows } from "./common.js";
import { facultyWorkflows } from "./faculty.js";
import { hodWorkflows } from "./hod.js";
import { residentWorkflows } from "./resident.js";
import type { ArogyaAction, ArogyaRole, RetrievedWorkflow, WorkflowEntry } from "./types.js";

export * from "./types.js";

const registry: readonly WorkflowEntry[] = [
  ...commonWorkflows,
  ...residentWorkflows,
  ...facultyWorkflows,
  ...hodWorkflows,
];

const retrievalStopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why",
]);

export const knowledgeSources = [...new Set(registry.flatMap((entry) => entry.sources))].sort();

const canonical = JSON.stringify(registry);
export const knowledgeVersion = createHash("sha256").update(canonical).digest("hex").slice(0, 16);

export function roleWorkflows(role: ArogyaRole, features: Record<string, boolean>): RetrievedWorkflow[] {
  return registry.filter((entry) => entry.roles.includes(role)).map((entry) => {
    let available = true;
    if (entry.availability) {
      const actual = features[entry.availability.key] === true;
      available = entry.availability.enabledWhen === "not-true" ? !actual : actual;
    }
    if (entry.unavailableWhen?.some((condition) => features[condition.key] === (condition.enabledWhen === true))) available = false;

    let href = entry.href;
    let title = entry.title;
    if (entry.id === "thesis" && role === "student") {
      title = features.publicationsOnly ? "Publications" : features.useThesisAndPublicationsLabel ? "Thesis and publications" : "Thesis";
    }
    if (!available) href = undefined;
    return { ...entry, title, available, href };
  });
}

function normalize(text: string): string {
  const tokens = text.toLocaleLowerCase().replace(/[’']s\b/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  return tokens.map((token) => {
    if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
    return token;
  }).join(" ");
}

function tokenMatches(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;
  for (let index = 0; index < Math.min(left.length, right.length) - 1; index++) {
    if (left[index] === right[index + 1] && left[index + 1] === right[index] &&
      left.slice(index + 2) === right.slice(index + 2) && left.slice(0, index) === right.slice(0, index)) return true;
  }
  let a = 0, b = 0, edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    edits++;
    if (edits > 1) return false;
    if (left.length > right.length) a++;
    else if (right.length > left.length) b++;
    else { a++; b++; }
  }
  return edits + (a < left.length || b < right.length ? 1 : 0) <= 1;
}

function scoreEntry(query: string, entry: WorkflowEntry): number {
  const normalized = normalize(query);
  if (!normalized) return 0;
  const padded = ` ${normalized} `;
  let score = 0;
  for (const phrase of [entry.title, ...entry.aliases]) {
    const target = normalize(phrase);
    if (target && padded.includes(` ${target} `)) score = Math.max(score, target.includes(" ") ? 12 : 3);
  }
  const queryTerms = new Set(normalized.split(" ").filter((token) => token.length > 2 && !retrievalStopWords.has(token)));
  const docTerms = new Set(normalize(`${entry.title} ${entry.aliases.join(" ")}`).split(" ").filter((token) => token.length > 2 && !retrievalStopWords.has(token)));
  let hits = 0;
  for (const term of queryTerms) if ([...docTerms].some((documentTerm) => tokenMatches(term, documentTerm))) hits++;
  if (queryTerms.size) score += hits / queryTerms.size * 5;
  return score;
}

export interface RetrievalResult {
  matches: RetrievedWorkflow[];
  ambiguous: boolean;
  choices: Array<{ id: string; label: string }>;
}

export function retrieveWorkflows(input: {
  query: string;
  role: ArogyaRole;
  features: Record<string, boolean>;
  workflowId?: string;
}): RetrievalResult {
  const applicable = roleWorkflows(input.role, input.features);
  const ranked = applicable.filter((entry) => entry.available).map((entry) => ({ entry, score: scoreEntry(input.query, entry) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));

  if (!ranked.length || ranked[0].score < 1.5) {
    const contextual = input.workflowId ? applicable.find((entry) => entry.id === input.workflowId) : undefined;
    return { matches: contextual ? [contextual] : [], ambiguous: false, choices: [] };
  }
  const top = ranked[0];
  const tied = ranked.filter((item) => item.score === top.score);
  if (tied.length > 1 && top.score < 7) {
    const choices = tied.slice(0, 4).map(({ entry }) => ({ id: entry.id, label: entry.title }));
    return { matches: [], ambiguous: true, choices };
  }
  const chosen = ranked.slice(0, 4).filter((item) => item.score >= Math.max(1.5, top.score * 0.5));
  return { matches: chosen.map(({ entry }) => roleWorkflows(input.role, input.features).find((current) => current.id === entry.id)!), ambiguous: false, choices: [] };
}

export function workflowActions(workflows: readonly RetrievedWorkflow[]): ArogyaAction[] {
  return workflows.flatMap((workflow) => workflow.available && workflow.href ? [{
    id: workflow.id,
    label: workflow.title,
    href: workflow.href,
  }] : []);
}

export function publicWorkflow(workflow: RetrievedWorkflow) {
  return {
    id: workflow.id,
    title: workflow.title,
    available: workflow.available,
    href: workflow.href,
    steps: workflow.available ? workflow.steps : [],
    rules: workflow.available ? workflow.rules : [],
    blockers: workflow.available ? workflow.blockers : ["This workflow is not enabled for the current department."],
  };
}

export function capabilitySignature(role: ArogyaRole, departmentId: number, features: Record<string, boolean>): string {
  const selected = Object.fromEntries(Object.entries(features).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify({ role, departmentId, features: selected, knowledgeVersion }))
    .digest("hex").slice(0, 16);
}
