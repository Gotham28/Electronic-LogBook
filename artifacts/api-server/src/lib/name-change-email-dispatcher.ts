import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  auditTable, db, departmentsTable, departmentNameChangeNotificationsTable,
  nameChangeEmailOutboxTable, studentsTable, usersTable,
} from "@workspace/db";
import { logger } from "./logger.js";
import {
  getNameChangeEmailFailure, renderNameChangeEmail, sendFrozenNameChangeEmail,
} from "./mailer.js";
import { PROFILE_NAME_CHANGE_EVENT } from "./profile-name-changes.js";

const RETRY_AFTER_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
const MAX_ATTEMPTS = 6;
const LEASE_MS = 60_000;
const MAX_AMBIGUOUS_AGE_MS = 23 * 60 * 60_000;
const WAIT_FOR_HOD_MS = 60_000;
const WAIT_FOR_SUBJECT_MS = 5 * 60_000;
const WAIT_FOR_CONFIGURATION_MS = 5 * 60_000;

type Clock = () => Date;
type EmailSender = (serializedPayload: string, idempotencyKey: string) => Promise<void>;

type ClaimedJob = {
  id: string;
  notificationId: string;
  status: string;
  recipientUserId: number | null;
  recipientGeneration: number;
  idempotencyKey: string | null;
  frozenPayload: string | null;
  attemptCount: number;
  firstAttemptAt: Date | null;
  leaseToken: string;
};

type PreparedEmail = {
  job: ClaimedJob;
  payload: string;
  idempotencyKey: string;
  attemptNumber: number;
};

function currentAppOrigin(): string | null {
  const value = process.env.APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function claimNextJob(now: Date): Promise<ClaimedJob | null> {
  return db.transaction(async (tx) => {
    const due = or(
      and(
        sql`${nameChangeEmailOutboxTable.status} IN ('queued', 'waiting_for_hod', 'waiting_for_subject', 'waiting_for_configuration')`,
        lte(nameChangeEmailOutboxTable.nextAttemptAt, now),
      ),
      and(
        eq(nameChangeEmailOutboxTable.status, "processing"),
        or(isNull(nameChangeEmailOutboxTable.leaseUntil), lte(nameChangeEmailOutboxTable.leaseUntil, now)),
      ),
    );
    const [row] = await tx.select().from(nameChangeEmailOutboxTable)
      .where(due)
      .orderBy(asc(nameChangeEmailOutboxTable.nextAttemptAt), asc(nameChangeEmailOutboxTable.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;

    const leaseToken = randomUUID();
    const [claimed] = await tx.update(nameChangeEmailOutboxTable).set({
      status: "processing",
      leaseToken,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    }).where(eq(nameChangeEmailOutboxTable.id, row.id)).returning();
    return {
      id: claimed.id,
      notificationId: claimed.notificationId,
      status: claimed.status,
      recipientUserId: claimed.recipientUserId,
      recipientGeneration: claimed.recipientGeneration,
      idempotencyKey: claimed.idempotencyKey,
      frozenPayload: claimed.frozenPayload,
      attemptCount: claimed.attemptCount,
      firstAttemptAt: claimed.firstAttemptAt,
      leaseToken,
    };
  });
}

function leaseFilter(job: ClaimedJob) {
  return and(
    eq(nameChangeEmailOutboxTable.id, job.id),
    eq(nameChangeEmailOutboxTable.status, "processing"),
    eq(nameChangeEmailOutboxTable.leaseToken, job.leaseToken),
  );
}

async function finishWaiting(job: ClaimedJob, status: "waiting_for_hod" | "waiting_for_subject" | "waiting_for_configuration", now: Date) {
  await db.update(nameChangeEmailOutboxTable).set({
    status,
    nextAttemptAt: new Date(now.getTime() + (
      status === "waiting_for_hod" ? WAIT_FOR_HOD_MS
        : status === "waiting_for_subject" ? WAIT_FOR_SUBJECT_MS
          : WAIT_FOR_CONFIGURATION_MS
    )),
    leaseToken: null,
    leaseUntil: null,
    updatedAt: now,
  }).where(leaseFilter(job));
}

async function finishTerminal(job: ClaimedJob, status: "accepted" | "needs_attention" | "cancelled" | "suppressed_test", now: Date, failureCode?: string, providerStatus?: number) {
  await db.update(nameChangeEmailOutboxTable).set({
    status,
    acceptedAt: status === "accepted" ? now : null,
    failureCode: failureCode ?? null,
    providerStatus: providerStatus ?? null,
    frozenPayload: null,
    idempotencyKey: null,
    leaseToken: null,
    leaseUntil: null,
    updatedAt: now,
  }).where(leaseFilter(job));
}

async function prepareEmail(job: ClaimedJob, now: Date): Promise<PreparedEmail | null> {
  const [notice] = await db.select({
    id: departmentNameChangeNotificationsTable.id,
    departmentId: departmentNameChangeNotificationsTable.departmentId,
    subjectUserId: departmentNameChangeNotificationsTable.subjectUserId,
    studentId: departmentNameChangeNotificationsTable.studentId,
    auditId: departmentNameChangeNotificationsTable.auditId,
    isTest: departmentsTable.isTest,
    departmentName: departmentsTable.name,
    subjectStatus: usersTable.status,
    subjectDepartmentId: usersTable.departmentId,
    currentStudentName: usersTable.fullName,
    registrationNumber: studentsTable.registrationNumber,
    kuhsId: studentsTable.kuhsId,
    previousState: auditTable.beforeState,
    nextState: auditTable.afterState,
    changedAt: auditTable.timestamp,
  }).from(departmentNameChangeNotificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, departmentNameChangeNotificationsTable.subjectUserId))
    .innerJoin(studentsTable, and(
      eq(studentsTable.id, departmentNameChangeNotificationsTable.studentId),
      eq(studentsTable.userId, departmentNameChangeNotificationsTable.subjectUserId),
    ))
    .innerJoin(departmentsTable, eq(departmentsTable.id, departmentNameChangeNotificationsTable.departmentId))
    .innerJoin(auditTable, eq(auditTable.id, departmentNameChangeNotificationsTable.auditId))
    .where(and(
      eq(departmentNameChangeNotificationsTable.id, job.notificationId),
      eq(auditTable.id, departmentNameChangeNotificationsTable.auditId),
      eq(auditTable.tableName, "users"),
      eq(auditTable.action, "UPDATE"),
      sql`${auditTable.recordId} = CAST(${departmentNameChangeNotificationsTable.subjectUserId} AS text)`,
      sql`${auditTable.afterState}->>'eventType' = ${PROFILE_NAME_CHANGE_EVENT}`,
      sql`${auditTable.afterState}->>'source' = 'self_service'`,
    )).limit(1);

  if (!notice || notice.subjectDepartmentId !== notice.departmentId) {
    await finishTerminal(job, "cancelled", now, "subject_department_changed");
    return null;
  }
  if (notice.isTest) {
    await finishTerminal(job, "suppressed_test", now, "test_department");
    return null;
  }

  if (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= MAX_AMBIGUOUS_AGE_MS) {
    await finishTerminal(job, "needs_attention", now, "ambiguous_attempt_expired");
    return null;
  }
  if (job.attemptCount >= MAX_ATTEMPTS) {
    await finishTerminal(job, "needs_attention", now, "attempts_exhausted");
    return null;
  }
  if (notice.subjectStatus !== "approved") {
    await finishWaiting(job, "waiting_for_subject", now);
    return null;
  }

  const appOrigin = currentAppOrigin();
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !appOrigin) {
    await finishWaiting(job, "waiting_for_configuration", now);
    return null;
  }

  const [hod] = await db.select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable).where(and(
      eq(usersTable.departmentId, notice.departmentId),
      eq(usersTable.role, "hod"),
      eq(usersTable.status, "approved"),
    )).limit(1);
  if (!hod) {
    await finishWaiting(job, "waiting_for_hod", now);
    return null;
  }

  const previousState = notice.previousState as { fullName?: unknown } | null;
  const nextState = notice.nextState as { fullName?: unknown } | null;
  const previousName = typeof previousState?.fullName === "string" ? previousState.fullName : "";
  const newName = typeof nextState?.fullName === "string" ? nextState.fullName : "";

  let generation = job.recipientGeneration;
  let attemptCount = job.attemptCount;
  let firstAttemptAt = job.firstAttemptAt;
  let idempotencyKey = job.idempotencyKey;
  let frozenPayload = job.frozenPayload;
  let recipientUserId = job.recipientUserId;
  if (frozenPayload && attemptCount > 0) {
    let priorRecipientEmail: unknown;
    try {
      priorRecipientEmail = (JSON.parse(frozenPayload) as { to?: unknown }).to;
    } catch {
      await finishTerminal(job, "needs_attention", now, "stored_payload_invalid");
      return null;
    }
    if (recipientUserId !== hod.id || priorRecipientEmail !== hod.email) {
      generation += 1;
      attemptCount = 0;
      firstAttemptAt = null;
      idempotencyKey = null;
      frozenPayload = null;
    }
  }

  if (!frozenPayload) {
    const rendered = renderNameChangeEmail({
      hodName: hod.fullName,
      previousName,
      newName,
      hodEmail: hod.email,
      registrationNumber: notice.registrationNumber,
      kuhsId: notice.kuhsId,
      departmentName: notice.departmentName,
      changedAt: notice.changedAt,
      notificationId: notice.id,
      appOrigin,
    });
    recipientUserId = hod.id;
    idempotencyKey = "profile-name-change/" + job.id + "/" + generation;
    frozenPayload = JSON.stringify(rendered);
  }

  attemptCount += 1;
  firstAttemptAt ??= now;
  const lease = leaseFilter(job);
  const [prepared] = await db.update(nameChangeEmailOutboxTable).set({
    recipientUserId,
    recipientGeneration: generation,
    idempotencyKey,
    frozenPayload,
    attemptCount,
    firstAttemptAt,
    failureCode: null,
    providerStatus: null,
    updatedAt: now,
  }).where(lease).returning({ id: nameChangeEmailOutboxTable.id });
  if (!prepared) return null;

  return {
    job: { ...job, recipientUserId, recipientGeneration: generation },
    payload: frozenPayload,
    idempotencyKey: idempotencyKey!,
    attemptNumber: attemptCount,
  };
}

async function finalizeAccepted(job: ClaimedJob, now: Date) {
  await finishTerminal(job, "accepted", now);
}

async function finalizeFailure(prepared: PreparedEmail, error: unknown, now: Date) {
  const { failure, providerStatus } = getNameChangeEmailFailure(error);
  if (failure === "missing_configuration") {
    await finishWaiting(prepared.job, "waiting_for_configuration", now);
    return;
  }
  const retryable = failure === "network_failure" || failure === "rate_limited"
    || failure === "transient_provider_failure" || failure === "concurrent_idempotent_request";
  if (!retryable) {
    await finishTerminal(prepared.job, "needs_attention", now, failure, providerStatus);
    return;
  }
  if (prepared.attemptNumber >= MAX_ATTEMPTS) {
    await finishTerminal(prepared.job, "needs_attention", now, "attempts_exhausted", providerStatus);
    return;
  }
  const retryDelay = RETRY_AFTER_MS[prepared.attemptNumber - 1];
  await db.update(nameChangeEmailOutboxTable).set({
    status: "queued",
    nextAttemptAt: new Date(now.getTime() + retryDelay),
    failureCode: failure,
    providerStatus: providerStatus ?? null,
    leaseToken: null,
    leaseUntil: null,
    updatedAt: now,
  }).where(leaseFilter(prepared.job));
}

async function deliverJob(job: ClaimedJob, now: Clock, send: EmailSender) {
  const prepared = await prepareEmail(job, now());
  if (!prepared) return;
  try {
    await send(prepared.payload, prepared.idempotencyKey);
  } catch (error) {
    const current = now();
    const failure = getNameChangeEmailFailure(error);
    await finalizeFailure(prepared, error, current);
    const retryable = ["network_failure", "rate_limited", "transient_provider_failure", "concurrent_idempotent_request"]
      .includes(failure.failure);
    if (!retryable || prepared.attemptNumber >= MAX_ATTEMPTS) {
      logger.error({
        outboxId: prepared.job.id,
        notificationId: prepared.job.notificationId,
        failure: failure.failure,
        ...(failure.providerStatus ? { status: failure.providerStatus } : {}),
      }, "Name-change email needs attention");
    } else {
      logger.warn({
        outboxId: prepared.job.id,
        notificationId: prepared.job.notificationId,
        failure: failure.failure,
        ...(failure.providerStatus ? { status: failure.providerStatus } : {}),
      }, "Name-change email attempt will be retried");
    }
    return;
  }

  try {
    await finalizeAccepted(prepared.job, now());
  } catch {
    // The provider may already have accepted this exact payload. Keep the lease to expire,
    // then retry the same frozen body and idempotency key after recovery.
    logger.error({
      outboxId: prepared.job.id,
      notificationId: prepared.job.notificationId,
      status: 500,
    }, "Name-change email acceptance could not be recorded");
  }
}

export async function runNameChangeEmailBatch(options: {
  now?: Clock;
  send?: EmailSender;
  maxJobs?: number;
} = {}): Promise<number> {
  const now = options.now ?? (() => new Date());
  const send = options.send ?? sendFrozenNameChangeEmail;
  const maxJobs = Math.max(1, Math.min(10, Math.floor(options.maxJobs ?? 10)));
  let processed = 0;
  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextJob(now());
    if (!job) break;
    processed += 1;
    await deliverJob(job, now, send);
  }
  return processed;
}

export function startNameChangeEmailDispatcher(intervalMs = 30_000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentTick: Promise<void> | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => { void tick(); }, intervalMs);
  };
  const tick = async () => {
    if (stopped || currentTick) return;
    currentTick = runNameChangeEmailBatch({ maxJobs: 1 }).then(() => undefined).catch(() => {
      logger.error({ status: 500 }, "Name-change email dispatcher tick failed");
    }).finally(() => {
      currentTick = undefined;
      schedule();
    });
    await currentTick;
  };

  void tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await currentTick;
  };
}
