import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { departmentsTable, usersTable } from "./users.js";

// One row per department and label key. No row means the registry default (lib/api-zod/src/department-labels.ts).
export const departmentLabelOverridesTable = pgTable("department_label_overrides", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  revision: integer("revision").notNull().default(1),
  // A usersTable.id (AGENTS.md §4), never a students.id.
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("department_label_overrides_department_id_key_key").on(t.departmentId, t.key)]);

export type DepartmentLabelOverride = typeof departmentLabelOverridesTable.$inferSelect;
