-- ADR-023 L3b: first-class investment financing rounds with fund-scoped
-- idempotency and append-only supersede corrections.

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
  CONSTRAINT investment_rounds_investment_fund_fk
    FOREIGN KEY (investment_id, fund_id)
    REFERENCES investments(id, fund_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT investment_rounds_fund_idem_key
    UNIQUE (fund_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS investment_rounds_fund_investment_idx
  ON investment_rounds(fund_id, investment_id);

CREATE INDEX IF NOT EXISTS investment_rounds_investment_round_date_idx
  ON investment_rounds(investment_id, round_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS investment_rounds_supersedes_uq
  ON investment_rounds(supersedes_round_id)
  WHERE supersedes_round_id IS NOT NULL;
