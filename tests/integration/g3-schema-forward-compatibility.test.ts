import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const skipIfNoDocker = !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let connectionString: string | undefined;
let pool: Pool | undefined;
let closeApplicationPool: (() => Promise<void>) | undefined;

describe.skipIf(skipIfNoDocker)('G3 schema forward compatibility', () => {
  beforeAll(async () => {
    const configuredConnectionString = process.env.TEST_DATABASE_URL;
    let databaseUrl = configuredConnectionString;
    if (!databaseUrl) {
      postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('g3_schema_forward_compatibility')
        .withUsername('test_user')
        .withPassword('test_password')
        .withStartupTimeout(STARTUP_TIMEOUT_MS)
        .start();
      databaseUrl = postgres.getConnectionUri();
    }
    connectionString = databaseUrl;

    // Two-stage apply mirrors production: baseline schema stops at 0052, then
    // 0053 applies on top — proving the precursor lands cleanly on a 0052 base
    // before any application code runs against the expanded schema.
    await runMigrationsWithConnectionString(
      databaseUrl,
      '0052_g3_capital_call_notification_outbox'
    );
    await runMigrationsWithConnectionString(
      databaseUrl,
      '0053_g3_release_gate_hardening'
    );
    pool = new Pool({ connectionString: databaseUrl, max: 1 });

    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      USE_REAL_DB_IN_VITEST: '1',
      RELEASE_CANARY_TTL_HOURS: '24',
      RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE: '100',
      RELEASE_CANARY_MAX_FUND_RESIDUE: '100',
      RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE: '100',
      RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE: '100',
      RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE: '100',
      RELEASE_CANARY_MAX_TOTAL_RESIDUE: '1000',
    });

    const { fundPersistenceService } = await import(
      '../../server/services/fund-persistence-service'
    );
    const { getReserveScenarioCalculationIdentity } = await import(
      '../../server/services/fund-scenario-reserve-calculation-service'
    );
    const { closeDatabasePool } = await import('../../server/db');
    closeApplicationPool = closeDatabasePool;

    await pool.query(`
      INSERT INTO users (username, password, role, is_release_canary_principal)
      VALUES
        ('g3-forward-compat-ordinary', 'test-password', 'partner', false),
        ('g3-forward-compat-canary', 'test-password', 'partner', true)
    `);

    const ordinaryUser = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE username = 'g3-forward-compat-ordinary'`
    );
    const canaryUser = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE username = 'g3-forward-compat-canary'`
    );

    const ordinary = await fundPersistenceService.createFundWithInitialDraft(
      {
        name: 'G3 ordinary compatibility fund',
        size: '1000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
        creatorUserId: ordinaryUser.rows[0]!.id,
      },
      { fundName: 'G3 ordinary compatibility fund', modelInputsAsOfDate: '2026-01-01' }
    );
    const canary = await fundPersistenceService.createFundWithInitialDraft(
      {
        name: 'G3 canary compatibility fund',
        size: '1000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
        creatorUserId: canaryUser.rows[0]!.id,
      },
      { fundName: 'G3 canary compatibility fund', modelInputsAsOfDate: '2026-01-01' }
    );

    await pool.query(
      `
        UPDATE fundconfigs
        SET is_draft = false, is_published = true, published_at = now()
        WHERE id IN ($1, $2)
      `,
      [ordinary.draft.id, canary.draft.id]
    );

    const scenarioSet = await pool.query<{ id: string }>(
      `
        INSERT INTO fund_scenario_sets
          (fund_id, name, description, source_config_id, source_config_version, created_by_user_id, created_by_label)
        VALUES ($1, 'Legacy reserve scenario', 'Forward compatibility fixture', $2, 1, $3, 'legacy-test')
        RETURNING id
      `,
      [ordinary.fund.id, ordinary.draft.id, ordinaryUser.rows[0]!.id]
    );
    const scenarioSetId = scenarioSet.rows[0]!.id;
    await pool.query(
      `
        INSERT INTO fund_scenario_variants
          (scenario_set_id, name, description, sort_order, override_type, override_payload)
        VALUES ($1, 'Reserve baseline', 'Legacy reserve variant', 0, 'reserve_allocation',
                '{"items": [{"companyId": 1, "plannedReservesCents": 0}]}'::jsonb)
      `,
      [scenarioSetId]
    );

    const calculationIdentity = await getReserveScenarioCalculationIdentity(
      ordinary.fund.id,
      scenarioSetId
    );
    const correlationId = '11111111-1111-4111-8111-111111111111';
    const run = await pool.query<{ id: string }>(
      `
        INSERT INTO fund_scenario_calculation_runs
          (fund_id, scenario_set_id, source_config_id, source_config_version,
           calculation_mode, override_type, input_hash, hash_kind,
           model_inputs_as_of_date, comparison_lineage_version, job_id,
           correlation_id, status)
        VALUES ($1, $2, $3, $4, 'async_reserve_allocation', 'reserve_allocation', $5,
                $6, $7::date, $8, $9, $10, 'queued')
        RETURNING id
      `,
      [
        ordinary.fund.id,
        scenarioSetId,
        calculationIdentity.sourceConfigId,
        calculationIdentity.sourceConfigVersion,
        calculationIdentity.inputHash,
        calculationIdentity.inputLineage.hashKind,
        calculationIdentity.inputLineage.modelInputsAsOfDate,
        calculationIdentity.inputLineage.comparisonLineageVersion,
        `legacy-${ordinary.fund.id}-${scenarioSetId}`,
        correlationId,
      ]
    );
    await pool.query(
      `
        INSERT INTO fund_scenario_set_events
          (scenario_set_id, fund_id, event_type, actor_user_id, actor_label, change_summary_json)
        VALUES ($1, $2, 'calculation_queued', $3, 'legacy-test', $4::jsonb)
      `,
      [
        scenarioSetId,
        ordinary.fund.id,
        ordinaryUser.rows[0]!.id,
        JSON.stringify({ correlation_id: correlationId, job_id: `legacy-${run.rows[0]!.id}` }),
      ]
    );

    // Replay 0053 raw AFTER legacy-shaped run/event fixtures exist: proves the
    // guarded statements are replay-safe AND exercises the backfill against
    // real matching historic queued events (marker populated from event time).
    const migration = await readFile(
      'migrations/0053_g3_release_gate_hardening.sql',
      'utf8'
    );
    await pool.query(migration.replaceAll('--> statement-breakpoint', '\n'));

    const { getFundScenarioCalculationStatus } = await import(
      '../../server/services/fund-scenario-calculation-status-service'
    );
    const status = await getFundScenarioCalculationStatus(ordinary.fund.id, scenarioSetId);
    expect(status).toMatchObject({
      status: 'queued',
      correlationId,
      jobId: `legacy-${ordinary.fund.id}-${scenarioSetId}`,
    });
  }, STARTUP_TIMEOUT_MS * 3);

  afterAll(async () => {
    await closeApplicationPool?.();
    await pool?.end();
    await postgres?.stop();
  });

  it('keeps legacy fund, canary, draft, scenario, and reserve writes readable after expand', async () => {
    expect(pool).toBeDefined();

    const funds = await pool!.query<{
      data_origin: string;
      canary_run_id: string | null;
    }>(
      `
        SELECT data_origin, canary_run_id
        FROM funds
        WHERE name IN ('G3 ordinary compatibility fund', 'G3 canary compatibility fund')
        ORDER BY name
      `
    );
    expect(funds.rows).toEqual([
      { data_origin: 'release_canary', canary_run_id: expect.any(String) },
      { data_origin: 'production', canary_run_id: null },
    ]);

    const compatibility = await pool!.query<{
      queued_event_recorded_at: Date | null;
    }>(
      `
        SELECT queued_event_recorded_at
        FROM fund_scenario_calculation_runs
        WHERE correlation_id = '11111111-1111-4111-8111-111111111111'
      `
    );
    expect(compatibility.rows[0]).toMatchObject({
      queued_event_recorded_at: expect.any(Date),
    });

    const canary = await pool!.query<{
      workflow_run_id: string | null;
      workflow_run_attempt: number | null;
      grant_residue_count: number;
      calculation_residue_count: number;
      mutation_receipt_residue_count: number;
      scenario_residue_count: number;
      reporting_residue_count: number;
    }>(
      `
        SELECT workflow_run_id, workflow_run_attempt,
          grant_residue_count, calculation_residue_count,
          mutation_receipt_residue_count, scenario_residue_count, reporting_residue_count
        FROM release_canary_runs
        ORDER BY created_at DESC
        LIMIT 1
      `
    );
    expect(canary.rows[0]).toEqual({
      workflow_run_id: null,
      workflow_run_attempt: null,
      grant_residue_count: 0,
      calculation_residue_count: 0,
      mutation_receipt_residue_count: 0,
      scenario_residue_count: 0,
      reporting_residue_count: 0,
    });

    const restartedPool = new Pool({ connectionString, max: 1 });
    try {
      const reread = await restartedPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM fund_scenario_sets WHERE name = 'Legacy reserve scenario'`
      );
      expect(reread.rows[0]?.count).toBe('1');
    } finally {
      await restartedPool.end();
    }
  });
});
