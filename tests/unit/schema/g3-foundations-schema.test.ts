import fs from 'node:fs';
import path from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import * as schemaIndex from '@shared/schema/index';
import {
  fundScenarioCalculationRuns,
  funds,
} from '@shared/schema/fund';
import { fundScenarioCalculationCommands } from '@shared/schema/fund-scenario-calculation-commands';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { releaseCanaryRuns } from '@shared/schema/release-canary';
import { users } from '@shared/schema/user';
import { capitalCallNotificationOutbox } from '@shared/schema/capital-call-notification-outbox';
import { portfolioCompanyUpdateReceipts } from '@shared/schema/portfolio-update-receipts';

const migration = (name: string): string =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf8');

const journal = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'migrations/meta/_journal.json'), 'utf8')
) as { entries: Array<{ idx: number; tag: string }> };

describe('G3 foundations schema', () => {
  it('re-exports every new domain table through both schema barrels', () => {
    for (const table of [
      portfolioCompanyUpdateReceipts,
      releaseCanaryRuns,
      capitalCallNotificationOutbox,
    ]) {
      expect(Object.values(schema)).toContain(table);
      expect(Object.values(schemaIndex)).toContain(table);
    }
  });

  it('adds optimistic versioning to portfolio companies without changing fund nullability', () => {
    const config = getTableConfig(portfolioCompanies);
    expect(config.columns.map((column) => column.name)).toContain('row_version');
    expect(config.columns.map((column) => column.name)).toContain('updated_at');
    expect(config.columns.find((column) => column.name === 'row_version')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
    expect(config.columns.find((column) => column.name === 'updated_at')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
    expect(config.columns.find((column) => column.name === 'fund_id')?.notNull).toBe(false);
  });

  it('uses explicit portfolio replay fields and a four-part idempotency key', () => {
    const config = getTableConfig(portfolioCompanyUpdateReceipts);
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'company_id',
      'actor_id',
      'idempotency_key',
      'request_hash',
      'response_id',
      'response_fund_id',
      'response_name',
      'response_sector',
      'response_stage',
      'response_current_stage',
      'response_investment_amount',
      'response_investment_date',
      'response_current_valuation',
      'response_founded_year',
      'response_company_status',
      'response_description',
      'response_deal_tags',
      'response_created_at',
      'response_deployed_reserves_cents',
      'response_planned_reserves_cents',
      'response_exit_moic_bps',
      'response_exit_probability',
      'response_ownership_current_pct',
      'response_allocation_cap_cents',
      'response_allocation_reason',
      'response_allocation_iteration',
      'response_last_allocation_at',
      'response_allocation_version',
      'response_status',
      'response_row_version',
      'response_updated_at',
      'created_at',
    ]);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'portfolio_company_update_receipts_scope_unique'
    );
    expect(config.columns.map((column) => column.name)).not.toContain('response_body');
  });

  it('keeps calculation deadlines nullable and column-only', () => {
    const deadline = getTableConfig(fundScenarioCalculationRuns).columns.find(
      (column) => column.name === 'deadline_at'
    );
    expect(deadline).toMatchObject({ notNull: false, hasDefault: false });
  });

  it('defines durable calculation commands with scoped idempotency and lifecycle fences', () => {
    const config = getTableConfig(fundScenarioCalculationCommands);
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'scenario_set_id',
      'idempotency_key',
      'request_hash',
      'status',
      'run_id',
      'correlation_id',
      'response_status',
      'response_body',
      'attempt_count',
      'lease_token',
      'lease_expires_at',
      'failure_code',
      'created_by_user_id',
      'created_by_label',
      'version',
      'created_at',
      'updated_at',
    ]);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'fund_scenario_calc_commands_scope_unique'
    );
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        'fund_scenario_calc_commands_status_check',
        'fund_scenario_calc_commands_hash_check',
        'fund_scenario_calc_commands_response_check',
        'fund_scenario_calc_commands_lease_check',
        'fund_scenario_calc_commands_attempt_check',
        'fund_scenario_calc_commands_version_check',
      ])
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      'fund_scenario_calc_commands_status_idx'
    );
  });

  it('pins canary principal, fund origin, and release run lifecycle shape', () => {
    const userConfig = getTableConfig(users);
    const canaryFlag = userConfig.columns.find(
      (column) => column.name === 'is_release_canary_principal'
    );
    expect(canaryFlag).toMatchObject({ notNull: true, hasDefault: true });

    const fundConfig = getTableConfig(funds);
    expect(fundConfig.columns.find((column) => column.name === 'data_origin')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
    expect(fundConfig.columns.find((column) => column.name === 'canary_run_id')?.notNull).toBe(
      false
    );
    expect(fundConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'funds_canary_run_id_unique'
    );

    const canaryConfig = getTableConfig(releaseCanaryRuns);
    expect(canaryConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'release_version',
      'release_sha',
      'deployment_id',
      'worker_deployment_id',
      'correlation_id',
      'workflow_run_id',
      'workflow_run_attempt',
      'principal_user_id',
      'status',
      'version',
      'started_at',
      'completed_at',
      'failed_at',
      'expires_at',
      'purged_at',
      'portfolio_company_residue_count',
      'fund_residue_count',
      'fund_config_residue_count',
      'fund_event_residue_count',
      'notification_residue_count',
      'grant_residue_count',
      'calculation_residue_count',
      'mutation_receipt_residue_count',
      'scenario_residue_count',
      'reporting_residue_count',
      'total_residue_count',
      'created_at',
      'updated_at',
    ]);
    expect(canaryConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      'release_canary_runs_principal_user_id_users_id_fk'
    );
    expect(canaryConfig.columns.map((column) => column.name)).toContain('workflow_run_id');
    expect(canaryConfig.columns.map((column) => column.name)).toContain('workflow_run_attempt');
    expect(canaryConfig.checks.map((constraint) => constraint.name)).toContain(
      'release_canary_runs_workflow_identity_check'
    );
    expect(canaryConfig.indexes.map((index) => index.config.name)).toContain(
      'release_canary_runs_workflow_identity_unique'
    );
  });

  it('pins durable capital-call dedupe, explicit payload, and exhausted status', () => {
    const config = getTableConfig(capitalCallNotificationOutbox);
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'capital_call_id',
      'lp_id',
      'transition_kind',
      'due_date_bucket',
      'notification_type',
      'title',
      'message',
      'related_entity_type',
      'related_entity_id',
      'action_url',
      'status',
      'attempt_count',
      'next_attempt_at',
      'last_attempt_at',
      'delivered_at',
      'last_error',
      'created_at',
      'updated_at',
    ]);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'capital_call_notification_outbox_dedupe_unique'
    );
    expect(config.checks.map((check) => check.name)).toContain(
      'capital_call_notification_outbox_status_check'
    );
  });

  it('keeps migrations additive, replay-safe, and pinned to their own journal entries', () => {
    const migration0050 = migration('0050_g3_portfolio_and_calculation_schema.sql');
    const migration0051 = migration('0051_g3_canary_schema.sql');
    const migration0052 = migration('0052_g3_capital_call_notification_outbox.sql');
    const migration0053 = migration('0053_g3_release_gate_hardening.sql');

    expect(migration0050).toContain('-- @drift-patch');
    expect(migration0050).toContain('ADD COLUMN IF NOT EXISTS "row_version"');
    expect(migration0050).toContain('ADD COLUMN IF NOT EXISTS "updated_at"');
    expect(migration0050).toContain('ADD COLUMN IF NOT EXISTS "deadline_at"');
    expect(migration0050).not.toMatch(/fund_id[^\n]+SET NOT NULL/i);
    expect(migration0050).not.toContain('response_body');
    expect(migration0051).toContain('CREATE TABLE IF NOT EXISTS "release_canary_runs"');
    expect(migration0051).toContain('is_release_canary_principal');
    expect(migration0052).toContain(
      'CREATE TABLE IF NOT EXISTS "capital_call_notification_outbox"'
    );
    expect(migration0052).toContain("'exhausted'");
    expect(migration0052).not.toContain('"payload" jsonb');
    expect(migration0053).toContain('-- @drift-patch');
    expect(migration0053).toContain(
      'CREATE TABLE IF NOT EXISTS "fund_scenario_calculation_commands"'
    );
    expect(migration0053).toContain('queued_event_recorded_at');
    expect(migration0053).toContain('calculation_queued');
    expect(migration0053).toContain('release_canary_runs_workflow_identity_unique');
    expect(migration0053).toContain('release_canary_runs_residue_count_check');
    expect(migration0053).toContain('ADD COLUMN IF NOT EXISTS "grant_residue_count"');
    expect(migration0053).not.toMatch(/DELETE\s+FROM|UPDATE\s+fund_scenario_set_events/i);

    for (const [idx, tag] of [
      [51, '0050_g3_portfolio_and_calculation_schema'],
      [52, '0051_g3_canary_schema'],
      [53, '0052_g3_capital_call_notification_outbox'],
      [54, '0053_g3_release_gate_hardening'],
    ] as const) {
      expect(
        journal.entries
          .filter((entry) => entry.tag === tag)
          .map(({ idx: entryIdx, tag: entryTag }) => ({ idx: entryIdx, tag: entryTag }))
      ).toEqual([{ idx, tag }]);
    }
  });
});
