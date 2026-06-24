CREATE UNIQUE INDEX IF NOT EXISTS investment_rounds_id_fund_uq
  ON investment_rounds(id, fund_id);

CREATE TABLE IF NOT EXISTS investment_round_model_overrides (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  round_id INTEGER NOT NULL,
  override_role VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  supersedes_override_id INTEGER REFERENCES investment_round_model_overrides(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key VARCHAR(255),
  request_hash VARCHAR(64),
  CONSTRAINT investment_round_model_overrides_role_check
    CHECK (override_role IN ('initial', 'follow_on', 'amount_only'))
);

ALTER TABLE investment_round_model_overrides
  ADD CONSTRAINT investment_round_model_overrides_round_fund_fk
  FOREIGN KEY (round_id, fund_id) REFERENCES investment_rounds(id, fund_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_supersedes_uq
  ON investment_round_model_overrides(supersedes_override_id)
  WHERE supersedes_override_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_id_fund_round_uq
  ON investment_round_model_overrides(id, fund_id, round_id);

ALTER TABLE investment_round_model_overrides
  ADD CONSTRAINT investment_round_model_overrides_supersedes_lineage_fk
  FOREIGN KEY (supersedes_override_id, fund_id, round_id)
  REFERENCES investment_round_model_overrides(id, fund_id, round_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_root_lineage_uq
  ON investment_round_model_overrides(fund_id, round_id)
  WHERE supersedes_override_id IS NULL;

CREATE INDEX IF NOT EXISTS investment_round_model_overrides_fund_round_idx
  ON investment_round_model_overrides(fund_id, round_id, created_at, id);
