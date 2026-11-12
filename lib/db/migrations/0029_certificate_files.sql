ALTER TABLE "certifications" ALTER COLUMN "certificate_url" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "certificate_file_key" text;
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "certificate_file_type" text;
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "certificate_file_size" integer;
--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "certificate_file_name" text;
--> statement-breakpoint
ALTER TABLE "certifications"
  ADD CONSTRAINT "certifications_certificate_file_key_unique" UNIQUE ("certificate_file_key");
