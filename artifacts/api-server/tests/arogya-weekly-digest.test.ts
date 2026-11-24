import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  assistantDepartmentWeeklyDigestsTable as digests, caseLogsTable, db, departmentsTable, engine,
} from "./database.js";
import { accounts, request, setup, type Account } from "./support.js";
import { AROGYA_PROVIDER_TIMEOUT_MS, _arogya } from "../src/lib/arogya.js";
import { departmentWeekStart } from "../src/lib/arogya/weekly-digest.js";

const path = "/arogya/department-report/weekly";
let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

function requestDigest(who?: Account, body: unknown = {}) {
  return request(runtime.base, path, who, "POST", body);
}

function evidence(label: string, response: Awaited<ReturnType<typeof requestDigest>>, status: number) {
  console.log(`EVIDENCE POST /api${path} (${label}) -> ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(response.status, status);
}

test("weekly cache uses the Monday boundary in Asia/Kolkata", () => {
  assert.equal(departmentWeekStart(new Date("2026-11-22T18:29:59Z")), "2026-11-16");
  assert.equal(departmentWeekStart(new Date("2026-11-22T18:30:00Z")), "2026-11-23");
});

test("weekly digest denies unauthenticated, wrong-role, and cross-department requests", async () => {
  evidence("unauthenticated", await requestDigest(), 401);
  evidence("professor", await requestDigest(accounts.faculty0), 403);
  const anotherDepartment = accounts.hod1.departmentId;
  evidence(`HOD of another department, body departmentId=${anotherDepartment}`,
    await requestDigest(accounts.hod0, { departmentId: anotherDepartment }), 403);
  assert.deepEqual(await db.select().from(digests), []);
});

test("concurrent HOD requests make one model call and reuse its stored aggregate digest", { timeout: 15_000 }, async () => {
  const hod = accounts.hod0;
  await db.insert(caseLogsTable).values({
    studentId: accounts.student0.studentId!, supervisorId: accounts.faculty0.id, date: "2026-11-20", status: "pending",
    patientAge: "fixture", patientGender: "other", diagnosisFinal: "fixture data",
  });
  let started!: () => void;
  let release!: () => void;
  const inModel = new Promise<void>((resolve) => { started = resolve; });
  const blockedModel = new Promise<void>((resolve) => { release = resolve; });
  const provider = mock.method(_arogya, "call", async (_prompt: string, facts: unknown, nameMap?: unknown) => {
    started();
    assert.deepEqual(facts, { totalStudents: 2, totalVerifiedLogs: 0, totalPendingLogs: 1, totalRejectedLogs: 0 });
    assert.equal(nameMap, undefined);
    await blockedModel;
    return { reply: "review_queue", tokenCount: 93 };
  });
  const first = requestDigest(hod);
  try {
    await Promise.race([inModel, first.then(() => { throw new Error("The first request exited before calling the model"); })]);
    const concurrent = await requestDigest(hod);
    assert.equal(concurrent.status, 202);
    assert.equal(concurrent.body.status, "pending");
    release();
    const completed = await first;
    evidence("HOD of own department", completed, 200);
    assert.equal(completed.body.status, "ready");
    assert.equal(completed.body.weekStart, departmentWeekStart(new Date()));
    assert.equal(completed.body.summary,
      "Approved residents: 2. Logs: 0 verified, 1 pending, 0 rejected. Review the department's pending workload with faculty.");
    assert.deepEqual((await requestDigest(hod)).body, completed.body);
    assert.equal(provider.mock.callCount(), 1);
  } finally {
    release();
    await first.catch(() => {});
    provider.mock.restore();
  }
});

test("a failed attempt and an expired pending claim never trigger a second generation", async () => {
  const weekStart = departmentWeekStart(new Date());
  const hod = accounts.hod1;
  const provider = mock.method(_arogya, "call", async () => ({ reply: "invalid fixture action", tokenCount: 10 }));
  try {
    assert.equal((await requestDigest(hod)).status, 503);
    assert.equal((await requestDigest(hod)).status, 503);
    const rows = await db.select().from(digests).where(and(eq(digests.departmentId, hod.departmentId), eq(digests.weekStart, weekStart)));
    assert.equal(rows[0].status, "failed");
    assert.equal(rows[0].summary, null);
    assert.equal(provider.mock.callCount(), 1);

    const interrupted = accounts.hod2;
    await db.insert(digests).values({
      departmentId: interrupted.departmentId, weekStart, status: "pending",
      attemptedAt: new Date(Date.now() - AROGYA_PROVIDER_TIMEOUT_MS - 1),
    });
    assert.equal((await requestDigest(interrupted)).status, 503);
    assert.equal(provider.mock.callCount(), 1);
  } finally {
    provider.mock.restore();
  }
});

test("a department that disappeared after authentication returns 404", async () => {
  const originalSelect = db.select.bind(db);
  const selection = mock.method(db, "select", (fields?: unknown) => {
    // An account's assigned department satisfies a foreign key. Simulate the read after
    // a concurrent removal by omitting just the explicit department lookup result.
    if ((fields as { id?: unknown } | undefined)?.id === departmentsTable.id) {
      return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
    }
    return originalSelect(fields as Parameters<typeof originalSelect>[0]);
  });
  try {
    evidence("HOD with a department removed after authentication", await requestDigest(accounts.hod0), 404);
  } finally {
    selection.mock.restore();
  }
});
