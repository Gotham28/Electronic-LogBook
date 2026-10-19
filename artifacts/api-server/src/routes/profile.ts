import { Router } from "express";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  auditTable, db, departmentsTable, departmentNameChangeNotificationsTable,
  nameChangeEmailOutboxTable, studentsTable, usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { validate, profileNameSchema } from "../lib/validation.js";
import {
  changeUserName, ProfileNameChangeError, profileNameChangeAuditFilter,
} from "../lib/profile-name-changes.js";
import { sessionProfile } from "./auth.js";

const router = Router();
const profileUpdateBody = z.object({
  fullName: profileNameSchema,
  expectedFullName: z.string().min(1).max(128_000),
}).strict();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pageLimit(value: unknown): number | null {
  if (value === undefined) return 20;
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
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
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?$/.test(parsed.timestamp)) return false;
    const timestamp = new Date(parsed.timestamp.slice(0, 23) + "Z");
    if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== parsed.timestamp.slice(0, 23) + "Z") return false;
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    return false;
  }
}

function makeCursor(timestamp: string, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id })).toString("base64url");
}

export async function readOwnProfile(userId: number, impersonated = false) {
  const [row] = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    email: usersTable.email,
    role: usersTable.role,
    departmentId: usersTable.departmentId,
    departmentName: departmentsTable.name,
    studentId: studentsTable.id,
    registrationNumber: studentsTable.registrationNumber,
    kuhsId: studentsTable.kuhsId,
    batch: studentsTable.batch,
    dateOfJoining: studentsTable.dateOfJoining,
  }).from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .leftJoin(studentsTable, eq(studentsTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId)).limit(1);

  if (!row) return null;
  if (row.role === "student" && row.studentId === null) {
    throw new ProfileNameChangeError("Your student profile could not be loaded.", 409, "PROFILE_INCOMPLETE");
  }
  return {
    user: {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
    },
    student: row.role === "student" ? {
      id: row.studentId,
      registrationNumber: row.registrationNumber,
      kuhsId: row.kuhsId,
      batch: row.batch,
      dateOfJoining: row.dateOfJoining,
    } : null,
    capabilities: {
      canEditName: !impersonated,
      readOnlyReason: impersonated ? "impersonation" : null,
    },
  };
}

router.get("/", requireAuth, async (req, res) => {
  const profile = await readOwnProfile(req.user!.id, !!req.tokenClaims?.impersonatedBy);
  if (!profile) {
    res.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Profile not found" });
    return;
  }
  res.json(profile);
});

router.patch("/", requireAuth, validate(profileUpdateBody), async (req, res) => {
  try {
    if (req.tokenClaims?.impersonatedBy) {
      res.status(403).json({ code: "PROFILE_READ_ONLY", message: "This profile is read-only while impersonating an account" });
      return;
    }

    const result = await changeUserName({
      subjectUserId: req.user!.id,
      actorUserId: req.user!.id,
      source: "self_service",
      fullName: req.body.fullName,
      expectedFullName: req.body.expectedFullName,
    });
    if (result.missing) {
      res.status(401).json({ code: "ACCOUNT_UNAVAILABLE", message: "Account is no longer active" });
      return;
    }

    const profile = await readOwnProfile(req.user!.id);
    const session = await sessionProfile(req.user!.id);
    if (!profile || !session) {
      res.status(401).json({ code: "ACCOUNT_UNAVAILABLE", message: "Account is no longer active" });
      return;
    }

    res.json({
      changed: result.changed,
      profile,
      session,
      change: result.changed ? {
        id: result.auditId,
        previousName: result.previousName,
        newName: result.fullName,
        changedAt: result.changedAt,
      } : null,
      notification: result.changed ? result.notification : null,
    });
  } catch (error) {
    if (error instanceof ProfileNameChangeError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

router.get("/name-history", requireAuth, async (req, res) => {
  const limit = pageLimit(req.query.limit);
  const cursor = readCursor(req.query.cursor);
  if (!limit || cursor === false) {
    res.status(400).json({ code: "INVALID_PAGE", message: "Invalid history page" });
    return;
  }

  const filter = profileNameChangeAuditFilter(req.user!.id);
  const cursorFilter = cursor
    ? or(sql`${auditTable.timestamp} < ${cursor.timestamp}::timestamp`, and(
      sql`${auditTable.timestamp} = ${cursor.timestamp}::timestamp`,
      lt(auditTable.id, cursor.id),
    ))
    : undefined;

  const rows = await db.select({
    id: auditTable.id,
    beforeState: auditTable.beforeState,
    afterState: auditTable.afterState,
    changedAt: auditTable.timestamp,
    notificationId: departmentNameChangeNotificationsTable.id,
    emailStatus: nameChangeEmailOutboxTable.status,
    cursorTimestamp: sql<string>`to_char(${auditTable.timestamp}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
  }).from(auditTable)
    .leftJoin(departmentNameChangeNotificationsTable, eq(departmentNameChangeNotificationsTable.auditId, auditTable.id))
    .leftJoin(nameChangeEmailOutboxTable, eq(nameChangeEmailOutboxTable.notificationId, departmentNameChangeNotificationsTable.id))
    .where(and(filter, cursorFilter))
    .orderBy(desc(auditTable.timestamp), desc(auditTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map((row) => {
    const before = row.beforeState as { fullName?: unknown } | null;
    const after = row.afterState as { fullName?: unknown; source?: unknown } | null;
    return {
      id: row.id,
      previousName: typeof before?.fullName === "string" ? before.fullName : "",
      newName: typeof after?.fullName === "string" ? after.fullName : "",
      changedAt: row.changedAt.toISOString(),
      source: after?.source === "admin_roster" ? "admin_roster" as const : "self_service" as const,
      notificationId: row.notificationId,
      emailStatus: row.emailStatus,
    };
  });

  res.json({
    items,
    hasMore,
    nextCursor: hasMore && page.length ? makeCursor(page[page.length - 1].cursorTimestamp, page[page.length - 1].id) : null,
  });
});

export default router;
