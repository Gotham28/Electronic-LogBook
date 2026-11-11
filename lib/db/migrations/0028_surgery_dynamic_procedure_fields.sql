-- Additive storage for Surgery dynamic procedure entry field customization.
ALTER TABLE public.department_configs
  ADD COLUMN IF NOT EXISTS procedure_log_fields jsonb;

ALTER TABLE public.procedure_logs
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
