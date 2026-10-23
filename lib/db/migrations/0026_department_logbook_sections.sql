CREATE TABLE department_logbook_sections (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  value text NOT NULL,
  definition jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (department_id, value)
);
