-- ============================================================================
-- AI Usage Ledger Migration
-- Purpose: Reserve→Settle→Void ledger for AI API call tracking with JSONB
-- Author: Schema Agent
-- Date: 2025-10-15
-- ============================================================================

-- Create enum for ledger states
CREATE TYPE ai_ledger_state AS ENUM ('reserved', 'settled', 'void');

-- Create AI usage ledger table with reserve→settle→void pattern
CREATE TABLE ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency and tracking
  idempotency_key text NOT NULL UNIQUE,
  request_id text,
  correlation_id text,

  -- Ledger state management
  state ai_ledger_state NOT NULL DEFAULT 'reserved',
  reserved_at timestamp with time zone NOT NULL DEFAULT now(),
  settled_at timestamp with time zone,
  voided_at timestamp with time zone,

  -- AI request metadata
  user_id integer REFERENCES users(id),
  prompt_hash text NOT NULL,
  models jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of model names
  tags jsonb DEFAULT '[]'::jsonb,

  -- Usage tracking
  successful_calls integer DEFAULT 0,
  failed_calls integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  cost_usd numeric(10, 6) DEFAULT 0,

  -- Response storage (JSONB)
  responses jsonb, -- Array of AIResponse objects

  -- Timing and performance
  elapsed_ms integer,
  completed_at timestamp with time zone,

  -- Error tracking
  error_message text,
  error_details jsonb,

  -- Metadata
  metadata jsonb,

  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes for AI Usage Ledger
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX idx_ai_usage_ledger_state
  ON ai_usage_ledger(state, created_at DESC);

CREATE INDEX idx_ai_usage_ledger_user_date
  ON ai_usage_ledger(user_id, created_at DESC);

CREATE INDEX idx_ai_usage_ledger_prompt_hash
  ON ai_usage_ledger(prompt_hash, created_at DESC);

-- Time-based queries for reporting
CREATE INDEX idx_ai_usage_ledger_reserved_at
  ON ai_usage_ledger(reserved_at DESC);

CREATE INDEX idx_ai_usage_ledger_settled_at
  ON ai_usage_ledger(settled_at DESC)
  WHERE settled_at IS NOT NULL;

-- Request tracking
CREATE INDEX idx_ai_usage_ledger_request_id
  ON ai_usage_ledger(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX idx_ai_usage_ledger_correlation_id
  ON ai_usage_ledger(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX idx_ai_usage_ledger_models_gin
  ON ai_usage_ledger USING gin(models);

CREATE INDEX idx_ai_usage_ledger_tags_gin
  ON ai_usage_ledger USING gin(tags);

CREATE INDEX idx_ai_usage_ledger_responses_gin
  ON ai_usage_ledger USING gin(responses);

-- ============================================================================
-- Proposal Workflows Migration: TEXT → JSONB with Generated Columns
-- ============================================================================

-- Note: This is a placeholder for the proposal_workflows table migration.
-- Actual table structure depends on existing schema. The pattern is:
--
-- ALTER TABLE proposal_workflows
--   ADD COLUMN proposal_data jsonb;
--
-- -- Generated columns for backward compatibility and text search
-- ALTER TABLE proposal_workflows
--   ADD COLUMN final_proposal_text text
--   GENERATED ALWAYS AS (proposal_data->>'final_proposal') STORED;
--
-- ALTER TABLE proposal_workflows
--   ADD COLUMN iteration_count integer
--   GENERATED ALWAYS AS (jsonb_array_length(proposal_data->'iterations')) STORED;
--
-- -- Create index on generated columns
-- CREATE INDEX idx_proposal_workflows_final_text
--   ON proposal_workflows USING gin(to_tsvector('english', final_proposal_text));
--
-- CREATE INDEX idx_proposal_workflows_iteration_count
--   ON proposal_workflows(iteration_count);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_ai_usage_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_ai_usage_ledger_updated_at
  BEFORE UPDATE ON ai_usage_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_usage_ledger_updated_at();

-- Function to validate state transitions
CREATE OR REPLACE FUNCTION validate_ai_ledger_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Reserved → Settled
  IF OLD.state = 'reserved' AND NEW.state = 'settled' THEN
    NEW.settled_at = now();
    RETURN NEW;
  END IF;

  -- Reserved → Void
  IF OLD.state = 'reserved' AND NEW.state = 'void' THEN
    NEW.voided_at = now();
    RETURN NEW;
  END IF;

  -- Settled → Void (rare, but allowed for corrections)
  IF OLD.state = 'settled' AND NEW.state = 'void' THEN
    NEW.voided_at = now();
    RETURN NEW;
  END IF;

  -- Invalid transitions
  IF OLD.state = 'void' AND NEW.state != 'void' THEN
    RAISE EXCEPTION 'Cannot transition from void state';
  END IF;

  IF OLD.state = 'settled' AND NEW.state = 'reserved' THEN
    RAISE EXCEPTION 'Cannot transition from settled back to reserved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate state transitions
CREATE TRIGGER trg_validate_ai_ledger_state
  BEFORE UPDATE OF state ON ai_usage_ledger
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION validate_ai_ledger_state_transition();

-- ============================================================================
-- Materialized View for AI Usage Statistics
-- ============================================================================

CREATE MATERIALIZED VIEW ai_usage_daily_stats AS
SELECT
  date_trunc('day', reserved_at) as usage_date,
  user_id,
  state,
  COUNT(*) as request_count,
  SUM(successful_calls) as total_successful_calls,
  SUM(failed_calls) as total_failed_calls,
  SUM(total_tokens) as total_tokens_used,
  SUM(cost_usd) as total_cost_usd,
  AVG(elapsed_ms) as avg_elapsed_ms,
  jsonb_agg(DISTINCT models) FILTER (WHERE models IS NOT NULL) as models_used,
  jsonb_agg(DISTINCT tags) FILTER (WHERE tags IS NOT NULL) as tags_used
FROM ai_usage_ledger
GROUP BY date_trunc('day', reserved_at), user_id, state;

-- Index on the materialized view
CREATE INDEX idx_ai_usage_daily_stats_date
  ON ai_usage_daily_stats(usage_date DESC);

CREATE INDEX idx_ai_usage_daily_stats_user_date
  ON ai_usage_daily_stats(user_id, usage_date DESC);

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE ai_usage_ledger IS
  'Reserve→Settle→Void ledger for AI API call tracking with idempotency';

COMMENT ON COLUMN ai_usage_ledger.idempotency_key IS
  'Unique key for idempotent request handling - prevents duplicate AI calls';

COMMENT ON COLUMN ai_usage_ledger.state IS
  'Ledger state: reserved (pending), settled (completed), void (cancelled/failed)';

COMMENT ON COLUMN ai_usage_ledger.prompt_hash IS
  'SHA-256 hash of the prompt for deduplication and caching';

COMMENT ON COLUMN ai_usage_ledger.responses IS
  'JSONB array of AIResponse objects from all queried models';

COMMENT ON COLUMN ai_usage_ledger.models IS
  'JSONB array of model names queried (claude, gpt, gemini, deepseek)';

COMMENT ON TYPE ai_ledger_state IS
  'States: reserved (initial), settled (success), void (cancelled/error)';

-- ============================================================================
-- Migration Verification Query
-- ============================================================================

-- Run this to verify the migration:
-- SELECT
--   schemaname, tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE tablename IN ('ai_usage_ledger')
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
