ALTER TABLE "departments" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;
ALTER TABLE "departments" ADD COLUMN "config_source_department_id" integer;
ALTER TABLE "departments" ADD CONSTRAINT "departments_config_source_department_id_departments_id_fk" FOREIGN KEY ("config_source_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "departments" ADD CONSTRAINT "mirror_test_dept_source_requires_test" CHECK ("config_source_department_id" IS NULL OR "is_test" = true);
ALTER TABLE "departments" ADD CONSTRAINT "mirror_test_dept_not_self" CHECK ("config_source_department_id" <> "id");
