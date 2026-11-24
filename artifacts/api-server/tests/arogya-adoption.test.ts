import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, engine, procedureLogsTable, procedureTypesTable, studentsTable } from "./database.js";
import { accounts, request, setup, type Account } from "./support.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("resident progress gaps use the account's own profile and configured department targets", async () => {
  const resident = accounts.student0;
  const path = "/arogya/progress-gaps";
  await db.insert(procedureTypesTable).values({
    departmentId: resident.departmentId, group: "Test training", name: "Fixture procedure", required: 2,
  });
  await db.insert(procedureLogsTable).values({
    studentId: accounts.student1.studentId!, supervisorId: accounts.faculty1.id,
    procedureGroup: "Test training", procedureName: "Fixture procedure", date: "2026-05-01",
    patientUhid: "SYNTHETIC-FOREIGN", patientAge: "fixture", competencyLevel: "observed", status: "verified",
  });

  async function check(actor: Account | undefined, label: string, status: number) {
    const response = await request(runtime.base, path, actor);
    console.log(`EVIDENCE GET /api${path} (${label}) -> ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.status, status);
    return response.body;
  }

  await check(undefined, "unauthenticated", 401);
  await check(accounts.faculty1, "professor outside the resident role", 403);
  const own = await check(resident, "resident with own profile", 200);
  assert.deepEqual(own.gaps.find((gap: { label: string }) => gap.label === "Test training: Fixture procedure"), {
    label: "Test training: Fixture procedure", verified: 0, target: 2,
  });
  assert.deepEqual(own.gaps.find((gap: { label: string }) => gap.label === "Procedures"), {
    label: "Procedures", verified: 0, target: 11,
  });
  const another = await check(accounts.student1, "resident of a different department", 200);
  assert.ok(!another.gaps.some((gap: { label: string }) => gap.label === "Test training: Fixture procedure"));
  assert.deepEqual(another.gaps.find((gap: { label: string }) => gap.label === "Procedures"), {
    label: "Procedures", verified: 1, target: 12,
  });

  const missing = accounts.student2;
  await db.delete(studentsTable).where(eq(studentsTable.userId, missing.id));
  await check(missing, "resident account without a profile", 404);
});
