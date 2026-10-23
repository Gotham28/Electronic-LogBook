import { pgTable, serial, integer, text, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { departmentsTable } from "./users.js";

export const departmentLogbookSectionsTable = pgTable("department_logbook_sections", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("department_logbook_sections_department_id_value_key").on(t.departmentId, t.value)]);
