import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, isNull, or } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fundEvents, fundMetrics } from '../../shared/schema';
import { lpCapitalCalls, lpDistributionDetails, lpDocuments } from '../../shared/schema-lp-sprint3';
import { capitalActivities, lpFundCommitments } from '../../shared/schema-lp-reporting';
import { funds, fundSnapshots } from '../../shared/schema/fund';
import { productionFundPredicate } from '../../server/lib/canary-exclusion';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

type Database = ReturnType<typeof drizzle>;

let pool: Pool | undefined;
let database: Database | undefined;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('canary exclusion differential PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      // setupTestContainers already applies the full Drizzle migration set.
      await setupTestContainers();
      startedTestContainers = true;
    }

    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL ?? getPostgresConnectionString(),
      max: 2,
    });
    database = drizzle(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('keeps governed cross-fund results byte-for-byte stable after adding a canary fund', async () => {
    if (!database || !pool) throw new Error('test database was not initialized');

    const suffix = randomUUID();
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (username, password, role, is_release_canary_principal)
       VALUES ($1, 'canary-test-secret', 'partner', true)
       RETURNING id`,
      [`canary-exclusion-${suffix}`]
    );
    const productionFund = await pool.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, '1000000.00', '0.0200', '0.2000', 2026)
       RETURNING id`,
      [`Canary exclusion production ${suffix}`]
    );
    const userId = user.rows[0]!.id;
    const productionFundId = productionFund.rows[0]!.id;
    let canaryRunId: string | undefined;
    let canaryFundId: number | undefined;
    let lpId: number | undefined;
    let commitmentId: number | undefined;
    let globalDocumentId: string | undefined;
    let nullableActivityId: number | undefined;

    try {
      const lp = await pool.query<{ id: number }>(
        `INSERT INTO limited_partners (name, email, entity_type)
         VALUES ($1, $2, 'institution')
         RETURNING id`,
        [`Canary exclusion LP ${suffix}`, `canary-exclusion-${suffix}@example.com`]
      );
      lpId = lp.rows[0]!.id;
      const commitment = await pool.query<{ id: number }>(
        `INSERT INTO lp_fund_commitments
           (lp_id, fund_id, commitment_amount_cents, commitment_date)
         VALUES ($1, $2, 100000, clock_timestamp())
         RETURNING id`,
        [lpId, productionFundId]
      );
      commitmentId = commitment.rows[0]!.id;
      const globalDocument = await pool.query<{ id: string }>(
        `INSERT INTO lp_documents
           (lp_id, fund_id, document_type, title, file_name, file_size, mime_type, storage_key)
         VALUES ($1, NULL, 'other', 'Global LP document', 'global.pdf', 1,
                 'application/pdf', $2)
         RETURNING id`,
        [lpId, `canary-exclusion/${suffix}/global.pdf`]
      );
      globalDocumentId = globalDocument.rows[0]!.id;
      const nullableActivity = await pool.query<{ id: number }>(
        `INSERT INTO capital_activities
           (commitment_id, activity_type, amount_cents, activity_date, effective_date, fund_id)
         VALUES ($1, 'capital_call', 1000, clock_timestamp(), clock_timestamp(), NULL)
         RETURNING id`,
        [commitmentId]
      );
      nullableActivityId = nullableActivity.rows[0]!.id;

      const baseline = await governedReportingProbe(database);
      expect(baseline.documents.some(({ id }) => id === globalDocumentId)).toBe(true);
      expect(baseline.activities.some(({ id }) => id === nullableActivityId)).toBe(true);
      canaryRunId = randomUUID();
      const canaryRun = await pool.query<{ id: string }>(
        `INSERT INTO release_canary_runs
           (id, release_version, release_sha, deployment_id, worker_deployment_id,
            correlation_id, principal_user_id, expires_at)
         VALUES ($1, 'test', 'test', 'test', 'test', $2, $3, clock_timestamp() + interval '1 hour')
         RETURNING id`,
        [canaryRunId, suffix, userId]
      );
      const canaryFund = await pool.query<{ id: number }>(
        `INSERT INTO funds
           (name, size, management_fee, carry_percentage, vintage_year, data_origin, canary_run_id)
         VALUES ($1, '1000000.00', '0.0200', '0.2000', 2026, 'release_canary', $2)
         RETURNING id`,
        [`Canary exclusion smoke ${suffix}`, canaryRun.rows[0]!.id]
      );
      canaryFundId = canaryFund.rows[0]!.id;
      await pool.query(
        `INSERT INTO fund_metrics (fund_id, metric_date, as_of_date, "totalvalue")
         VALUES ($1, clock_timestamp(), clock_timestamp(), '123.45')`,
        [canaryFundId]
      );
      await pool.query(
        `INSERT INTO fund_snapshots
           (fund_id, type, payload, calc_version, correlation_id, snapshot_time)
         VALUES ($1, 'RESERVE', '{}'::jsonb, 'canary-test', $2, clock_timestamp())`,
        [canaryFundId, suffix]
      );
      await pool.query(
        `INSERT INTO fund_events (fund_id, event_type, event_time)
         VALUES ($1, 'CANARY_TEST', clock_timestamp())`,
        [canaryFundId]
      );

      const afterCanary = await governedReportingProbe(database);
      expect(afterCanary).toEqual(baseline);
      expect(afterCanary.funds.some(({ id }) => id === canaryFundId)).toBe(false);
      expect(afterCanary.funds.some(({ id }) => id === productionFundId)).toBe(true);

      const authorizedDirectRead = await database
        .select({ id: funds.id, dataOrigin: funds.dataOrigin })
        .from(funds)
        .where(eq(funds.id, canaryFundId));
      expect(authorizedDirectRead).toEqual([{ id: canaryFundId, dataOrigin: 'release_canary' }]);
    } finally {
      if (canaryFundId !== undefined) {
        await pool.query('DELETE FROM fund_events WHERE fund_id = $1', [canaryFundId]);
        await pool.query('DELETE FROM fund_snapshots WHERE fund_id = $1', [canaryFundId]);
        await pool.query('DELETE FROM fund_metrics WHERE fund_id = $1', [canaryFundId]);
        await pool.query('DELETE FROM funds WHERE id = $1', [canaryFundId]);
      }
      if (canaryRunId !== undefined) {
        await pool.query('DELETE FROM release_canary_runs WHERE id = $1', [canaryRunId]);
      }
      if (nullableActivityId !== undefined) {
        await pool.query('DELETE FROM capital_activities WHERE id = $1', [nullableActivityId]);
      }
      if (globalDocumentId !== undefined) {
        await pool.query('DELETE FROM lp_documents WHERE id = $1', [globalDocumentId]);
      }
      if (commitmentId !== undefined) {
        await pool.query('DELETE FROM lp_fund_commitments WHERE id = $1', [commitmentId]);
      }
      if (lpId !== undefined) {
        await pool.query('DELETE FROM limited_partners WHERE id = $1', [lpId]);
      }
      await pool.query('DELETE FROM funds WHERE id = $1', [productionFundId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });
});

async function governedReportingProbe(database: Database) {
  const [
    fundRows,
    metricRows,
    snapshotRows,
    eventRows,
    capitalCallRows,
    distributionRows,
    documentRows,
    commitmentRows,
    activityRows,
  ] = await Promise.all([
    database
      .select({ id: funds.id, name: funds.name, dataOrigin: funds.dataOrigin })
      .from(funds)
      .where(productionFundPredicate())
      .orderBy(funds.id),
    database
      .select({ id: fundMetrics.id, fundId: fundMetrics.fundId })
      .from(fundMetrics)
      .innerJoin(funds, eq(fundMetrics.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(fundMetrics.id),
    database
      .select({ id: fundSnapshots.id, fundId: fundSnapshots.fundId })
      .from(fundSnapshots)
      .innerJoin(funds, eq(fundSnapshots.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(fundSnapshots.id),
    database
      .select({ id: fundEvents.id, fundId: fundEvents.fundId })
      .from(fundEvents)
      .innerJoin(funds, eq(fundEvents.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(fundEvents.id),
    database
      .select({ id: lpCapitalCalls.id, fundId: lpCapitalCalls.fundId })
      .from(lpCapitalCalls)
      .innerJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(lpCapitalCalls.id),
    database
      .select({ id: lpDistributionDetails.id, fundId: lpDistributionDetails.fundId })
      .from(lpDistributionDetails)
      .innerJoin(funds, eq(lpDistributionDetails.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(lpDistributionDetails.id),
    database
      .select({ id: lpDocuments.id, fundId: lpDocuments.fundId })
      .from(lpDocuments)
      .leftJoin(funds, eq(lpDocuments.fundId, funds.id))
      .where(or(isNull(funds.id), productionFundPredicate(funds.dataOrigin)))
      .orderBy(lpDocuments.id),
    database
      .select({ id: lpFundCommitments.id, fundId: lpFundCommitments.fundId })
      .from(lpFundCommitments)
      .innerJoin(funds, eq(lpFundCommitments.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(lpFundCommitments.id),
    database
      .select({ id: capitalActivities.id, fundId: lpFundCommitments.fundId })
      .from(capitalActivities)
      .innerJoin(lpFundCommitments, eq(capitalActivities.commitmentId, lpFundCommitments.id))
      .innerJoin(funds, eq(lpFundCommitments.fundId, funds.id))
      .where(productionFundPredicate())
      .orderBy(capitalActivities.id),
  ]);

  return {
    funds: fundRows,
    metrics: metricRows,
    snapshots: snapshotRows,
    events: eventRows,
    capitalCalls: capitalCallRows,
    distributions: distributionRows,
    documents: documentRows,
    commitments: commitmentRows,
    activities: activityRows,
  };
}
