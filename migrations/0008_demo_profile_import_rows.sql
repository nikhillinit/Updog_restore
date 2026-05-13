DO $$
BEGIN
  CREATE TYPE demo_profile_target_pk_type AS ENUM ('integer', 'uuid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS demo_profile_import_rows (
  id serial PRIMARY KEY,
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  dataset_id text NOT NULL,
  target_table text NOT NULL,
  source_key text NOT NULL,
  source_hash text NOT NULL,
  target_id_text text NOT NULL,
  target_pk_type demo_profile_target_pk_type NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT demo_profile_import_rows_target_table_check CHECK (
    target_table IN (
      'portfoliocompanies',
      'investments',
      'investment_lots',
      'deal_opportunities',
      'fund_metrics',
      'pacing_history',
      'fund_baselines',
      'variance_reports',
      'backtest_results'
    )
  ),
  CONSTRAINT demo_profile_import_rows_source_hash_check CHECK (
    source_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT demo_profile_import_rows_target_id_type_check CHECK (
    (
      target_pk_type = 'integer'
      AND target_id_text ~ '^[1-9][0-9]*$'
    )
    OR (
      target_pk_type = 'uuid'
      AND target_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_profile_import_rows_scope_unique
  ON demo_profile_import_rows (fund_id, dataset_id, target_table, source_key);

CREATE INDEX IF NOT EXISTS demo_profile_import_rows_fund_dataset_idx
  ON demo_profile_import_rows (fund_id, dataset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS demo_profile_import_rows_target_lookup_idx
  ON demo_profile_import_rows (target_table, target_id_text);
