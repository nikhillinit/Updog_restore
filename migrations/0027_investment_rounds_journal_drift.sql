-- @drift-patch
-- Reason: journal the live investment_rounds family (ADR-023 L3b) so the canonical migrations/ ledger covers what shared/schema already ships via db:push, unblocking lane-B retirement of server/migrations (PR-2b s8.2 slice 1). Content mirrors server/migrations/20260621_z_investment_rounds_v1 + 20260623_z_investment_rounds_operational_v1 + 20260624_investment_round_model_overrides_v1 with ONE deliberate delta: investment_rounds_id_fund_uq and investment_round_model_overrides_id_fund_round_uq are UNIQUE CONSTRAINTS (as shared/schema declares them -- the PG 42830 FK-ordering fix; see shared/schema/investment-rounds.ts) rather than the unique INDEXES the legacy server files created. Fully guarded (IF NOT EXISTS / DO-block) so the gated operator narrow-apply path is idempotent against db:push-built databases that already carry these objects; same-name/wrong-shape divergence stays the job of the s7 comparator and operator re-audit. Additive (CREATE-only); no prod apply -- prod (built via db:push) already has the push shape.
CREATE TABLE IF NOT EXISTS investment_rounds (
  id SERIAL PRIMARY KEY,
  investment_id INTEGER NOT NULL,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  round_name VARCHAR(120) NOT NULL,
  security_type VARCHAR(32) NOT NULL,
  round_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  investment_amount NUMERIC(20,6) NOT NULL,
  round_size NUMERIC(20,6),
  pre_money_valuation NUMERIC(20,6),
  idempotency_key VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  supersedes_round_id INTEGER REFERENCES investment_rounds(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT investment_rounds_security_type_check
    CHECK (security_type IN ('equity', 'convertible_note', 'safe', 'warrant', 'other')),
  CONSTRAINT investment_rounds_amount_positive CHECK (investment_amount > 0),
  CONSTRAINT investment_rounds_investment_fund_fk
    FOREIGN KEY (investment_id, fund_id)
    REFERENCES investments(id, fund_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT investment_rounds_fund_idem_key UNIQUE (fund_id, idempotency_key),
  CONSTRAINT investment_rounds_id_fund_uq UNIQUE (id, fund_id)
);

CREATE INDEX IF NOT EXISTS investment_rounds_fund_investment_idx
  ON investment_rounds (fund_id, investment_id);

CREATE INDEX IF NOT EXISTS investment_rounds_investment_round_date_idx
  ON investment_rounds (investment_id, round_date DESC);

CREATE INDEX IF NOT EXISTS investment_rounds_fund_round_order_idx
  ON investment_rounds (fund_id, investment_id, round_date, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS investment_rounds_supersedes_uq
  ON investment_rounds (supersedes_round_id)
  WHERE supersedes_round_id IS NOT NULL;

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
    CHECK (override_role IN ('initial', 'follow_on', 'amount_only')),
  CONSTRAINT investment_round_model_overrides_id_fund_round_uq UNIQUE (id, fund_id, round_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'investment_round_model_overrides_round_fund_fk'
      AND conrelid = 'public.investment_round_model_overrides'::regclass
  ) THEN
    ALTER TABLE investment_round_model_overrides
      ADD CONSTRAINT investment_round_model_overrides_round_fund_fk
      FOREIGN KEY (round_id, fund_id) REFERENCES investment_rounds(id, fund_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'investment_round_model_overrides_supersedes_lineage_fk'
      AND conrelid = 'public.investment_round_model_overrides'::regclass
  ) THEN
    ALTER TABLE investment_round_model_overrides
      ADD CONSTRAINT investment_round_model_overrides_supersedes_lineage_fk
      FOREIGN KEY (supersedes_override_id, fund_id, round_id)
      REFERENCES investment_round_model_overrides(id, fund_id, round_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_supersedes_uq
  ON investment_round_model_overrides (supersedes_override_id)
  WHERE supersedes_override_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_round_model_overrides_root_lineage_uq
  ON investment_round_model_overrides (fund_id, round_id)
  WHERE supersedes_override_id IS NULL;

CREATE INDEX IF NOT EXISTS investment_round_model_overrides_fund_round_idx
  ON investment_round_model_overrides (fund_id, round_id, created_at, id);
