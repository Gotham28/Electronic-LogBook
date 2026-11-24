/**
 * Optional OpenAI reasoning effort, driven by the OPENAI_REASONING_EFFORT env var.
 * Returns an empty object when unset or blank so the field is never sent to
 * non-reasoning models. This module has no imports, so any Arogya file can use it.
 */
export function reasoningEffortParam(): { reasoning_effort?: string } {
  const effort = process.env.OPENAI_REASONING_EFFORT?.trim();
  return effort ? { reasoning_effort: effort } : {};
}
