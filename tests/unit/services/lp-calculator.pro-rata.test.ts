import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

// Same chainable-select double as tests/unit/routes/lp-api.contract.test.ts:
// each db.select() consumes the next queued result, in call order.
const dbState = vi.hoisted(() => {
  const state = { selectResults: [] as unknown[][] };

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      innerJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: (
        onfulfilled?: (value: unknown[]) => unknown,
        onrejected?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
    } as QueryChain;
    return query;
  }

  const db = {
    select: vi.fn(() => makeQuery(state.selectResults.shift() ?? [])),
  };

  return { db, state };
});

const storageState = vi.hoisted(() => ({
  getFund: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db, pool: null }));
vi.mock('../../../server/storage', () => ({ storage: storageState }));

import { lpCalculator } from '../../../server/services/lp-calculator';

const LP_ID = 9001;
const FUND_ID = 7;
// $250k commitment into a $1M fund: LP owns 25% of the fund.
const LP_PCT_OF_FUND = 0.25;

const companies = [
  { id: 1, name: 'Alpha', sector: 'SaaS', stage: 'Seed', currentValuation: '10000000' },
  { id: 2, name: 'Beta', sector: 'Fintech', stage: 'Series A', currentValuation: '4000000' },
  { id: 3, name: 'Gamma', sector: 'Health', stage: 'Seed', currentValuation: '8000000' },
];

describe('LPCalculator.calculateProRataHoldings ownership handling (ADR-054)', () => {
  beforeEach(() => {
    dbState.state.selectResults = [];
    dbState.db.select.mockClear();
    storageState.getFund.mockReset();
    storageState.getFund.mockResolvedValue({ id: FUND_ID, size: '1000000' });

    dbState.state.selectResults.push([
      { lp_fund_commitments: { lpId: LP_ID, fundId: FUND_ID, commitmentAmountCents: 25000000n } },
    ]);
    dbState.state.selectResults.push(companies);
    dbState.state.selectResults.push([
      { companyId: 1, ownershipPercentage: '0.1500' },
      { companyId: 2, ownershipPercentage: '0.0000' },
      // Gamma (3) has no investments row: ownership is unrecorded, not zero.
    ]);
  });

  it('discloses a company with no recorded ownership instead of pricing it at zero', async () => {
    const { holdings, unpricedCompanies } = await lpCalculator.calculateProRataHoldings(
      LP_ID,
      FUND_ID
    );

    expect(holdings.map((h) => h.companyId)).not.toContain(3);
    expect(unpricedCompanies).toEqual([{ companyId: 3, companyName: 'Gamma' }]);
    expect(holdings.length + unpricedCompanies.length).toBe(companies.length);
  });

  it('keeps a recorded zero ownership priced at 0', async () => {
    const { holdings } = await lpCalculator.calculateProRataHoldings(LP_ID, FUND_ID);

    const beta = holdings.find((h) => h.companyId === 2);
    expect(beta).toMatchObject({
      companyName: 'Beta',
      lpSharePercentage: 0,
      currentValuation: 4000000,
      lpProRataValue: 0,
    });
  });

  it('prices recorded ownership as valuation x LP share of fund x ownership', async () => {
    const { holdings } = await lpCalculator.calculateProRataHoldings(LP_ID, FUND_ID);

    const alpha = holdings.find((h) => h.companyId === 1);
    expect(alpha?.lpSharePercentage).toBe(LP_PCT_OF_FUND * 0.15);
    expect(alpha?.lpProRataValue).toBe(10000000 * (LP_PCT_OF_FUND * 0.15));
    expect(holdings.map((h) => h.companyId)).toEqual([1, 2]);
  });
});
