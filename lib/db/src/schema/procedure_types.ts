import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { departmentsTable } from "./users.js";

export const procedureTypesTable = pgTable("procedure_types", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  name: text("name").notNull(),
  group: text("group").notNull(),
  required: integer("required").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProcedureTypeSchema = createInsertSchema(procedureTypesTable);
export type InsertProcedureType = typeof procedureTypesTable.$inferInsert;
export type ProcedureType = typeof procedureTypesTable.$inferSelect;
