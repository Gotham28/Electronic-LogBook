import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { assistantUsageEventsTable, collegesTable, db, departmentsTable, engine, usersTable } from "./database.js";
import { accounts, request, setup, type Account } from "./support.js";
import { _arogya } from "../src/lib/arogya.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("POST /arogya/usage requires an authenticated actor", async () => {
  const response = await request(runtime.base, "/arogya/usage", undefined, "POST", { eventType: "panel_open" });
  assert.equal(response.status, 401);
  assert.deepEqual(await db.select().from(assistantUsageEventsTable), []);
});

test("POST /arogya/usage rejects a signed-in account outside the Mochi roles", async () => {
  const actor = accounts.faculty0;
  await db.update(usersTable).set({ role: "dean" }).where(eq(usersTable.id, actor.id));
  try {
    const response = await request(runtime.base, "/arogya/usage", actor, "POST", { eventType: "panel_open" });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Mochi usage is unavailable for this account type." });
    assert.deepEqual(await db.select().from(assistantUsageEventsTable), []);
  } finally {
    await db.update(usersTable).set({ role: "professor" }).where(eq(usersTable.id, actor.id));
  }
});

test("POST /arogya/usage records each permitted event against the signed-in account", async () => {
  const events = [
    { eventType: "panel_open", actor: accounts.student0 },
    { eventType: "quick_action_click", actor: accounts.faculty1 },
    { eventType: "nudge_click", actor: accounts.hod2 },
  ];
  for (const { eventType, actor } of events) {
    const response = await request(runtime.base, "/arogya/usage", actor, "POST", { eventType });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { recorded: true });

    const rows = await db.select({
      userId: assistantUsageEventsTable.userId,
      departmentId: assistantUsageEventsTable.departmentId,
      role: assistantUsageEventsTable.role,
      feature: assistantUsageEventsTable.feature,
      httpStatus: assistantUsageEventsTable.httpStatus,
      tokenCount: assistantUsageEventsTable.tokenCount,
    }).from(assistantUsageEventsTable).where(eq(assistantUsageEventsTable.eventType, eventType));
    assert.deepEqual(rows, [{
      userId: actor.id,
      departmentId: actor.departmentId,
      role: actor.role,
      feature: "mochi",
      httpStatus: null,
      tokenCount: null,
    }]);
  }
});

test("POST /arogya/usage rejects unknown events, client scope, and free text", async () => {
  const before = await db.select().from(assistantUsageEventsTable);
  for (const body of [
    { eventType: "unsupported" },
    { eventType: "panel_open", userId: accounts.student1.id, departmentId: accounts.student1.departmentId },
    { eventType: "nudge_click", text: "extra input" },
  ]) {
    const response = await request(runtime.base, "/arogya/usage", accounts.student0, "POST", body);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Invalid Mochi usage event." });
  }
  assert.deepEqual(await db.select().from(assistantUsageEventsTable), before);
});

test("GET /arogya/usage scopes counts to the actor's department or college", async () => {
  await db.delete(assistantUsageEventsTable);
  const [otherCollege] = await db.insert(collegesTable).values({
    name: "Usage test college", code: "usage-test-college",
  }).returning({ id: collegesTable.id });
  const requester = accounts.hod0;
  const otherDepartment = accounts.hod2.departmentId;
  await db.update(departmentsTable).set({ collegeId: otherCollege.id })
    .where(eq(departmentsTable.id, otherDepartment));

  const seed = [
    { actor: accounts.student0, eventType: "panel_open" },
    { actor: accounts.faculty1, eventType: "quick_action_click" },
    { actor: accounts.hod2, eventType: "nudge_click" },
  ];
  await db.insert(assistantUsageEventsTable).values(seed.map(({ actor, eventType }) => ({
    userId: actor.id, role: actor.role, departmentId: actor.departmentId, feature: "mochi", eventType,
  })));

  async function checkRead(path: string, actor: Account | undefined, label: string, status: number, body?: unknown) {
    const response = await request(runtime.base, path, actor);
    console.log(`EVIDENCE GET /api${path} (${label}) -> ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.status, status);
    if (body !== undefined) assert.deepEqual(response.body, body);
  }

  const nudge = { feature: "mochi", eventType: "nudge_click", count: 1 };
  const panel = { feature: "mochi", eventType: "panel_open", count: 1 };
  const quick = { feature: "mochi", eventType: "quick_action_click", count: 1 };
  await checkRead("/arogya/usage", undefined, "unauthenticated", 401);
  await checkRead(`/arogya/usage?departmentId=${otherDepartment}`, requester, "HOD of another department", 403);
  await checkRead("/arogya/usage", requester, "HOD of own department", 200, {
    departmentId: requester.departmentId, counts: [panel],
  });

  const admin = accounts.faculty0;
  await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, admin.id));
  try {
    await checkRead("/arogya/usage", admin, "college-scoped admin", 200, {
      departmentId: null, counts: [panel, quick],
    });
    await checkRead(`/arogya/usage?departmentId=${otherDepartment}`, admin, "admin of another college", 403);
    await db.update(usersTable).set({ departmentId: null }).where(eq(usersTable.id, admin.id));
    await checkRead("/arogya/usage", admin, "platform admin", 200, {
      departmentId: null, counts: [nudge, panel, quick],
    });
    await checkRead("/arogya/usage?departmentId=2147483647", admin, "platform admin, nonexistent department", 404);
  } finally {
    await db.update(usersTable).set({ role: "professor", departmentId: admin.departmentId })
      .where(eq(usersTable.id, admin.id));
  }
});

test("Mochi requests write one metadata event with the response status and available token count", async () => {
  const actor = accounts.student0;
  const original = _arogya.call;
  _arogya.call = async () => ({ reply: "Look at your dashboard.", tokenCount: 15 });
  try {
    const malformed = await request(runtime.base, "/arogya/ask", actor, "POST", {});
    assert.equal(malformed.status, 400);
    const completed = await request(runtime.base, "/arogya/ask", actor, "POST", { question: "Where are my postings?" });
    assert.equal(completed.status, 200);

    const read = () => db.select().from(assistantUsageEventsTable)
      .where(eq(assistantUsageEventsTable.eventType, "api_request"))
      .orderBy(assistantUsageEventsTable.id);
    let rows = await read();
    for (let attempt = 0; rows.length < 2 && attempt < 20; attempt++) {
      await setTimeout(25);
      rows = await read();
    }
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.userId, actor.id);
      assert.equal(row.departmentId, actor.departmentId);
      assert.equal(row.feature, "ask");
      assert.equal(row.role, "student");
    }
    assert.deepEqual(rows.map(({ httpStatus, tokenCount }) => ({ httpStatus, tokenCount })), [
      { httpStatus: 400, tokenCount: null }, { httpStatus: 200, tokenCount: 15 },
    ]);
  } finally {
    _arogya.call = original;
  }
});
