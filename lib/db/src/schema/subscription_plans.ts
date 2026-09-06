import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { departmentsTable } from "./users.js";

// departmentId NULL means the plan applies to every department. Nothing may branch on a
// specific departmentId value (AGENTS.md section 5) - a NULL row is the "applies to all" case.
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  durationMonths: integer("duration_months").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable);
export type InsertSubscriptionPlan = typeof subscriptionPlansTable.$inferInsert;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
