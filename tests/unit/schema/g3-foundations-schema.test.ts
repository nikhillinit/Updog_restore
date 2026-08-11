import fs from 'node:fs';
import path from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import { fundScenarioCalculationRuns, funds } from '@shared/schema/fund';
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
  it('re-exports every new domain table through the canonical schema barrel', () => {
    for (const table of [
      portfolioCompanyUpdateReceipts,
      releaseCanaryRuns,
      capitalCallNotificationOutbox,
    ]) {
      expect(Object.values(schema)).toContain(table);
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
      'total_residue_count',
      'created_at',
      'updated_at',
    ]);
    expect(canaryConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      'release_canary_runs_principal_user_id_users_id_fk'
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

    for (const [idx, tag] of [
      [51, '0050_g3_portfolio_and_calculation_schema'],
      [52, '0051_g3_canary_schema'],
      [53, '0052_g3_capital_call_notification_outbox'],
    ] as const) {
      expect(
        journal.entries
          .filter((entry) => entry.tag === tag)
          .map(({ idx: entryIdx, tag: entryTag }) => ({ idx: entryIdx, tag: entryTag }))
      ).toEqual([{ idx, tag }]);
    }
  });
});
