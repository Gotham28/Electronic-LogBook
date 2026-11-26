CREATE TABLE posting_attachments (
  id uuid PRIMARY KEY,
  posting_id integer NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg')),
  byte_size integer NOT NULL,
  CONSTRAINT posting_attachments_byte_size_check CHECK (
    byte_size BETWEEN 1 AND CASE content_type WHEN 'image/jpeg' THEN 1048576 ELSE 3145728 END
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posting_attachments_posting_id_idx ON posting_attachments (posting_id);

CREATE TABLE posting_attachment_cleanup (
  id uuid PRIMARY KEY,
  ready_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posting_attachment_cleanup_ready_at_idx ON posting_attachment_cleanup (ready_at);

CREATE FUNCTION queue_deleted_posting_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO posting_attachment_cleanup (id) VALUES (OLD.id) ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;

CREATE TRIGGER posting_attachment_cleanup_after_delete
  AFTER DELETE ON posting_attachments
  FOR EACH ROW EXECUTE FUNCTION queue_deleted_posting_attachment();
