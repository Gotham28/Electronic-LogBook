ALTER TABLE department_configs ALTER COLUMN required_cases DROP NOT NULL;
ALTER TABLE department_configs ALTER COLUMN required_cases DROP DEFAULT;
ALTER TABLE department_configs ALTER COLUMN required_procedures DROP NOT NULL;
ALTER TABLE department_configs ALTER COLUMN required_procedures DROP DEFAULT;
ALTER TABLE department_configs ALTER COLUMN required_academic DROP NOT NULL;
ALTER TABLE department_configs ALTER COLUMN required_academic DROP DEFAULT;
ALTER TABLE department_configs ADD COLUMN IF NOT EXISTS enabled_features jsonb NOT NULL DEFAULT '{}'::jsonb;
