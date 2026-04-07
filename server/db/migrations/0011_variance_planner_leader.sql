-- 0011_variance_planner_leader.sql
-- Phase 1 (M8 1C.3 follow-ons) Item A: planner-loop leader election heartbeat table.
-- See .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md D-01.
-- Single-row table; the row id is the constant string 'variance-planner'.
-- Atomic takeover via UPDATE ... WHERE lease_expires_at < now() OR instance_id = $me.

BEGIN;

CREATE TABLE IF NOT EXISTS variance_planner_leader (
  id                VARCHAR(64) PRIMARY KEY,
  instance_id       VARCHAR(255) NOT NULL,
  acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  last_renewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variance_planner_leader_lease_expires
  ON variance_planner_leader (lease_expires_at);

COMMIT;
