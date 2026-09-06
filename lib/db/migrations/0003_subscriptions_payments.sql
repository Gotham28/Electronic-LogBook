-- Atomic, additive upgrade. Adds subscription plan and payment tracking; touches no
-- existing table and no existing row.
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"duration_months" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);

CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"amount_paise" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"refund_status" text,
	"refunded_at" timestamp,
	"refund_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('created', 'paid', 'failed', 'refunded'))
);

ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;

-- A user may hold at most one 'paid' row. Other statuses (created/failed/refunded) are unrestricted.
CREATE UNIQUE INDEX "payments_one_paid_per_user" ON "payments" USING btree ("user_id") WHERE "payments"."status" = 'paid';

-- Seed the one plan this task needs. department_id NULL means it applies to every department
-- (AGENTS.md section 5 - nothing may branch on a specific department instead).
INSERT INTO subscription_plans (department_id, code, name, amount_paise, currency, duration_months, active)
VALUES (NULL, 'pg-3yr', 'Postgraduate 3-Year Subscription', 140000, 'INR', 36, true)
ON CONFLICT (code) DO NOTHING;
