import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { departmentsTable, usersTable } from "./users.js";

export const assistantUsageEventsTable = pgTable("assistant_usage_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  role: text("role").notNull(),
  departmentId: integer("department_id").references(() => departmentsTable.id, { onDelete: "set null" }),
  feature: text("feature").notNull(),
  eventType: text("event_type").notNull(),
  httpStatus: integer("http_status"),
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("assistant_usage_events_created_idx").on(table.createdAt),
  index("assistant_usage_events_department_created_idx").on(table.departmentId, table.createdAt),
]);
