import { pgTable, serial, text, integer, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable);
export type InsertDepartment = typeof departmentsTable.$inferInsert;
export type Department = typeof departmentsTable.$inferSelect;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["student", "professor", "hod", "dean", "admin"] }).notNull().default("student"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  avatarUrl: text("avatar_url"),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_one_approved_hod_per_department").on(table.departmentId)
    .where(sql`${table.role} = 'hod' AND ${table.status} = 'approved'`),
  check("users_department_required", sql`${table.role} NOT IN ('student', 'professor', 'hod') OR ${table.departmentId} IS NOT NULL`),
]);

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
