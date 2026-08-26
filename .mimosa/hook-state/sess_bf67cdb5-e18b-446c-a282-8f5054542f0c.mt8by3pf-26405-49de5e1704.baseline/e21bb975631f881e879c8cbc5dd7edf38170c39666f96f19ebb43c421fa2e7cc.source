/**
 * Native PostgreSQL proofs for quarterly-review migration 0048.
 *
 * Uses a uniquely named disposable database. TEST_DATABASE_URL is preferred;
 * testcontainers remains the fallback used by existing PostgreSQL suites.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import { weakETag } from '../../../server/lib/http-preconditions';
import {
  createAnalysisCheckpointPorts,
  saveDraftWithReceipt,
} from '../../../server/services/internal-analysis/analysis-checkpoint-service';
import {
  createQuarterlyReviewPorts,
  executeQuarterlyReviewItemCommand,
  executeQuarterlyReviewWaiverCommand,
} from '../../../server/services/internal-analysis/quarterly-review-service';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import {
  getMigrationStateFromConnectionString,
  runMigrationsWithConnectionString,
} from '../../helpers/testcontainers-migration';

const MIGRATION_TAG = '0048_quarterly_review_workflow';
const PERIOD = { start: '2026-04-01', end: '2026-06-30' };
const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let connectionString = '';
let databaseName = '';
let startedTestContainers = false;
let labelCounter = 0;

describe.skipIf(skipIfNoDocker)('quarterly review PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }

    adminPool = new Pool({ connectionString: adminConnectionString(), max: 1 });
    databaseName = `qr0048_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    connectionString = databaseConnectionString(databaseName);

    await runMigrationsWithConnectionString(connectionString, MIGRATION_TAG);
  }, 120_000);

  afterAll(async () => {
    if (adminPool && databaseName.startsWith('qr0048_')) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
      );
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('raw replay preserves exact quarterly catalog and migration journal', async () => {
    await withPool(async (pool) => {
      const catalogBefore = await quarterlyCatalog(pool);
      const journalBefore = await migrationJournal(pool);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const statement of migrationStatements()) {
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await runMigrationsWithConnectionString(connectionString, MIGRATION_TAG);

      expect(await quarterlyCatalog(pool)).toEqual(catalogBefore);
      expect(await migrationJournal(pool)).toEqual(journalBefore);
      expect(
        (await getMigrationStateFromConnectionString(connectionString)).applied.map(
          (entry) => entry.name
        )
      ).toContain(MIGRATION_TAG);
    });
  }, 120_000);

  it('rejects invalid waiver, changed-item, receipt-result, and cross-fund coupling', async () => {
    await withPool(async (pool) => {
      const basis = await seedBasis(pool, 'coupling');
      const foreign = await seedBasis(pool, 'foreign');

      await expect(
        pool.query(`UPDATE quarterly_review_companies SET waived_at = NOW() WHERE id = $1`, [
          basis.reviewCompanyId,
        ])
      ).rejects.toThrow(/quarterly_review_companies_waiver_coupling_check/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_items (
              fund_id, quarterly_review_company_id, category, state,
              note, reviewed_by, reviewed_at
            ) VALUES ($1, $2, 'kpis', 'changed', 'changed', $3, NOW())
          `,
          [basis.fundId, basis.reviewCompanyId, basis.userId]
        )
      ).rejects.toThrow(/quarterly_review_items_state_coupling_check/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_command_receipts (
              fund_id, analysis_draft_id, roster_id, operation, idempotency_key,
              request_hash, response_status, result_kind, actor_id
            ) VALUES ($1, $2, $3, 'draft_refresh', $4, $5, 200, 'draft', $6)
          `,
          [
            basis.fundId,
            basis.draftId,
            basis.rosterId,
            uniqueLabel('bad-result'),
            hex64('bad-result'),
            basis.userId,
          ]
        )
      ).rejects.toThrow(/quarterly_review_command_receipts_result_coupling_check/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_rosters (
              fund_id, analysis_draft_id, draft_version,
              financial_facts_snapshot_id, company_count, created_by
            ) VALUES ($1, $2, 1, $3, 0, $4)
          `,
          [basis.fundId, foreign.draftId, basis.factsSnapshotId, basis.userId]
        )
      ).rejects.toThrow(/quarterly_review_rosters_draft_fund_fk/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_companies (
              fund_id, quarterly_review_roster_id, portfolio_company_id
            ) VALUES ($1, $2, $3)
          `,
          [basis.fundId, basis.rosterId, foreign.portfolioCompanyId]
        )
      ).rejects.toThrow(/quarterly_review_companies_portfolio_company_fund_fk/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_items (
              fund_id, quarterly_review_company_id, category, follow_up_task_id
            ) VALUES ($1, $2, 'reserve_plan', $3)
          `,
          [basis.fundId, basis.reviewCompanyId, foreign.taskId]
        )
      ).rejects.toThrow(/quarterly_review_items_state_coupling_check/);

      await expect(
        pool.query(
          `
            INSERT INTO quarterly_review_items (
              fund_id, quarterly_review_company_id, category, state, note,
              reviewed_by, reviewed_at, change_ref_kind, change_ref_path,
              change_ref_label, follow_up_task_id
            ) VALUES (
              $1, $2, 'reserve_plan', 'changed', 'follow up', $3, NOW(),
              'internal_route', '/internal/funds/1', 'Open', $4
            )
          `,
          [basis.fundId, basis.reviewCompanyId, basis.userId, foreign.taskId]
        )
      ).rejects.toThrow(/quarterly_review_items_follow_up_task_fund_fk/);
    });
  });

  it('makes receipts immutable and serializes concurrent same-key commands', async () => {
    await withPool(async (pool) => {
      const basis = await seedBasis(pool, 'receipt');
      const receiptId = await insertItemReceipt(pool, basis, uniqueLabel('immutable'));

      await expect(
        pool.query(`UPDATE quarterly_review_command_receipts SET request_hash = $1 WHERE id = $2`, [
          hex64('mutated'),
          receiptId,
        ])
      ).rejects.toThrow(/quarterly_review_command_receipts are immutable/);

      const sameKey = uniqueLabel('same-key');
      const attempts = await Promise.allSettled([
        insertItemReceipt(pool, basis, sameKey),
        insertItemReceipt(pool, basis, sameKey),
      ]);

      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM quarterly_review_command_receipts WHERE fund_id = $1 AND idempotency_key = $2`,
          [basis.fundId, sameKey]
        )
      ).toBe(1);
    });
  });

  it('enforces restrict and cascade delete actions', async () => {
    await withPool(async (pool) => {
      const basis = await seedBasis(pool, 'deletes');
      const rosterFactsSnapshotId = await seedFactsSnapshot(
        pool,
        basis.fundId,
        uniqueLabel('roster-facts')
      );
      await pool.query(
        `UPDATE quarterly_review_rosters SET financial_facts_snapshot_id = $1 WHERE id = $2`,
        [rosterFactsSnapshotId, basis.rosterId]
      );
      const receiptActorId = await insertedId(
        pool,
        `INSERT INTO users (username, password) VALUES ($1, 'x') RETURNING id`,
        [uniqueLabel('receipt-actor')]
      );
      await insertItemReceipt(pool, { ...basis, userId: receiptActorId }, uniqueLabel('cascade'));

      await expect(
        pool.query(`DELETE FROM financial_facts_snapshots WHERE id = $1`, [rosterFactsSnapshotId])
      ).rejects.toThrow(/quarterly_review_rosters_facts_fund_fk/);
      await expect(
        pool.query(`DELETE FROM portfoliocompanies WHERE id = $1`, [basis.portfolioCompanyId])
      ).rejects.toThrow(/quarterly_review_companies_portfolio_company_fund_fk/);
      await expect(pool.query(`DELETE FROM users WHERE id = $1`, [receiptActorId])).rejects.toThrow(
        /quarterly_review_command_receipts_actor_fk/
      );

      await pool.query(`DELETE FROM internal_analysis_drafts WHERE id = $1`, [basis.draftId]);

      for (const table of [
        'quarterly_review_rosters',
        'quarterly_review_companies',
        'quarterly_review_items',
        'quarterly_review_command_receipts',
      ]) {
        expect(
          await scalar(pool, `SELECT COUNT(*)::int FROM ${table} WHERE fund_id = $1`, [
            basis.fundId,
          ])
        ).toBe(0);
      }
    });
  });

  it('blocks save on roster-count tamper without closing draft or writing reference/receipt', async () => {
    await withPool(async (pool) => {
      const basis = await seedBasis(pool, 'tamper');
      await pool.query(`UPDATE quarterly_review_rosters SET company_count = 2 WHERE id = $1`, [
        basis.rosterId,
      ]);

      const database = drizzle(pool, { schema });
      const ports = createAnalysisCheckpointPorts(database);
      await expect(
        saveDraftWithReceipt(ports, {
          fundId: basis.fundId,
          draftId: basis.draftId,
          acknowledgeMixedBasis: false,
          actorId: basis.userId,
          idempotencyKey: uniqueLabel('save-tamper'),
          rawIfMatch: weakETag(`internal-analysis-draft:${basis.fundId}:${basis.draftId}:1`),
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'QUARTERLY_REVIEW_ROSTER_CORRUPT' });

      expect(
        await scalar(pool, `SELECT saved_at IS NULL FROM internal_analysis_drafts WHERE id = $1`, [
          basis.draftId,
        ])
      ).toBe(true);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_references WHERE source_draft_id = $1`,
          [basis.draftId]
        )
      ).toBe(0);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM quarterly_review_command_receipts WHERE analysis_draft_id = $1`,
          [basis.draftId]
        )
      ).toBe(0);
    });
  });

  it('allows grantless admins but requires an explicit fund grant for analysts', async () => {
    await withPool(async (pool) => {
      const adminBasis = await seedBasis(pool, 'admin-auth');
      const analystBasis = await seedBasis(pool, 'analyst-auth');
      const analystId = await insertedId(
        pool,
        `INSERT INTO users (username, password, role) VALUES ($1, 'x', 'analyst') RETURNING id`,
        [uniqueLabel('analyst')]
      );
      const ports = createQuarterlyReviewPorts(drizzle(pool, { schema }));

      await expect(
        executeQuarterlyReviewItemCommand(
          ports,
          itemCommand(adminBasis, adminBasis.userId, uniqueLabel('admin-no-grant'))
        )
      ).resolves.toMatchObject({ operation: 'review_item_update', resultingRowVersion: 2 });
      expect(
        await scalar(pool, `SELECT COUNT(*)::int FROM user_fund_grants WHERE user_id = $1`, [
          adminBasis.userId,
        ])
      ).toBe(0);

      const analystKey = uniqueLabel('analyst-grant');
      await expect(
        executeQuarterlyReviewItemCommand(ports, itemCommand(analystBasis, analystId, analystKey))
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'QUARTERLY_REVIEW_ACTOR_FORBIDDEN',
      });
      expect(await receiptCount(pool, analystBasis.fundId, analystKey)).toBe(0);

      await pool.query(`INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)`, [
        analystId,
        analystBasis.fundId,
      ]);
      await expect(
        executeQuarterlyReviewItemCommand(ports, itemCommand(analystBasis, analystId, analystKey))
      ).resolves.toMatchObject({ operation: 'review_item_update', resultingRowVersion: 2 });
      expect(await receiptCount(pool, analystBasis.fundId, analystKey)).toBe(1);
    });
  });

  it('serializes item and refresh in both directions without mutating a stale review tuple', async () => {
    await withPool(async (pool) => {
      const refreshFirst = await seedBasis(pool, 'refresh-before-item');
      const refreshFirstFacts = await seedFactsSnapshot(
        pool,
        refreshFirst.fundId,
        uniqueLabel('refresh-first-facts')
      );
      const checkpointPorts = createAnalysisCheckpointPorts(drizzle(pool, { schema }));
      const reviewPorts = createQuarterlyReviewPorts(drizzle(pool, { schema }));
      const staleItemKey = uniqueLabel('stale-item');
      const refreshKey = uniqueLabel('refresh-first');

      const [refreshOutcome, staleItemOutcome] = await orderedDraftRace(
        pool,
        refreshFirst.draftId,
        () => refreshTransition(checkpointPorts, refreshFirst, refreshFirstFacts, refreshKey),
        () =>
          executeQuarterlyReviewItemCommand(
            reviewPorts,
            itemCommand(refreshFirst, refreshFirst.userId, staleItemKey)
          )
      );
      expect(refreshOutcome.status).toBe('fulfilled');
      expectRejectedCode(staleItemOutcome, 'QUARTERLY_REVIEW_BASIS_CONFLICT');
      if (staleItemOutcome.status === 'rejected') {
        expect(staleItemOutcome.reason).toMatchObject({
          statusCode: 412,
          details: {
            draftId: refreshFirst.draftId,
            draftVersion: 2,
            financialFactsSnapshotId: refreshFirstFacts,
          },
        });
      }
      expect(await itemVersion(pool, refreshFirst.itemId)).toEqual({
        state: 'pending',
        version: 1,
      });
      expect(await receiptCount(pool, refreshFirst.fundId, staleItemKey)).toBe(0);

      const staleWaiverKey = uniqueLabel('stale-waiver');
      await expect(
        executeQuarterlyReviewWaiverCommand(
          reviewPorts,
          waiverCommand(refreshFirst, staleWaiverKey)
        )
      ).rejects.toMatchObject({
        statusCode: 412,
        code: 'QUARTERLY_REVIEW_BASIS_CONFLICT',
        details: {
          draftId: refreshFirst.draftId,
          draftVersion: 2,
          financialFactsSnapshotId: refreshFirstFacts,
        },
      });
      expect(await receiptCount(pool, refreshFirst.fundId, staleWaiverKey)).toBe(0);

      await expect(
        executeQuarterlyReviewItemCommand(reviewPorts, {
          ...itemCommand(refreshFirst, refreshFirst.userId, uniqueLabel('out-of-range-company')),
          companyId: Number.MAX_SAFE_INTEGER,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_QUARTERLY_REVIEW_COMMAND_ID',
      });

      await expect(
        executeQuarterlyReviewItemCommand(reviewPorts, {
          ...itemCommand(refreshFirst, refreshFirst.userId, uniqueLabel('unknown-current-company')),
          companyId: 2_147_483_647,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'QUARTERLY_REVIEW_COMPANY_NOT_FOUND',
      });

      const itemFirst = await seedBasis(pool, 'item-before-refresh');
      const itemFirstFacts = await seedFactsSnapshot(
        pool,
        itemFirst.fundId,
        uniqueLabel('item-first-facts')
      );
      const [itemOutcome, laterRefreshOutcome] = await orderedDraftRace(
        pool,
        itemFirst.draftId,
        () =>
          executeQuarterlyReviewItemCommand(
            reviewPorts,
            itemCommand(itemFirst, itemFirst.userId, uniqueLabel('item-first'))
          ),
        () =>
          refreshTransition(
            checkpointPorts,
            itemFirst,
            itemFirstFacts,
            uniqueLabel('refresh-second')
          )
      );
      expect(itemOutcome.status).toBe('fulfilled');
      expect(laterRefreshOutcome.status).toBe('fulfilled');
      expect(await itemVersion(pool, itemFirst.itemId)).toEqual({
        state: 'reviewed_no_change',
        version: 2,
      });
      expect(await draftVersion(pool, itemFirst.draftId)).toBe(2);
    });
  });

  it('serializes waiver and finalize in both directions without applying a stale waiver', async () => {
    await withPool(async (pool) => {
      const saveFirst = await seedBasis(pool, 'save-before-waiver');
      await completeReview(pool, saveFirst);
      const checkpointPorts = createAnalysisCheckpointPorts(drizzle(pool, { schema }));
      const reviewPorts = createQuarterlyReviewPorts(drizzle(pool, { schema }));
      const saveKey = uniqueLabel('save-first');
      const staleWaiverKey = uniqueLabel('waiver-second');

      const [saveOutcome, staleWaiverOutcome] = await orderedDraftRace(
        pool,
        saveFirst.draftId,
        () => saveCommand(checkpointPorts, saveFirst, saveKey),
        () =>
          executeQuarterlyReviewWaiverCommand(reviewPorts, waiverCommand(saveFirst, staleWaiverKey))
      );
      expect(saveOutcome.status).toBe('fulfilled');
      expectRejectedCode(staleWaiverOutcome, 'DRAFT_ALREADY_SAVED');
      expect(
        await scalar(
          pool,
          `SELECT waived_at IS NULL FROM quarterly_review_companies WHERE id = $1`,
          [saveFirst.reviewCompanyId]
        )
      ).toBe(true);
      expect(await receiptCount(pool, saveFirst.fundId, staleWaiverKey)).toBe(0);

      const waiverFirst = await seedBasis(pool, 'waiver-before-save');
      const waiverKey = uniqueLabel('waiver-first');
      const laterSaveKey = uniqueLabel('save-second');
      const [waiverOutcome, laterSaveOutcome] = await orderedDraftRace(
        pool,
        waiverFirst.draftId,
        () =>
          executeQuarterlyReviewWaiverCommand(reviewPorts, waiverCommand(waiverFirst, waiverKey)),
        () => saveCommand(checkpointPorts, waiverFirst, laterSaveKey)
      );
      expect(waiverOutcome.status).toBe('fulfilled');
      expect(laterSaveOutcome.status).toBe('fulfilled');
      expect(await receiptCount(pool, waiverFirst.fundId, waiverKey)).toBe(1);
      expect(await receiptCount(pool, waiverFirst.fundId, laterSaveKey)).toBe(1);
    });
  });

  it('serializes refresh and save in both directions and rejects stale finalization', async () => {
    await withPool(async (pool) => {
      const refreshFirst = await seedBasis(pool, 'refresh-before-save');
      await completeReview(pool, refreshFirst);
      const refreshedFacts = await seedFactsSnapshot(
        pool,
        refreshFirst.fundId,
        uniqueLabel('refresh-save-facts')
      );
      const ports = createAnalysisCheckpointPorts(drizzle(pool, { schema }));
      const refreshKey = uniqueLabel('refresh-before-save');
      const staleSaveKey = uniqueLabel('stale-save');

      const [refreshOutcome, staleSaveOutcome] = await orderedDraftRace(
        pool,
        refreshFirst.draftId,
        () => refreshTransition(ports, refreshFirst, refreshedFacts, refreshKey),
        () => saveCommand(ports, refreshFirst, staleSaveKey)
      );
      expect(refreshOutcome.status).toBe('fulfilled');
      expectRejectedCode(staleSaveOutcome, 'DRAFT_VERSION_CONFLICT');
      expect(await draftVersion(pool, refreshFirst.draftId)).toBe(2);
      expect(await receiptCount(pool, refreshFirst.fundId, staleSaveKey)).toBe(0);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_references WHERE source_draft_id = $1`,
          [refreshFirst.draftId]
        )
      ).toBe(0);

      const saveFirst = await seedBasis(pool, 'save-before-refresh');
      await completeReview(pool, saveFirst);
      const nextFacts = await seedFactsSnapshot(
        pool,
        saveFirst.fundId,
        uniqueLabel('save-refresh-facts')
      );
      const staleRefreshKey = uniqueLabel('stale-refresh');
      const [saveOutcome, staleRefreshOutcome] = await orderedDraftRace(
        pool,
        saveFirst.draftId,
        () => saveCommand(ports, saveFirst, uniqueLabel('save-before-refresh')),
        () => refreshTransition(ports, saveFirst, nextFacts, staleRefreshKey)
      );
      expect(saveOutcome.status).toBe('fulfilled');
      expectRejectedCode(staleRefreshOutcome, 'DRAFT_ALREADY_SAVED');
      expect(await receiptCount(pool, saveFirst.fundId, staleRefreshKey)).toBe(0);
    });
  });

  it('replays concurrent identical item, waiver, refresh, and save caller keys once', async () => {
    await withPool(async (pool) => {
      const reviewPorts = createQuarterlyReviewPorts(drizzle(pool, { schema }));
      const checkpointPorts = createAnalysisCheckpointPorts(drizzle(pool, { schema }));

      const itemBasis = await seedBasis(pool, 'same-item');
      const itemKey = uniqueLabel('same-item-key');
      const itemResults = await Promise.all([
        executeQuarterlyReviewItemCommand(
          reviewPorts,
          itemCommand(itemBasis, itemBasis.userId, itemKey)
        ),
        executeQuarterlyReviewItemCommand(
          reviewPorts,
          itemCommand(itemBasis, itemBasis.userId, itemKey)
        ),
      ]);
      expect(itemResults[0]).toEqual(itemResults[1]);
      expect(await itemVersion(pool, itemBasis.itemId)).toMatchObject({ version: 2 });
      expect(await receiptCount(pool, itemBasis.fundId, itemKey)).toBe(1);

      const waiverBasis = await seedBasis(pool, 'same-waiver');
      const waiverKey = uniqueLabel('same-waiver-key');
      const waiverResults = await Promise.all([
        executeQuarterlyReviewWaiverCommand(reviewPorts, waiverCommand(waiverBasis, waiverKey)),
        executeQuarterlyReviewWaiverCommand(reviewPorts, waiverCommand(waiverBasis, waiverKey)),
      ]);
      expect(waiverResults[0]).toEqual(waiverResults[1]);
      expect(await receiptCount(pool, waiverBasis.fundId, waiverKey)).toBe(1);

      const refreshBasis = await seedBasis(pool, 'same-refresh');
      const refreshFacts = await seedFactsSnapshot(
        pool,
        refreshBasis.fundId,
        uniqueLabel('same-refresh-facts')
      );
      const refreshKey = uniqueLabel('same-refresh-key');
      const refreshResults = await Promise.all([
        refreshTransition(checkpointPorts, refreshBasis, refreshFacts, refreshKey),
        refreshTransition(checkpointPorts, refreshBasis, refreshFacts, refreshKey),
      ]);
      expect(refreshResults[0].result).toEqual(refreshResults[1].result);
      expect(await draftVersion(pool, refreshBasis.draftId)).toBe(2);
      expect(await receiptCount(pool, refreshBasis.fundId, refreshKey)).toBe(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_revision_events
           WHERE draft_id = $1 AND event_type = 'refreshed'`,
          [refreshBasis.draftId]
        )
      ).toBe(1);

      const saveBasis = await seedBasis(pool, 'same-save');
      await completeReview(pool, saveBasis);
      const saveKey = uniqueLabel('same-save-key');
      const saveResults = await Promise.all([
        saveCommand(checkpointPorts, saveBasis, saveKey),
        saveCommand(checkpointPorts, saveBasis, saveKey),
      ]);
      expect(saveResults[0]).toEqual(saveResults[1]);
      expect(await receiptCount(pool, saveBasis.fundId, saveKey)).toBe(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_references WHERE source_draft_id = $1`,
          [saveBasis.draftId]
        )
      ).toBe(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_revision_events
           WHERE draft_id = $1 AND event_type = 'saved'`,
          [saveBasis.draftId]
        )
      ).toBe(1);
    });
  });

  it('replays a concurrent identical economics-reference key with one compact receipt result', async () => {
    await withPool(async (pool) => {
      const basis = await seedBasis(pool, 'same-economics');
      const ports = createAnalysisCheckpointPorts(drizzle(pool, { schema }));
      const idempotencyKey = uniqueLabel('same-economics-key');

      const results = await Promise.all([
        economicsTransition(ports, basis, idempotencyKey),
        economicsTransition(ports, basis, idempotencyKey),
      ]);

      expect(results[0].result).toEqual(results[1].result);
      expect(results[0].result).toMatchObject({
        operation: 'economics_reference_replace',
        draftId: basis.draftId,
        targetId: basis.draftId,
        resultingDraftVersion: 1,
      });
      expect(await receiptCount(pool, basis.fundId, idempotencyKey)).toBe(1);
      expect(await draftVersion(pool, basis.draftId)).toBe(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM quarterly_review_rosters WHERE analysis_draft_id = $1`,
          [basis.draftId]
        )
      ).toBe(1);
    });
  });

  it('rolls back draft creation, refresh transition, and save close/reference on injected DB failure', async () => {
    await withPool(async (pool) => {
      const checkpointPorts = createAnalysisCheckpointPorts(drizzle(pool, { schema }));
      const createBasis = await seedBasis(pool, 'atomic-create');
      const createFacts = await seedFactsSnapshot(
        pool,
        createBasis.fundId,
        uniqueLabel('atomic-create-facts')
      );
      const createKey = uniqueLabel('atomic-create-key');
      await installFailTrigger(pool, 'quarterly_review_rosters', 'qr_test_fail_roster_insert');
      try {
        await expect(
          checkpointPorts.insertDraftWithRoster({
            fundId: createBasis.fundId,
            period: {
              periodKind: 'quarterly',
              periodStart: '2026-07-01',
              periodEnd: '2026-09-30',
            },
            basis: {
              financialFactsSnapshotId: createFacts,
              knowledgeCutoff: new Date('2026-10-01T00:00:00.000Z'),
              forecastFundSnapshotId: null,
            },
            sourceReferenceId: null,
            actorId: createBasis.userId,
            idempotencyKey: createKey,
          })
        ).rejects.toThrow(/Failed query/);
      } finally {
        await removeFailTrigger(pool, 'quarterly_review_rosters', 'qr_test_fail_roster_insert');
      }
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_drafts WHERE idempotency_key = $1`,
          [createKey]
        )
      ).toBe(0);

      const refreshBasis = await seedBasis(pool, 'atomic-refresh');
      const refreshFacts = await seedFactsSnapshot(
        pool,
        refreshBasis.fundId,
        uniqueLabel('atomic-refresh-facts')
      );
      const refreshKey = uniqueLabel('atomic-refresh-key');
      await installFailTrigger(
        pool,
        'quarterly_review_command_receipts',
        'qr_test_fail_refresh_receipt',
        "NEW.operation = 'draft_refresh'"
      );
      try {
        await expect(
          refreshTransition(checkpointPorts, refreshBasis, refreshFacts, refreshKey)
        ).rejects.toThrow(/Failed query/);
      } finally {
        await removeFailTrigger(
          pool,
          'quarterly_review_command_receipts',
          'qr_test_fail_refresh_receipt'
        );
      }
      expect(await draftVersion(pool, refreshBasis.draftId)).toBe(1);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM quarterly_review_rosters WHERE analysis_draft_id = $1`,
          [refreshBasis.draftId]
        )
      ).toBe(1);
      expect(await receiptCount(pool, refreshBasis.fundId, refreshKey)).toBe(0);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_revision_events
           WHERE draft_id = $1 AND event_type = 'refreshed'`,
          [refreshBasis.draftId]
        )
      ).toBe(0);

      const saveBasis = await seedBasis(pool, 'atomic-save');
      await completeReview(pool, saveBasis);
      const saveKey = uniqueLabel('atomic-save-key');
      await installFailTrigger(
        pool,
        'quarterly_review_command_receipts',
        'qr_test_fail_save_receipt',
        "NEW.operation = 'draft_save'"
      );
      try {
        await expect(saveCommand(checkpointPorts, saveBasis, saveKey)).rejects.toThrow(
          /Failed query/
        );
      } finally {
        await removeFailTrigger(
          pool,
          'quarterly_review_command_receipts',
          'qr_test_fail_save_receipt'
        );
      }
      expect(
        await scalar(pool, `SELECT saved_at IS NULL FROM internal_analysis_drafts WHERE id = $1`, [
          saveBasis.draftId,
        ])
      ).toBe(true);
      expect(
        await scalar(
          pool,
          `SELECT COUNT(*)::int FROM internal_analysis_references WHERE source_draft_id = $1`,
          [saveBasis.draftId]
        )
      ).toBe(0);
      expect(await receiptCount(pool, saveBasis.fundId, saveKey)).toBe(0);
    });
  });
});

interface Basis {
  fundId: number;
  userId: number;
  factsSnapshotId: number;
  draftId: number;
  portfolioCompanyId: number;
  taskId: number;
  rosterId: number;
  reviewCompanyId: number;
  itemId: number;
}

function itemCommand(basis: Basis, actorId: number, idempotencyKey: string) {
  return {
    fundId: basis.fundId,
    draftId: basis.draftId,
    companyId: basis.reviewCompanyId,
    actorId,
    idempotencyKey,
    rawIfMatch: weakETag(`quarterly-review-item:${basis.fundId}:${basis.itemId}:1`),
    category: 'cases_probabilities' as const,
    body: { state: 'reviewed_no_change' as const, note: 'Reviewed against current basis.' },
  };
}

function waiverCommand(basis: Basis, idempotencyKey: string) {
  return {
    fundId: basis.fundId,
    draftId: basis.draftId,
    companyId: basis.reviewCompanyId,
    actorId: basis.userId,
    idempotencyKey,
    rawIfMatch: weakETag(`quarterly-review-company:${basis.fundId}:${basis.reviewCompanyId}:1`),
    body: { reason: 'Partner approved waiver for this review basis.' },
  };
}

function saveCommand(
  ports: ReturnType<typeof createAnalysisCheckpointPorts>,
  basis: Basis,
  idempotencyKey: string
) {
  return saveDraftWithReceipt(ports, {
    fundId: basis.fundId,
    draftId: basis.draftId,
    acknowledgeMixedBasis: false,
    actorId: basis.userId,
    idempotencyKey,
    rawIfMatch: weakETag(`internal-analysis-draft:${basis.fundId}:${basis.draftId}:1`),
  });
}

function refreshTransition(
  ports: ReturnType<typeof createAnalysisCheckpointPorts>,
  basis: Basis,
  financialFactsSnapshotId: number,
  idempotencyKey: string
) {
  return ports.mutateOpenDraftWithRoster({
    operation: 'refresh',
    mutation: {
      fundId: basis.fundId,
      draftId: basis.draftId,
      expectedVersion: 1,
      basis: {
        financialFactsSnapshotId,
        knowledgeCutoff: new Date('2026-07-01T00:00:00.000Z'),
        forecastFundSnapshotId: null,
      },
      actorId: basis.userId,
    },
    command: {
      idempotencyKey,
      requestHash: hex64(`request-${idempotencyKey}`),
      actorId: basis.userId,
    },
  });
}

function economicsTransition(
  ports: ReturnType<typeof createAnalysisCheckpointPorts>,
  basis: Basis,
  idempotencyKey: string
) {
  return ports.mutateOpenDraftWithRoster({
    operation: 'economics_reference_replace',
    mutation: {
      fundId: basis.fundId,
      draftId: basis.draftId,
      expectedVersion: 1,
      economicsReferenceId: null,
    },
    command: {
      idempotencyKey,
      requestHash: hex64(`request-${idempotencyKey}`),
      actorId: basis.userId,
    },
  });
}

async function orderedDraftRace<First, Second>(
  pool: Pool,
  draftId: number,
  first: () => Promise<First>,
  second: () => Promise<Second>
): Promise<[PromiseSettledResult<First>, PromiseSettledResult<Second>]> {
  const blocker = await pool.connect();
  let transactionOpen = false;
  let firstPromise: Promise<First> | undefined;
  let secondPromise: Promise<Second> | undefined;
  try {
    await blocker.query('BEGIN');
    transactionOpen = true;
    await blocker.query(`SELECT id FROM internal_analysis_drafts WHERE id = $1 FOR UPDATE`, [
      draftId,
    ]);

    firstPromise = first();
    await waitForBlockedWaiters(pool, 1);
    secondPromise = second();
    await waitForBlockedWaiters(pool, 2);

    await blocker.query('COMMIT');
    transactionOpen = false;
    const outcomes = await Promise.allSettled([firstPromise, secondPromise]);
    return [outcomes[0], outcomes[1]];
  } finally {
    if (transactionOpen) await blocker.query('ROLLBACK');
    blocker.release();
    if (firstPromise || secondPromise) {
      await Promise.allSettled(
        [firstPromise, secondPromise].filter(
          (promise): promise is Promise<First> | Promise<Second> => promise !== undefined
        )
      );
    }
  }
}

async function waitForBlockedWaiters(pool: Pool, expectedCount: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const count = Number(
      await scalar(
        pool,
        `
          SELECT COUNT(*)::int
          FROM pg_stat_activity
          WHERE application_name = 'quarterly-review-pg-proof'
            AND cardinality(pg_blocking_pids(pid)) > 0
        `
      )
    );
    if (count >= expectedCount) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error(`Timed out waiting for ${expectedCount} blocked draft commands.`);
}

function expectRejectedCode(result: PromiseSettledResult<unknown>, code: string): void {
  expect(result.status).toBe('rejected');
  if (result.status === 'rejected') expect(result.reason).toMatchObject({ code });
}

async function completeReview(pool: Pool, basis: Basis): Promise<void> {
  await pool.query(
    `
      INSERT INTO quarterly_review_items (
        fund_id, quarterly_review_company_id, category
      )
      SELECT $1, $2, category
      FROM unnest(ARRAY[
        'cases_probabilities', 'kpis', 'valuation_fmv',
        'reserve_plan', 'qualitative_risks'
      ]::text[]) AS category
      ON CONFLICT (quarterly_review_company_id, category) DO NOTHING
    `,
    [basis.fundId, basis.reviewCompanyId]
  );
  await pool.query(
    `
      UPDATE quarterly_review_items
      SET state = 'reviewed_no_change', note = 'Reviewed against current basis.',
          reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
      WHERE fund_id = $2 AND quarterly_review_company_id = $3
    `,
    [basis.userId, basis.fundId, basis.reviewCompanyId]
  );
}

async function installFailTrigger(
  pool: Pool,
  table: string,
  trigger: string,
  predicate?: string
): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION qr_test_raise_failure()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'qr_test_injected_failure';
    END $$
  `);
  await pool.query(`
    CREATE TRIGGER ${quoteIdentifier(trigger)}
    BEFORE INSERT ON ${quoteIdentifier(table)}
    FOR EACH ROW ${predicate ? `WHEN (${predicate})` : ''}
    EXECUTE FUNCTION qr_test_raise_failure()
  `);
}

async function removeFailTrigger(pool: Pool, table: string, trigger: string): Promise<void> {
  await pool.query(
    `DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger)} ON ${quoteIdentifier(table)}`
  );
  await pool.query(`DROP FUNCTION IF EXISTS qr_test_raise_failure()`);
}

async function receiptCount(pool: Pool, fundId: number, idempotencyKey: string): Promise<number> {
  return Number(
    await scalar(
      pool,
      `SELECT COUNT(*)::int FROM quarterly_review_command_receipts WHERE fund_id = $1 AND idempotency_key = $2`,
      [fundId, idempotencyKey]
    )
  );
}

async function itemVersion(
  pool: Pool,
  itemId: number
): Promise<{ state: string; version: number }> {
  const result = await pool.query(
    `SELECT state, version FROM quarterly_review_items WHERE id = $1`,
    [itemId]
  );
  const row = result.rows[0] as { state?: unknown; version?: unknown } | undefined;
  if (typeof row?.state !== 'string' || typeof row.version !== 'number') {
    throw new Error('Expected quarterly review item state and version.');
  }
  return { state: row.state, version: row.version };
}

async function draftVersion(pool: Pool, draftId: number): Promise<number> {
  return Number(
    await scalar(pool, `SELECT version FROM internal_analysis_drafts WHERE id = $1`, [draftId])
  );
}

async function seedBasis(pool: Pool, label: string): Promise<Basis> {
  const suffix = uniqueLabel(label);
  const fundId = await insertedId(
    pool,
    `
      INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, 10000000, '0.0200', '0.2000', 2026)
      RETURNING id
    `,
    [`Quarterly Review ${suffix}`]
  );
  const userId = await insertedId(
    pool,
    `INSERT INTO users (username, password, role) VALUES ($1, 'x', 'admin') RETURNING id`,
    [`qr-${suffix}`]
  );
  const factsSnapshotId = await seedFactsSnapshot(pool, fundId, suffix);
  const draftId = await insertedId(
    pool,
    `
      INSERT INTO internal_analysis_drafts (
        fund_id, period_kind, period_start, period_end, knowledge_cutoff,
        financial_facts_snapshot_id, created_by, idempotency_key, request_hash
      ) VALUES ($1, 'quarterly', $2, $3, NOW(), $4, $5, $6, $7)
      RETURNING id
    `,
    [
      fundId,
      PERIOD.start,
      PERIOD.end,
      factsSnapshotId,
      userId,
      `${suffix}-draft`,
      hex64(`${suffix}-draft`),
    ]
  );
  const portfolioCompanyId = await insertedId(
    pool,
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      ) VALUES ($1, $2, 'Software', 'Series A', 1000000, 'active')
      RETURNING id
    `,
    [fundId, `Company ${suffix}`]
  );
  const taskId = await insertedId(
    pool,
    `INSERT INTO tasks (fund_id, title) VALUES ($1, $2) RETURNING id`,
    [fundId, `Review ${suffix}`]
  );
  const rosterId = await insertedId(
    pool,
    `
      INSERT INTO quarterly_review_rosters (
        fund_id, analysis_draft_id, draft_version,
        financial_facts_snapshot_id, company_count, created_by
      ) VALUES ($1, $2, 1, $3, 1, $4)
      RETURNING id
    `,
    [fundId, draftId, factsSnapshotId, userId]
  );
  const reviewCompanyId = await insertedId(
    pool,
    `
      INSERT INTO quarterly_review_companies (
        fund_id, quarterly_review_roster_id, portfolio_company_id
      ) VALUES ($1, $2, $3)
      RETURNING id
    `,
    [fundId, rosterId, portfolioCompanyId]
  );
  const itemId = await insertedId(
    pool,
    `
      INSERT INTO quarterly_review_items (
        fund_id, quarterly_review_company_id, category
      ) VALUES ($1, $2, 'cases_probabilities')
      RETURNING id
    `,
    [fundId, reviewCompanyId]
  );
  return {
    fundId,
    userId,
    factsSnapshotId,
    draftId,
    portfolioCompanyId,
    taskId,
    rosterId,
    reviewCompanyId,
    itemId,
  };
}

function seedFactsSnapshot(pool: Pool, fundId: number, label: string): Promise<number> {
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
      ) RETURNING id
    `,
    [
      fundId,
      PERIOD.end,
      hex64(`${label}-selection`),
      hex64(`${label}-source`),
      hex64(`${label}-snapshot`),
      `${label}-facts`,
      hex64(`${label}-facts-request`),
    ]
  );
}

function insertItemReceipt(pool: Pool, basis: Basis, idempotencyKey: string): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO quarterly_review_command_receipts (
        fund_id, analysis_draft_id, roster_id, operation, idempotency_key,
        request_hash, response_status, result_kind, result_item_id,
        result_row_version, actor_id
      ) VALUES ($1, $2, $3, 'review_item_update', $4, $5, 200, 'item', $6, 1, $7)
      RETURNING id
    `,
    [
      basis.fundId,
      basis.draftId,
      basis.rosterId,
      idempotencyKey,
      hex64(idempotencyKey),
      basis.itemId,
      basis.userId,
    ]
  );
}

async function quarterlyCatalog(pool: Pool): Promise<unknown[]> {
  const result = await pool.query(`
    SELECT kind, identity, definition
    FROM (
      SELECT
        'column'::text AS kind,
        table_name || '.' || column_name AS identity,
        concat_ws('|', ordinal_position, data_type, is_nullable,
          coalesce(character_maximum_length::text, ''), coalesce(column_default, '')) AS definition
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'quarterly_review_%'
      UNION ALL
      SELECT 'constraint', relation.relname || '.' || constraint_row.conname,
        pg_get_constraintdef(constraint_row.oid)
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname LIKE 'quarterly_review_%'
      UNION ALL
      SELECT 'index', tablename || '.' || indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'quarterly_review_%'
      UNION ALL
      SELECT 'trigger', event_object_table || '.' || trigger_name,
        action_timing || '|' || event_manipulation || '|' || action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND event_object_table LIKE 'quarterly_review_%'
      UNION ALL
      SELECT 'function', routine.proname, pg_get_functiondef(routine.oid)
      FROM pg_proc AS routine
      JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
        AND routine.proname = 'quarterly_review_command_receipts_forbid_update'
    ) AS catalog
    ORDER BY kind, identity
  `);
  return result.rows;
}

async function migrationJournal(pool: Pool): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT id, hash::text AS hash, created_at::text AS created_at FROM drizzle_migrations ORDER BY id`
  );
  return result.rows;
}

function migrationStatements(): string[] {
  return readFileSync(resolve(process.cwd(), 'migrations', `${MIGRATION_TAG}.sql`), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function adminConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(name: string): string {
  const url = new URL(adminConnectionString());
  url.pathname = `/${name}`;
  return url.toString();
}

async function withPool<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString,
    max: 6,
    statement_timeout: 5_000,
    query_timeout: 7_000,
    application_name: 'quarterly-review-pg-proof',
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function insertedId(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  const result = await pool.query(sql, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected inserted id.');
  return id;
}

async function scalar(pool: Pool, sql: string, values: unknown[] = []): Promise<unknown> {
  const result = await pool.query(sql, values);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function uniqueLabel(prefix: string): string {
  labelCounter += 1;
  return `${prefix}-${process.pid}-${labelCounter}`;
}

function hex64(seed: string): string {
  let value = '';
  for (let index = 0; value.length < 64; index += 1) {
    value += (seed.charCodeAt(index % seed.length) + index).toString(16).padStart(2, '0');
  }
  return value.slice(0, 64);
}
