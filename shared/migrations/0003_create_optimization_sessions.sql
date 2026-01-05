-- Migration: 0003_create_optimization_sessions.sql
-- Created: 2026-01-04
-- Purpose: MILP optimization sessions with two-pass lexicographic tie-break
-- See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 7)
-- See: docs/plans/2026-01-04-critical-corrections.md (Correction #9)

CREATE TABLE IF NOT EXISTS optimization_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id UUID NOT NULL
    REFERENCES scenario_matrices(id) ON DELETE CASCADE,
  optimization_config JSONB NOT NULL,

  -- Correction #9: Two-pass lexicographic MILP for deterministic tie-break
  -- Pass 1: Maximize E[M], store E* and epsilon
  -- Pass 2: Lock E[M] >= E* - epsilon, minimize L1 deviation from uniform
  pass1_e_star DOUBLE PRECISION,
  primary_lock_epsilon DOUBLE PRECISION,

  result_weights JSONB,
  result_metrics JSONB,

  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  current_iteration INTEGER DEFAULT 0,
  total_iterations INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for matrix lookup
CREATE INDEX idx_optimization_sessions_matrix
  ON optimization_sessions (matrix_id);

-- Index for status filtering
CREATE INDEX idx_optimization_sessions_status
  ON optimization_sessions (status);

-- Index for chronological ordering (DESC for most recent first)
CREATE INDEX idx_optimization_sessions_created
  ON optimization_sessions (created_at DESC);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_optimization_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER optimization_sessions_updated_at
  BEFORE UPDATE ON optimization_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_optimization_sessions_updated_at();

-- Comments
COMMENT ON TABLE optimization_sessions IS 'MILP optimization sessions with deterministic two-pass tie-break';
COMMENT ON COLUMN optimization_sessions.pass1_e_star IS 'Correction #9: Pass 1 optimal E[M] value for primary lock constraint';
COMMENT ON COLUMN optimization_sessions.primary_lock_epsilon IS 'Correction #9: Epsilon tolerance for E[M] >= E* - epsilon lock';
COMMENT ON COLUMN optimization_sessions.optimization_config IS '{objective, constraints, algorithm, maxIterations, convergenceTolerance}';
COMMENT ON COLUMN optimization_sessions.result_weights IS 'Final bucket allocation weights (indexed by bucket ID)';
COMMENT ON COLUMN optimization_sessions.result_metrics IS '{expectedReturn, risk, sharpeRatio, cvar}';
