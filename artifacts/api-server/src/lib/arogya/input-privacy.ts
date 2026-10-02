const patientIdentifier = /\b(?:UHID|MRN|patient\s*id|case\s*(?:number|no\.?|id)|medical\s+record\s+number)\s*[:=#-]\s*[A-Z0-9-]{3,}\b/i;
const labeledClinicalValue = /\b(?:patient\s*(?:name|details|history|record|diagnosis)?|chief\s+complaints?|clinical\s+findings?|examination\s+findings?|diagnosis|history|management\s+plan)\s*:\s*\S/i;
const likelyClinicalNarrative = /\b(?:patient\s+(?:is|was|has|had)|complains? of|presented with|diagnosed with|examination shows|history reveals)\s+(?!the\s+(?:field|form|page)\b)[\p{L}\d]/iu;

export function containsSensitiveClinicalInput(value: string): boolean {
  return patientIdentifier.test(value) || labeledClinicalValue.test(value) || likelyClinicalNarrative.test(value);
}

export function normalizeHistory(history: unknown): Array<{ question: string; reply: string }> | null {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > 6) return null;
  const normalized: Array<{ question: string; reply: string }> = [];
  let total = 0;
  for (const turn of history) {
    if (!turn || typeof turn !== "object") return null;
    const item = turn as Record<string, unknown>;
    if (Object.keys(item).some((key) => key !== "question" && key !== "reply")) return null;
    if (typeof item.question !== "string" || typeof item.reply !== "string") return null;
    const question = item.question.trim();
    const reply = item.reply.trim();
    if (!question || question.length > 1200 || reply.length > 4000) return null;
    total += question.length + reply.length;
    if (total > 12000) return null;
    if (containsSensitiveClinicalInput(question) || containsSensitiveClinicalInput(reply)) return null;
    normalized.push({ question, reply });
  }
  return normalized;
}

export function scrubAccountNames(input: string, names: readonly string[]): string {
  let result = input;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "giu"), "$1the selected account");
  }
  return result;
}
