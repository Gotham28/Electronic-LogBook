import { sql } from "drizzle-orm";
import { check, date, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { departmentsTable } from "./users.js";

export const assistantDepartmentWeeklyDigestsTable = pgTable("assistant_department_weekly_digests", {
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  summary: text("summary"),
}, (table) => [
  primaryKey({ name: "assistant_department_weekly_digests_pkey", columns: [table.departmentId, table.weekStart] }),
  check("assistant_department_weekly_digests_status_check", sql`${table.status} IN ('pending', 'ready', 'failed')`),
  check("assistant_department_weekly_digests_result_check", sql`
    (${table.status} = 'ready' AND ${table.summary} IS NOT NULL AND ${table.generatedAt} IS NOT NULL)
    OR (${table.status} <> 'ready' AND ${table.summary} IS NULL AND ${table.generatedAt} IS NULL)
  `),
]);
