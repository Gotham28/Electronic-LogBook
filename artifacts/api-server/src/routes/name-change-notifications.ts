import { Router } from "express";
import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  auditTable, db, departmentNameChangeNotificationsTable, departmentsTable,
  nameChangeEmailOutboxTable, studentsTable, usersTable,
} from "@workspace/db";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { validate } from "../lib/validation.js";
import { PROFILE_NAME_CHANGE_EVENT } from "../lib/profile-name-changes.js";

const router = Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyBody = z.object({}).strict();
const readParams = z.object({ notificationId: z.string().regex(UUID_PATTERN) });
const readBody = validate(emptyBody);
function validateReadParams(req: Request, res: Response, next: NextFunction) {
  const parsed = readParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ code: "INVALID_NOTIFICATION_ID", message: "Invalid notification ID" });
    return;
  }
  next();
}

function pageLimit(value: unknown): number | null {
  if (value === undefined) return 20;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

function notificationIdFrom(req: Request): string {
  const value = req.params.notificationId;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readCursor(value: unknown): { timestamp: string; id: string } | null | false {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return false;
    const parsed = JSON.parse(decoded.toString("utf8"));
    if (!parsed || typeof parsed.timestamp !== "string" || typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return false;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(parsed.timestamp)) return false;
    const timestamp = new Date(parsed.timestamp);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== parsed.timestamp.slice(0, 23) + "Z") return false;
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    return false;
  }
}

function makeCursor(timestamp: string, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString("base64url");
}

function scopedNoticeWhere(departmentId: number, unreadOnly: boolean, cursor: { timestamp: string; id: string } | null) {
  const cursorFilter = cursor
    ? or(
      sql`${departmentNameChangeNotificationsTable.createdAt} < ${cursor.timestamp}::timestamptz`,
      and(
        sql`${departmentNameChangeNotificationsTable.createdAt} = ${cursor.timestamp}::timestamptz`,
        lt(departmentNameChangeNotificationsTable.id, cursor.id),
      ),
    )
    : undefined;
  return and(
    eq(departmentNameChangeNotificationsTable.departmentId, departmentId),
    eq(usersTable.departmentId, departmentId),
    eq(auditTable.tableName, "users"),
    eq(auditTable.recordId, sql`CAST(${departmentNameChangeNotificationsTable.subjectUserId} AS text)`),
    sql`${auditTable.afterState}->>'eventType' = ${PROFILE_NAME_CHANGE_EVENT}`,
    sql`${auditTable.afterState}->>'source' = 'self_service'`,
    ...(unreadOnly ? [isNull(departmentNameChangeNotificationsTable.readAt)] : []),
    ...(cursorFilter ? [cursorFilter] : []),
  );
}

async function readScopedNotice(id: string, departmentId: number) {
  const [row] = await db.select({
    id: departmentNameChangeNotificationsTable.id,
    departmentId: departmentNameChangeNotificationsTable.departmentId,
    subjectDepartmentId: usersTable.departmentId,
    subjectUserId: departmentNameChangeNotificationsTable.subjectUserId,
    studentId: departmentNameChangeNotificationsTable.studentId,
    fullName: usersTable.fullName,
    registrationNumber: studentsTable.registrationNumber,
    kuhsId: studentsTable.kuhsId,
    departmentName: departmentsTable.name,
    eventId: auditTable.id,
    beforeState: auditTable.beforeState,
    afterState: auditTable.afterState,
    changedAt: auditTable.timestamp,
    createdAt: departmentNameChangeNotificationsTable.createdAt,
    readAt: departmentNameChangeNotificationsTable.readAt,
    readByUserId: departmentNameChangeNotificationsTable.readByUserId,
    emailStatus: nameChangeEmailOutboxTable.status,
  }).from(departmentNameChangeNotificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, departmentNameChangeNotificationsTable.subjectUserId))
    .innerJoin(studentsTable, and(
      eq(studentsTable.id, departmentNameChangeNotificationsTable.studentId),
      eq(studentsTable.userId, departmentNameChangeNotificationsTable.subjectUserId),
    ))
    .innerJoin(departmentsTable, eq(departmentsTable.id, departmentNameChangeNotificationsTable.departmentId))
    .innerJoin(auditTable, eq(auditTable.id, departmentNameChangeNotificationsTable.auditId))
    .leftJoin(nameChangeEmailOutboxTable, eq(nameChangeEmailOutboxTable.notificationId, departmentNameChangeNotificationsTable.id))
    .where(and(
      eq(departmentNameChangeNotificationsTable.id, id),
      eq(auditTable.tableName, "users"),
      eq(auditTable.recordId, sql`CAST(${departmentNameChangeNotificationsTable.subjectUserId} AS text)`),
      sql`${auditTable.afterState}->>'eventType' = ${PROFILE_NAME_CHANGE_EVENT}`,
      sql`${auditTable.afterState}->>'source' = 'self_service'`,
    )).limit(1);

  if (!row) return { kind: "missing" as const };
  if (row.departmentId !== departmentId || row.subjectDepartmentId !== departmentId) {
    return { kind: "forbidden" as const };
  }

  const before = row.beforeState as { fullName?: unknown } | null;
  const after = row.afterState as { fullName?: unknown } | null;
  return {
    kind: "found" as const,
    item: {
      id: row.id,
      previousName: typeof before?.fullName === "string" ? before.fullName : "",
      newName: typeof after?.fullName === "string" ? after.fullName : "",
      createdAt: row.createdAt.toISOString(),
      changedAt: row.changedAt.toISOString(),
      subjectUserId: row.subjectUserId,
      studentProfileId: row.studentId,
      currentStudentName: row.fullName,
      registrationNumber: row.registrationNumber,
      kuhsId: row.kuhsId,
      departmentName: row.departmentName,
      detailHref: "/notifications/name-changes/" + row.id,
      readAt: row.readAt?.toISOString() ?? null,
      readByUserId: row.readByUserId,
      emailStatus: row.emailStatus,
      source: "self_service" as const,
    },
  };
}

async function countScopedUnread(departmentId: number): Promise<number> {
  const [result] = await db.select({ value: count() }).from(departmentNameChangeNotificationsTable)
    .innerJoin(usersTable, eq(usersTable.id, departmentNameChangeNotificationsTable.subjectUserId))
    .innerJoin(studentsTable, and(
      eq(studentsTable.id, departmentNameChangeNotificationsTable.studentId),
      eq(studentsTable.userId, departmentNameChangeNotificationsTable.subjectUserId),
    ))
    .innerJoin(auditTable, eq(auditTable.id, departmentNameChangeNotificationsTable.auditId))
    .where(scopedNoticeWhere(departmentId, true, null));
  return Number(result?.value ?? 0);
}

router.use(requireAuth, requireRole(["hod"]), requireDepartment);

router.get("/", async (req, res) => {
  const limit = pageLimit(req.query.limit);
  const cursor = readCursor(req.query.cursor);
  const unreadQuery = req.query.unreadOnly;
  if (!limit || cursor === false || (unreadQuery !== undefined && unreadQuery !== "true" && unreadQuery !== "false")) {
    res.status(400).json({ code: "INVALID_PAGE", message: "Invalid notification page" });
    return;
  }

  const departmentId = req.user!.departmentId!;
  const unreadOnly = unreadQuery === "true";
  const [rows, unreadCount] = await Promise.all([
    db.select({
      id: departmentNameChangeNotificationsTable.id,
      previousState: auditTable.beforeState,
      nextState: auditTable.afterState,
      createdAt: departmentNameChangeNotificationsTable.createdAt,
      readAt: departmentNameChangeNotificationsTable.readAt,
      currentStudentName: usersTable.fullName,
      subjectUserId: departmentNameChangeNotificationsTable.subjectUserId,
      studentId: departmentNameChangeNotificationsTable.studentId,
      registrationNumber: studentsTable.registrationNumber,
      kuhsId: studentsTable.kuhsId,
      departmentName: departmentsTable.name,
      emailStatus: nameChangeEmailOutboxTable.status,
      cursorTimestamp: sql<string>`to_char(${departmentNameChangeNotificationsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(departmentNameChangeNotificationsTable)
      .innerJoin(usersTable, eq(usersTable.id, departmentNameChangeNotificationsTable.subjectUserId))
      .innerJoin(studentsTable, and(
        eq(studentsTable.id, departmentNameChangeNotificationsTable.studentId),
        eq(studentsTable.userId, departmentNameChangeNotificationsTable.subjectUserId),
      ))
      .innerJoin(departmentsTable, eq(departmentsTable.id, departmentNameChangeNotificationsTable.departmentId))
      .innerJoin(auditTable, eq(auditTable.id, departmentNameChangeNotificationsTable.auditId))
      .leftJoin(nameChangeEmailOutboxTable, eq(nameChangeEmailOutboxTable.notificationId, departmentNameChangeNotificationsTable.id))
      .where(scopedNoticeWhere(departmentId, unreadOnly, cursor))
      .orderBy(desc(departmentNameChangeNotificationsTable.createdAt), desc(departmentNameChangeNotificationsTable.id))
      .limit(limit + 1),
    countScopedUnread(departmentId),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map((row) => {
    const before = row.previousState as { fullName?: unknown } | null;
    const after = row.nextState as { fullName?: unknown } | null;
    return {
      id: row.id,
      previousName: typeof before?.fullName === "string" ? before.fullName : "",
      newName: typeof after?.fullName === "string" ? after.fullName : "",
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      subjectUserId: row.subjectUserId,
      studentProfileId: row.studentId,
      currentStudentName: row.currentStudentName,
      registrationNumber: row.registrationNumber,
      kuhsId: row.kuhsId,
      departmentName: row.departmentName,
      detailHref: "/notifications/name-changes/" + row.id,
      emailStatus: row.emailStatus,
    };
  });

  res.json({
    items,
    unreadCount,
    hasMore,
    nextCursor: hasMore && page.length ? makeCursor(page[page.length - 1].cursorTimestamp, page[page.length - 1].id) : null,
  });
});

router.get("/:notificationId", validateReadParams, async (req, res) => {
  const result = await readScopedNotice(notificationIdFrom(req), req.user!.departmentId!);
  if (result.kind === "missing") {
    res.status(404).json({ code: "NOTICE_NOT_FOUND", message: "Name-change notice not found" });
    return;
  }
  if (result.kind === "forbidden") {
    res.status(403).json({ code: "NOTICE_FORBIDDEN", message: "This notice is outside your department" });
    return;
  }
  res.json(result.item);
});

router.post("/:notificationId/read", validateReadParams, readBody, async (req, res) => {
  const result = await readScopedNotice(notificationIdFrom(req), req.user!.departmentId!);
  if (result.kind === "missing") {
    res.status(404).json({ code: "NOTICE_NOT_FOUND", message: "Name-change notice not found" });
    return;
  }
  if (result.kind === "forbidden") {
    res.status(403).json({ code: "NOTICE_FORBIDDEN", message: "This notice is outside your department" });
    return;
  }

  if (!result.item.readAt) {
    const [acknowledged] = await db.update(departmentNameChangeNotificationsTable).set({
      readAt: new Date(),
      readByUserId: req.user!.id,
    }).where(and(
      eq(departmentNameChangeNotificationsTable.id, result.item.id),
      isNull(departmentNameChangeNotificationsTable.readAt),
    )).returning({
      readAt: departmentNameChangeNotificationsTable.readAt,
      readByUserId: departmentNameChangeNotificationsTable.readByUserId,
    });
    if (acknowledged) {
      result.item.readAt = acknowledged.readAt?.toISOString() ?? null;
      result.item.readByUserId = acknowledged.readByUserId;
    } else {
      const [current] = await db.select({
        readAt: departmentNameChangeNotificationsTable.readAt,
        readByUserId: departmentNameChangeNotificationsTable.readByUserId,
      }).from(departmentNameChangeNotificationsTable)
        .where(eq(departmentNameChangeNotificationsTable.id, result.item.id)).limit(1);
      result.item.readAt = current?.readAt?.toISOString() ?? null;
      result.item.readByUserId = current?.readByUserId ?? null;
    }
  }
  res.json({
    id: result.item.id,
    readAt: result.item.readAt,
    readByUserId: result.item.readByUserId,
    unreadCount: await countScopedUnread(req.user!.departmentId!),
  });
});

export default router;
