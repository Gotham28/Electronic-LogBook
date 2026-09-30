import { eq, and, isNull, count } from "drizzle-orm";
import { studentsTable, usersTable, caseLogsTable, procedureLogsTable, academicLogsTable, departmentConfigsTable, procedureTypesTable, departmentCatalogTable, postingsTable } from "@workspace/db";
import { resolveConfigDepartmentId } from "./department-config-source.js";

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
    const numbersInReply = reply.match(/\b\d{2,}\b/g) || [];
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

export async function buildProgressFacts(studentId: number, departmentId: number, db: any) {
  const configSourceId = await resolveConfigDepartmentId(departmentId);

  const [caseCounts, procedureCounts, academicCounts, configTargets, procedureRequirements, academicRequirements] = await Promise.all([
    db.select({ category: caseLogsTable.category, status: caseLogsTable.status, count: count() })
      .from(caseLogsTable)
      .where(and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt)))
      .groupBy(caseLogsTable.category, caseLogsTable.status),

    db.select({ procedureGroup: procedureLogsTable.procedureGroup, procedureName: procedureLogsTable.procedureName, status: procedureLogsTable.status, count: count() })
      .from(procedureLogsTable)
      .where(and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt)))
      .groupBy(procedureLogsTable.procedureGroup, procedureLogsTable.procedureName, procedureLogsTable.status),

    db.select({ activityType: academicLogsTable.activityType, status: academicLogsTable.status, count: count() })
      .from(academicLogsTable)
      .where(eq(academicLogsTable.studentId, studentId))
      .groupBy(academicLogsTable.activityType, academicLogsTable.status),

    db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1),
    db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId)),
    db.select().from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "academic")))
  ]);

  const caseCategoryMap = new Map<string | null, { verified: number; pending: number }>();
  for (const row of caseCounts) {
    const key = row.category ?? null;
    if (!caseCategoryMap.has(key)) caseCategoryMap.set(key, { verified: 0, pending: 0 });
    const entry = caseCategoryMap.get(key)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending" || row.status === null) entry.pending += Number(row.count);
  }
  const caseCategories = Array.from(caseCategoryMap.entries()).map(([value, counts]) => ({
    value, verified: counts.verified, pending: counts.pending,
  }));

  const procedureMap = new Map<string, { group: string; name: string; verified: number; pending: number; }>();
  for (const row of procedureCounts) {
    const key = `${row.procedureGroup}\0${row.procedureName}`;
    if (!procedureMap.has(key)) procedureMap.set(key, { group: row.procedureGroup, name: row.procedureName, verified: 0, pending: 0 });
    const entry = procedureMap.get(key)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending") entry.pending += Number(row.count);
  }
  const procedures = Array.from(procedureMap.values()).map(entry => ({
    group: entry.group, name: entry.name, verified: entry.verified, pending: entry.pending,
  }));

  const academicMap = new Map<string, { verified: number; pending: number }>();
  for (const row of academicCounts) {
    if (!academicMap.has(row.activityType)) academicMap.set(row.activityType, { verified: 0, pending: 0 });
    const entry = academicMap.get(row.activityType)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending") entry.pending += Number(row.count);
  }
  const academics = Array.from(academicMap.entries()).map(([value, counts]) => ({
    value, verified: counts.verified, pending: counts.pending,
  }));

  return {
    caseCategories,
    procedures,
    academics,
    departmentTargets: configTargets[0] || null,
    procedureRequirements,
    academicRequirements
  };
}

export async function buildAppraisalFacts(studentId: number, departmentId: number, db: any) {
  const configSourceId = await resolveConfigDepartmentId(departmentId);

  const [caseCounts, procedureCounts, academicCounts, configTargets, procedureRequirements, academicRequirements, postings] = await Promise.all([
    db.select({ category: caseLogsTable.category, status: caseLogsTable.status, count: count() })
      .from(caseLogsTable)
      .where(and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt)))
      .groupBy(caseLogsTable.category, caseLogsTable.status),

    db.select({ procedureGroup: procedureLogsTable.procedureGroup, procedureName: procedureLogsTable.procedureName, status: procedureLogsTable.status, count: count() })
      .from(procedureLogsTable)
      .where(and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt)))
      .groupBy(procedureLogsTable.procedureGroup, procedureLogsTable.procedureName, procedureLogsTable.status),

    db.select({ activityType: academicLogsTable.activityType, status: academicLogsTable.status, count: count() })
      .from(academicLogsTable)
      .where(eq(academicLogsTable.studentId, studentId))
      .groupBy(academicLogsTable.activityType, academicLogsTable.status),

    db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1),
    db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId)),
    db.select().from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "academic"))),

    db.select({ ward: postingsTable.ward, startDate: postingsTable.startDate, endDate: postingsTable.endDate, status: postingsTable.status })
      .from(postingsTable)
      .where(eq(postingsTable.studentId, studentId)),
  ]);

  const caseCategoryMap = new Map<string | null, { verified: number; pending: number; rejected: number }>();
  for (const row of caseCounts) {
    const key = row.category ?? null;
    if (!caseCategoryMap.has(key)) caseCategoryMap.set(key, { verified: 0, pending: 0, rejected: 0 });
    const entry = caseCategoryMap.get(key)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending" || row.status === null) entry.pending += Number(row.count);
    else if (row.status === "rejected") entry.rejected += Number(row.count);
  }
  const caseCategories = Array.from(caseCategoryMap.entries()).map(([value, counts]) => ({
    value, verified: counts.verified, pending: counts.pending, rejected: counts.rejected,
  }));

  const procedureMap = new Map<string, { group: string; name: string; verified: number; pending: number; rejected: number }>();
  for (const row of procedureCounts) {
    const key = `${row.procedureGroup}\0${row.procedureName}`;
    if (!procedureMap.has(key)) procedureMap.set(key, { group: row.procedureGroup, name: row.procedureName, verified: 0, pending: 0, rejected: 0 });
    const entry = procedureMap.get(key)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending") entry.pending += Number(row.count);
    else if (row.status === "rejected") entry.rejected += Number(row.count);
  }
  const procedures = Array.from(procedureMap.values()).map(entry => ({
    group: entry.group, name: entry.name, verified: entry.verified, pending: entry.pending, rejected: entry.rejected,
  }));

  const academicMap = new Map<string, { verified: number; pending: number; rejected: number }>();
  for (const row of academicCounts) {
    if (!academicMap.has(row.activityType)) academicMap.set(row.activityType, { verified: 0, pending: 0, rejected: 0 });
    const entry = academicMap.get(row.activityType)!;
    if (row.status === "verified") entry.verified += Number(row.count);
    else if (row.status === "pending") entry.pending += Number(row.count);
    else if (row.status === "rejected") entry.rejected += Number(row.count);
  }
  const academics = Array.from(academicMap.entries()).map(([value, counts]) => ({
    value, verified: counts.verified, pending: counts.pending, rejected: counts.rejected,
  }));

  return {
    caseCategories,
    procedures,
    academics,
    departmentTargets: configTargets[0] || null,
    procedureRequirements,
    academicRequirements,
    postings,
  };
}
