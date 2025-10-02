-- Compass Valuation Sandbox - Database Schema
-- PostgreSQL Schema for internal decision-support tool
--
-- ⚠️ IMPORTANT: Data in this schema is NOT for official reporting
-- This is a "sandbox" for exploration and scenario planning

-- Create dedicated schema for isolation
CREATE SCHEMA IF NOT EXISTS compass;

-- Set search path for this session
SET search_path TO compass, public;

--
-- TABLE: portfolio_company_metrics
-- Core metrics for portfolio companies used in valuations
--
CREATE TABLE IF NOT EXISTS compass.portfolio_company_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Company identification
    company_id UUID NOT NULL, -- FK to main companies table (if exists)
    company_name TEXT NOT NULL,

    -- Current metrics
    current_revenue_usd BIGINT NOT NULL DEFAULT 0,
    sector TEXT,
    stage TEXT,

    -- Last funding round context
    last_round_valuation_usd BIGINT,
    last_round_date DATE,
    last_round_revenue_usd BIGINT,
    last_round_implied_multiple NUMERIC(10, 2),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT portfolio_company_metrics_company_id_key UNIQUE (company_id)
);

CREATE INDEX idx_portfolio_company_metrics_sector ON compass.portfolio_company_metrics(sector);
CREATE INDEX idx_portfolio_company_metrics_stage ON compass.portfolio_company_metrics(stage);

--
-- TABLE: comparable_companies_cache
-- Persistent cache for comparable company data (public + private)
-- Reduces API calls to PitchBook and enables offline work
--
CREATE TABLE IF NOT EXISTS compass.comparable_companies_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- External identifiers
    pitchbook_id TEXT UNIQUE, -- PitchBook company ID
    ticker TEXT, -- Stock ticker (if public)

    -- Company info
    company_name TEXT NOT NULL,
    sector TEXT,
    stage TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    -- Financial metrics (stored as JSONB for flexibility)
    metrics JSONB NOT NULL DEFAULT '{}', -- { evRevenueMultiple, revenue, etc. }

    -- Cache metadata
    last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fetch_count INTEGER NOT NULL DEFAULT 1,

    -- Raw data from external source (for debugging/audit)
    raw_data JSONB,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast comp search
CREATE INDEX idx_comparable_companies_name ON compass.comparable_companies_cache USING gin(to_tsvector('english', company_name));
CREATE INDEX idx_comparable_companies_sector ON compass.comparable_companies_cache(sector);
CREATE INDEX idx_comparable_companies_public ON compass.comparable_companies_cache(is_public);
CREATE INDEX idx_comparable_companies_fetched ON compass.comparable_companies_cache(last_fetched_at DESC);

--
-- TABLE: valuation_scenarios
-- User-saved valuation scenarios (personal bookmarks, NOT official marks)
--
CREATE TABLE IF NOT EXISTS compass.valuation_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    user_id UUID NOT NULL, -- FK to users table
    portfolio_company_id UUID NOT NULL REFERENCES compass.portfolio_company_metrics(id) ON DELETE CASCADE,

    -- Scenario details
    scenario_name TEXT NOT NULL,
    description TEXT,

    -- Valuation data (stored as JSONB for flexibility)
    inputs JSONB NOT NULL, -- ValuationInputs
    outputs JSONB NOT NULL, -- ValuationResult
    comps_used JSONB NOT NULL DEFAULT '[]', -- Array of comp IDs

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete (scenarios can be "archived" without losing history)
    deleted_at TIMESTAMPTZ
);

-- Indexes for fast scenario retrieval
CREATE INDEX idx_valuation_scenarios_user ON compass.valuation_scenarios(user_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_valuation_scenarios_company ON compass.valuation_scenarios(portfolio_company_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_valuation_scenarios_created ON compass.valuation_scenarios(created_at DESC);

--
-- TABLE: comp_usage_analytics (optional)
-- Track which comps are used most frequently to optimize caching
--
CREATE TABLE IF NOT EXISTS compass.comp_usage_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    comp_id UUID NOT NULL REFERENCES compass.comparable_companies_cache(id) ON DELETE CASCADE,
    portfolio_company_id UUID NOT NULL REFERENCES compass.portfolio_company_metrics(id) ON DELETE CASCADE,

    -- Usage context
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL,

    -- Selected metrics
    multiple_at_time NUMERIC(10, 2)
);

CREATE INDEX idx_comp_usage_comp ON compass.comp_usage_analytics(comp_id, used_at DESC);
CREATE INDEX idx_comp_usage_company ON compass.comp_usage_analytics(portfolio_company_id, used_at DESC);

--
-- FUNCTION: update_updated_at_column
-- Automatically updates the updated_at timestamp
--
CREATE OR REPLACE FUNCTION compass.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_portfolio_company_metrics_updated_at
    BEFORE UPDATE ON compass.portfolio_company_metrics
    FOR EACH ROW
    EXECUTE FUNCTION compass.update_updated_at_column();

CREATE TRIGGER update_comparable_companies_updated_at
    BEFORE UPDATE ON compass.comparable_companies_cache
    FOR EACH ROW
    EXECUTE FUNCTION compass.update_updated_at_column();

CREATE TRIGGER update_valuation_scenarios_updated_at
    BEFORE UPDATE ON compass.valuation_scenarios
    FOR EACH ROW
    EXECUTE FUNCTION compass.update_updated_at_column();

--
-- SEED DATA: Example portfolio companies
-- (Replace with actual data import)
--
INSERT INTO compass.portfolio_company_metrics
    (company_id, company_name, current_revenue_usd, sector, stage, last_round_valuation_usd, last_round_date, last_round_revenue_usd, last_round_implied_multiple)
VALUES
    (gen_random_uuid(), 'Acme AI Inc', 45000000, 'Enterprise SaaS', 'Series B', 320000000, '2024-01-15', 28000000, 11.4),
    (gen_random_uuid(), 'CloudCo', 12000000, 'Infrastructure', 'Series A', 85000000, '2023-06-20', 8000000, 10.6),
    (gen_random_uuid(), 'DataViz Pro', 28000000, 'Analytics', 'Series B', 220000000, '2023-11-10', 18000000, 12.2)
ON CONFLICT (company_id) DO NOTHING;

--
-- SEED DATA: Example comps (mock data)
-- In production, these would come from PitchBook API
--
INSERT INTO compass.comparable_companies_cache
    (pitchbook_id, company_name, ticker, sector, is_public, metrics)
VALUES
    ('pb_snowflake', 'Snowflake Inc', 'SNOW', 'Enterprise SaaS', true, '{"evRevenueMultiple": 18.5, "revenue": 2000000000}'::jsonb),
    ('pb_datadog', 'Datadog Inc', 'DDOG', 'Infrastructure', true, '{"evRevenueMultiple": 15.2, "revenue": 1800000000}'::jsonb),
    ('pb_mongo', 'MongoDB Inc', 'MDB', 'Infrastructure', true, '{"evRevenueMultiple": 9.8, "revenue": 1200000000}'::jsonb)
ON CONFLICT (pitchbook_id) DO NOTHING;

-- Grant permissions (adjust based on your user setup)
-- GRANT USAGE ON SCHEMA compass TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA compass TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA compass TO your_app_user;

COMMENT ON SCHEMA compass IS 'Internal valuation sandbox - NOT for official LP reporting';
COMMENT ON TABLE compass.portfolio_company_metrics IS 'Portfolio company metrics for sandbox valuations';
COMMENT ON TABLE compass.comparable_companies_cache IS 'Cached comparable company data from PitchBook and other sources';
COMMENT ON TABLE compass.valuation_scenarios IS 'User-saved valuation scenarios (personal bookmarks)';
COMMENT ON TABLE compass.comp_usage_analytics IS 'Track comp usage for cache optimization';
