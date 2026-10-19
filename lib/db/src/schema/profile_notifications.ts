import { pgTable, uuid, integer, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditTable } from "./audit.js";
import { departmentsTable, usersTable } from "./users.js";
import { studentsTable } from "./students.js";

export const departmentNameChangeNotificationsTable = pgTable("department_name_change_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id").notNull().unique().references(() => auditTable.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id, { onDelete: "cascade" }),
  subjectUserId: integer("subject_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
  readByUserId: integer("read_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
}, (table) => [
  index("department_name_change_notifications_department_created_idx")
    .on(table.departmentId, table.createdAt.desc(), table.id.desc()),
  index("department_name_change_notifications_department_unread_idx")
    .on(table.departmentId, table.createdAt.desc(), table.id.desc())
    .where(sql`${table.readAt} IS NULL`),
  check("department_name_change_notifications_reader_consistency",
    sql`(${table.readAt} IS NULL AND ${table.readByUserId} IS NULL) OR ${table.readAt} IS NOT NULL`),
]);

export const nameChangeEmailOutboxTable = pgTable("name_change_email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").notNull().unique()
    .references(() => departmentNameChangeNotificationsTable.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "processing", "waiting_for_hod", "waiting_for_subject", "waiting_for_configuration",
      "accepted", "needs_attention", "cancelled", "suppressed_test"],
  }).notNull().default("queued"),
  recipientUserId: integer("recipient_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  recipientGeneration: integer("recipient_generation").notNull().default(0),
  idempotencyKey: text("idempotency_key"),
  frozenPayload: text("frozen_payload"),
  attemptCount: integer("attempt_count").notNull().default(0),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  failureCode: text("failure_code"),
  providerStatus: integer("provider_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("name_change_email_outbox_due_idx")
    .on(table.status, table.nextAttemptAt, table.leaseUntil),
  check("name_change_email_outbox_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  check("name_change_email_outbox_generation_nonnegative", sql`${table.recipientGeneration} >= 0`),
]);

export type DepartmentNameChangeNotification = typeof departmentNameChangeNotificationsTable.$inferSelect;
export type NameChangeEmailOutbox = typeof nameChangeEmailOutboxTable.$inferSelect;
