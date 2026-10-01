CREATE TABLE localizations (
  kind text NOT NULL,
  ref_id text NOT NULL,
  locale text NOT NULL,
  source_hash text NOT NULL,
  fields jsonb NOT NULL,
  receipt_id bigint REFERENCES receipts (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id, locale)
);
