import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users.js";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  batch: text("batch").notNull(),
  registrationNumber: text("registration_number").notNull().unique(),
  dateOfJoining: text("date_of_joining").notNull(),
  kuhsId: text("kuhs_id").notNull().unique(),
  specialty: text("specialty").notNull(),
  mentorId: integer("mentor_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStudentSchema = createInsertSchema(studentsTable);
export type InsertStudent = typeof studentsTable.$inferInsert;
export type Student = typeof studentsTable.$inferSelect;
