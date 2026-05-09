-- Phase 0.2: LP Reporting & Evidence Pack foundation schema.
-- Verbatim transcription of LP_Reporting_Evidence_Pack_Revised_Design.md
-- sections 4.2 through 4.8. Money columns are NUMERIC(20,6).
-- Evidence target uses typed nullable FKs with num_nonnulls(...) = 1 CHECK
-- (no polymorphic target_type/target_id). No partial indexes whose
-- predicate references NOW() (per design §4.5).
-- Locked by ADR-010 (XIRR policy) and ADR-011 (decimal-string API
-- convention).
-- Mirrors the YYYYMMDD_name_v1.up.sql pattern in server/migrations/.

-- ============================================================================
-- 1. vehicles (no FK dependencies beyond funds)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  vehicle_slug          VARCHAR(64) NOT NULL,
  vehicle_type          VARCHAR(16) NOT NULL,
  name                  VARCHAR(128) NOT NULL,
  description           TEXT,
  committed_capital     NUMERIC(20,6),
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
  inception_date        DATE,
  status                VARCHAR(16) NOT NULL DEFAULT 'active',
  spv_economics         JSONB NOT NULL DEFAULT '{}',
  admin_burden_score    INTEGER,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT vehicles_type_check CHECK (
    vehicle_type IN ('main_fund', 'spv', 'co_invest')
  ),
  CONSTRAINT vehicles_status_check CHECK (
    status IN ('active', 'winding_down', 'closed')
  ),
  CONSTRAINT vehicles_admin_score_check CHECK (
    admin_burden_score IS NULL OR (admin_burden_score >= 0 AND admin_burden_score <= 100)
  ),
  CONSTRAINT vehicles_fund_slug_unique UNIQUE (fund_id, vehicle_slug)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_fund_type ON vehicles(fund_id, vehicle_type);

-- ============================================================================
-- 2. cash_flow_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS cash_flow_events (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
  company_id            INTEGER REFERENCES portfoliocompanies(id) ON DELETE SET NULL,
  lp_id                 INTEGER REFERENCES limited_partners(id) ON DELETE SET NULL,

  event_type            VARCHAR(32) NOT NULL,
  amount                NUMERIC(20,6) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
  event_date            TIMESTAMP WITH TIME ZONE NOT NULL,
  perspective           VARCHAR(16) NOT NULL,
  description           TEXT,
  payload               JSONB NOT NULL DEFAULT '{}',

  status                VARCHAR(16) NOT NULL DEFAULT 'draft',
  locked_at             TIMESTAMP WITH TIME ZONE,
  locked_by             INTEGER REFERENCES users(id),
  supersedes_event_id   INTEGER REFERENCES cash_flow_events(id),
  reversal_of_event_id  INTEGER REFERENCES cash_flow_events(id),

  imported_from         VARCHAR(32),
  import_batch_id       UUID,
  source_hash           VARCHAR(128),

  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT cash_flow_event_type_check CHECK (
    event_type IN (
      'lp_capital_call',
      'lp_distribution',
      'fund_expense',
      'portfolio_investment',
      'realized_proceeds',
      'recallable_distribution',
      'reversal'
    )
  ),
  CONSTRAINT cash_flow_perspective_check CHECK (
    perspective IN ('lp_net', 'fund_gross', 'vehicle', 'company')
  ),
  CONSTRAINT cash_flow_status_check CHECK (
    status IN ('draft', 'approved', 'locked', 'reversed')
  ),
  CONSTRAINT cash_flow_locked_not_mutable CHECK (
    status <> 'locked' OR locked_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_fund_date ON cash_flow_events(fund_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_vehicle_date ON cash_flow_events(vehicle_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_company_date ON cash_flow_events(company_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_event_type ON cash_flow_events(event_type, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_flow_import_batch ON cash_flow_events(import_batch_id);

-- ============================================================================
-- 3. valuation_marks
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation_marks (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
  company_id            INTEGER NOT NULL REFERENCES portfoliocompanies(id) ON DELETE CASCADE,

  mark_date             DATE NOT NULL,
  as_of_date            DATE NOT NULL,
  fair_value            NUMERIC(20,6) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
  cost_basis            NUMERIC(20,6),

  mark_source           VARCHAR(64) NOT NULL,
  confidence_level      VARCHAR(16) NOT NULL,
  valuation_method      VARCHAR(64) NOT NULL,
  methodology_notes     TEXT,

  status                VARCHAR(16) NOT NULL DEFAULT 'draft',
  prior_mark_id         INTEGER REFERENCES valuation_marks(id),
  approved_by           INTEGER REFERENCES users(id),
  approved_at           TIMESTAMP WITH TIME ZONE,
  locked_at             TIMESTAMP WITH TIME ZONE,

  imported_from         VARCHAR(32),
  import_batch_id       UUID,
  source_hash           VARCHAR(128),

  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valuation_mark_source_check CHECK (
    mark_source IN (
      'financing_round',
      'signed_loi',
      'revenue_milestone',
      'strategic_partnership',
      'audited_financials',
      'board_update',
      'gp_estimate',
      'third_party_priced',
      'secondary_transaction',
      'impairment'
    )
  ),
  CONSTRAINT valuation_confidence_check CHECK (
    confidence_level IN ('high', 'medium', 'low')
  ),
  CONSTRAINT valuation_status_check CHECK (
    status IN ('draft', 'approved', 'locked', 'superseded')
  )
);

CREATE INDEX IF NOT EXISTS idx_valuation_marks_fund_asof ON valuation_marks(fund_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_marks_company_asof ON valuation_marks(company_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_marks_vehicle_asof ON valuation_marks(vehicle_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_valuation_marks_import_batch ON valuation_marks(import_batch_id);

-- ============================================================================
-- 4. lp_metric_runs (must precede evidence_records, narrative_runs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lp_metric_runs (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  vehicle_id            INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,

  as_of_date            DATE NOT NULL,
  run_type              VARCHAR(32) NOT NULL,
  perspective           VARCHAR(16) NOT NULL,
  status                VARCHAR(32) NOT NULL DEFAULT 'draft',

  inputs_hash           VARCHAR(128) NOT NULL,
  source_event_ids      JSONB NOT NULL DEFAULT '[]',
  source_mark_ids       JSONB NOT NULL DEFAULT '[]',
  source_evidence_ids   JSONB NOT NULL DEFAULT '[]',

  results_json          JSONB NOT NULL,
  diagnostics_json      JSONB NOT NULL DEFAULT '{}',
  methodology_version   VARCHAR(64) NOT NULL,
  calculation_version   VARCHAR(64) NOT NULL,

  generated_by          INTEGER REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  approved_at           TIMESTAMP WITH TIME ZONE,
  locked_at             TIMESTAMP WITH TIME ZONE,
  exported_at           TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT lp_metric_run_type_check CHECK (
    run_type IN ('quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update')
  ),
  CONSTRAINT lp_metric_run_perspective_check CHECK (
    perspective IN ('lp_net', 'fund_gross', 'vehicle')
  ),
  CONSTRAINT lp_metric_run_status_check CHECK (
    status IN ('draft', 'approved', 'locked', 'exported', 'superseded')
  )
);

CREATE INDEX IF NOT EXISTS idx_lp_metric_runs_fund_asof ON lp_metric_runs(fund_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_lp_metric_runs_vehicle_asof ON lp_metric_runs(vehicle_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_lp_metric_runs_status ON lp_metric_runs(status);

-- ============================================================================
-- 5. narrative_runs (must precede evidence_records)
-- ============================================================================
CREATE TABLE IF NOT EXISTS narrative_runs (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  metric_run_id         INTEGER NOT NULL REFERENCES lp_metric_runs(id) ON DELETE CASCADE,
  as_of_date            DATE NOT NULL,

  narrative_type        VARCHAR(32) NOT NULL,
  generated_text        TEXT NOT NULL,
  edited_text           TEXT,
  status                VARCHAR(32) NOT NULL DEFAULT 'draft',

  generated_by          INTEGER REFERENCES users(id),
  edited_by             INTEGER REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  approved_at           TIMESTAMP WITH TIME ZONE,
  exported_at           TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT narrative_type_check CHECK (
    narrative_type IN ('no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure')
  ),
  CONSTRAINT narrative_status_check CHECK (
    status IN ('draft', 'reviewed', 'approved', 'exported')
  )
);

CREATE INDEX IF NOT EXISTS idx_narrative_runs_metric_run ON narrative_runs(metric_run_id);

-- ============================================================================
-- 6. evidence_records (typed FKs with num_nonnulls = 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evidence_records (
  id                    SERIAL PRIMARY KEY,
  fund_id               INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  valuation_mark_id     INTEGER REFERENCES valuation_marks(id) ON DELETE CASCADE,
  company_id            INTEGER REFERENCES portfoliocompanies(id) ON DELETE CASCADE,
  metric_run_id         INTEGER REFERENCES lp_metric_runs(id) ON DELETE CASCADE,
  narrative_run_id      INTEGER REFERENCES narrative_runs(id) ON DELETE CASCADE,

  evidence_source       VARCHAR(64) NOT NULL,
  source_date           DATE NOT NULL,
  received_date         DATE,
  expiration_date       DATE,
  confidence_level      VARCHAR(16) NOT NULL DEFAULT 'medium',
  materiality_level     VARCHAR(16) NOT NULL DEFAULT 'medium',

  confidentiality       VARCHAR(24) NOT NULL DEFAULT 'internal',
  redaction_required    BOOLEAN NOT NULL DEFAULT FALSE,
  document_hash         VARCHAR(128),
  valuation_policy_version VARCHAR(64),

  description           TEXT,
  internal_notes        TEXT,
  lp_objection          TEXT,
  attachments           JSONB NOT NULL DEFAULT '[]',

  uploaded_by           INTEGER REFERENCES users(id),
  approved_by           INTEGER REFERENCES users(id),
  approved_at           TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT evidence_one_target_check CHECK (
    num_nonnulls(valuation_mark_id, company_id, metric_run_id, narrative_run_id) = 1
  ),
  CONSTRAINT evidence_source_check CHECK (
    evidence_source IN (
      'financing_round',
      'signed_loi',
      'revenue_milestone',
      'strategic_partnership',
      'audited_financials',
      'board_update',
      'gp_estimate',
      'third_party_priced',
      'secondary_transaction',
      'customer_contract',
      'management_report',
      'auditor_confirmation'
    )
  ),
  CONSTRAINT evidence_confidence_check CHECK (
    confidence_level IN ('high', 'medium', 'low')
  ),
  CONSTRAINT evidence_materiality_check CHECK (
    materiality_level IN ('high', 'medium', 'low')
  ),
  CONSTRAINT evidence_confidentiality_check CHECK (
    confidentiality IN ('internal', 'lp_shareable', 'restricted')
  )
);

CREATE INDEX IF NOT EXISTS idx_evidence_fund ON evidence_records(fund_id);
CREATE INDEX IF NOT EXISTS idx_evidence_valuation_mark ON evidence_records(valuation_mark_id);
CREATE INDEX IF NOT EXISTS idx_evidence_company ON evidence_records(company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_metric_run ON evidence_records(metric_run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_narrative_run ON evidence_records(narrative_run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_expiration_date ON evidence_records(expiration_date);
CREATE INDEX IF NOT EXISTS idx_evidence_confidence ON evidence_records(confidence_level);
CREATE INDEX IF NOT EXISTS idx_evidence_confidentiality ON evidence_records(confidentiality);

-- ============================================================================
-- 7. lp_vehicle_participation
-- ============================================================================
CREATE TABLE IF NOT EXISTS lp_vehicle_participation (
  id                    SERIAL PRIMARY KEY,
  lp_id                 INTEGER NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
  vehicle_id            INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  commitment_amount     NUMERIC(20,6) NOT NULL DEFAULT 0,
  status                VARCHAR(32) NOT NULL DEFAULT 'exploratory',
  follow_on_interest    BOOLEAN DEFAULT FALSE,
  conversion_probability NUMERIC(5,4),
  notes                 TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT lp_participation_lp_vehicle_unique UNIQUE (lp_id, vehicle_id),
  CONSTRAINT lp_participation_status_check CHECK (
    status IN (
      'main_fund_aligned',
      'spv_only',
      'exploratory',
      'high_conversion_prospect',
      'low_conversion_prospect',
      'committed_to_fund_ii',
      'declined'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lp_vehicle_participation_vehicle ON lp_vehicle_participation(vehicle_id);

-- ============================================================================
-- 8. lp_vehicle_participation_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS lp_vehicle_participation_history (
  id                    SERIAL PRIMARY KEY,
  lp_vehicle_participation_id INTEGER NOT NULL REFERENCES lp_vehicle_participation(id) ON DELETE CASCADE,
  from_status           VARCHAR(32),
  to_status             VARCHAR(32) NOT NULL,
  changed_by            INTEGER REFERENCES users(id),
  changed_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason                TEXT
);

CREATE INDEX IF NOT EXISTS idx_lp_vehicle_participation_history_parent_changed_at
  ON lp_vehicle_participation_history(lp_vehicle_participation_id, changed_at DESC);
