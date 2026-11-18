import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { createInsertSchema } from "drizzle-zod";

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  referenceCode: text("reference_code").notNull().unique(),
  name: text("name"),
  email: text("email"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"),
  adminNotes: text("admin_notes"),
  emailStatus: text("email_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable);
export type InsertSupportTicket = typeof supportTicketsTable.$inferInsert;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
