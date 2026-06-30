-- @drift-patch
-- Reason: promote the live allocation-scenario surface (allocation_scenarios + _items + _ic_decisions + _events) from server/migrations (20260330_*/20260406_*) into the canonical Drizzle shape (shared/schema/allocation-scenarios.ts) + journal. These 4 tables are a mounted makeApp prod surface absent from both shape and journal; promotion gives them a canonical home so the server files can retire (PR-2b-3). allocation_scenario_decisions is dead (no consumer) and is intentionally NOT promoted. Additive (CREATE-only); no prod apply.
CREATE TABLE allocation_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  notes text,
  source_allocation_version integer,
  company_count integer NOT NULL DEFAULT 0,
  total_planned_cents bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_applied_at timestamp with time zone,
  last_applied_by text,
  last_applied_allocation_version integer,
  last_synced_at timestamp with time zone,
  last_synced_by text
);
CREATE INDEX allocation_scenarios_fund_updated_idx ON allocation_scenarios (fund_id, updated_at DESC, id DESC);

CREATE TABLE allocation_scenario_items (
  scenario_id uuid NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES portfoliocompanies(id) ON DELETE CASCADE,
  planned_reserves_cents bigint NOT NULL DEFAULT 0,
  allocation_cap_cents bigint,
  allocation_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_id, company_id),
  CONSTRAINT allocation_scenario_items_non_negative_planned CHECK (planned_reserves_cents >= 0),
  CONSTRAINT allocation_scenario_items_non_negative_cap CHECK (allocation_cap_cents IS NULL OR allocation_cap_cents >= 0),
  CONSTRAINT allocation_scenario_items_cap_gte_planned CHECK (allocation_cap_cents IS NULL OR allocation_cap_cents >= planned_reserves_cents)
);
CREATE INDEX allocation_scenario_items_scenario_idx ON allocation_scenario_items (scenario_id, company_id);

CREATE TABLE allocation_scenario_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  event_type varchar(32) NOT NULL,
  actor_user_id integer REFERENCES users(id),
  actor_label text,
  note text,
  source_allocation_version integer,
  resulting_allocation_version integer,
  change_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT allocation_scenario_events_type_check CHECK (event_type IN ('applied', 'synced'))
);
CREATE INDEX allocation_scenario_events_scenario_created_idx ON allocation_scenario_events (scenario_id, created_at DESC, id DESC);
CREATE INDEX allocation_scenario_events_fund_created_idx ON allocation_scenario_events (fund_id, created_at DESC, id DESC);

CREATE TABLE allocation_scenario_ic_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  company_id integer NOT NULL REFERENCES portfoliocompanies(id) ON DELETE CASCADE,
  decision_type varchar(32) NOT NULL,
  decision_status varchar(32) NOT NULL DEFAULT 'draft',
  rationale text NOT NULL,
  proposed_planned_reserves_cents bigint,
  final_planned_reserves_cents bigint,
  decided_by_user_id integer REFERENCES users(id),
  decided_by_label text,
  decided_at timestamp with time zone,
  source_allocation_version integer,
  live_allocation_version integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT allocation_scenario_ic_decisions_unique_company UNIQUE (scenario_id, company_id),
  CONSTRAINT allocation_scenario_ic_decisions_type_check CHECK (decision_type IN ('follow_on', 'defer', 'cut_reserve', 'no_action')),
  CONSTRAINT allocation_scenario_ic_decisions_status_check CHECK (decision_status IN ('draft', 'proposed', 'approved', 'rejected')),
  CONSTRAINT allocation_scenario_ic_decisions_proposed_non_negative CHECK (proposed_planned_reserves_cents IS NULL OR proposed_planned_reserves_cents >= 0),
  CONSTRAINT allocation_scenario_ic_decisions_final_non_negative CHECK (final_planned_reserves_cents IS NULL OR final_planned_reserves_cents >= 0)
);
CREATE INDEX allocation_scenario_ic_decisions_scenario_idx ON allocation_scenario_ic_decisions (scenario_id, company_id);
CREATE INDEX allocation_scenario_ic_decisions_fund_idx ON allocation_scenario_ic_decisions (fund_id, scenario_id, updated_at DESC, id DESC);
