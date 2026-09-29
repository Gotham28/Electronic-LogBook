export const DAILY_LIMIT = 20;

const SYSTEM_INSTRUCTION = `Use only the facts in the facts pack provided. Do not invent any number.
If asked a medical, clinical, diagnostic or treatment question, reply: "I can only help with app usage and your records in this system. Please consult a qualified professional."
If the facts don't cover the question, say: "I don't have enough information to answer that."
Never mention patient names, UHIDs, diagnoses, clinical history, or examination findings.
Reply in plain, concise sentences. No bullet formatting.`;

const limits = new Map<string, { count: number; date: string }>();

export function checkAndIncrementLimit(userId: string): void {
  const today = new Date().toISOString().split("T")[0];
  
  if (limits.size > 5000) {
    for (const [k, v] of limits.entries()) {
      if (v.date !== today) limits.delete(k);
    }
  }

  const current = limits.get(userId) || { count: 0, date: today };
  if (current.date !== today) {
    current.count = 0;
    current.date = today;
  }

  if (current.count >= DAILY_LIMIT) {
    throw new Error("AROGYA_LIMIT_REACHED");
  }

  current.count += 1;
  limits.set(userId, current);
}

export async function callOpenAI(
  userMessage: string,
  factsPack: Record<string, unknown>,
  nameMap?: Record<string, string>
): Promise<{ reply: string; tokenCount: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) {
    throw new Error("AROGYA_UNAVAILABLE");
  }

  const abortSignal = AbortSignal.timeout(20_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `${SYSTEM_INSTRUCTION}\n\nFacts:\n${JSON.stringify(factsPack)}`
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      }),
      signal: abortSignal
    });

    if (!response.ok) {
      throw new Error("AROGYA_UNAVAILABLE");
    }

    const data = (await response.json()) as any;
    let reply = data.choices[0]?.message?.content || "";
    const tokenCount = data.usage?.total_tokens ?? 0;

    const packString = JSON.stringify(factsPack);
    const numbersInReply = reply.match(/\d+/g) || [];
    for (const num of numbersInReply) {
      if (!packString.includes(num)) {
        throw new Error("AROGYA_NUMBER_CHECK_FAILED");
      }
    }

    if (nameMap) {
      for (const [placeholder, realName] of Object.entries(nameMap)) {
        reply = reply.replaceAll(placeholder, realName);
      }
    }

    return { reply, tokenCount };
  } catch (error: any) {
    // If it's one of our own errors, rethrow it
    if (error.message === "AROGYA_UNAVAILABLE" || error.message === "AROGYA_NUMBER_CHECK_FAILED") {
      throw error;
    }
    // Otherwise it's a fetch error or timeout, wrap it
    throw new Error("AROGYA_UNAVAILABLE");
  }
}

/**
 * Injectable seam for testing. The route calls this instead of callOpenAI directly.
 * Tests replace _arogya.call to control what the AI returns without touching globalThis.fetch.
 */
export const _arogya = {
  call: callOpenAI,
};
