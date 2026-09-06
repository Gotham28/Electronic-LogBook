import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { departmentsTable } from "./users.js";

export const departmentConfigsTable = pgTable("department_configs", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().unique().references(() => departmentsTable.id),
  requiredCases: integer("required_cases").default(0),
  requiredProcedures: integer("required_procedures").default(0),
  requiredAcademic: integer("required_academic").default(0),
  programDurationMonths: integer("program_duration_months"),
  casualLeaveAllowance: integer("casual_leave_allowance"),
  academicLeaveAllowance: integer("academic_leave_allowance"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepartmentConfigSchema = createInsertSchema(departmentConfigsTable);
export type InsertDepartmentConfig = typeof departmentConfigsTable.$inferInsert;
export type DepartmentConfig = typeof departmentConfigsTable.$inferSelect;
