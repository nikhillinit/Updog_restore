-- Migration 0006: Deal Pipeline Cursor Pagination Indexes
-- Per cheatsheets/anti-pattern-prevention.md AP-CURSOR-01: Missing Index on Cursor Field
-- These indexes support efficient cursor-based pagination for deal pipeline APIs

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Deal opportunities: Primary listing and filtering
-- Compound cursor for race-condition-free pagination (AP-CURSOR-05)
CREATE INDEX IF NOT EXISTS idx_deal_opportunities_cursor
  ON deal_opportunities(created_at DESC, id DESC);

-- Filter by status (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_deal_opportunities_status
  ON deal_opportunities(status, created_at DESC);

-- Filter by fund
CREATE INDEX IF NOT EXISTS idx_deal_opportunities_fund
  ON deal_opportunities(fund_id, status, created_at DESC);

-- Priority sorting (for pipeline view)
CREATE INDEX IF NOT EXISTS idx_deal_opportunities_priority
  ON deal_opportunities(priority, created_at DESC);

-- Due diligence items: Filtering by opportunity and status
CREATE INDEX IF NOT EXISTS idx_due_diligence_cursor
  ON due_diligence_items(opportunity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_due_diligence_status
  ON due_diligence_items(status, due_date);

-- Pipeline activities: Activity feed pagination
CREATE INDEX IF NOT EXISTS idx_pipeline_activities_cursor
  ON pipeline_activities(opportunity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_activities_type
  ON pipeline_activities(type, created_at DESC);

-- Scoring models: Latest scores per opportunity
CREATE INDEX IF NOT EXISTS idx_scoring_models_cursor
  ON scoring_models(opportunity_id, scored_at DESC, id DESC);

-- Market research: Research by opportunity
CREATE INDEX IF NOT EXISTS idx_market_research_cursor
  ON market_research(opportunity_id, created_at DESC, id DESC);

-- Financial projections: Projections timeline
CREATE INDEX IF NOT EXISTS idx_financial_projections_cursor
  ON financial_projections(opportunity_id, year DESC, id DESC);

-- Pipeline stages: Ordered display
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order
  ON pipeline_stages(order_index, is_active);

-- ============================================================
-- DOWN MIGRATION
-- ============================================================

-- To rollback, run:
-- DROP INDEX IF EXISTS idx_deal_opportunities_cursor;
-- DROP INDEX IF EXISTS idx_deal_opportunities_status;
-- DROP INDEX IF EXISTS idx_deal_opportunities_fund;
-- DROP INDEX IF EXISTS idx_deal_opportunities_priority;
-- DROP INDEX IF EXISTS idx_due_diligence_cursor;
-- DROP INDEX IF EXISTS idx_due_diligence_status;
-- DROP INDEX IF EXISTS idx_pipeline_activities_cursor;
-- DROP INDEX IF EXISTS idx_pipeline_activities_type;
-- DROP INDEX IF EXISTS idx_scoring_models_cursor;
-- DROP INDEX IF EXISTS idx_market_research_cursor;
-- DROP INDEX IF EXISTS idx_financial_projections_cursor;
-- DROP INDEX IF EXISTS idx_pipeline_stages_order;
