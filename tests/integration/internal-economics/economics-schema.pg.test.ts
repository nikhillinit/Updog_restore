/**
 * PostgreSQL proofs for migrations 0045/0046 (WP-L3 Phase A + Trust-Spine PR1).
 *
 * These assert the invariants only a real database can demonstrate:
 * - T-A1: both migrations apply clean through the drizzle migrator (journal
 *   entries asserted by their OWN tags) and raw files replay without error.
 * - T-A2: the internal_economics_forbid_update() trigger web forbids every
 *   UPDATE on the three new tables, forbids UPDATE of INTERNAL_LP_ECONOMICS
 *   fund_snapshots rows in BOTH directions (including laundering another
 *   row INTO the protected type), leaves other snapshot types mutable,
 *   admits child-version corrections, and `DELETE FROM funds` fails on the
 *   FK web (L3-Q2: RESTRICT posture, no live fund-deletion cascade exists).
 * - T-A3: envelope arithmetic CHECKs (exact numeric equality incl. the
 *   trailing-zeros pre-mortem case), runs state-coupling CHECKs, all three
 *   certified trust states, typed snapshot composite FKs, wrong-fund
 *   composite FK rejection, and the one-result-snapshot-per-run partial
 *   unique.
 * - T-A5: manifest 22 audits ACTION_REFUSE_FOR_HUMAN before manual
 *   reconciliation (trigger DDL cannot ride the additive-safe apply path)
 *   and ACTION_SKIP only once the live tgenabled/pg_get_triggerdef wiring
 *   and pg_proc function body match the manifest pins exactly.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
} from '../../../scripts/reconcile-prod-schema.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

const BASE_MIGRATION_TAG = '0045_internal_economics_policy_runs';
const BASE_MIGRATION_FILE = path.join(process.cwd(), 'migrations', `${BASE_MIGRATION_TAG}.sql`);
const CERTIFICATION_MIGRATION_TAG = '0046_internal_economics_certification';
const CERTIFICATION_MIGRATION_FILE = path.join(
  process.cwd(),
  'migrations',
  `${CERTIFICATION_MIGRATION_TAG}.sql`
);
const TRIGGER_NAMES = [
  'internal_capital_envelope_versions_forbid_update_trigger',
  'internal_economics_policy_versions_forbid_update_trigger',
  'internal_lp_economics_runs_forbid_update_trigger',
  'fund_snapshots_internal_economics_forbid_update_trigger',
] as const;

let adminPool: Pool | undefined;
let fundIdCounter = 163_450_000;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('internal economics schema PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  });

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
    if (startedTestContainers) {
      await cleanupTestContainers();
    }
  });

  it('applies migrations 0045/0046 through the migrator and replays both raw files', async () => {
    const { connectionString, state } = await createMigratedDatabase('replay');

    // Journal entry asserted by its OWN tag, never entries.at(-1).
    expect(state.applied.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([BASE_MIGRATION_TAG, CERTIFICATION_MIGRATION_TAG])
    );

    await withPool(connectionString, async (pool) => {
      // Raw replay: every statement is replay-safe by construction.
      await pool.query(await readFile(BASE_MIGRATION_FILE, 'utf8'));
      await pool.query(await readFile(CERTIFICATION_MIGRATION_FILE, 'utf8'));

      const triggers = await pool.query<{ tgname: string; tgenabled: string }>(
        `
          SELECT t.tgname, t.tgenabled
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND NOT t.tgisinternal
            AND t.tgname = ANY($1::text[])
        `,
        [[...TRIGGER_NAMES]]
      );
      expect(triggers.rows.map((row) => row.tgname).sort()).toEqual([...TRIGGER_NAMES].sort());
      expect(triggers.rows.every((row) => row.tgenabled === 'O')).toBe(true);

      const constraint = await pool.query(
        `
          SELECT conname
          FROM pg_constraint
          WHERE conname = 'fund_snapshots_id_type_unique'
            AND conrelid = 'public.fund_snapshots'::regclass
        `
      );
      expect(constraint.rowCount).toBe(1);

      const functions = await pool.query(
        `
          SELECT p.proname
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'internal_economics_forbid_update'
        `
      );
      expect(functions.rowCount).toBe(1);
    });
  });

  it('rolls back every 0046 catalog change and preserves rows when migration fails', async () => {
    const { connectionString } = await createMigratedDatabase('atomic-failure', BASE_MIGRATION_TAG);

    await withPool(connectionString, async (pool) => {
      const basis = await seedRunBasis(pool);
      const runId = await insertRun(pool, basis, {
        idempotencyKey: 'pre-certification-failed-run',
        runState: 'failed',
        resultSnapshotId: null,
        resultSnapshotType: null,
        resultStatus: null,
        resultHash: null,
        failureCode: 'CORE_ROW_MAPPING_MISMATCH',
        failureContext: '{}',
      });

      const migrationSql = await readFile(CERTIFICATION_MIGRATION_FILE, 'utf8');
      const failingMigrationSql = migrationSql.replace(
        'END $$;',
        "RAISE EXCEPTION 'forced_0046_failure';\nEND $$;"
      );
      expect(failingMigrationSql).not.toBe(migrationSql);
      await expect(pool.query(failingMigrationSql)).rejects.toThrow(/forced_0046_failure/);

      const column = await pool.query(
        `
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'internal_lp_economics_runs'
            AND column_name = 'calculation_contract_version'
        `
      );
      expect(column.rowCount).toBe(0);

      const constraint = await pool.query<{ definition: string }>(
        `
          SELECT pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conname = 'internal_lp_economics_runs_result_status_check'
            AND conrelid = 'public.internal_lp_economics_runs'::regclass
        `
      );
      expect(constraint.rows[0]?.definition).not.toContain("'available'");

      const preserved = await pool.query<{ run_state: string; failure_code: string }>(
        `SELECT run_state, failure_code FROM internal_lp_economics_runs WHERE id = $1`,
        [runId]
      );
      expect(preserved.rows).toEqual([
        { run_state: 'failed', failure_code: 'CORE_ROW_MAPPING_MISMATCH' },
      ]);
    });
  });

  it('forbids every UPDATE on the three tables and type-scoped fund_snapshots rows (T-A2)', async () => {
    const { connectionString } = await createMigratedDatabase('immutability');

    await withPool(connectionString, async (pool) => {
      const basis = await seedRunBasis(pool);
      const envelopeId = basis.envelopeId;
      const policyId = basis.policyId;
      const runId = await insertCompletedRun(pool, basis, 'immutable-run');

      await expect(
        pool.query(
          `UPDATE internal_capital_envelope_versions SET lp_commitment_usd = '1.000000' WHERE id = $1`,
          [envelopeId]
        )
      ).rejects.toThrow(/immutable_row_update_forbidden: internal_capital_envelope_versions/);

      await expect(
        pool.query(`UPDATE internal_economics_policy_versions SET version = 99 WHERE id = $1`, [
          policyId,
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: internal_economics_policy_versions/);

      await expect(
        pool.query(`UPDATE internal_lp_economics_runs SET result_hash = $2 WHERE id = $1`, [
          runId,
          hex64('tampered'),
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: internal_lp_economics_runs/);

      // Type-scoped fund_snapshots trigger: protected row cannot be updated...
      await expect(
        pool.query(`UPDATE fund_snapshots SET payload = '{"tampered":true}'::jsonb WHERE id = $1`, [
          basis.resultSnapshotId,
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: fund_snapshots/);

      // ...a row of another type cannot be laundered INTO the protected type...
      const reserveSnapshotId = await seedFundSnapshot(pool, basis.fundId, 'RESERVE');
      await expect(
        pool.query(`UPDATE fund_snapshots SET type = 'INTERNAL_LP_ECONOMICS' WHERE id = $1`, [
          reserveSnapshotId,
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: fund_snapshots/);

      // ...and every other snapshot type keeps its existing mutability.
      await expect(
        pool.query(`UPDATE fund_snapshots SET payload = '{"updated":true}'::jsonb WHERE id = $1`, [
          reserveSnapshotId,
        ])
      ).resolves.toMatchObject({ rowCount: 1 });

      // Corrections are child-version INSERTs, never UPDATEs.
      const childEnvelopeId = await insertEnvelope(pool, {
        fundId: basis.fundId,
        vehicleId: basis.vehicleId,
        sourceArtifactId: basis.sourceArtifactId,
        attestedBy: basis.userId,
        version: 2,
        parentEnvelopeVersionId: envelopeId,
        idempotencyKey: 'envelope-v2',
      });
      expect(childEnvelopeId).toEqual(expect.any(Number));

      // L3-Q2 posture: no live fund-deletion cascade exists to preserve; the
      // FK web (restrict basis pins + fund_snapshots NO ACTION) rejects it.
      await expect(pool.query(`DELETE FROM funds WHERE id = $1`, [basis.fundId])).rejects.toThrow(
        /violates foreign key constraint/
      );
    });
  });

  it('enforces envelope arithmetic, state coupling, typed and fund-scoped FKs (T-A3)', async () => {
    const { connectionString } = await createMigratedDatabase('constraints');

    await withPool(connectionString, async (pool) => {
      const basis = await seedRunBasis(pool);
      const envelopeDefaults = {
        fundId: basis.fundId,
        vehicleId: basis.vehicleId,
        sourceArtifactId: basis.sourceArtifactId,
        attestedBy: basis.userId,
      };

      // lp + gp = total must hold with exact numeric equality.
      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 11,
          idempotencyKey: 'sum-violation',
          lp: '600000.000000',
          gp: '300000.000000',
          total: '1000000.000000',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_commitment_sum_check/);

      // numeric compares by value, not representation (pre-mortem row):
      // trailing zeros and mixed scales still satisfy the equality CHECK.
      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 12,
          idempotencyKey: 'trailing-zeros',
          lp: '600000.10',
          gp: '399999.9',
          total: '1000000.000000',
        })
      ).resolves.toEqual(expect.any(Number));

      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 13,
          idempotencyKey: 'negative-lp',
          lp: '-1.000000',
          gp: '1000001.000000',
          total: '1000000.000000',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_lp_nonnegative_check/);

      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 14,
          idempotencyKey: 'negative-gp',
          lp: '1000001.000000',
          gp: '-1.000000',
          total: '1000000.000000',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_gp_nonnegative_check/);

      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 15,
          idempotencyKey: 'zero-total',
          lp: '0.000000',
          gp: '0.000000',
          total: '0.000000',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_total_positive_check/);

      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 16,
          idempotencyKey: 'non-usd',
          currency: 'EUR',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_currency_check/);

      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 17,
          idempotencyKey: 'self-parent',
          explicitId: 900001,
          parentEnvelopeVersionId: 900001,
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_no_self_parent_check/);

      // Version sequence uniqueness per fund.
      await expect(
        insertEnvelope(pool, {
          ...envelopeDefaults,
          version: 1,
          idempotencyKey: 'duplicate-version',
        })
      ).rejects.toThrow(/internal_capital_envelope_versions_fund_version_unique/);

      // State coupling: completed run without a result snapshot is
      // unrepresentable...
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'completed-without-snapshot',
          runState: 'completed',
          resultSnapshotId: null,
          resultSnapshotType: null,
          resultStatus: 'indicative',
          resultHash: hex64('r'),
          failureCode: null,
          failureContext: null,
        })
      ).rejects.toThrow(/internal_lp_economics_runs_state_coupling_check/);

      // ...as is a failed run carrying one...
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'failed-with-snapshot',
          runState: 'failed',
          resultSnapshotId: basis.resultSnapshotId,
          resultSnapshotType: 'INTERNAL_LP_ECONOMICS',
          resultStatus: null,
          resultHash: null,
          failureCode: 'CORE_ROW_MAPPING_MISMATCH',
          failureContext: '{}',
        })
      ).rejects.toThrow(/internal_lp_economics_runs_state_coupling_check/);

      // Certification migration makes 'available' and contract identity representable.
      const availableBasis = await seedRunBasis(pool);
      await expect(
        insertRun(pool, availableBasis, {
          idempotencyKey: 'available-certified',
          calculationContractVersion: 'lp-economics/1.1.0',
          runState: 'completed',
          resultSnapshotId: availableBasis.resultSnapshotId,
          resultSnapshotType: 'INTERNAL_LP_ECONOMICS',
          resultStatus: 'available',
          resultHash: hex64('r'),
          failureCode: null,
          failureContext: null,
        })
      ).resolves.toEqual(expect.any(Number));

      // Typed snapshot composite FK: a RESERVE row cannot satisfy the
      // CURRENT_FORECAST_V2 pin even when the type literal is asserted.
      const reserveSnapshotId = await seedFundSnapshot(pool, basis.fundId, 'RESERVE');
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'wrong-forecast-type',
          forecastSnapshotId: reserveSnapshotId,
        })
      ).rejects.toThrow(/internal_lp_economics_runs_forecast_snapshot_type_fk/);

      // Wrong-type result snapshot pin rejected the same way.
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'wrong-result-type',
          resultSnapshotId: basis.forecastSnapshotId,
        })
      ).rejects.toThrow(/internal_lp_economics_runs_result_snapshot_type_fk/);

      // Wrong-fund composite FK: another fund's policy is unrepresentable.
      const otherBasis = await seedRunBasis(pool);
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'cross-fund-policy',
          policyVersionId: otherBasis.policyId,
        })
      ).rejects.toThrow(/internal_lp_economics_runs_policy_version_fund_fk/);

      // Exactly one run may pin a result snapshot (partial unique).
      await insertCompletedRun(pool, basis, 'first-result-pin');
      await expect(insertCompletedRun(pool, basis, 'second-result-pin')).rejects.toThrow(
        /internal_lp_economics_runs_result_snapshot_unique/
      );

      // Idempotency-key uniqueness is fund-scoped.
      await expect(
        insertRun(pool, otherBasis, {
          idempotencyKey: 'first-result-pin',
          runState: 'failed',
          resultSnapshotId: null,
          resultSnapshotType: null,
          resultStatus: null,
          resultHash: null,
          failureCode: 'CORE_ROW_MAPPING_MISMATCH',
          failureContext: '{}',
        })
      ).resolves.toEqual(expect.any(Number));
      await expect(
        insertRun(pool, basis, {
          idempotencyKey: 'first-result-pin',
          runState: 'failed',
          resultSnapshotId: null,
          resultSnapshotType: null,
          resultStatus: null,
          resultHash: null,
          failureCode: 'CORE_ROW_MAPPING_MISMATCH',
          failureContext: '{}',
        })
      ).rejects.toThrow(/internal_lp_economics_runs_fund_idempotency_unique/);
    });
  });

  it('manifest 22 REFUSES-FOR-HUMAN pre-reconciliation and SKIPs once live definitions match (T-A5)', async () => {
    const { connectionString } = await createMigratedDatabase('manifest', '0044_internal_analysis');
    const manifests = await loadManifests();
    const manifest = manifests.find(
      (candidate: { name: string }) => candidate.name === 'internal-economics-policy-runs'
    );
    expect(manifest).toBeDefined();

    await withPool(connectionString, async (pool) => {
      // Pre-reconciliation: tables and triggers absent -> REFUSE-FOR-HUMAN,
      // never an automated apply (trigger DDL cannot ride the additive path).
      const before = await auditManifest(pool, manifest);
      expect(before.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      const beforeKinds = before.objects.flatMap((object: { deltas: Array<{ kind: string }> }) =>
        object.deltas.map((delta) => delta.kind)
      );
      expect(beforeKinds).toContain('missing-trigger');
      expect(beforeKinds).toContain('missing-function');

      // Manual reconciliation: the operator applies the journaled migration.
      const migrationSql = await readFile(BASE_MIGRATION_FILE, 'utf8');
      await pool.query(migrationSql);

      const after = await auditManifest(pool, manifest);
      expect(after.action).toBe(ACTION_SKIP);
      for (const object of after.objects) {
        expect(object.deltas, `${object.table} deltas`).toEqual([]);
        expect(object.action, `${object.table} action`).toBe(ACTION_SKIP);
      }

      // Dropped trigger drift -> REFUSE until restored.
      await pool.query(
        `DROP TRIGGER "fund_snapshots_internal_economics_forbid_update_trigger" ON "fund_snapshots"`
      );
      const dropped = await auditManifest(pool, manifest);
      expect(dropped.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      await pool.query(migrationSql);
      expect((await auditManifest(pool, manifest)).action).toBe(ACTION_SKIP);

      // Disabled trigger drift -> REFUSE until re-enabled.
      await pool.query(
        `ALTER TABLE "internal_lp_economics_runs" DISABLE TRIGGER "internal_lp_economics_runs_forbid_update_trigger"`
      );
      const disabled = await auditManifest(pool, manifest);
      expect(disabled.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(
        disabled.objects.some((object: { deltas: Array<{ kind: string }> }) =>
          object.deltas.some((delta) => delta.kind === 'trigger-disabled')
        )
      ).toBe(true);
      await pool.query(
        `ALTER TABLE "internal_lp_economics_runs" ENABLE TRIGGER "internal_lp_economics_runs_forbid_update_trigger"`
      );
      expect((await auditManifest(pool, manifest)).action).toBe(ACTION_SKIP);

      // Function-body drift -> REFUSE until the pinned body is restored.
      await pool.query(`
        CREATE OR REPLACE FUNCTION "internal_economics_forbid_update"() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RETURN NEW;
        END;
        $$;
      `);
      const redefined = await auditManifest(pool, manifest);
      expect(redefined.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(
        redefined.objects.some((object: { deltas: Array<{ kind: string }> }) =>
          object.deltas.some((delta) => delta.kind === 'function-definition-mismatch')
        )
      ).toBe(true);
      await pool.query(migrationSql);
      expect((await auditManifest(pool, manifest)).action).toBe(ACTION_SKIP);
    });
  }, 120_000);

  it('manifest 23 applies additive certification DDL and audits the widened contract', async () => {
    const { connectionString } = await createMigratedDatabase(
      'certification-manifest',
      BASE_MIGRATION_TAG
    );
    const manifests = await loadManifests();
    const manifest = manifests.find(
      (candidate: { name: string }) => candidate.name === 'internal-economics-certification'
    );
    expect(manifest).toBeDefined();

    await withPool(connectionString, async (pool) => {
      const before = await auditManifest(pool, manifest);
      expect(before.action).toBe(ACTION_APPLY_MISSING_DDL);

      await pool.query(await readFile(CERTIFICATION_MIGRATION_FILE, 'utf8'));

      const after = await auditManifest(pool, manifest);
      expect(after.action).toBe(ACTION_SKIP);
      expect(after.objects).toEqual([
        expect.objectContaining({
          table: 'internal_lp_economics_runs',
          deltas: [],
          action: ACTION_SKIP,
        }),
      ]);

      const comment = await pool.query<{ description: string }>(
        `
          SELECT col_description('public.internal_lp_economics_runs'::regclass, ordinal_position) AS description
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'internal_lp_economics_runs'
            AND column_name = 'calculation_contract_version'
        `
      );
      expect(comment.rows[0]?.description).toBe(
        'null is legacy-only and requires registry verification'
      );
    });
  }, 120_000);
});

interface RunBasis {
  fundId: number;
  userId: number;
  vehicleId: number;
  sourceArtifactId: number;
  factsSnapshotId: number;
  planVersionId: number;
  forecastSnapshotId: number;
  resultSnapshotId: number;
  envelopeId: number;
  policyId: number;
}

interface EnvelopeInput {
  fundId: number;
  vehicleId: number;
  sourceArtifactId: number;
  attestedBy: number;
  version: number;
  idempotencyKey: string;
  lp?: string;
  gp?: string;
  total?: string;
  currency?: string;
  parentEnvelopeVersionId?: number;
  explicitId?: number;
}

interface RunOverrides {
  idempotencyKey: string;
  calculationContractVersion?: 'lp-economics/1.0.0' | 'lp-economics/1.1.0';
  policyVersionId?: number;
  forecastSnapshotId?: number;
  runState?: 'completed' | 'failed';
  resultSnapshotId?: number | null;
  resultSnapshotType?: string | null;
  resultStatus?: string | null;
  resultHash?: string | null;
  failureCode?: string | null;
  failureContext?: string | null;
}

async function seedRunBasis(pool: Pool): Promise<RunBasis> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `WP-L3 Fund ${fundId}`]
  );
  const userId = await insertedId(
    pool,
    `INSERT INTO users (username, password) VALUES ($1, 'x') RETURNING id`,
    [`wp-l3-${fundId}`]
  );
  const vehicleId = await insertedId(
    pool,
    `
      INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
      VALUES ($1, $2, 'main_fund', $3)
      RETURNING id
    `,
    [fundId, `main-${fundId}`, `Main Fund ${fundId}`]
  );
  const sourceArtifactId = await insertedId(
    pool,
    `
      INSERT INTO source_artifacts (
        fund_id, source_type, media_type, byte_count, payload_sha256, payload,
        purge_after, idempotency_key, request_hash
      ) VALUES ($1, 'manual', 'text/csv', 1, $2, $3, NOW() + INTERVAL '30 days', $4, $5)
      RETURNING id
    `,
    [fundId, hex64(`artifact-${fundId}`), Buffer.from('a'), `artifact-${fundId}`, hex64('req')]
  );
  const factsSnapshotId = await insertedId(
    pool,
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
      ) VALUES (
        $1, 'financial-facts-policy/1.2.0', 'financial-facts-payload/3', '2026-06-30', NOW(),
        'fund_all', '[]'::jsonb, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, $5, $6
      )
      RETURNING id
    `,
    [
      fundId,
      hex64(`selection-${fundId}`),
      hex64(`source-${fundId}`),
      hex64(`snapshot-${fundId}`),
      `facts-${fundId}`,
      hex64(`request-${fundId}`),
    ]
  );
  const planVersionId = await insertedId(
    pool,
    `
      INSERT INTO current_plan_versions (
        fund_id, version, source_config_id, source_config_version,
        source_facts_snapshot_id, deployable_capital_usd, plan_transformation_version,
        allocations, pacing_assumptions, cohort_assumptions, reserve_policy_version,
        assumptions_hash, idempotency_key, request_hash
      ) VALUES (
        $1, 1, 1, 1, $2, '10000000.000000', 'plan-transformation/1.0.0',
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'reserve-policy/1.0.0',
        $3, $4, $5
      )
      RETURNING id
    `,
    [fundId, factsSnapshotId, hex64(`plan-${fundId}`), `plan-${fundId}`, hex64('plan-req')]
  );
  const forecastSnapshotId = await seedFundSnapshot(pool, fundId, 'CURRENT_FORECAST_V2');
  const resultSnapshotId = await seedFundSnapshot(pool, fundId, 'INTERNAL_LP_ECONOMICS');
  const envelopeId = await insertEnvelope(pool, {
    fundId,
    vehicleId,
    sourceArtifactId,
    attestedBy: userId,
    version: 1,
    idempotencyKey: 'envelope-v1',
  });
  const policyId = await insertedId(
    pool,
    `
      INSERT INTO internal_economics_policy_versions (
        fund_id, version, policy_schema_version, policy_body, terminal_period_end,
        terminal_resolution_methodology_version, capital_envelope_version_id,
        assumptions_hash, source_config_id, source_config_version, created_by,
        idempotency_key, request_hash
      ) VALUES (
        $1, 1, 'internal-economics-policy/1.0.0', '{}'::jsonb, '2036-12-31',
        'terminal-resolution/1.0.0', $2, $3, 1, 1, $4, $5, $6
      )
      RETURNING id
    `,
    [fundId, envelopeId, hex64(`assumptions-${fundId}`), userId, 'policy-v1', hex64('policy-req')]
  );

  return {
    fundId,
    userId,
    vehicleId,
    sourceArtifactId,
    factsSnapshotId,
    planVersionId,
    forecastSnapshotId,
    resultSnapshotId,
    envelopeId,
    policyId,
  };
}

function insertEnvelope(pool: Pool, input: EnvelopeInput): Promise<number> {
  const columns = input.explicitId === undefined ? '' : 'id,';
  const idValue = input.explicitId === undefined ? '' : `${input.explicitId},`;
  return insertedId(
    pool,
    `
      INSERT INTO internal_capital_envelope_versions (
        ${columns}
        fund_id, version, main_fund_vehicle_id, lp_commitment_usd, gp_commitment_usd,
        total_commitment_usd, currency, effective_at, source_artifact_id,
        source_config_id, source_config_version, source_config_hash, attested_by,
        attested_at, envelope_hash, parent_envelope_version_id, idempotency_key,
        request_hash
      ) VALUES (
        ${idValue}
        $1, $2, $3, $4, $5, $6, $7, NOW(), $8, 1, 1, $9, $10, NOW(), $11, $12, $13, $14
      )
      RETURNING id
    `,
    [
      input.fundId,
      input.version,
      input.vehicleId,
      input.lp ?? '10000000.000000',
      input.gp ?? '0.000000',
      input.total ?? '10000000.000000',
      input.currency ?? 'USD',
      input.sourceArtifactId,
      hex64('config'),
      input.attestedBy,
      hex64('envelope'),
      input.parentEnvelopeVersionId ?? null,
      input.idempotencyKey,
      hex64(input.idempotencyKey),
    ]
  );
}

function insertRun(pool: Pool, basis: RunBasis, overrides: RunOverrides): Promise<number> {
  const runState = overrides.runState ?? 'completed';
  const contractColumn =
    overrides.calculationContractVersion === undefined ? '' : ', calculation_contract_version';
  const contractValue = overrides.calculationContractVersion === undefined ? '' : ', $17';
  return insertedId(
    pool,
    `
      INSERT INTO internal_lp_economics_runs (
        fund_id, policy_version_id, facts_snapshot_id, plan_version_id,
        forecast_snapshot_id, forecast_snapshot_type, result_snapshot_id,
        result_snapshot_type, run_state, result_status, failure_code,
        failure_context, evaluation_clock, terminal_mode, engine_version,
        methodology_version, input_hash, result_hash, created_by,
        idempotency_key, request_hash${contractColumn}
      ) VALUES (
        $1, $2, $3, $4, $5, 'CURRENT_FORECAST_V2', $6, $7, $8, $9, $10,
        $11::jsonb, NOW(), 'liquidate_at_horizon', 'cash-assembly-period-loop/1.0.0',
        'lp-economics/1.0.0', $12, $13, $14, $15, $16${contractValue}
      )
      RETURNING id
    `,
    [
      basis.fundId,
      overrides.policyVersionId ?? basis.policyId,
      basis.factsSnapshotId,
      basis.planVersionId,
      overrides.forecastSnapshotId ?? basis.forecastSnapshotId,
      'resultSnapshotId' in overrides ? overrides.resultSnapshotId : basis.resultSnapshotId,
      'resultSnapshotType' in overrides ? overrides.resultSnapshotType : 'INTERNAL_LP_ECONOMICS',
      runState,
      'resultStatus' in overrides ? overrides.resultStatus : 'indicative',
      overrides.failureCode ?? null,
      overrides.failureContext ?? null,
      hex64(`input-${overrides.idempotencyKey}`),
      'resultHash' in overrides ? overrides.resultHash : hex64('result'),
      basis.userId,
      overrides.idempotencyKey,
      hex64(overrides.idempotencyKey),
      ...(overrides.calculationContractVersion === undefined
        ? []
        : [overrides.calculationContractVersion]),
    ]
  );
}

function insertCompletedRun(pool: Pool, basis: RunBasis, idempotencyKey: string): Promise<number> {
  return insertRun(pool, basis, { idempotencyKey });
}

async function seedFundSnapshot(pool: Pool, fundId: number, type: string): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO fund_snapshots (
        fund_id, type, payload, calc_version, correlation_id, snapshot_time
      ) VALUES ($1, $2, '{}'::jsonb, 'lp-economics/1.0.0', $3, NOW())
      RETURNING id
    `,
    [fundId, type, `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`]
  );
}

async function createMigratedDatabase(
  suffix: string,
  targetVersion: string = CERTIFICATION_MIGRATION_TAG
): Promise<{ connectionString: string; state: { applied: Array<{ name: string }> } }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const databaseName = `wp_l3_${suffix}_${process.pid}_${Date.now()}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  const state = await runMigrationsWithConnectionString(connectionString, targetVersion);
  return { connectionString, state };
}

function databaseConnectionString(databaseName: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  return base.toString();
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function insertedId(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  const result = await pool.query(sql, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected an inserted id.');
  return id;
}

async function withPool<T>(
  connectionString: string,
  callback: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Deterministic 64-char hex filler for the provenance hash columns. */
function hex64(seed: string): string {
  let value = '';
  for (let index = 0; value.length < 64; index += 1) {
    value += (seed.charCodeAt(index % seed.length) + index).toString(16).padStart(2, '0');
  }
  return value.slice(0, 64);
}

function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}
