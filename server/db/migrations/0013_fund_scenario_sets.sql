-- 0013_fund_scenario_sets.sql
-- ADR-022: fund-scoped scenario set persistence shell.
-- First slice supports fee-profile overrides only; calculation workers ship later.

BEGIN;

CREATE TABLE IF NOT EXISTS fund_scenario_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  source_config_id INTEGER NOT NULL REFERENCES fundconfigs(id),
  source_config_version INTEGER NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_label TEXT,
  updated_by_user_id INTEGER REFERENCES users(id),
  updated_by_label TEXT,
  archived_at TIMESTAMPTZ,
  archived_by_user_id INTEGER REFERENCES users(id),
  archived_by_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fund_scenario_sets_source_config_version_positive
    CHECK (source_config_version >= 1)
);

CREATE INDEX IF NOT EXISTS fund_scenario_sets_fund_active_updated_idx
  ON fund_scenario_sets(fund_id, updated_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fund_scenario_sets_fund_name_active_unique
  ON fund_scenario_sets(fund_id, lower(name))
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS fund_scenario_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_set_id UUID NOT NULL REFERENCES fund_scenario_sets(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  override_type VARCHAR(32) NOT NULL,
  override_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fund_scenario_variants_sort_order_non_negative
    CHECK (sort_order >= 0),
  CONSTRAINT fund_scenario_variants_override_type_check
    CHECK (override_type IN ('fee_profile'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fund_scenario_variants_set_order_unique
  ON fund_scenario_variants(scenario_set_id, sort_order);

CREATE INDEX IF NOT EXISTS fund_scenario_variants_set_order_idx
  ON fund_scenario_variants(scenario_set_id, sort_order, id);

CREATE TABLE IF NOT EXISTS fund_scenario_set_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_set_id UUID NOT NULL REFERENCES fund_scenario_sets(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  actor_label TEXT,
  change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fund_scenario_set_events_type_check
    CHECK (event_type IN ('created', 'updated', 'archived'))
);

CREATE INDEX IF NOT EXISTS fund_scenario_set_events_scenario_created_idx
  ON fund_scenario_set_events(scenario_set_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS fund_scenario_set_events_fund_created_idx
  ON fund_scenario_set_events(fund_id, created_at DESC, id DESC);

COMMIT;
