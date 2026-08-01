import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
  runReconciliation,
  splitSqlStatements,
} from '../../scripts/reconcile-prod-schema.mjs';
import { assertApplyPolicyForManifests } from '../../scripts/prod-schema-apply-policy.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 60_000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

interface ManifestTable {
  readonly name: string;
  readonly constraints?: readonly string[];
}

interface Manifest {
  readonly name: string;
  readonly order: number;
  readonly sqlFiles: readonly string[];
  readonly expectedTables?: readonly ManifestTable[];
}

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let h9Manifest: Manifest | undefined;
let allocationManifest: Manifest | undefined;
let substrateShadowManifest: Manifest | undefined;
let currentForecastManifest: Manifest | undefined;
let positionsOwnershipManifest: Manifest | undefined;
let identityManifest: Manifest | undefined;
let companyScenarioCreateManifest: Manifest | undefined;
let businessTimeComparisonManifest: Manifest | undefined;
let baseConnectionString = '';

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Postgres pool has not been initialized');
  }
  return pool;
}

function requireManifest(manifest: Manifest | undefined, tableName: string): Manifest {
  if (!manifest) {
    throw new Error(`Manifest containing ${tableName} was not loaded`);
  }
  return manifest;
}

function findManifest(manifests: readonly Manifest[], tableName: string): Manifest {
  return requireManifest(
    manifests.find((manifest) =>
      manifest.expectedTables?.some((table) => table.name === tableName)
    ),
    tableName
  );
}

function connectionStringForDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function applyManifest(activePool: Pool, manifest: Manifest): Promise<void> {
  for (const sqlFile of manifest.sqlFiles) {
    const sql = await readFile(path.resolve(REPO_ROOT, sqlFile), 'utf8');
    for (const statement of splitSqlStatements(sql)) {
      await activePool.query(statement);
    }
  }
}

describe.skipIf(skipIfNoDocker)('prod schema partial-drift reconciliation', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();

    baseConnectionString = postgres.getConnectionUri();
    await runMigrationsWithConnectionString(baseConnectionString);
    pool = new Pool({ connectionString: baseConnectionString, max: 1 });

    const manifests = (await loadManifests()) as Manifest[];
    h9Manifest = findManifest(manifests, 'pacing_history');
    allocationManifest = findManifest(manifests, 'allocation_scenarios');
    substrateShadowManifest = findManifest(manifests, 'substrate_shadow_reconciliations');
    currentForecastManifest = findManifest(manifests, 'current_forecast_references');
    positionsOwnershipManifest = manifests.find(
      (manifest) => manifest.name === 'positions-ownership-compat'
    );
    identityManifest = manifests.find(
      (manifest) => manifest.name === 'user-identity-grants-revocation'
    );
    companyScenarioCreateManifest = manifests.find(
      (manifest) => manifest.name === 'company-scenario-create-requests'
    );
    businessTimeComparisonManifest = manifests.find(
      (manifest) => manifest.name === 'business-time-comparison-lineage'
    );
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
  });

  it(
    'manifest 19 additively converges identity grants and revocation from pre-0031',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(identityManifest, 'user_fund_grants');
      const databaseName = 'prod_like_pre_0031_identity';
      const databaseConnectionString = connectionStringForDatabase(
        baseConnectionString,
        databaseName
      );
      let isolatedPool: Pool | undefined;

      await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await activePool.query(`CREATE DATABASE ${databaseName}`);

      try {
        await runMigrationsWithConnectionString(
          databaseConnectionString,
          '0030_allocation_scenarios_reconcile_drift'
        );
        isolatedPool = new Pool({ connectionString: databaseConnectionString, max: 1 });

        const result = await runReconciliation({
          client: isolatedPool,
          manifests: [manifest],
          apply: true,
          stdout: { write: () => undefined },
        });
        expect(result.applied).toContain('user-identity-grants-revocation');

        const tableResult = await isolatedPool.query<{ name: string | null }>(`
          SELECT to_regclass('public.user_fund_grants')::text AS name
          UNION ALL
          SELECT to_regclass('public.revoked_tokens')::text
        `);
        expect(tableResult.rows.map((row) => row.name)).toEqual([
          'user_fund_grants',
          'revoked_tokens',
        ]);

        const columnResult = await isolatedPool.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = ANY(
              ARRAY['role', 'is_active', 'password_updated_at']::text[]
            )
          ORDER BY column_name
        `);
        expect(columnResult.rows).toEqual([
          { column_name: 'is_active', data_type: 'boolean', is_nullable: 'NO' },
          {
            column_name: 'password_updated_at',
            data_type: 'timestamp with time zone',
            is_nullable: 'NO',
          },
          { column_name: 'role', data_type: 'character varying', is_nullable: 'NO' },
        ]);

        const constraintResult = await isolatedPool.query<{ conname: string }>(`
          SELECT conname
          FROM pg_constraint
          WHERE conname = ANY(
            ARRAY[
              'users_role_check',
              'user_fund_grants_pkey',
              'user_fund_grants_user_id_users_id_fk',
              'user_fund_grants_fund_id_funds_id_fk',
              'revoked_tokens_pkey',
              'revoked_tokens_user_id_users_id_fk'
            ]::text[]
          )
          ORDER BY conname
        `);
        expect(constraintResult.rows.map((row) => row.conname)).toEqual([
          'revoked_tokens_pkey',
          'revoked_tokens_user_id_users_id_fk',
          'user_fund_grants_fund_id_funds_id_fk',
          'user_fund_grants_pkey',
          'user_fund_grants_user_id_users_id_fk',
          'users_role_check',
        ]);

        const indexResult = await isolatedPool.query<{ name: string | null }>(
          "SELECT to_regclass('public.revoked_tokens_expires_at_idx')::text AS name"
        );
        expect(indexResult.rows).toEqual([{ name: 'revoked_tokens_expires_at_idx' }]);
        expect((await auditManifest(isolatedPool, manifest)).action).toBe(ACTION_SKIP);

        const replay = await runReconciliation({
          client: isolatedPool,
          manifests: [manifest],
          apply: true,
          stdout: { write: () => undefined },
        });
        expect(replay.applied).toEqual([]);
      } finally {
        await isolatedPool?.end();
        await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      }
    },
    TEST_TIMEOUT_MS * 2
  );

  it(
    'manifest 20 additively converges company scenario create requests from pre-0033',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(
        companyScenarioCreateManifest,
        'company_scenario_create_requests'
      );
      const databaseName = 'prod_like_pre_0033_company_requests';
      const databaseConnectionString = connectionStringForDatabase(
        baseConnectionString,
        databaseName
      );
      let isolatedPool: Pool | undefined;

      await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await activePool.query(`CREATE DATABASE ${databaseName}`);

      try {
        await runMigrationsWithConnectionString(
          databaseConnectionString,
          '0032_scenario_case_seed_provenance'
        );
        isolatedPool = new Pool({ connectionString: databaseConnectionString, max: 1 });

        const result = await runReconciliation({
          client: isolatedPool,
          manifests: [manifest],
          apply: true,
          stdout: { write: () => undefined },
        });
        expect(result.applied).toContain('company-scenario-create-requests');

        const tableResult = await isolatedPool.query<{ name: string | null }>(
          "SELECT to_regclass('public.company_scenario_create_requests')::text AS name"
        );
        expect(tableResult.rows).toEqual([{ name: 'company_scenario_create_requests' }]);
        expect((await auditManifest(isolatedPool, manifest)).action).toBe(ACTION_SKIP);

        const replay = await runReconciliation({
          client: isolatedPool,
          manifests: [manifest],
          apply: true,
          stdout: { write: () => undefined },
        });
        expect(replay.applied).toEqual([]);
      } finally {
        await isolatedPool?.end();
        await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      }
    },
    TEST_TIMEOUT_MS * 2
  );

  it(
    'manifest 21 exposes legacy index drift and refuses non-additive apply from pre-0034',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(businessTimeComparisonManifest, 'calc_runs');
      const databaseName = 'prod_like_pre_0034_business_time';
      const databaseConnectionString = connectionStringForDatabase(
        baseConnectionString,
        databaseName
      );
      let isolatedPool: Pool | undefined;

      await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await activePool.query(`CREATE DATABASE ${databaseName}`);

      try {
        await runMigrationsWithConnectionString(
          databaseConnectionString,
          '0033_company_scenario_create_requests'
        );
        isolatedPool = new Pool({ connectionString: databaseConnectionString, max: 1 });

        const legacyIndex = await isolatedPool.query<{ definition: string }>(`
          SELECT pg_get_indexdef('public.fund_scenario_calc_runs_active_dedup_idx'::regclass)
            AS definition
        `);
        expect(legacyIndex.rows[0]?.definition).toContain(
          '(scenario_set_id, source_config_id, source_config_version, input_hash)'
        );
        expect(legacyIndex.rows[0]?.definition).not.toContain('COALESCE(hash_kind');

        const audit = await auditManifest(isolatedPool, manifest);
        expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
        expect(
          audit.objects
            .flatMap((object) => object.deltas)
            .map((delta) => ({ kind: delta.kind, name: delta.name }))
        ).toEqual(
          expect.arrayContaining([
            { kind: 'missing-column', name: 'calc_runs.model_inputs_as_of_date' },
            { kind: 'missing-column', name: 'calc_runs.comparison_lineage_version' },
            {
              kind: 'missing-column',
              name: 'fund_scenario_calculation_runs.hash_kind',
            },
            {
              kind: 'index-definition-mismatch',
              name: 'fund_scenario_calc_runs_active_dedup_idx',
            },
          ])
        );

        expect(() =>
          assertApplyPolicyForManifests({
            manifests: [manifest],
            applyingManifestNames: new Set([manifest.name]),
          })
        ).toThrowError(
          expect.objectContaining({
            details: {
              kind: 'apply-policy-violation',
              violations: expect.arrayContaining([expect.objectContaining({ kind: 'drop-index' })]),
            },
          })
        );

        const unchangedColumns = await isolatedPool.query<{
          table_name: string;
          column_name: string;
        }>(`
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (
                table_name = 'calc_runs'
                AND column_name = ANY(
                  ARRAY[
                    'model_inputs_as_of_date',
                    'comparison_lineage_version'
                  ]::text[]
                )
              )
              OR (
                table_name = 'fund_scenario_calculation_runs'
                AND column_name = ANY(
                  ARRAY[
                    'model_inputs_as_of_date',
                    'comparison_lineage_version',
                    'hash_kind'
                  ]::text[]
                )
              )
            )
          ORDER BY table_name, column_name
        `);
        expect(unchangedColumns.rows).toEqual([]);

        const unchangedIndex = await isolatedPool.query<{ definition: string }>(`
          SELECT pg_get_indexdef('public.fund_scenario_calc_runs_active_dedup_idx'::regclass)
            AS definition
        `);
        expect(unchangedIndex.rows[0]?.definition).not.toContain('COALESCE(hash_kind');
      } finally {
        await isolatedPool?.end();
        await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      }
    },
    TEST_TIMEOUT_MS * 2
  );

  it(
    'production-like 0035 database converges M9 through M17 in apply order',
    async () => {
      const activePool = requirePool();
      const databaseName = 'prod_like_0035_reconcile';
      const databaseConnectionString = connectionStringForDatabase(
        baseConnectionString,
        databaseName
      );
      let isolatedPool: Pool | undefined;

      await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await activePool.query(`CREATE DATABASE ${databaseName}`);

      try {
        await runMigrationsWithConnectionString(
          databaseConnectionString,
          '0035_substrate_shadow_reconciliations'
        );
        isolatedPool = new Pool({ connectionString: databaseConnectionString, max: 1 });
        const manifests = ((await loadManifests()) as Manifest[]).filter(
          (manifest) => manifest.order <= 21
        );

        await isolatedPool.query(`
          WITH inserted_fund AS (
            INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
            VALUES ('Prod-like reconcile fund', 1000000, 0.02, 0.20, 2026)
            RETURNING id
          )
          INSERT INTO substrate_shadow_reconciliations (
            fund_id,
            calculation_key,
            configured_mode,
            effective_mode,
            kill_switch_active,
            substrate_state,
            reconciliation_status,
            input_hash,
            result_hash,
            assumptions_hash,
            mismatches
          )
          SELECT
            id,
            'proof',
            'off',
            'off',
            false,
            'available',
            'match',
            'input-hash',
            'result-hash',
            'assumptions-hash',
            '[]'::jsonb
          FROM inserted_fund
        `);

        const output: string[] = [];
        const result = await runReconciliation({
          client: isolatedPool,
          manifests,
          apply: true,
          stdout: { write: (chunk: string) => output.push(chunk) },
        });

        expect(result.applied).toEqual([
          'substrate-shadow-reconciliations',
          'financial-facts-snapshots',
          'current-plan-versions',
          'current-forecast-references',
          'financial-observations',
          'investment-ledger',
          'vehicle-financing-participations',
          'positions-ownership-compat',
          'position-source-basis-reliefs',
          'internal-analysis',
        ]);

        const postAudits = await Promise.all(
          manifests.map((manifest) => auditManifest(isolatedPool!, manifest))
        );
        expect(postAudits.map((audit) => audit.action)).toEqual(manifests.map(() => ACTION_SKIP));

        const replay = await runReconciliation({
          client: isolatedPool,
          manifests,
          apply: true,
          stdout: { write: (chunk: string) => output.push(chunk) },
        });
        expect(replay.applied).toEqual([]);

        const tableResult = await isolatedPool.query<{ regclass: string | null }>(
          "SELECT to_regclass('public.position_event_source_basis_reliefs')::text AS regclass"
        );
        expect(tableResult.rows).toEqual([{ regclass: 'position_event_source_basis_reliefs' }]);

        const sourceBasisTable = manifests
          .flatMap((manifest) => manifest.expectedTables ?? [])
          .find((table) => table.name === 'position_event_source_basis_reliefs');
        if (!sourceBasisTable?.constraints) {
          throw new Error(
            'Manifest constraints for position_event_source_basis_reliefs were not loaded'
          );
        }

        const constraintResult = await isolatedPool.query<{ conname: string }>(`
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'public.position_event_source_basis_reliefs'::regclass
          ORDER BY conname
        `);
        expect(constraintResult.rows.map((row) => row.conname)).toEqual(
          [...sourceBasisTable.constraints].sort()
        );

        await expect(
          isolatedPool.query(`
            INSERT INTO substrate_shadow_reconciliations (
              fund_id,
              calculation_key,
              configured_mode,
              effective_mode,
              kill_switch_active,
              substrate_state,
              reconciliation_status,
              input_hash,
              result_hash,
              assumptions_hash,
              mismatches
            )
            SELECT
              id,
              'proof-invalid-null',
              'off',
              'off',
              false,
              'available',
              'match',
              'input-invalid-null',
              null,
              'assumptions-hash',
              '[]'::jsonb
            FROM funds
            WHERE name = 'Prod-like reconcile fund'
          `)
        ).rejects.toThrow();

        await isolatedPool.query(`
          INSERT INTO substrate_shadow_reconciliations (
            fund_id,
            calculation_key,
            configured_mode,
            effective_mode,
            kill_switch_active,
            substrate_state,
            reconciliation_status,
            input_hash,
            result_hash,
            assumptions_hash,
            mismatches
          )
          SELECT
            id,
            'proof-valid-null',
            'off',
            'off',
            false,
            'failed',
            'match',
            'input-valid-null',
            null,
            'assumptions-hash',
            '[]'::jsonb
          FROM funds
          WHERE name = 'Prod-like reconcile fund'
        `);
      } finally {
        await isolatedPool?.end();
        await activePool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      }
    },
    TEST_TIMEOUT_MS * 2
  );

  it(
    'clean journal clone audits SKIP for M6 and M7',
    async () => {
      const activePool = requirePool();

      const h9Audit = await auditManifest(
        activePool,
        requireManifest(h9Manifest, 'fund_calculation_modes')
      );
      const allocationAudit = await auditManifest(
        activePool,
        requireManifest(allocationManifest, 'allocation_scenarios')
      );

      expect(h9Audit.action).toBe(ACTION_SKIP);
      expect(allocationAudit.action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'partial allocation drift repairs additively',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(allocationManifest, 'allocation_scenarios');

      await activePool.query('DROP TABLE IF EXISTS allocation_scenario_items CASCADE');
      await activePool.query(
        'ALTER TABLE allocation_scenarios DROP COLUMN IF EXISTS last_synced_at'
      );
      await activePool.query('DROP INDEX IF EXISTS allocation_scenario_events_fund_created_idx');

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_APPLY_MISSING_DDL);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'partial H9 drift repairs additively',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(h9Manifest, 'fund_calculation_modes');

      await activePool.query(
        'ALTER TABLE fund_calculation_modes DROP COLUMN IF EXISTS h9_policy_version'
      );

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_APPLY_MISSING_DDL);

      await applyManifest(activePool, manifest);
      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'partial substrate-shadow widening drift repairs additively before current forecast replay',
    async () => {
      const activePool = requirePool();
      const substrateManifest = requireManifest(
        substrateShadowManifest,
        'substrate_shadow_reconciliations'
      );
      const forecastManifest = requireManifest(
        currentForecastManifest,
        'current_forecast_references'
      );

      await activePool.query(`
        WITH inserted_fund AS (
          INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
          VALUES ('Substrate widening proof fund', 1000000, 0.02, 0.20, 2026)
          RETURNING id
        )
        INSERT INTO substrate_shadow_reconciliations (
          fund_id,
          calculation_key,
          configured_mode,
          effective_mode,
          kill_switch_active,
          substrate_state,
          reconciliation_status,
          input_hash,
          result_hash,
          assumptions_hash,
          mismatches
        )
        SELECT
          id,
          'proof',
          'off',
          'off',
          false,
          'available',
          'match',
          'input-hash',
          'result-hash',
          'assumptions-hash',
          '[]'::jsonb
        FROM inserted_fund
      `);
      await activePool.query(
        'DROP INDEX IF EXISTS substrate_shadow_reconciliations_fund_key_input_null_hash_unique'
      );
      await activePool.query(`
        ALTER TABLE substrate_shadow_reconciliations
          DROP CONSTRAINT IF EXISTS substrate_shadow_reconciliations_result_hash_state_check
      `);
      await activePool.query(`
        ALTER TABLE substrate_shadow_reconciliations
          DROP CONSTRAINT IF EXISTS substrate_shadow_reconciliations_substrate_state_check
      `);
      await activePool.query(`
        ALTER TABLE substrate_shadow_reconciliations
          ADD CONSTRAINT substrate_shadow_reconciliations_substrate_state_check
          CHECK (substrate_state IN ('available','indicative'))
      `);
      await activePool.query(`
        ALTER TABLE substrate_shadow_reconciliations
          ALTER COLUMN result_hash SET NOT NULL
      `);

      const preApplyAudit = await auditManifest(activePool, substrateManifest);
      expect(preApplyAudit.action).toBe(ACTION_APPLY_MISSING_DDL);
      expect(
        preApplyAudit.objects
          .find((object) => object.table === 'substrate_shadow_reconciliations')
          ?.deltas.map((delta) => delta.kind)
      ).toContain('constraint-definition-mismatch');

      await applyManifest(activePool, substrateManifest);
      expect((await auditManifest(activePool, substrateManifest)).action).toBe(ACTION_SKIP);

      await applyManifest(activePool, forecastManifest);
      expect((await auditManifest(activePool, substrateManifest)).action).toBe(ACTION_SKIP);
      expect((await auditManifest(activePool, forecastManifest)).action).toBe(ACTION_SKIP);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'stale same-name lot-type check repairs on its target table despite a name collision',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(positionsOwnershipManifest, 'investment_lots');
      const constraintName = 'investment_lots_lot_type_check';

      await activePool.query('DROP TABLE IF EXISTS constraint_collision_probe');
      await activePool.query(`
        CREATE TABLE constraint_collision_probe (
          lot_type text,
          CONSTRAINT investment_lots_lot_type_check
            CHECK (lot_type IN ('legacy'))
        )
      `);
      try {
        await activePool.query(`
          ALTER TABLE investment_lots
            DROP CONSTRAINT IF EXISTS investment_lots_lot_type_check
        `);
        await activePool.query(`
          ALTER TABLE investment_lots
            ADD CONSTRAINT investment_lots_lot_type_check
            CHECK (lot_type IN ('initial', 'follow_on', 'secondary'))
        `);

        const preApplyAudit = await auditManifest(activePool, manifest);
        expect(preApplyAudit.action).toBe(ACTION_APPLY_MISSING_DDL);
        expect(
          preApplyAudit.objects.find((object) => object.table === 'investment_lots')?.deltas
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: 'constraint-definition-mismatch',
              name: constraintName,
            }),
          ])
        );

        await applyManifest(activePool, manifest);
        expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_SKIP);

        const targetDefinition = await activePool.query<{ definition: string }>(
          `
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conname = $1
              AND conrelid = 'public.investment_lots'::regclass
          `,
          [constraintName]
        );
        const collisionDefinition = await activePool.query<{ definition: string }>(
          `
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conname = $1
              AND conrelid = 'public.constraint_collision_probe'::regclass
          `,
          [constraintName]
        );
        expect(targetDefinition.rows[0]?.definition).toContain('conversion');
        expect(collisionDefinition.rows[0]?.definition).toContain('legacy');
      } finally {
        await activePool.query('DROP TABLE IF EXISTS constraint_collision_probe');
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'missing H9 base table refuses for human (existing_table_required)',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(h9Manifest, 'pacing_history');

      await activePool.query('DROP TABLE IF EXISTS pacing_history CASCADE');

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_REFUSE_FOR_HUMAN);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'non-additive type change on a populated table does not auto-apply',
    async () => {
      const activePool = requirePool();
      const manifest = requireManifest(allocationManifest, 'allocation_scenarios');

      await activePool.query(`
        WITH inserted_fund AS (
          INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
          VALUES ('Partial drift proof fund', 1000000, 0.02, 0.20, 2026)
          RETURNING id
        )
        INSERT INTO allocation_scenarios (fund_id, name)
        SELECT id, 'Partial drift proof scenario'
        FROM inserted_fund
      `);
      await activePool.query(`
        ALTER TABLE allocation_scenarios
        ALTER COLUMN total_planned_cents TYPE text USING total_planned_cents::text
      `);

      expect((await auditManifest(activePool, manifest)).action).toBe(ACTION_REFUSE_FOR_HUMAN);

      const typeResult = await activePool.query<{ data_type: string }>(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'allocation_scenarios'
          AND column_name = 'total_planned_cents'
      `);
      expect(typeResult.rows).toEqual([{ data_type: 'text' }]);
    },
    TEST_TIMEOUT_MS
  );
});
