import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, usersTable, departmentsTable, nameChangeEmailOutboxTable } from "./database.js";
import { runNameChangeEmailBatch } from "../src/lib/name-change-email-dispatcher.js";
import { EmailDeliveryError } from "../src/lib/mailer.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => {
  runtime = await setup();
  process.env.APP_URL = "https://elogbook.example.test/deployment";
});
after(async () => { if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve())); await engine.close(); });

async function createNotice(who: keyof typeof a, newName: string) {
  const [user] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, a[who].id));
  const response = await request(runtime.base, "/profile", a[who], "PATCH", { fullName: newName, expectedFullName: user.fullName });
  assert.equal(response.status, 200);
  return response.body.notification.id as string;
}

test("dispatcher retries transient provider failures with a frozen body and the same idempotency key", async () => {
  const noticeId = await createNotice("student0", "Dispatcher Retry Resident");
  const [outbox] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, noticeId));
  const startedAt = new Date(Math.max(Date.now(), outbox.nextAttemptAt.getTime()) + 1000);
  const calls: Array<{ payload: string; key: string }> = [];
  const first = await runNameChangeEmailBatch({ now: () => startedAt, maxJobs: 1, send: async (payload, key) => {
    calls.push({ payload, key });
    throw new EmailDeliveryError("provider_rejected", 503);
  } });
  assert.equal(first, 1);
  let [saved] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.id, outbox.id));
  assert.equal(saved.status, "queued");
  assert.equal(saved.attemptCount, 1);
  assert.equal(saved.failureCode, "transient_provider_failure");
  assert.ok(saved.frozenPayload);
  assert.ok(saved.idempotencyKey);

  const retryAt = new Date(startedAt.getTime() + 60_001);
  const second = await runNameChangeEmailBatch({ now: () => retryAt, maxJobs: 1, send: async (payload, key) => {
    calls.push({ payload, key });
  } });
  assert.equal(second, 1);
  [saved] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.id, outbox.id));
  assert.equal(saved.status, "accepted");
  assert.equal(saved.attemptCount, 2);
  assert.equal(saved.acceptedAt?.toISOString(), retryAt.toISOString());
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload, calls[1].payload);
  assert.equal(calls[0].key, calls[1].key);
  assert.match(calls[0].key, /^profile-name-change\/[0-9a-f-]+\/0$/);
  assert.match(calls[0].payload, /Resident profile name updated/);
  assert.match(calls[0].payload, /https:\/\/elogbook\.example\.test\/notifications\/name-changes\//);
});

test("dispatcher waits without consuming attempts when no HOD is approved, and suppresses test departments", async () => {
  const noticeId = await createNotice("student1", "Wait for HOD Resident");
  const [outbox] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, noticeId));
  await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, a.hod1.id));
  const now = new Date(Math.max(Date.now(), outbox.nextAttemptAt.getTime()) + 1000);
  await runNameChangeEmailBatch({ now: () => now, maxJobs: 1, send: async () => assert.fail("must not send without an approved HOD") });
  const [waiting] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, noticeId));
  assert.equal(waiting.status, "waiting_for_hod");
  assert.equal(waiting.attemptCount, 0);
  await db.update(usersTable).set({ status: "approved" }).where(eq(usersTable.id, a.hod1.id));

  await db.update(departmentsTable).set({ isTest: true }).where(eq(departmentsTable.id, a.student2.departmentId));
  const testNoticeId = await createNotice("student2", "Test Department Resident");
  const [suppressed] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, testNoticeId));
  assert.equal(suppressed.status, "suppressed_test");
  assert.equal(suppressed.attemptCount, 0);
});

test("attempts older than the safe idempotency window become needs_attention without a replay", async () => {
  const noticeId = await createNotice("student0", "Old Attempt Resident");
  const [outbox] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, noticeId));
  await db.update(nameChangeEmailOutboxTable).set({
    attemptCount: 1,
    firstAttemptAt: new Date(Math.max(Date.now(), outbox.nextAttemptAt.getTime()) - 24 * 60 * 60_000),
    nextAttemptAt: new Date(Math.max(Date.now(), outbox.nextAttemptAt.getTime()) + 1000),
    frozenPayload: JSON.stringify({ from: "E-LogBook <noreply@example.test>", to: "hod@example.test", subject: "frozen" }),
    idempotencyKey: "profile-name-change/old-generation",
  }).where(eq(nameChangeEmailOutboxTable.id, outbox.id));
  let sent = false;
  const runAt = new Date(Math.max(Date.now(), outbox.nextAttemptAt.getTime()) + 1000);
  await runNameChangeEmailBatch({ now: () => runAt, maxJobs: 1, send: async () => { sent = true; } });
  const [saved] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.id, outbox.id));
  assert.equal(sent, false);
  assert.equal(saved.status, "needs_attention");
  assert.equal(saved.failureCode, "ambiguous_attempt_expired");
});
