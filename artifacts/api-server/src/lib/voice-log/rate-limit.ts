import { VoiceLogError } from "./errors.js";

export { VoiceLogError };

interface UserRateLimitState {
  dailyCount: number;
  date: string;
  timestamps: number[];
}

const limits = new Map<string, UserRateLimitState>();

export function checkVoiceLogLimit(userId: string): void {
  const now = Date.now();
  const today = new Date().toISOString().split("T")[0];
  const dailyLimit = Number(process.env.VOICE_LOG_DAILY_LIMIT) || 40;
  const burstLimit = 6;
  const burstWindowMs = 60_000;

  if (limits.size > 5000) {
    for (const [k, v] of limits.entries()) {
      if (v.date !== today && v.timestamps.every((t) => now - t > burstWindowMs)) {
        limits.delete(k);
      }
    }
  }

  const current = limits.get(userId) || { dailyCount: 0, date: today, timestamps: [] };

  if (current.date !== today) {
    current.dailyCount = 0;
    current.date = today;
  }

  current.timestamps = current.timestamps.filter((t) => now - t < burstWindowMs);

  if (current.dailyCount >= dailyLimit) {
    throw new VoiceLogError("VOICE_LOG_LIMIT_REACHED");
  }

  if (current.timestamps.length >= burstLimit) {
    throw new VoiceLogError("VOICE_LOG_LIMIT_REACHED");
  }

  current.dailyCount += 1;
  current.timestamps.push(now);
  limits.set(userId, current);
}

export function resetVoiceLogLimits(): void {
  limits.clear();
}
