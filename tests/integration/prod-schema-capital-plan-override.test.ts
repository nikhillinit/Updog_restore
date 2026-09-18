import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeIdentifier, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
  runReconciliation,
} from '../../scripts/reconcile-prod-schema.mjs';
import { createIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRIOR = '0057_actuals_restatement_commands';
const TARGET = '0058_capital_plan_override';
const CONSTRAINT = 'fund_scenario_variants_override_type_check';
const MODES = [
  'fee_profile',
  'reserve_allocation',
  'allocation',
  'sector_profile',
  'methodology',
  'capital_plan',
] as const;
const LEGACY_MODES = MODES.slice(0, 5);
const LEGACY_CHECK_MODES = MODES.slice(0, 4);
const FIXED_TIME = '2026-09-11T00:00:00.000Z';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

interface Manifest {
  name: string;
  order: number;
  sqlFiles: string[];
}
interface CheckState {
  name: string;
  definition: string;
  validated: boolean;
}
interface DatabaseFixture {
  pool: Pool;
  uri: string;
  name: string;
}

let postgres: StartedPostgreSqlContainer | undefined;
let admin: Pool | undefined;
let baseUri = '';
let migrationSql = '';
let legacySql = '';
let manifest: Manifest;
let databaseSequence = 0;
const ownedDatabases = new Set<string>();
const evidence: Record<string, unknown>[] = [];

function requireAdmin(): Pool {
  if (!admin) throw new Error('Owned PostgreSQL admin pool unavailable');
  return admin;
}

async function checkState(pool: Pool): Promise<CheckState | null> {
  const result = await pool.query<CheckState>(`
    SELECT conname AS name, pg_get_constraintdef(oid, true) AS definition,
           convalidated AS validated
    FROM pg_constraint
    WHERE conrelid = 'public.fund_scenario_variants'::regclass
      AND conname = '${CONSTRAINT}' AND contype = 'c'
  `);
  expect(result.rows.length).toBeLessThanOrEqual(1);
  return result.rows[0] ?? null;
}

async function expectSixModeCheck(pool: Pool): Promise<CheckState> {
  const state = await checkState(pool);
  expect(state).toMatchObject({ name: CONSTRAINT, validated: true });
  expect(state!.definition).toMatch(/^CHECK \(.*override_type.*ANY /);
  expect([...state!.definition.matchAll(/'([^']*)'/g)].map((match) => match[1])).toEqual(MODES);
  return state!;
}

async function ledger(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ row: string }>(`
    SELECT row_to_json(m)::text AS row FROM public.drizzle_migrations m ORDER BY id
  `);
  return result.rows.map((row) => row.row);
}

async function storedRows(pool: Pool) {
  const tables = [
    'funds',
    'fundconfigs',
    'fund_scenario_sets',
    'fund_scenario_variants',
    'fund_snapshots',
  ] as const;
  const rows: Record<string, unknown> = {};
  for (const table of tables) {
    const result = await pool.query<{ row: string; binary: string }>(`
      SELECT row_to_json(t)::text AS row, encode(jsonb_send(to_jsonb(t)), 'hex') AS binary
      FROM ${escapeIdentifier(table)} t ORDER BY id
    `);
    rows[table] = result.rows;
  }
  const payloads = await pool.query<{ id: string; payload: string; binary: string }>(`
    SELECT id::text AS id, override_payload::text AS payload,
           encode(jsonb_send(override_payload), 'hex') AS binary
    FROM fund_scenario_variants ORDER BY id
  `);
  const snapshotPayloads = await pool.query<{ id: string; payload: string; binary: string }>(`
    SELECT id::text AS id, payload::text AS payload,
           encode(jsonb_send(payload), 'hex') AS binary
    FROM fund_snapshots ORDER BY id
  `);
  return { rows, payloads: payloads.rows, snapshotPayloads: snapshotPayloads.rows };
}

async function expectNoCapitalPopulation(pool: Pool) {
  // Sets have no family column. Inspect related variants and actual saved payload markers.
  // Any one capital marker counts, including a partially inconsistent saved payload.
  const result = await pool.query<{
    capital_sets: string;
    capital_variants: string;
    capital_snapshots: string;
    unclassified_sets: string;
    total_sets: string;
    total_snapshots: string;
  }>(`
    WITH capital_snapshots AS (
      SELECT id, scenario_set_id FROM fund_snapshots
      WHERE payload->>'calculationDomain' = 'capital_plan'
         OR payload->>'calculationMode' = 'sync_capital_plan'
         OR payload->>'contractVersion' = 'fund-scenario-capital-calculation/1.0.0'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(payload->'variants') = 'array'
                  THEN payload->'variants' ELSE '[]'::jsonb END
           ) variant
           WHERE variant->>'overrideType' = 'capital_plan'
         )
    )
    SELECT
      (SELECT count(*)::text FROM fund_scenario_sets s
       WHERE EXISTS (SELECT 1 FROM fund_scenario_variants v
                     WHERE v.scenario_set_id = s.id AND v.override_type = 'capital_plan')
          OR EXISTS (SELECT 1 FROM capital_snapshots c WHERE c.scenario_set_id = s.id)
      ) AS capital_sets,
      (SELECT count(*)::text FROM fund_scenario_variants WHERE override_type = 'capital_plan')
        AS capital_variants,
      (SELECT count(*)::text FROM capital_snapshots) AS capital_snapshots,
      (SELECT count(*)::text FROM fund_scenario_sets s
       WHERE NOT EXISTS (SELECT 1 FROM fund_scenario_variants v WHERE v.scenario_set_id = s.id)
      ) AS unclassified_sets,
      (SELECT count(*)::text FROM fund_scenario_sets) AS total_sets,
      (SELECT count(*)::text FROM fund_snapshots) AS total_snapshots
  `);
  expect(result.rows).toEqual([
    {
      capital_sets: '0',
      capital_variants: '0',
      capital_snapshots: '0',
      unclassified_sets: '0',
      total_sets: '1',
      total_snapshots: '1',
    },
  ]);
  return result.rows[0]!;
}

async function catalogue(pool: Pool) {
  const result = await pool.query(`
    SELECT conname, contype, convalidated, pg_get_constraintdef(oid, true) AS definition
    FROM pg_constraint WHERE conrelid = 'public.fund_scenario_variants'::regclass
    ORDER BY conname
  `);
  return result.rows;
}

function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('code' in current && typeof current.code === 'string') codes.push(current.code);
    current = 'cause' in current ? current.cause : null;
  }
  return codes;
}

async function expectSqlState(action: () => Promise<unknown>, code: string) {
  let failure: unknown;
  try {
    await action();
  } catch (error) {
    failure = error;
  }
  expect(failure, `Expected PostgreSQL refusal ${code}`).toBeDefined();
  expect(errorCodes(failure)).toContain(code);
}

async function withPriorDatabase(label: string, run: (fixture: DatabaseFixture) => Promise<void>) {
  const activeAdmin = requireAdmin();
  const name = `b6_capital_${process.pid}_${++databaseSequence}`;
  const url = new URL(baseUri);
  url.pathname = `/${name}`;
  const uri = url.toString();
  await activeAdmin.query(`CREATE DATABASE ${escapeIdentifier(name)}`);
  ownedDatabases.add(name);
  const managed = createIsolatedDatabasePool(uri);
  const failures: unknown[] = [];
  try {
    await managed.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await managed.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    const migrationState = await runMigrationsWithConnectionString(uri, PRIOR);
    expect(migrationState.current).toBe(PRIOR);
    expect(migrationState.applied).not.toContain(TARGET);
    const identity = await managed.pool.query<{ database: string; version: string }>(
      'SELECT current_database() AS database, version() AS version'
    );
    expect(identity.rows[0]!.database).toBe(name);
    expect(await checkState(managed.pool)).toBeNull();
    evidence.push({
      label,
      database: name,
      identity: identity.rows[0],
      startingTarget: PRIOR,
      priorLedgerSha256: sha256(JSON.stringify(await ledger(managed.pool))),
    });
    await run({ pool: managed.pool, uri, name });
  } catch (error) {
    failures.push(error);
  }
  try {
    await managed.dropDatabase(activeAdmin, name);
    const remaining = await activeAdmin.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [name]
    );
    expect(remaining.rows).toEqual([]);
    ownedDatabases.delete(name);
    evidence.push({ label, database: name, cleanup: 'pool-ended-and-database-absent' });
  } catch (cleanupError) {
    failures.push(cleanupError);
  }
  if (failures.length > 1)
    throw new AggregateError(failures, 'B6 fixture failed and cleanup failed');
  if (failures.length === 1) throw failures[0];
}

async function insertVariant(pool: Pool, setId: string, type: string | null, index: number) {
  // Opaque SQL-valid persisted payloads exercise storage bytes, not HTTP/parser acceptance.
  const payload = {
    kind: type,
    input: { initialCheckUsd: '0.000001', ratio: '0.123456789012', omittedVsNull: null },
    sourceBundleHash: 'a'.repeat(64),
    inputHash: 'b'.repeat(64),
    lineage: { hashKind: 'scenario-input-hash-v2', modelInputsAsOfDate: '2026-09-10' },
    literal: 'embedded\nline and "quoted" text',
    values: [index, false, '001-preserved', { unicode: 'café' }],
  };
  await pool.query(
    `
    INSERT INTO fund_scenario_variants
      (id, scenario_set_id, name, description, sort_order, override_type, override_payload, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
  `,
    [
      randomUUID(),
      setId,
      `Variant ${index}`,
      'Stored byte fixture',
      index,
      type,
      JSON.stringify(payload),
      FIXED_TIME,
    ]
  );
}

async function seedModes(pool: Pool, modes: readonly string[]) {
  const fund = await pool.query<{ id: number }>(`
    INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
    VALUES ('B6 synthetic migration fund', 1000000, 0.02, 0.20, 2026) RETURNING id
  `);
  const config = await pool.query<{ id: number }>(
    `
    INSERT INTO fundconfigs (fund_id, version, config) VALUES ($1, 1, $2::jsonb) RETURNING id
  `,
    [
      fund.rows[0]!.id,
      JSON.stringify({ name: 'B6 source', exactMoney: '123.000001', sourceHash: 'c'.repeat(64) }),
    ]
  );
  const setId = randomUUID();
  await pool.query(
    `
    INSERT INTO fund_scenario_sets
      (id, fund_id, name, source_config_id, source_config_version, created_at, updated_at)
    VALUES ($1, $2, 'B6 stored variants', $3, 1, $4, $4)
  `,
    [setId, fund.rows[0]!.id, config.rows[0]!.id, FIXED_TIME]
  );
  for (const [index, mode] of modes.entries()) await insertVariant(pool, setId, mode, index);
  return setId;
}

async function seedLegacySnapshot(pool: Pool, setId: string) {
  // Opaque SQL-valid historical bytes; this migration test does not assert reader acceptance.
  const payload = {
    version: 'fund-scenarios-v1',
    calculationMode: 'sync_fee_profile',
    scenarioSetId: setId,
    calculatedAt: FIXED_TIME,
    variants: [{ overrideType: 'fee_profile', retainedMoneyUsd: '123.000001' }],
    inputHash: 'd'.repeat(64),
    lineage: { hashKind: 'scenario-input-hash-v2', modelInputsAsOfDate: '2026-09-10' },
    literal: 'legacy snapshot\nwith "quoted" text',
    retained: ['001-preserved', null, false, { ratio: '0.123456789012' }],
  };
  const result = await pool.query<{ id: number }>(
    `INSERT INTO fund_snapshots
       (fund_id, type, payload, calc_version, correlation_id, metadata, snapshot_time,
        event_count, state_hash, state, config_id, config_version, scenario_set_id, created_at)
     SELECT fund_id, 'SCENARIOS', $2::jsonb, '1.0.0', $3, $4::jsonb, $5,
            7, $6, $7::jsonb, source_config_id, source_config_version, id, $5
     FROM fund_scenario_sets WHERE id = $1
     RETURNING id`,
    [
      setId,
      JSON.stringify(payload),
      randomUUID(),
      JSON.stringify({ historicalLabel: 'Legacy saved scenario', explicitNull: null }),
      FIXED_TIME,
      'e'.repeat(64),
      JSON.stringify({ exactAmount: '456.000001', sourceHash: 'f'.repeat(64) }),
    ]
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!.id;
}

async function assertAuditConverged(pool: Pool) {
  const direct = await auditManifest(pool, manifest);
  expect(direct.action).toBe(ACTION_SKIP);
  expect(direct.objects).toHaveLength(1);
  expect(direct.objects[0].deltas).toEqual([]);
  const result = await runReconciliation({
    client: pool,
    manifests: [manifest],
    apply: false,
  });
  expect(result).toMatchObject({
    ok: true,
    applied: [],
    audits: [{ manifest: 'capital-plan-override', action: ACTION_SKIP }],
  });
  return result;
}

describe('B6 capital-plan override migration on owned PostgreSQL databases', () => {
  beforeAll(async () => {
    migrationSql = await readFile(path.join(ROOT, 'migrations', `${TARGET}.sql`), 'utf8');
    legacySql = await readFile(
      path.join(ROOT, 'server/db/migrations/0017_fund_scenario_allocation_sector_overrides.sql'),
      'utf8'
    );
    const manifests = (await loadManifests()) as Manifest[];
    const candidates = manifests.filter((candidate) => candidate.name === 'capital-plan-override');
    expect(candidates).toHaveLength(1);
    manifest = candidates[0]!;
    expect(manifest).toMatchObject({ order: 35, sqlFiles: [`migrations/${TARGET}.sql`] });
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('b6_admin')
      .withUsername('b6_test')
      .withPassword('b6_disposable')
      .withStartupTimeout(90_000)
      .start();
    baseUri = postgres.getConnectionUri();
    admin = new Pool({ connectionString: baseUri, max: 1 });
    evidence.push({
      containerId: postgres.getId(),
      database: 'b6_admin',
      migrationSqlSha256: sha256(migrationSql),
      legacySqlSha256: sha256(legacySql),
    });
  }, 120_000);

  afterAll(async () => {
    const remainingBeforeCleanup = [...ownedDatabases];
    const failures: unknown[] = [];
    if (admin) {
      for (const name of ownedDatabases) {
        try {
          await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(name)} WITH (FORCE)`);
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        await admin.end();
        evidence.push({ adminPoolCleanup: 'awaited' });
      } catch (error) {
        failures.push(error);
      }
    }
    if (postgres) {
      try {
        await postgres.stop();
        evidence.push({ containerId: postgres.getId(), containerCleanup: 'stop-awaited' });
      } catch (error) {
        failures.push(error);
      }
    }
    process.stdout.write(
      `B6_POSTGRES_EVIDENCE ${JSON.stringify({
        remainingBeforeCleanup,
        cleanupFailures: failures.map((failure) => String(failure)),
        evidence,
      })}\n`
    );
    expect(remainingBeforeCleanup, 'Every fixture must complete owned database cleanup').toEqual(
      []
    );
    if (failures.length) throw new AggregateError(failures, 'B6 PostgreSQL teardown failed');
  }, 120_000);

  it('admits all six modes from canonical 0057, preserves bytes, and converges on registered and direct replay', async () => {
    await withPriorDatabase('canonical-replay', async ({ pool, uri, name }) => {
      const setId = await seedModes(pool, LEGACY_MODES);
      const legacySnapshotId = await seedLegacySnapshot(pool, setId);
      const before = await storedRows(pool);
      expect(before.rows['fund_snapshots']).toHaveLength(1);
      expect(before.snapshotPayloads).toHaveLength(1);
      const priorLedger = await ledger(pool);
      const applied = await runMigrationsWithConnectionString(uri, TARGET);
      expect(applied.current).toBe(TARGET);
      expect(await storedRows(pool)).toEqual(before);
      const afterLedger = await ledger(pool);
      expect(afterLedger).toHaveLength(priorLedger.length + 1);
      expect(afterLedger.slice(0, priorLedger.length)).toEqual(priorLedger);
      expect(JSON.parse(afterLedger.at(-1)!).hash).toBe(sha256(migrationSql));
      const check = await expectSixModeCheck(pool);
      const noCapital = await expectNoCapitalPopulation(pool);
      const priorAudit = await assertAuditConverged(pool);
      expect(await storedRows(pool)).toEqual(before);
      expect(await ledger(pool)).toEqual(afterLedger);
      await insertVariant(pool, setId, 'capital_plan', LEGACY_MODES.length);
      const types = await pool.query<{ override_type: string }>(
        'SELECT override_type FROM fund_scenario_variants ORDER BY sort_order'
      );
      expect(types.rows.map((row) => row.override_type)).toEqual(MODES);
      const withCapital = await storedRows(pool);
      expect(withCapital.rows['fund_snapshots']).toEqual(before.rows['fund_snapshots']);
      expect(withCapital.snapshotPayloads).toEqual(before.snapshotPayloads);
      for (const type of ['unknown', '', 'CAPITAL_PLAN', ' capital_plan', 'capital_plan ']) {
        await expectSqlState(() => insertVariant(pool, setId, type, 20), '23514');
      }
      await expectSqlState(() => insertVariant(pool, setId, null, 20), '23502');
      expect(await storedRows(pool)).toEqual(withCapital);
      await runMigrationsWithConnectionString(uri, TARGET);
      expect(await ledger(pool)).toEqual(afterLedger);
      expect(await storedRows(pool)).toEqual(withCapital);
      expect(await checkState(pool)).toEqual(check);
      await pool.query(migrationSql);
      expect(await checkState(pool)).toEqual(check);
      expect(await ledger(pool)).toEqual(afterLedger);
      expect(await storedRows(pool)).toEqual(withCapital);
      await assertAuditConverged(pool);
      expect(await ledger(pool)).toEqual(afterLedger);
      expect(await storedRows(pool)).toEqual(withCapital);
      evidence.push({
        case: 'canonical-replay',
        database: name,
        legacyRows: 5,
        allModes: types.rows.map((row) => row.override_type),
        beforeFirstCapitalCount: '0',
        beforeFirstCapitalPopulation: noCapital,
        legacySnapshotId,
        legacySnapshotRowsSha256: sha256(JSON.stringify(before.rows['fund_snapshots'])),
        legacySnapshotPayloadsSha256: sha256(JSON.stringify(before.snapshotPayloads)),
        legacySnapshotPreserved: true,
        beforeRowsSha256: sha256(JSON.stringify(before)),
        afterCapitalRowsSha256: sha256(JSON.stringify(withCapital)),
        ledgerSha256: sha256(JSON.stringify(afterLedger)),
        check,
        audit: priorAudit.audits,
        registeredReplay: 'unchanged',
        directSqlReplay: 'unchanged',
      });
    });
  }, 120_000);

  it('upgrades the actual legacy 0017 four-mode CHECK without rewriting stored rows', async () => {
    await withPriorDatabase('legacy-four-mode', async ({ pool, uri, name }) => {
      await pool.query(legacySql);
      const legacyCheck = await checkState(pool);
      expect(legacyCheck?.validated).toBe(true);
      expect([...legacyCheck!.definition.matchAll(/'([^']*)'/g)].map((match) => match[1])).toEqual(
        LEGACY_CHECK_MODES
      );
      const setId = await seedModes(pool, LEGACY_CHECK_MODES);
      const legacySnapshotId = await seedLegacySnapshot(pool, setId);
      const before = await storedRows(pool);
      expect(before.rows['fund_snapshots']).toHaveLength(1);
      expect(before.snapshotPayloads).toHaveLength(1);
      const priorLedger = await ledger(pool);
      for (const type of ['methodology', 'capital_plan'])
        await expectSqlState(() => insertVariant(pool, setId, type, 10), '23514');
      expect(await storedRows(pool)).toEqual(before);
      await runMigrationsWithConnectionString(uri, TARGET);
      expect(await storedRows(pool)).toEqual(before);
      expect((await ledger(pool)).slice(0, priorLedger.length)).toEqual(priorLedger);
      const check = await expectSixModeCheck(pool);
      const noCapital = await expectNoCapitalPopulation(pool);
      await insertVariant(pool, setId, 'methodology', 4);
      await insertVariant(pool, setId, 'capital_plan', 5);
      const types = await pool.query<{ override_type: string }>(
        'SELECT override_type FROM fund_scenario_variants ORDER BY sort_order'
      );
      expect(types.rows.map((row) => row.override_type)).toEqual(MODES);
      const withCapital = await storedRows(pool);
      const afterLedger = await ledger(pool);
      expect(withCapital.rows['fund_snapshots']).toEqual(before.rows['fund_snapshots']);
      expect(withCapital.snapshotPayloads).toEqual(before.snapshotPayloads);
      await runMigrationsWithConnectionString(uri, TARGET);
      expect(await storedRows(pool)).toEqual(withCapital);
      expect(await ledger(pool)).toEqual(afterLedger);
      expect(await checkState(pool)).toEqual(check);
      await pool.query(migrationSql);
      expect(await storedRows(pool)).toEqual(withCapital);
      expect(await ledger(pool)).toEqual(afterLedger);
      expect(await checkState(pool)).toEqual(check);
      await assertAuditConverged(pool);
      expect(await storedRows(pool)).toEqual(withCapital);
      expect(await ledger(pool)).toEqual(afterLedger);
      evidence.push({
        case: 'legacy-four-mode',
        database: name,
        legacyCheck,
        check,
        originalRowsSha256: sha256(JSON.stringify(before)),
        retainedOriginalRows: true,
        beforeFirstCapitalPopulation: noCapital,
        legacySnapshotId,
        legacySnapshotRowsSha256: sha256(JSON.stringify(before.rows['fund_snapshots'])),
        legacySnapshotPayloadsSha256: sha256(JSON.stringify(before.snapshotPayloads)),
        legacySnapshotPreserved: true,
        registeredReplay: 'unchanged',
        directSqlReplay: 'unchanged',
        allModes: types.rows.map((row) => row.override_type),
      });
    });
  }, 120_000);

  it.each(['unknown', '', 'CAPITAL_PLAN', 'capital_plan '])(
    'refuses malformed existing type %j with complete row/catalog/journal rollback',
    async (type) => {
      await withPriorDatabase(`malformed-${JSON.stringify(type)}`, async ({ pool, uri, name }) => {
        await seedModes(pool, [...LEGACY_MODES, type]);
        const before = await storedRows(pool);
        const priorLedger = await ledger(pool);
        const priorCatalogue = await catalogue(pool);
        await expectSqlState(() => runMigrationsWithConnectionString(uri, TARGET), '23514');
        expect(await storedRows(pool)).toEqual(before);
        expect(await ledger(pool)).toEqual(priorLedger);
        expect(await catalogue(pool)).toEqual(priorCatalogue);
        expect(await checkState(pool)).toBeNull();
        evidence.push({
          case: 'malformed-existing',
          database: name,
          type,
          sqlState: '23514',
          preservedRowsSha256: sha256(JSON.stringify(before)),
          unchangedLedgerSha256: sha256(JSON.stringify(priorLedger)),
          unchangedCatalogueSha256: sha256(JSON.stringify(priorCatalogue)),
        });
      });
    },
    120_000
  );

  it('rolls back the dropped named CHECK when replacement validation finds historical invalid rows', async () => {
    await withPriorDatabase('invalid-check-rollback', async ({ pool, uri, name }) => {
      await seedModes(pool, ['fee_profile', 'unknown']);
      // Explicit preexisting drift fixture: unvalidated old constraint over an invalid stored row.
      // The forward migration must never retain this escape or lose the old catalog object on failure.
      await pool.query(
        `ALTER TABLE fund_scenario_variants ADD CONSTRAINT ${CONSTRAINT} CHECK (override_type IN ('fee_profile', 'reserve_allocation', 'allocation', 'sector_profile')) NOT VALID`
      );
      const oldCheck = await checkState(pool);
      expect(oldCheck?.validated).toBe(false);
      const before = await storedRows(pool);
      const oldCatalogue = await catalogue(pool);
      const oldLedger = await ledger(pool);
      await expectSqlState(() => runMigrationsWithConnectionString(uri, TARGET), '23514');
      expect(await storedRows(pool)).toEqual(before);
      expect(await catalogue(pool)).toEqual(oldCatalogue);
      expect(await ledger(pool)).toEqual(oldLedger);
      expect(await checkState(pool)).toEqual(oldCheck);
      evidence.push({
        case: 'invalid-check-rollback',
        database: name,
        sqlState: '23514',
        retainedCheck: oldCheck,
        preservedRowsSha256: sha256(JSON.stringify(before)),
      });
    });
  }, 120_000);

  it('detects a same-name wrong CHECK through actual audit-only reconciliation, then converges without writes', async () => {
    await withPriorDatabase('manifest-definition', async ({ pool, uri, name }) => {
      await seedModes(pool, LEGACY_CHECK_MODES);
      await runMigrationsWithConnectionString(uri, TARGET);
      const before = await storedRows(pool);
      const committedLedger = await ledger(pool);
      await pool.query(legacySql);
      const wrongCheck = await checkState(pool);
      const direct = await auditManifest(pool, manifest);
      expect(direct.action).toBe(ACTION_APPLY_MISSING_DDL);
      const auditOnly = await runReconciliation({
        client: pool,
        manifests: [manifest],
        apply: false,
      });
      expect(auditOnly).toMatchObject({
        ok: true,
        applied: [],
        audits: [{ action: ACTION_APPLY_MISSING_DDL }],
      });
      expect(await checkState(pool)).toEqual(wrongCheck);
      expect(await storedRows(pool)).toEqual(before);
      expect(await ledger(pool)).toEqual(committedLedger);
      await pool.query(migrationSql);
      await expectSixModeCheck(pool);
      const converged = await assertAuditConverged(pool);
      expect(await storedRows(pool)).toEqual(before);
      expect(await ledger(pool)).toEqual(committedLedger);
      evidence.push({
        case: 'manifest-definition',
        database: name,
        wrongDefinitionAction: direct.action,
        convergedAudit: converged.audits,
        unchangedRowsSha256: sha256(JSON.stringify(before)),
        unchangedLedgerSha256: sha256(JSON.stringify(committedLedger)),
      });
    });
  }, 120_000);
});
