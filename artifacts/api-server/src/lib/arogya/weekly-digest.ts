import { and, eq } from "drizzle-orm";
import { assistantDepartmentWeeklyDigestsTable as digests, db } from "@workspace/db";
import { AROGYA_PROVIDER_TIMEOUT_MS, _arogya } from "../arogya.js";
import { buildDepartmentReportFacts } from "../department-report.js";

const departmentCalendar = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

export function departmentWeekStart(now: Date): string {
  const parts = departmentCalendar.formatToParts(now);
  const part = (name: "year" | "month" | "day") => Number(parts.find(({ type }) => type === name)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

type DigestState = (
  | { status: "ready"; weekStart: string; generatedAt: string; summary: string }
  | { status: "pending" | "failed"; weekStart: string }
) & { tokenCount?: number };

function cachedState(row: typeof digests.$inferSelect): DigestState {
  if (row.status === "ready" && row.generatedAt && row.summary !== null) {
    return { status: "ready", weekStart: row.weekStart, generatedAt: row.generatedAt.toISOString(), summary: row.summary };
  }
  const pending = row.status === "pending" && Date.now() - row.attemptedAt.getTime() < AROGYA_PROVIDER_TIMEOUT_MS;
  return { status: pending ? "pending" : "failed", weekStart: row.weekStart };
}

// The route resolves departmentId from the authenticated HOD before this function is called.
export async function getWeeklyDepartmentDigest(departmentId: number): Promise<DigestState> {
  const weekStart = departmentWeekStart(new Date());
  const key = and(eq(digests.departmentId, departmentId), eq(digests.weekStart, weekStart));
  const read = () => db.select().from(digests).where(key).limit(1);
  const [cached] = await read();
  if (cached) return cachedState(cached);

  const { facts: { department } } = await buildDepartmentReportFacts(departmentId, db);
  const [claim] = await db.insert(digests).values({ departmentId, weekStart, status: "pending" })
    .onConflictDoNothing({ target: [digests.departmentId, digests.weekStart] })
    .returning({ weekStart: digests.weekStart });
  if (!claim) {
    const [winner] = await read();
    return winner ? cachedState(winner) : { status: "failed", weekStart };
  }

  let tokenCount: number | undefined;
  try {
    const generation = await _arogya.call(
      'Choose one administrative next step from these department totals. Reply with exactly "review_queue" or "progress". Use "progress" if there are no pending logs.',
      department,
    );
    tokenCount = generation.tokenCount;
    const action = generation.reply.trim().toLowerCase();
    const nextStep = action === "progress" ? "Review resident progress against your configured targets."
      : action === "review_queue" && department.totalPendingLogs > 0 ? "Review the department's pending workload with faculty."
      : null;
    if (!nextStep) throw new Error("Invalid weekly digest action");

    const summary = `Approved residents: ${department.totalStudents}. Logs: ${department.totalVerifiedLogs} verified, ${department.totalPendingLogs} pending, ${department.totalRejectedLogs} rejected. ${nextStep}`;
    const [saved] = await db.update(digests).set({ status: "ready", summary, generatedAt: new Date() })
      .where(and(key, eq(digests.status, "pending"))).returning();
    if (saved) return { ...cachedState(saved), tokenCount };
  } catch {
    await db.update(digests).set({ status: "failed" }).where(and(key, eq(digests.status, "pending")));
  }
  return { status: "failed", weekStart, tokenCount };
}
