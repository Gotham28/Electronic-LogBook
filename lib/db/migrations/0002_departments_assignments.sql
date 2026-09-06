-- Atomic, additive upgrade. Resolve these preflight errors using verified institutional
-- mappings; do not guess a department or delete clinical records to make migration pass.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role IN ('student', 'professor', 'hod') AND department_id IS NULL) THEN
    RAISE EXCEPTION 'Assign every student, faculty member and HOD to a department before migration';
  END IF;
  IF EXISTS (SELECT department_id FROM users WHERE role = 'hod' AND status = 'approved' GROUP BY department_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve multiple approved HODs in a department before migration';
  END IF;
  IF EXISTS (SELECT department_id FROM department_configs GROUP BY department_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate department configurations before migration';
  END IF;
  IF EXISTS (SELECT student_id FROM research GROUP BY student_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Consolidate duplicate thesis rows without losing history before migration';
  END IF;
  IF EXISTS (SELECT user_id FROM students GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate student profiles before migration';
  END IF;
  IF EXISTS (SELECT lower(btrim(email)) FROM users GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve case-insensitive duplicate account emails before migration';
  END IF;
END $$;

UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

CREATE TABLE "assignment_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"response" text,
	"feedback" text,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" integer,
	CONSTRAINT "assignment_recipient_unique" UNIQUE("assignment_id","student_id"),
	CONSTRAINT "assignment_recipient_status_check" CHECK ("assignment_recipients"."status" IN ('assigned', 'submitted', 'returned', 'completed'))
);

CREATE TABLE "assignment_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_types_department_name_unique" UNIQUE("department_id","name")
);

CREATE TABLE "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"faculty_id" integer NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "department_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"required" integer DEFAULT 0 NOT NULL,
	"period" text DEFAULT 'total' NOT NULL,
	CONSTRAINT "department_catalog_value_unique" UNIQUE("department_id","kind","value")
);

ALTER TABLE "certifications" ALTER COLUMN "title" SET DATA TYPE text;
ALTER TABLE "certifications" ADD COLUMN "provider" text;
ALTER TABLE "department_configs" ADD COLUMN "program_duration_months" integer;
ALTER TABLE "department_configs" ADD COLUMN "casual_leave_allowance" integer;
ALTER TABLE "department_configs" ADD COLUMN "academic_leave_allowance" integer;
ALTER TABLE "password_resets" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "procedure_types" ADD COLUMN "required" integer DEFAULT 0 NOT NULL;
ALTER TABLE "registration_otps" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "research" ADD COLUMN "guide_id" integer;
ALTER TABLE "research" ADD COLUMN "co_guide_id" integer;
ALTER TABLE "research" ADD COLUMN "protocol_submission_date" text;
ALTER TABLE "research" ADD COLUMN "iec_clearance_date" text;
ALTER TABLE "research" ADD COLUMN "data_collection_start_date" text;
ALTER TABLE "research" ADD COLUMN "data_collection_end_date" text;
ALTER TABLE "research" ADD COLUMN "submission_date" text;
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignment_types" ADD CONSTRAINT "assignment_types_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignment_types" ADD CONSTRAINT "assignment_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_type_id_assignment_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."assignment_types"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_faculty_id_users_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "department_catalog" ADD CONSTRAINT "department_catalog_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "assignment_recipients_student_idx" ON "assignment_recipients" USING btree ("student_id");
CREATE INDEX "assignments_department_faculty_idx" ON "assignments" USING btree ("department_id","faculty_id");
ALTER TABLE "department_configs" ADD CONSTRAINT "department_configs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "procedure_types" ADD CONSTRAINT "procedure_types_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research" ADD CONSTRAINT "research_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research" ADD CONSTRAINT "research_co_guide_id_users_id_fk" FOREIGN KEY ("co_guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "users_one_approved_hod_per_department" ON "users" USING btree ("department_id") WHERE "users"."role" = 'hod' AND "users"."status" = 'approved';
ALTER TABLE "department_configs" ADD CONSTRAINT "department_configs_department_id_unique" UNIQUE("department_id");
ALTER TABLE "research" ADD CONSTRAINT "research_student_id_unique" UNIQUE("student_id");
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_unique" UNIQUE("user_id");
ALTER TABLE "users" ADD CONSTRAINT "users_department_required" CHECK ("users"."role" NOT IN ('student', 'professor', 'hod') OR "users"."department_id" IS NOT NULL);

-- Preserve training choices that already exist in real department records.
-- Unrecorded requirements must be configured by the HOD; no clinical targets are inferred.
INSERT INTO department_catalog (department_id, kind, name, value)
SELECT DISTINCT u.department_id, 'posting', p.ward, p.ward
FROM postings p JOIN students s ON s.id = p.student_id JOIN users u ON u.id = s.user_id
WHERE u.department_id IS NOT NULL AND btrim(p.ward) <> ''
ON CONFLICT (department_id, kind, value) DO NOTHING;

INSERT INTO department_catalog (department_id, kind, name, value)
SELECT DISTINCT u.department_id, 'academic', a.activity_type, a.activity_type
FROM academic_logs a JOIN students s ON s.id = a.student_id JOIN users u ON u.id = s.user_id
WHERE u.department_id IS NOT NULL AND btrim(a.activity_type) <> ''
ON CONFLICT (department_id, kind, value) DO NOTHING;

INSERT INTO procedure_types (department_id, name, "group")
SELECT DISTINCT u.department_id, p.procedure_name, p.procedure_group
FROM procedure_logs p JOIN students s ON s.id = p.student_id JOIN users u ON u.id = s.user_id
WHERE u.department_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM procedure_types t WHERE t.department_id = u.department_id
  AND t.name = p.procedure_name AND t."group" = p.procedure_group
);

-- Invalidate codes issued by the old proof-less OTP flow, without deleting account data.
UPDATE registration_otps SET expires_at = LEAST(expires_at, now());
UPDATE password_resets SET expires_at = LEAST(expires_at, now());
