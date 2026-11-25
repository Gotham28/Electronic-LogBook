CREATE TABLE psychiatry_entries (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id),
  student_id integer NOT NULL REFERENCES students(id),
  section text NOT NULL,
  month text,
  reviewer_id integer REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('draft', 'pending', 'verified', 'rejected', 'recorded')),
  "values" jsonb NOT NULL,
  diagnosis_rows jsonb NOT NULL DEFAULT '[]',
  review_note text,
  reviewed_by integer REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX psychiatry_entries_student_section_month_idx ON psychiatry_entries (student_id, section, month) WHERE month IS NOT NULL;
CREATE INDEX psychiatry_entries_department_status_idx ON psychiatry_entries (department_id, status, reviewer_id);
CREATE INDEX psychiatry_entries_student_idx ON psychiatry_entries (student_id, id);

CREATE TABLE psychiatry_attendees (
  entry_id integer NOT NULL REFERENCES psychiatry_entries(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, user_id)
);

CREATE INDEX psychiatry_attendees_user_idx ON psychiatry_attendees (user_id, entry_id);
