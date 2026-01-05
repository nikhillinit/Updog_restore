-- Migration: 0002_create_scenario_matrices.sql
-- Created: 2026-01-04
-- Purpose: Monte Carlo MOIC matrix storage with metadata
-- See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 4)
-- See: docs/plans/2026-01-04-critical-corrections.md (Corrections #1, #2)

CREATE TABLE IF NOT EXISTS scenario_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical cache key for scenario matrix (replaces scenario_id FK)
  matrix_key TEXT NOT NULL UNIQUE,
  fund_id TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  matrix_type VARCHAR(50) NOT NULL
    CHECK (matrix_type IN ('moic', 'tvpi', 'dpi', 'irr')),

  -- Correction #2: BYTEA for binary matrix storage (not text/base64)
  -- Store as Buffer directly, reconstruct Float32Array using byteOffset/byteLength
  moic_matrix BYTEA,

  -- Correction #1: All payload fields required when status='complete'
  scenario_states JSONB,
  bucket_params JSONB,
  compression_codec VARCHAR(50) CHECK (compression_codec IN ('zstd', 'lz4', 'none')),
  matrix_layout VARCHAR(50) CHECK (matrix_layout IN ('row-major', 'column-major')),
  bucket_count INTEGER,
  s_opt JSONB,

  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Correction #1: CHECK constraint enforces payload completeness when status='complete'
  CONSTRAINT scenario_matrices_complete_payload CHECK (
    (status != 'complete') OR
    (
      moic_matrix IS NOT NULL AND
      scenario_states IS NOT NULL AND
      bucket_params IS NOT NULL AND
      compression_codec IS NOT NULL AND
      matrix_layout IS NOT NULL AND
      bucket_count IS NOT NULL AND
      s_opt IS NOT NULL
    )
  )
);

-- Index for fund/taxonomy/status queries
CREATE INDEX idx_scenario_matrices_fund_tax_status
  ON scenario_matrices (fund_id, taxonomy_version, status);

-- Index for matrix key lookup
CREATE INDEX idx_scenario_matrices_matrix_key
  ON scenario_matrices (matrix_key);

-- Index for status filtering
CREATE INDEX idx_scenario_matrices_status
  ON scenario_matrices (status);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_scenario_matrices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scenario_matrices_updated_at
  BEFORE UPDATE ON scenario_matrices
  FOR EACH ROW
  EXECUTE FUNCTION update_scenario_matrices_updated_at();

-- Comments
COMMENT ON TABLE scenario_matrices IS 'Monte Carlo MOIC matrices with metadata (S x B dimensional arrays)';
COMMENT ON COLUMN scenario_matrices.moic_matrix IS 'Correction #2: BYTEA storage eliminates 33% base64 overhead and alignment bugs';
COMMENT ON CONSTRAINT scenario_matrices_complete_payload IS 'Correction #1: Enforces all payload fields present when status=complete';
COMMENT ON COLUMN scenario_matrices.scenario_states IS 'Array of {id, params} for S scenarios';
COMMENT ON COLUMN scenario_matrices.bucket_params IS '{min, max, count, distribution} for B buckets';
COMMENT ON COLUMN scenario_matrices.s_opt IS '{algorithm, params, convergence} metadata';
