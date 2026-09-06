import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";
import { departmentsTable } from "./users.js";

// Department-owned training options. There are no specialty-specific lists in the app.
export const departmentCatalogTable = pgTable("department_catalog", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  kind: text("kind", { enum: ["posting", "academic"] }).notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  required: integer("required").notNull().default(0),
  period: text("period", { enum: ["total", "month"] }).notNull().default("total"),
}, (t) => [unique("department_catalog_value_unique").on(t.departmentId, t.kind, t.value)]);
