-- @drift-patch
-- Reason: Add journaled production drift patch for Planning FMV Override request ledger and active-mark lookup index.

CREATE TABLE IF NOT EXISTS planning_fmv_override_requests (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  valuation_mark_id INTEGER,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  source_hash VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  response_body JSONB,
  failure_code VARCHAR(64),
  failure_message TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT planning_fmv_override_request_status_check
    CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT planning_fmv_override_requests_idempotency_unique
    UNIQUE (fund_id, idempotency_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'planning_fmv_override_requests'::regclass
      AND conname = 'planning_fmv_override_requests_fund_id_funds_id_fk'
  ) THEN
    ALTER TABLE "planning_fmv_override_requests"
      ADD CONSTRAINT "planning_fmv_override_requests_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'planning_fmv_override_requests'::regclass
      AND conname = 'planning_fmv_override_requests_company_id_portfoliocompanies_id'
  ) THEN
    ALTER TABLE "planning_fmv_override_requests"
      ADD CONSTRAINT "planning_fmv_override_requests_company_id_portfoliocompanies_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'planning_fmv_override_requests'::regclass
      AND conname = 'planning_fmv_override_requests_valuation_mark_id_valuation_mark'
  ) THEN
    ALTER TABLE "planning_fmv_override_requests"
      ADD CONSTRAINT "planning_fmv_override_requests_valuation_mark_id_valuation_marks_id_fk"
      FOREIGN KEY ("valuation_mark_id") REFERENCES "public"."valuation_marks"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'planning_fmv_override_requests'::regclass
      AND conname = 'planning_fmv_override_requests_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "planning_fmv_override_requests"
      ADD CONSTRAINT "planning_fmv_override_requests_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_planning_fmv_override_requests_fund_company_created
  ON planning_fmv_override_requests(fund_id, company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_planning_fmv_override_requests_valuation_mark
  ON planning_fmv_override_requests(valuation_mark_id);

CREATE INDEX IF NOT EXISTS idx_valuation_marks_planning_active_mark_date
  ON valuation_marks(fund_id, company_id, mark_date DESC, id DESC)
  WHERE imported_from = 'planning_fmv_override'
    AND status IN ('approved', 'locked');
