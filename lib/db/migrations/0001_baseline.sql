CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE');
CREATE TYPE "public"."certification_title" AS ENUM('BLS', 'NRP', 'PALS', 'ACLS', 'other');
CREATE TYPE "public"."research_status" AS ENUM('pending', 'submitted', 'approved');
CREATE TABLE "academic_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"presentation_type" text,
	"topic" text NOT NULL,
	"date" text NOT NULL,
	"presenter" text,
	"supervisor_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"faculty_remarks" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "appraisals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" integer NOT NULL,
	"evaluator_id" integer NOT NULL,
	"quarter" integer NOT NULL,
	"year" integer NOT NULL,
	"scholastic_grade" varchar(8) NOT NULL,
	"patient_care_grade" varchar(8) NOT NULL,
	"professional_attributes_grade" varchar(8) NOT NULL,
	"faculty_remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_name" text NOT NULL,
	"student_id" integer NOT NULL,
	"marks" integer,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"assessor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "attendance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"date" text NOT NULL,
	"clock_in" text,
	"clock_out" text,
	"status" text DEFAULT 'present' NOT NULL,
	"verified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" varchar NOT NULL,
	"record_id" varchar NOT NULL,
	"action" "audit_action" NOT NULL,
	"performed_by_id" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "case_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"supervisor_id" integer,
	"date" text NOT NULL,
	"attempt_number" integer DEFAULT 1,
	"patient_uhid" text,
	"patient_age" text NOT NULL,
	"patient_gender" text NOT NULL,
	"chief_complaints" text,
	"diagnosis_provisional" text,
	"diagnosis_final" text NOT NULL,
	"history" text,
	"examination" text,
	"investigations" text,
	"differential_diagnosis" text,
	"management_plan" text,
	"outcome" text,
	"learning_points" text,
	"status" text DEFAULT 'pending',
	"faculty_remarks" text,
	"faculty_grade" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" integer NOT NULL,
	"title" "certification_title" NOT NULL,
	"issue_date" timestamp NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"certificate_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "department_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"required_cases" integer DEFAULT 0,
	"required_procedures" integer DEFAULT 0,
	"required_academic" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);

CREATE TABLE "leave_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"total_days" integer NOT NULL,
	"leave_type" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "leave_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending',
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "postings" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"ward" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"supervisor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "procedure_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"supervisor_id" integer,
	"procedure_group" text NOT NULL,
	"procedure_name" text NOT NULL,
	"date" text NOT NULL,
	"patient_uhid" text NOT NULL,
	"patient_age" text NOT NULL,
	"competency_level" text NOT NULL,
	"faculty_verified_level" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"faculty_remarks" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "procedure_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "registration_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" integer NOT NULL,
	"thesis_title" text NOT NULL,
	"protocol_status" "research_status" DEFAULT 'pending' NOT NULL,
	"mid_term_status" "research_status" DEFAULT 'pending' NOT NULL,
	"final_submission_status" "research_status" DEFAULT 'pending' NOT NULL,
	"publication_proof_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"batch" text NOT NULL,
	"registration_number" text NOT NULL,
	"date_of_joining" text NOT NULL,
	"kuhs_id" text NOT NULL,
	"specialty" text NOT NULL,
	"mentor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_registration_number_unique" UNIQUE("registration_number"),
	CONSTRAINT "students_kuhs_id_unique" UNIQUE("kuhs_id")
);

CREATE TABLE "thesis_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"topic" text NOT NULL,
	"guide_id" integer,
	"co_guide_id" integer,
	"protocol_submission_date" text,
	"iec_clearance_date" text,
	"data_collection_start_date" text,
	"data_collection_end_date" text,
	"submission_date" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "thesis_milestones_student_id_unique" UNIQUE("student_id")
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'student' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"department_id" integer,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

ALTER TABLE "academic_logs" ADD CONSTRAINT "academic_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "academic_logs" ADD CONSTRAINT "academic_logs_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "academic_logs" ADD CONSTRAINT "academic_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_evaluator_id_users_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit" ADD CONSTRAINT "audit_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "case_logs" ADD CONSTRAINT "case_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "case_logs" ADD CONSTRAINT "case_logs_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "case_logs" ADD CONSTRAINT "case_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "postings" ADD CONSTRAINT "postings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "postings" ADD CONSTRAINT "postings_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "procedure_logs" ADD CONSTRAINT "procedure_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "procedure_logs" ADD CONSTRAINT "procedure_logs_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "procedure_logs" ADD CONSTRAINT "procedure_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "research" ADD CONSTRAINT "research_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "students" ADD CONSTRAINT "students_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "thesis_milestones" ADD CONSTRAINT "thesis_milestones_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "thesis_milestones" ADD CONSTRAINT "thesis_milestones_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "thesis_milestones" ADD CONSTRAINT "thesis_milestones_co_guide_id_users_id_fk" FOREIGN KEY ("co_guide_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
