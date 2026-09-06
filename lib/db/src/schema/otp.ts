import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const registrationOtpsTable = pgTable("registration_otps", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
