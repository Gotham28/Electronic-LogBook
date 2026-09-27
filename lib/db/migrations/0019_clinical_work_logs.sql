CREATE TABLE IF NOT EXISTS "clinical_work_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"supervisor_id" integer,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"sub_type" text,
	"patient_age" text NOT NULL,
	"patient_sex" text NOT NULL,
	"case_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"faculty_remarks" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_work_logs_status_check" CHECK ("status" IN ('pending', 'verified', 'rejected')),
	CONSTRAINT "clinical_work_logs_sex_check" CHECK ("patient_sex" IN ('male', 'female', 'other'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinical_work_logs_student_id_idx" ON "clinical_work_logs" ("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinical_work_logs_supervisor_status_idx" ON "clinical_work_logs" ("supervisor_id", "status");
