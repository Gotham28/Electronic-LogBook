import { pgTable, serial, text, integer, timestamp, unique, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users.js";
import { subscriptionPlansTable } from "./subscription_plans.js";

// userId is always usersTable.id - never studentsTable.id (AGENTS.md section 4). No column
// here may ever hold patient data or a leave reason.
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  planId: integer("plan_id").notNull().references(() => subscriptionPlansTable.id),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  razorpayPaymentId: text("razorpay_payment_id"),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["created", "paid", "failed", "refunded"] }).notNull().default("created"),
  refundStatus: text("refund_status"),
  refundedAt: timestamp("refunded_at"),
  refundNote: text("refund_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("payments_razorpay_order_id_unique").on(t.razorpayOrderId),
  uniqueIndex("payments_one_paid_per_user").on(t.userId).where(sql`${t.status} = 'paid'`),
  check("payments_status_check", sql`${t.status} IN ('created', 'paid', 'failed', 'refunded')`),
]);

export const insertPaymentSchema = createInsertSchema(paymentsTable);
export type InsertPayment = typeof paymentsTable.$inferInsert;
export type Payment = typeof paymentsTable.$inferSelect;
