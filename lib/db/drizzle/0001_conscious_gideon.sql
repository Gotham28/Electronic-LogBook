CREATE TABLE "clinical_work_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"supervisor_id" integer,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"sub_type" text,
	"patient_age" text NOT NULL,
	"patient_sex" text NOT NULL,
	"case_number" text NOT NULL,
	"organ_system" text,
	"clinical_findings" text,
	"competency" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"faculty_remarks" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_posting_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"training_year" integer NOT NULL,
	"posting_value" text NOT NULL,
	"months" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "department_posting_schedule_unique" UNIQUE("department_id","training_year","posting_value")
);
--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "registration_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "department_catalog" ADD COLUMN "parent_value" text;--> statement-breakpoint
ALTER TABLE "academic_logs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "procedure_logs" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "procedure_logs" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_work_logs" ADD CONSTRAINT "clinical_work_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_posting_schedule" ADD CONSTRAINT "department_posting_schedule_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinical_work_logs_student_id_idx" ON "clinical_work_logs" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "clinical_work_logs_supervisor_status_idx" ON "clinical_work_logs" USING btree ("supervisor_id","status");