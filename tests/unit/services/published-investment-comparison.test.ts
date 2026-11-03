import { beforeEach, describe, expect, it, vi } from 'vitest';

const { head, parse, select, baseline, rows } = vi.hoisted(() => ({
  head: vi.fn(),
  parse: vi.fn(),
  select: vi.fn(),
  baseline: vi.fn(),
  rows: { value: [] as unknown[] },
}));
vi.mock('../../../server/services/financial-facts-snapshot-service', () => ({
  getTerminalFinancialFactsHead: head,
}));
vi.mock('../../../server/services/financial-facts/parse-persisted-facts-row', () => ({
  parsePersistedFactsRow: parse,
}));
vi.mock('../../../server/services/forecast-investment-baseline', () => ({
  readForecastInvestmentBaseline: baseline,
}));
vi.mock('../../../server/db', () => ({ db: { select } }));

import {
  aggregatePublishedInvestments,
  readPublishedInvestmentComparison,
  type PublishedInvestment,
} from '../../../server/services/published-investment-comparison';

const investments: PublishedInvestment[] = [
  { eventId: 1, companyId: 10, effectiveDate: '2024-07-01', amount: '100.35', category: 'initial' },
  { eventId: 2, companyId: 11, effectiveDate: '2025-03-31', amount: '200.25', category: 'initial' },
  {
    eventId: 3,
    companyId: 10,
    effectiveDate: '2025-04-01',
    amount: '50.10',
    category: 'follow_on',
  },
];
const payload = {
  contractVersion: 'actuals-pilot-cash-flow/1.0.0',
  sourceExternalRef: 'test-row-1',
  rowContentHash: 'a'.repeat(64),
  templateVersion: 'actuals-ledger/1.0.0',
  settlementStatus: null,
  deploymentCategory: 'initial',
  expenseCategory: null,
  distributionType: null,
  recallable: null,
};

describe('published investment cadence', () => {
  it('uses exact decimal sums, calendar quarters, inclusive cutoff, and distinct companies', () => {
    const historical = aggregatePublishedInvestments(investments, '2025-03-31');
    expect(historical.actual).toEqual({
      deployedCapital: '300.600000',
      initialCapital: '300.600000',
      followOnCapital: '0',
      transactionCount: 2,
      companyCount: 2,
    });
    const current = aggregatePublishedInvestments([...investments].reverse(), '2026-11-03');
    expect(current.actual).toMatchObject({
      deployedCapital: '350.700000',
      initialCapital: '300.600000',
      followOnCapital: '50.100000',
      transactionCount: 3,
      companyCount: 2,
    });
    expect(
      current.periods.map((row) => [row.period, row.newCompanies, row.cumulativeCompanies])
    ).toEqual([
      ['2024-Q3', 1, 1],
      ['2025-Q1', 1, 2],
      ['2025-Q2', 0, 2],
    ]);
    expect(current.periods.some((row) => row.period === '2024-Q4')).toBe(false);
  });
  it('refuses duplicate event identities and negative amounts', () => {
    expect(() =>
      aggregatePublishedInvestments([investments[0]!, investments[0]!], '2026-11-03')
    ).toThrow('Duplicate');
    expect(() =>
      aggregatePublishedInvestments([{ ...investments[0]!, amount: '-1' }], '2026-11-03')
    ).toThrow('Invalid');
  });
  it('retains secondary and other investments in deployment and company counts without calling them follow-ons', () => {
    const result = aggregatePublishedInvestments(
      [
        ...investments,
        {
          eventId: 4,
          companyId: 12,
          effectiveDate: '2025-04-02',
          amount: '20.20',
          category: 'secondary',
        },
        {
          eventId: 5,
          companyId: 12,
          effectiveDate: '2025-04-03',
          amount: '10.10',
          category: 'other',
        },
      ],
      '2025-06-30'
    );
    expect(result.actual).toMatchObject({
      deployedCapital: '381.000000',
      initialCapital: '300.600000',
      followOnCapital: '50.100000',
      secondaryCapital: '20.200000',
      otherCapital: '10.100000',
      companyCount: 3,
      transactionCount: 5,
    });
  });
});

describe('published investment read seam', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { ACTUALS_LEDGER_TEMPLATE_VERSION } =
      await import('@shared/contracts/lp-reporting/actuals-pilot-templates');
    payload.templateVersion = ACTUALS_LEDGER_TEMPLATE_VERSION;
    head.mockResolvedValue({
      kind: 'head',
      row: {
        id: 31,
        fundId: 1,
        asOfDate: '2025-03-31',
        snapshotInputHash: 'a'.repeat(64),
        knowledgeCutoff: new Date('2026-11-03T00:00:00Z'),
      },
    });
    parse.mockReturnValue({
      kind: 'facts',
      snapshot: {
        fundId: 1,
        asOfDate: '2025-03-31',
        payload: {
          capitalActuals: {},
          cashFlowSeries: {
            warnings: [],
            series: [
              {
                eventType: 'portfolio_investment',
                vehicleId: 2,
                perspective: 'fund_gross',
                points: [
                  { eventId: 1, effectiveAt: '2024-07-01T00:00:00.000Z', amount: '100.350000' },
                ],
              },
            ],
          },
        },
      },
    });
    rows.value = [
      {
        id: 1,
        fundId: 1,
        vehicleId: 2,
        companyId: 10,
        currency: 'USD',
        status: 'approved',
        eventType: 'portfolio_investment',
        perspective: 'fund_gross',
        eventDate: new Date('2024-07-01T00:00:00Z'),
        amount: '100.35',
        payload,
      },
    ];
    select.mockImplementation(() => ({ from: () => ({ where: async () => rows.value }) }));
    baseline.mockResolvedValue(null);
  });
  it('reads only pinned event IDs and discloses effective-date versus publication knowledge', async () => {
    const result = await readPublishedInvestmentComparison(1, { asOfDate: '2026-11-03' });
    expect(result?.status).toBe('available');
    expect(result?.actual).toMatchObject({ deployedCapital: '100.350000', companyCount: 1 });
    expect(result?.basis).toMatchObject({
      snapshotId: 31,
      snapshotAsOfDate: '2025-03-31',
      knowledgeCutoff: '2026-11-03T00:00:00.000Z',
    });
    expect(result?.disclosures.join(' ')).toContain('later activity is unknown');
  });
  it.each([
    ['missing event', undefined],
    ['other fund', { fundId: 2 }],
    ['draft', { status: 'draft' }],
    ['currency', { currency: 'EUR' }],
    ['amount mismatch', { amount: '999' }],
    ['date mismatch', { eventDate: new Date('2025-01-01') }],
    ['identity missing', { companyId: null }],
    ['category missing', { payload: { ...payload, deploymentCategory: null } }],
  ])('refuses %s without falling back to legacy zero', async (_name, change) => {
    rows.value = change === undefined ? [] : [{ ...(rows.value[0] as object), ...change }];
    const result = await readPublishedInvestmentComparison(1);
    expect(result).toMatchObject({ status: 'unavailable', actual: null, periods: [] });
  });
  it('does not query event storage for an empty published series or invent zero activity', async () => {
    parse.mockReturnValue({
      kind: 'facts',
      snapshot: {
        fundId: 1,
        asOfDate: '2025-03-31',
        payload: { capitalActuals: {}, cashFlowSeries: { series: [], warnings: [] } },
      },
    });
    expect(await readPublishedInvestmentComparison(1)).toMatchObject({
      status: 'unavailable',
      actual: null,
    });
    expect(select).not.toHaveBeenCalled();
  });
  it('preserves legacy consumers without a publication and refuses ambiguous lineage', async () => {
    head.mockResolvedValue({ kind: 'none' });
    expect(await readPublishedInvestmentComparison(1)).toBeNull();
    expect(await readPublishedInvestmentComparison(1, { asOfDate: '2025-03-31' })).toMatchObject({
      status: 'unavailable',
      asOfDate: '2025-03-31',
    });
    head.mockResolvedValue({ kind: 'ambiguous' });
    expect(await readPublishedInvestmentComparison(1)).toMatchObject({
      status: 'unavailable',
      actual: null,
    });
  });

  it('preserves older Round/FMV snapshot consumers unless an investment comparison is requested', async () => {
    parse.mockReturnValue({
      kind: 'facts',
      snapshot: { fundId: 1, payload: { cashFlowSeries: { series: [] } } },
    });
    expect(await readPublishedInvestmentComparison(1)).toBeNull();
    expect(await readPublishedInvestmentComparison(1, { asOfDate: '2025-03-31' })).toMatchObject({
      status: 'unavailable',
      actual: null,
    });
  });
});
