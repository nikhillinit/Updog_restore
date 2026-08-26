import { describe, expect, it, vi } from 'vitest';

import type { PortfolioCompanyUpdateVersionConflictError } from '../../../server/services/portfolio-company-update-service';
import {
  PORTFOLIO_COMPANY_METADATA_UPDATE_ROUTE,
  PortfolioCompanyUpdateIdempotencyReuseError,
  updatePortfolioCompanyMetadata,
  type PortfolioCompanyUpdateDatabase,
} from '../../../server/services/portfolio-company-update-service';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import type { PortfolioCompanyUpdateRequestInput } from '@shared/schemas/portfolio-route';

const companyRow = {
  id: 11,
  fund_id: 7,
  name: 'Original Company',
  sector: 'Enterprise',
  stage: 'Seed',
  current_stage: null,
  investment_amount: '1000000.00',
  investment_date: null,
  current_valuation: '2500000.00',
  founded_year: 2018,
  status: 'active',
  description: 'Original description',
  deal_tags: ['AI'],
  created_at: '2026-01-01T00:00:00.000Z',
  deployed_reserves_cents: 0,
  planned_reserves_cents: 100000,
  exit_moic_bps: null,
  exit_probability: null,
  ownership_current_pct: null,
  allocation_cap_cents: null,
  allocation_reason: null,
  allocation_iteration: 0,
  last_allocation_at: null,
  allocation_version: 1,
  row_version: 1,
  updated_at: '2026-01-01T00:00:00.000Z',
};

const request: PortfolioCompanyUpdateRequestInput = {
  expectedVersion: 1,
  patch: { name: 'Updated Company', description: null, dealTags: null },
};

const receiptFields = {
  response_id: 11,
  response_fund_id: 7,
  response_name: 'Updated Company',
  response_sector: 'Enterprise',
  response_stage: 'Seed',
  response_current_stage: null,
  response_investment_amount: '1000000.00',
  response_investment_date: null,
  response_current_valuation: '2500000.00',
  response_founded_year: 2018,
  response_company_status: 'active',
  response_description: null,
  response_deal_tags: null,
  response_created_at: '2026-01-01T00:00:00.000Z',
  response_deployed_reserves_cents: 0,
  response_planned_reserves_cents: 100000,
  response_exit_moic_bps: null,
  response_exit_probability: null,
  response_ownership_current_pct: null,
  response_allocation_cap_cents: null,
  response_allocation_reason: null,
  response_allocation_iteration: 0,
  response_last_allocation_at: null,
  response_allocation_version: 1,
  response_status: 200,
  response_row_version: 2,
  response_updated_at: '2026-01-02T00:00:00.000Z',
};

function makeDatabase(rows: unknown[]) {
  const execute = vi.fn();
  for (const row of rows) {
    execute.mockResolvedValueOnce({ rows: Array.isArray(row) ? row : [] });
  }
  const tx = { execute };
  const transaction = vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
    callback(tx)
  );
  return {
    database: { transaction } as unknown as PortfolioCompanyUpdateDatabase,
    execute,
    transaction,
  };
}

describe('portfolio company metadata update service', () => {
  it('updates metadata and writes receipt within one transaction', async () => {
    const updatedRow = {
      ...companyRow,
      name: 'Updated Company',
      description: null,
      deal_tags: null,
      row_version: 2,
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    const database = makeDatabase([
      [{ id: companyRow.id }],
      [],
      [],
      [companyRow],
      [updatedRow],
      [],
    ]);

    const result = await updatePortfolioCompanyMetadata({
      fundId: 7,
      companyId: 11,
      actorId: 22,
      idempotencyKey: 'metadata-update-1',
      request,
      database: database.database,
    });

    expect(result).toMatchObject({ replayed: false, response: { rowVersion: 2 } });
    expect(result.response).toMatchObject({
      name: 'Updated Company',
      description: null,
      dealTags: null,
    });
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(database.execute).toHaveBeenCalledTimes(6);
  });

  it('replays same-hash requests without a second update', async () => {
    const requestHash = canonicalSha256({
      route: PORTFOLIO_COMPANY_METADATA_UPDATE_ROUTE,
      fundId: 7,
      companyId: 11,
      expectedVersion: request.expectedVersion,
      patch: request.patch,
    });
    const database = makeDatabase([
      [{ id: companyRow.id }],
      [],
      [
        {
          request_hash: requestHash,
          ...receiptFields,
        },
      ],
    ]);

    const replay = await updatePortfolioCompanyMetadata({
      fundId: 7,
      companyId: 11,
      actorId: 22,
      idempotencyKey: 'metadata-update-2',
      request,
      database: database.database,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.response.rowVersion).toBe(2);
    expect(database.execute).toHaveBeenCalledTimes(3);
  });

  it('rejects reuse of an idempotency key for a different canonical request', async () => {
    const database = makeDatabase([
      [{ id: companyRow.id }],
      [],
      [
        {
          request_hash: 'different-hash',
          ...receiptFields,
        },
      ],
    ]);

    await expect(
      updatePortfolioCompanyMetadata({
        fundId: 7,
        companyId: 11,
        actorId: 22,
        idempotencyKey: 'metadata-update-3',
        request,
        database: database.database,
      })
    ).rejects.toBeInstanceOf(PortfolioCompanyUpdateIdempotencyReuseError);
  });

  it('turns a zero-row CAS update into a version conflict', async () => {
    const database = makeDatabase([
      [{ id: companyRow.id }],
      [],
      [],
      [{ ...companyRow, row_version: 2 }],
      [],
    ]);

    await expect(
      updatePortfolioCompanyMetadata({
        fundId: 7,
        companyId: 11,
        actorId: 22,
        idempotencyKey: 'metadata-update-4',
        request,
        database: database.database,
      })
    ).rejects.toMatchObject<Partial<PortfolioCompanyUpdateVersionConflictError>>({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
      actualVersion: 2,
    });
  });
});
