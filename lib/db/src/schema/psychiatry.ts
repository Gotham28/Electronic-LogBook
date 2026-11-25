import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { studentsTable } from "./students.js";
import { departmentsTable, usersTable } from "./users.js";

export type StoredPsychiatryDiagnosis = { code: string; title: string; uri: string };
export type StoredPsychiatryDiagnosisRow = { diagnosis: StoredPsychiatryDiagnosis; medical: string; count: number; visit?: string; tags?: string[]; department?: string; icu?: string };

export const psychiatryEntriesTable = pgTable("psychiatry_entries", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  section: text("section").notNull(),
  month: text("month"),
  reviewerId: integer("reviewer_id").references(() => usersTable.id),
  status: text("status", { enum: ["draft", "pending", "verified", "rejected", "recorded"] }).notNull(),
  values: jsonb("values").$type<Record<string, string | string[] | StoredPsychiatryDiagnosis>>().notNull(),
  diagnosisRows: jsonb("diagnosis_rows").$type<StoredPsychiatryDiagnosisRow[]>().notNull().default([]),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revision: integer("revision").notNull().default(1),
}, (table) => [
  check("psychiatry_entries_status_check", sql`${table.status} IN ('draft', 'pending', 'verified', 'rejected', 'recorded')`),
  uniqueIndex("psychiatry_entries_student_section_month_idx").on(table.studentId, table.section, table.month).where(sql`${table.month} IS NOT NULL`),
  index("psychiatry_entries_department_status_idx").on(table.departmentId, table.status, table.reviewerId),
  index("psychiatry_entries_student_idx").on(table.studentId, table.id),
]);

export const psychiatryAttendeesTable = pgTable("psychiatry_attendees", {
  entryId: integer("entry_id").notNull().references(() => psychiatryEntriesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.entryId, table.userId] }), index("psychiatry_attendees_user_idx").on(table.userId, table.entryId)]);
