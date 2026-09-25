import { pgTable, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { departmentsTable } from "./users.js";

export const departmentConfigsTable = pgTable("department_configs", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().unique().references(() => departmentsTable.id),
  requiredCases: integer("required_cases"),
  requiredProcedures: integer("required_procedures"),
  requiredAcademic: integer("required_academic"),
  enabledFeatures: jsonb("enabled_features").$type<Record<string, boolean>>().notNull().default({ procedureExperience: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepartmentConfigSchema = createInsertSchema(departmentConfigsTable);
export type InsertDepartmentConfig = typeof departmentConfigsTable.$inferInsert;
export type DepartmentConfig = typeof departmentConfigsTable.$inferSelect;
