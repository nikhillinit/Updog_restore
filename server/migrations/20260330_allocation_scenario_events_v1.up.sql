-- Migration: Allocation scenario audit events and header metadata
-- Created: 2026-03-30

CREATE TABLE IF NOT EXISTS allocation_scenario_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  actor_label TEXT,
  note TEXT,
  source_allocation_version INTEGER,
  resulting_allocation_version INTEGER,
  change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT allocation_scenario_events_type_check
    CHECK (event_type IN ('applied', 'synced'))
);

CREATE INDEX IF NOT EXISTS allocation_scenario_events_scenario_created_idx
  ON allocation_scenario_events (scenario_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS allocation_scenario_events_fund_created_idx
  ON allocation_scenario_events (fund_id, created_at DESC, id DESC);

ALTER TABLE allocation_scenarios
  ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_applied_by TEXT,
  ADD COLUMN IF NOT EXISTS last_applied_allocation_version INTEGER,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_by TEXT;
