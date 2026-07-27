/**
 * PostgreSQL proofs for the Task 18 internal-analysis substrate.
 *
 * These assert the invariants that only a real database can demonstrate: the
 * outbox dedupe index, `FOR UPDATE SKIP LOCKED` claim exclusivity, the partial
 * unique indexes behind "one open draft per period" and "linear revision chains",
 * and the composite fund-scoped foreign keys that make cross-fund pins
 * structurally impossible.
 */
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

const QUARTERLY_JOB_TYPE = 'quarterly_analysis_draft';
const PERIOD = { start: '2026-04-01', end: '2026-06-30' };

let adminPool: Pool | undefined;
let fundIdCounter = 180_440_000;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('internal analysis checkpoint PostgreSQL proof', () => {
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

  it('absorbs a replayed quarterly plan through the outbox dedupe index', async () => {
    const { connectionString } = await createMigratedDatabase('dedupe');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      const dedupeKey = `quarterly:${fundId}:${PERIOD.start}:${PERIOD.end}`;

      const first = await enqueueQuarterlyJob(pool, dedupeKey, fundId);
      const replay = await enqueueQuarterlyJob(pool, dedupeKey, fundId);

      expect(first.rowCount).toBe(1);
      expect(replay.rowCount).toBe(0);
      expect(await countRows(pool, 'job_outbox')).toBe(1);
    });
  });

  it('lets exactly one claimer take a job under FOR UPDATE SKIP LOCKED', async () => {
    const { connectionString } = await createMigratedDatabase('skip_locked');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      await enqueueQuarterlyJob(pool, `quarterly:${fundId}:${PERIOD.start}:${PERIOD.end}`, fundId);

      // Hold the claim open in one transaction while a second claimer runs.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN');
        const held = await holder.query(claimSql());
        expect(held.rowCount).toBe(1);

        // The second replica must see nothing rather than block or double-process.
        const contender = await pool.query(claimSql());
        expect(contender.rowCount).toBe(0);

        await holder.query('COMMIT');
      } finally {
        holder.release();
      }

      const afterCommit = await pool.query(claimSql());
      expect(afterCommit.rowCount).toBe(0);
      expect(await scalar(pool, `SELECT status FROM job_outbox LIMIT 1`)).toBe('processing');
    });
  });

  it('allows one open draft per period and frees the slot once saved', async () => {
    const { connectionString } = await createMigratedDatabase('open_draft');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      const snapshotId = await seedFactsSnapshot(pool, fundId);

      const firstDraftId = await insertDraft(pool, fundId, snapshotId, 'draft-a');

      await expect(insertDraft(pool, fundId, snapshotId, 'draft-b')).rejects.toThrow(
        /internal_analysis_drafts_open_period_unique/
      );

      await pool.query(`UPDATE internal_analysis_drafts SET saved_at = NOW() WHERE id = $1`, [
        firstDraftId,
      ]);

      // A late correction opens a fresh draft for the same period.
      await expect(insertDraft(pool, fundId, snapshotId, 'draft-c')).resolves.toEqual(
        expect.any(Number)
      );
    });
  });

  it('rejects a facts snapshot that belongs to another fund', async () => {
    const { connectionString } = await createMigratedDatabase('cross_fund');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      const otherFundId = await seedFund(pool);
      const foreignSnapshotId = await seedFactsSnapshot(pool, otherFundId);

      // The composite (id, fund_id) FK makes the cross-fund pin unrepresentable.
      await expect(insertDraft(pool, fundId, foreignSnapshotId, 'cross')).rejects.toThrow(
        /internal_analysis_drafts_facts_snapshot_fund_fk/
      );
    });
  });

  it('keeps each reference revision chain linear', async () => {
    const { connectionString } = await createMigratedDatabase('chain');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      const snapshotId = await seedFactsSnapshot(pool, fundId);

      const original = await insertReference(pool, fundId, snapshotId, 'ref-a', null);
      const successor = await insertReference(pool, fundId, snapshotId, 'ref-b', original);
      expect(successor).toEqual(expect.any(Number));

      // A second reference cannot supersede the same predecessor.
      await expect(insertReference(pool, fundId, snapshotId, 'ref-c', original)).rejects.toThrow(
        /internal_analysis_references_supersedes_unique/
      );

      // Nor may a reference supersede itself.
      await expect(
        pool.query(
          `UPDATE internal_analysis_references SET supersedes_reference_id = id WHERE id = $1`,
          [successor]
        )
      ).rejects.toThrow(/internal_analysis_references_no_self_supersede_check/);
    });
  });

  it('requires exactly one typed source on a generated narrative claim', async () => {
    const { connectionString } = await createMigratedDatabase('claims');

    await withPool(connectionString, async (pool) => {
      const fundId = await seedFund(pool);
      const snapshotId = await seedFactsSnapshot(pool, fundId);
      const referenceId = await insertReference(pool, fundId, snapshotId, 'ref-claims', null);
      const narrativeDraftId = await insertNarrativeDraft(pool, fundId, referenceId);

      // A generated claim with no source is rejected...
      await expect(
        insertClaim(pool, { fundId, narrativeDraftId, ordinal: 1, authorship: 'generated' })
      ).rejects.toThrow(/internal_narrative_claims_exactly_one_source_check/);

      // ...and so is one carrying two.
      await expect(
        insertClaim(pool, {
          fundId,
          narrativeDraftId,
          ordinal: 2,
          authorship: 'generated',
          sourceFactsSnapshotId: snapshotId,
          sourceAnalysisReferenceId: referenceId,
        })
      ).rejects.toThrow(/internal_narrative_claims_exactly_one_source_check/);

      // Exactly one source is accepted.
      await expect(
        insertClaim(pool, {
          fundId,
          narrativeDraftId,
          ordinal: 3,
          authorship: 'generated',
          sourceFactsSnapshotId: snapshotId,
        })
      ).resolves.toEqual(expect.any(Number));

      // User commentary may be uncited.
      await expect(
        insertClaim(pool, {
          fundId,
          narrativeDraftId,
          ordinal: 4,
          authorship: 'user_authored_commentary',
        })
      ).resolves.toEqual(expect.any(Number));
    });
  });
});

function claimSql(): string {
  return `
    WITH next_job AS (
      SELECT id
      FROM job_outbox
      WHERE job_type = '${QUARTERLY_JOB_TYPE}'
        AND status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
        AND (next_run_at IS NULL OR next_run_at <= NOW())
      ORDER BY next_run_at ASC NULLS FIRST, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE job_outbox AS j
    SET status = 'processing',
        processing_at = NOW(),
        attempt_count = COALESCE(j.attempt_count, 0) + 1,
        updated_at = NOW()
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.id
  `;
}

function enqueueQuarterlyJob(pool: Pool, dedupeKey: string, fundId: number) {
  return pool.query(
    `
      INSERT INTO job_outbox (job_type, dedupe_key, payload, status, scheduled_for, next_run_at)
      VALUES ($1, $2, $3::jsonb, 'pending', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
    [
      QUARTERLY_JOB_TYPE,
      dedupeKey,
      JSON.stringify({
        kind: QUARTERLY_JOB_TYPE,
        fundId,
        periodKind: 'quarterly',
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
      }),
    ]
  );
}

async function seedFund(pool: Pool): Promise<number> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `Task 18 Fund ${fundId}`]
  );
  return fundId;
}

async function seedFactsSnapshot(pool: Pool, fundId: number): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
      ) VALUES (
        $1, 'financial-facts-policy/1.1.0', 'financial-facts-payload/2', $2, NOW(),
        'fund_all', '[]'::jsonb, $3, $4, $5, '{}'::jsonb, '[]'::jsonb, $6, $7
      )
      RETURNING id
    `,
    [
      fundId,
      PERIOD.end,
      hex64(`selection-${fundId}`),
      hex64(`source-${fundId}`),
      hex64(`snapshot-${fundId}`),
      `facts-${fundId}`,
      hex64(`request-${fundId}`),
    ]
  );
}

function insertDraft(
  pool: Pool,
  fundId: number,
  factsSnapshotId: number,
  idempotencyKey: string
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO internal_analysis_drafts (
        fund_id, period_kind, period_start, period_end, knowledge_cutoff,
        financial_facts_snapshot_id, idempotency_key, request_hash
      ) VALUES ($1, 'quarterly', $2, $3, NOW(), $4, $5, $6)
      RETURNING id
    `,
    [fundId, PERIOD.start, PERIOD.end, factsSnapshotId, idempotencyKey, hex64(idempotencyKey)]
  );
}

function insertReference(
  pool: Pool,
  fundId: number,
  factsSnapshotId: number,
  idempotencyKey: string,
  supersedesReferenceId: number | null
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO internal_analysis_references (
        fund_id, period_kind, period_start, period_end, knowledge_cutoff,
        financial_facts_snapshot_id, supersedes_reference_id, idempotency_key, request_hash
      ) VALUES ($1, 'quarterly', $2, $3, NOW(), $4, $5, $6, $7)
      RETURNING id
    `,
    [
      fundId,
      PERIOD.start,
      PERIOD.end,
      factsSnapshotId,
      supersedesReferenceId,
      idempotencyKey,
      hex64(idempotencyKey),
    ]
  );
}

function insertNarrativeDraft(
  pool: Pool,
  fundId: number,
  analysisReferenceId: number
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO internal_narrative_drafts (
        fund_id, analysis_reference_id, idempotency_key, request_hash
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [fundId, analysisReferenceId, `narrative-${analysisReferenceId}`, hex64('narrative')]
  );
}

function insertClaim(
  pool: Pool,
  input: {
    fundId: number;
    narrativeDraftId: number;
    ordinal: number;
    authorship: 'generated' | 'user_authored_commentary';
    sourceFactsSnapshotId?: number;
    sourceAnalysisReferenceId?: number;
  }
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO internal_narrative_claims (
        fund_id, narrative_draft_id, ordinal, marker, body, authorship,
        source_facts_snapshot_id, source_analysis_reference_id
      ) VALUES ($1, $2, $3, $4, 'claim body', $5, $6, $7)
      RETURNING id
    `,
    [
      input.fundId,
      input.narrativeDraftId,
      input.ordinal,
      `[S${input.ordinal}]`,
      input.authorship,
      input.sourceFactsSnapshotId ?? null,
      input.sourceAnalysisReferenceId ?? null,
    ]
  );
}

async function createMigratedDatabase(suffix: string): Promise<{ connectionString: string }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const databaseName = `task18_${suffix}_${process.pid}_${Date.now()}`.toLowerCase();
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  await withPool(connectionString, async (pool) => {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  });
  await runMigrationsWithConnectionString(connectionString, '0044_internal_analysis');
  return { connectionString };
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

async function countRows(pool: Pool, table: string): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function scalar(pool: Pool, sql: string): Promise<unknown> {
  const result = await pool.query(sql);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
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
