import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";
import { departmentsTable } from "./users.js";

// Read-only reference plan: which posting a resident is expected to do in each training year, and for how long.
export const departmentPostingScheduleTable = pgTable("department_posting_schedule", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  trainingYear: integer("training_year").notNull(),
  postingValue: text("posting_value").notNull(),
  months: integer("months").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [unique("department_posting_schedule_unique").on(t.departmentId, t.trainingYear, t.postingValue)]);
