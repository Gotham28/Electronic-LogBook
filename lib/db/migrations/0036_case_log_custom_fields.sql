ALTER TABLE department_configs
  ADD COLUMN IF NOT EXISTS case_log_fields jsonb;

ALTER TABLE case_logs
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
