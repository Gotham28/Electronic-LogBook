const legacyAssistantErrors = new Set([
  "Arogya context could not be loaded.",
  "Arogya is not available for this account type.",
  "Arogya is not available right now.",
  "Invalid Arogya request.",
  "You've reached today's Arogya limit. Try again tomorrow.",
  "Arogya returned an invalid response. Please try again.",
  "Arogya couldn't check that right now.",
  "Arogya couldn't answer right now.",
]);

export function displayAssistantError(message: unknown, fallback: string) {
  if (typeof message !== "string" || !message.trim()) return fallback;
  return legacyAssistantErrors.has(message) ? message.replace("Arogya", "Mochi") : message;
}
