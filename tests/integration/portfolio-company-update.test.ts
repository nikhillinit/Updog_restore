import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

let pool: Pool;
let database: ReturnType<typeof drizzle<typeof schema>>;
let updatePortfolioCompanyMetadata: typeof import('../../server/services/portfolio-company-update-service').updatePortfolioCompanyMetadata;
let startedTestContainers = false;

describe('portfolio company update PostgreSQL concurrency and replay', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    database = drizzle(pool, { schema });
    ({ updatePortfolioCompanyMetadata } =
      await import('../../server/services/portfolio-company-update-service'));
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('serializes same-key updates and replays the exact receipt snapshot', async () => {
    const username = `portfolio-update-${randomUUID()}`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (username, password, role) VALUES ($1, 'x', 'analyst') RETURNING id`,
      [username]
    );
    const fund = await pool.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, '1000000.00', '0.0200', '0.2000', 2026) RETURNING id`,
      [`Portfolio Update Fund ${randomUUID()}`]
    );
    const company = await pool.query<{ id: number }>(
      `INSERT INTO portfoliocompanies
         (fund_id, name, sector, stage, investment_amount, status, description, deal_tags,
          planned_reserves_cents)
       VALUES ($1, 'Original Company', 'Enterprise', 'Seed', '1000000.00', 'active', $2, $3,
          100000)
       RETURNING id`,
      [fund.rows[0]!.id, 'Original description', ['AI']]
    );

    const request = {
      expectedVersion: 1,
      patch: { name: 'Updated Company', description: null, dealTags: null },
    } as const;
    const params = {
      fundId: fund.rows[0]!.id,
      companyId: company.rows[0]!.id,
      actorId: user.rows[0]!.id,
      idempotencyKey: `same-key-${randomUUID()}`,
      request,
      database,
    };

    const [first, second] = await Promise.all([
      updatePortfolioCompanyMetadata(params),
      updatePortfolioCompanyMetadata(params),
    ]);

    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first.response).toEqual(second.response);
    expect(first.response).toMatchObject({
      name: 'Updated Company',
      description: null,
      dealTags: null,
      rowVersion: 2,
    });

    await pool.query(
      `UPDATE portfoliocompanies
          SET name = 'Later edit',
              status = 'exited',
              current_valuation = '9999999.00',
              planned_reserves_cents = 999999,
              allocation_iteration = 9,
              row_version = 3,
              updated_at = clock_timestamp()
        WHERE id = $1`,
      [params.companyId]
    );
    const replayAfterLaterEdit = await updatePortfolioCompanyMetadata(params);
    expect(replayAfterLaterEdit.replayed).toBe(true);
    expect(replayAfterLaterEdit.response).toEqual(first.response);

    const receipt = await pool.query(
      `SELECT request_hash, response_id, response_fund_id, response_name, response_sector,
              response_stage, response_current_stage, response_investment_amount,
              response_investment_date, response_current_valuation, response_founded_year,
              response_company_status, response_description, response_deal_tags,
              response_created_at, response_deployed_reserves_cents,
              response_planned_reserves_cents, response_exit_moic_bps,
              response_exit_probability, response_ownership_current_pct,
              response_allocation_cap_cents, response_allocation_reason,
              response_allocation_iteration, response_last_allocation_at,
              response_allocation_version, response_status, response_row_version,
              response_updated_at
         FROM portfolio_company_update_receipts
        WHERE fund_id = $1 AND company_id = $2 AND actor_id = $3
          AND idempotency_key = $4`,
      [params.fundId, params.companyId, params.actorId, params.idempotencyKey]
    );
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      response_id: params.companyId,
      response_fund_id: params.fundId,
      response_name: 'Updated Company',
      response_company_status: 'active',
      response_planned_reserves_cents: '100000',
      response_row_version: 2,
    });
    expect(receipt.rows[0].response_updated_at).toEqual(new Date(first.response.updatedAt));
  });

  it('rejects different requests under an existing key and stale versions', async () => {
    const username = `portfolio-update-${randomUUID()}`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (username, password, role) VALUES ($1, 'x', 'analyst') RETURNING id`,
      [username]
    );
    const fund = await pool.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, '1000000.00', '0.0200', '0.2000', 2026) RETURNING id`,
      [`Portfolio Update Conflict Fund ${randomUUID()}`]
    );
    const company = await pool.query<{ id: number }>(
      `INSERT INTO portfoliocompanies
         (fund_id, name, sector, stage, investment_amount, status)
       VALUES ($1, 'Conflict Company', 'Enterprise', 'Seed', '1000000.00', 'active')
       RETURNING id`,
      [fund.rows[0]!.id]
    );

    const base = {
      fundId: fund.rows[0]!.id,
      companyId: company.rows[0]!.id,
      actorId: user.rows[0]!.id,
      database,
    };
    const key = `conflict-key-${randomUUID()}`;
    await updatePortfolioCompanyMetadata({
      ...base,
      idempotencyKey: key,
      request: { expectedVersion: 1, patch: { name: 'First name' } },
    });

    await expect(
      updatePortfolioCompanyMetadata({
        ...base,
        idempotencyKey: key,
        request: { expectedVersion: 1, patch: { name: 'Different name' } },
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });

    await expect(
      updatePortfolioCompanyMetadata({
        ...base,
        idempotencyKey: `stale-key-${randomUUID()}`,
        request: { expectedVersion: 1, patch: { sector: 'Healthcare' } },
      })
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const current = await pool.query<{ name: string; sector: string; row_version: number }>(
      `SELECT name, sector, row_version FROM portfoliocompanies WHERE id = $1`,
      [base.companyId]
    );
    expect(current.rows[0]).toEqual({ name: 'First name', sector: 'Enterprise', row_version: 2 });
  });
});
