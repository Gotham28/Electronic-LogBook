ALTER TABLE "department_catalog" ADD COLUMN IF NOT EXISTS "parent_value" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "department_catalog" ADD CONSTRAINT "department_catalog_parent_check"
   CHECK (("kind" = 'clinical_work_subtype') = ("parent_value" IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
