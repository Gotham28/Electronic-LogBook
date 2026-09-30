import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { createInsertSchema } from "drizzle-zod";

export const maintenanceAnnouncementsTable = pgTable("maintenance_announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  expectedImpact: text("expected_impact"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  audienceRoles: jsonb("audience_roles").$type<string[]>().notNull().default(["student", "professor", "hod"]),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  reminder24hSent: boolean("reminder_24h_sent").notNull().default(false),
  reminder1hSent: boolean("reminder_1h_sent").notNull().default(false),
});

export const insertAnnouncementSchema = createInsertSchema(maintenanceAnnouncementsTable);
export type InsertAnnouncement = typeof maintenanceAnnouncementsTable.$inferInsert;
export type Announcement = typeof maintenanceAnnouncementsTable.$inferSelect;
