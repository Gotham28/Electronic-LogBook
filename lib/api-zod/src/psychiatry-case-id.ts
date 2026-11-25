export const SHORT_CASE_CATEGORY = "psychiatry-short-case";
export const SHORT_CASE_RECORD_VERSION = "2026-01";

export function isPsychiatryShortCase(entry: { category?: string | null; customFields?: Record<string, string> | null }) {
  return entry.category === SHORT_CASE_CATEGORY && entry.customFields?._psychiatryShortCase === SHORT_CASE_RECORD_VERSION;
}
