DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_rounds_amount_positive') THEN
    ALTER TABLE investment_rounds
      ADD CONSTRAINT investment_rounds_amount_positive CHECK (investment_amount > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS investment_rounds_fund_round_order_idx
  ON investment_rounds (fund_id, investment_id, round_date, created_at, id);
