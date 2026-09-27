CREATE TABLE IF NOT EXISTS "department_posting_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"training_year" integer NOT NULL,
	"posting_value" text NOT NULL,
	"months" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "department_posting_schedule_year_check" CHECK ("training_year" > 0),
	CONSTRAINT "department_posting_schedule_months_check" CHECK ("months" > 0),
	CONSTRAINT "department_posting_schedule_unique" UNIQUE ("department_id", "training_year", "posting_value")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_posting_schedule" ADD CONSTRAINT "department_posting_schedule_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
