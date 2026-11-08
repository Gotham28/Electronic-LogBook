-- Shared storage: existing procedure types retain their original requirements.
ALTER TABLE public.procedure_types
  ADD COLUMN IF NOT EXISTS required_log_fields text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.procedure_logs
  ADD COLUMN IF NOT EXISTS setting text;
