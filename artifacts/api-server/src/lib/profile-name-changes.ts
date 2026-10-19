import { and, eq, sql } from "drizzle-orm";
import {
  db, auditTable, departmentsTable, departmentNameChangeNotificationsTable, nameChangeEmailOutboxTable,
  studentsTable, usersTable,
} from "@workspace/db";

export const PROFILE_NAME_CHANGE_EVENT = "profile_name_change";
export type ProfileNameChangeSource = "self_service" | "admin_roster";

export class ProfileNameChangeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ProfileNameChangeError";
  }
}

export async function changeUserName(input: {
  subjectUserId: number;
  actorUserId: number;
  source: ProfileNameChangeSource;
  fullName: string;
  expectedFullName?: string;
  departmentId?: number;
}) {
  return db.transaction(async (tx) => {
    const [subject] = await tx.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      status: usersTable.status,
      departmentId: usersTable.departmentId,
    }).from(usersTable).where(eq(usersTable.id, input.subjectUserId)).for("update").limit(1);

    if (!subject) return { changed: false as const, missing: true as const };

    const [actor] = await tx.select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
    }).from(usersTable).where(eq(usersTable.id, input.actorUserId)).limit(1);
    if (!actor || actor.status !== "approved") {
      throw new ProfileNameChangeError("Account is no longer active", 401, "ACCOUNT_UNAVAILABLE");
    }

    if (input.source === "self_service") {
      if (subject.id !== actor.id) {
        throw new ProfileNameChangeError("You may only update your own profile", 403, "PROFILE_OWNER_REQUIRED");
      }
      if (subject.status !== "approved") {
        throw new ProfileNameChangeError("Account is no longer active", 401, "ACCOUNT_UNAVAILABLE");
      }
    } else {
      if (actor.role !== "admin") {
        throw new ProfileNameChangeError("Forbidden", 403, "FORBIDDEN");
      }
      if (!input.departmentId || subject.departmentId !== input.departmentId
        || !["hod", "professor", "student"].includes(subject.role)) {
        return { changed: false as const, missing: true as const };
      }
    }

    if (subject.fullName === input.fullName) {
      return { changed: false as const, missing: false as const, fullName: subject.fullName };
    }

    if (input.source === "self_service" && subject.fullName !== input.expectedFullName) {
      throw new ProfileNameChangeError("This name changed after you opened the profile. Reload it and try again.", 409, "PROFILE_NAME_CONFLICT");
    }

    let student: { id: number; registrationNumber: string | null; kuhsId: string; isTest: boolean } | undefined;
    if (input.source === "self_service" && subject.role === "student") {
      const [row] = await tx.select({
        id: studentsTable.id,
        registrationNumber: studentsTable.registrationNumber,
        kuhsId: studentsTable.kuhsId,
        isTest: departmentsTable.isTest,
      }).from(studentsTable)
        .innerJoin(departmentsTable, eq(departmentsTable.id, subject.departmentId!))
        .where(eq(studentsTable.userId, subject.id)).limit(1);
      if (!row) {
        throw new ProfileNameChangeError("Your student profile could not be loaded. No changes were saved.", 409, "PROFILE_INCOMPLETE");
      }
      student = row;
    }

    const [updated] = await tx.update(usersTable).set({ fullName: input.fullName })
      .where(eq(usersTable.id, subject.id))
      .returning({ id: usersTable.id, fullName: usersTable.fullName });

    const [event] = await tx.insert(auditTable).values({
      tableName: "users",
      recordId: String(subject.id),
      action: "UPDATE",
      performedById: actor.id,
      beforeState: { fullName: subject.fullName },
      afterState: {
        fullName: updated.fullName,
        eventType: PROFILE_NAME_CHANGE_EVENT,
        source: input.source,
        actorRoleAtChange: actor.role,
      },
    }).returning({ id: auditTable.id, timestamp: auditTable.timestamp });

    let notification: { id: string; inAppSaved: true; emailStatus: string } | null = null;
    if (input.source === "self_service" && student) {
      const [notice] = await tx.insert(departmentNameChangeNotificationsTable).values({
        auditId: event.id,
        departmentId: subject.departmentId!,
        subjectUserId: subject.id,
        studentId: student.id,
      }).returning({ id: departmentNameChangeNotificationsTable.id });

      const [outbox] = await tx.insert(nameChangeEmailOutboxTable).values({
        notificationId: notice.id,
        status: student.isTest ? "suppressed_test" : "queued",
        nextAttemptAt: event.timestamp,
      }).returning({ status: nameChangeEmailOutboxTable.status });
      notification = { id: notice.id, inAppSaved: true, emailStatus: outbox.status };
    }

    return {
      changed: true as const,
      missing: false as const,
      fullName: updated.fullName,
      previousName: subject.fullName,
      auditId: event.id,
      changedAt: event.timestamp,
      notification,
      studentProfileId: student?.id ?? null,
    };
  });
}

export function profileNameChangeAuditFilter(userId: number) {
  return and(
    eq(auditTable.tableName, "users"),
    eq(auditTable.recordId, String(userId)),
    eq(auditTable.action, "UPDATE"),
    sql`${auditTable.afterState}->>'eventType' = ${PROFILE_NAME_CHANGE_EVENT}`,
  );
}
