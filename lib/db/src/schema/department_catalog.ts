import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";
import { departmentsTable } from "./users.js";

// Department-owned training options. There are no specialty-specific lists in the app.
export const departmentCatalogTable = pgTable("department_catalog", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  kind: text("kind", { enum: ["posting", "academic", "case_category", "competency_level", "leave_type", "conference_level", "clinical_work_category", "clinical_work_subtype", "organ_system_option"] as const }).notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  required: integer("required").notNull().default(0),
  period: text("period", { enum: ["total", "month"] }).notNull().default("total"),
  parentValue: text("parent_value"),
}, (t) => [unique("department_catalog_value_unique").on(t.departmentId, t.kind, t.value)]);
