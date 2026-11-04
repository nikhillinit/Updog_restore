import { beforeEach, describe, expect, it, vi } from 'vitest';

const { head, parse, select, baseline, rows, vehicleRows, warn } = vi.hoisted(() => ({
  head: vi.fn(),
  parse: vi.fn(),
  select: vi.fn(),
  baseline: vi.fn(),
  rows: { value: [] as unknown[] },
  vehicleRows: { value: [] as unknown[] },
  warn: vi.fn(),
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
vi.mock('../../../server/lib/logger', () => ({ logger: { warn } }));

import {
  aggregatePublishedInvestments,
  readPublishedFundActuals,
  readPublishedInvestmentComparison,
  type PublishedInvestment,
} from '../../../server/services/published-investment-comparison';
import { vehicles } from '@shared/schema/vehicles';

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
    vehicleRows.value = [{ id: 2 }];
    select.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: async () => (table === vehicles ? vehicleRows.value : rows.value),
      }),
    }));
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
  it('reads main-fund dashboard actuals without an exclusion disclosure when nothing is excluded', async () => {
    const result = await readPublishedFundActuals(1, new Date('2026-11-03T12:00:00.000Z'));
    expect(result).toMatchObject({
      status: 'available',
      vehicleScope: 'main_fund',
      investments: { deployedCapital: '100.350000', transactionCount: 1, companyCount: 1 },
    });
    expect(result?.disclosures.join(' ')).not.toContain('Excluded');
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
    const requested = await readPublishedInvestmentComparison(1, { asOfDate: '2025-03-31' });
    expect(requested).toMatchObject({
      status: 'unavailable',
      actual: null,
      reason: 'This publication does not contain supported investment actuals.',
    });
    expect(requested?.basis).not.toBeNull();
  });

  it('returns null when no publication applies or head is an older snapshot', async () => {
    head.mockResolvedValueOnce({ kind: 'none' });
    expect(await readPublishedFundActuals(1)).toBeNull();

    parse.mockReturnValueOnce({
      kind: 'facts',
      snapshot: { fundId: 1, payload: { cashFlowSeries: { series: [], warnings: [] } } },
    });
    expect(await readPublishedFundActuals(1)).toBeNull();
  });

  it('returns unavailable for ambiguous publication lineage', async () => {
    head.mockResolvedValue({ kind: 'ambiguous' });
    expect(await readPublishedFundActuals(1, new Date('2025-06-30T00:00:00.000Z'))).toMatchObject({
      status: 'unavailable',
      reason: 'Published facts lineage is ambiguous or invalid.',
      basis: null,
      vehicleScope: 'main_fund',
      investments: null,
    });
  });

  it('counts only active main-fund investments and discloses excluded vehicles', async () => {
    parse.mockReturnValue({
      kind: 'facts',
      snapshot: {
        fundId: 1,
        asOfDate: '2025-03-31',
        payload: {
          capitalActuals: {},
          cashFlowSeries: {
            warnings: [{ message: 'Synthetic publication warning.' }],
            series: [
              {
                eventType: 'portfolio_investment',
                vehicleId: 2,
                perspective: 'fund_gross',
                points: [
                  { eventId: 1, effectiveAt: '2024-07-01T00:00:00.000Z', amount: '100.350000' },
                ],
              },
              {
                eventType: 'portfolio_investment',
                vehicleId: 3,
                perspective: 'fund_gross',
                points: [
                  { eventId: 2, effectiveAt: '2024-08-01T00:00:00.000Z', amount: '200.250000' },
                ],
              },
            ],
          },
        },
      },
    });
    rows.value = [
      rows.value[0],
      {
        ...(rows.value[0] as object),
        id: 2,
        vehicleId: 3,
        companyId: 11,
        eventDate: new Date('2024-08-01T00:00:00.000Z'),
        amount: '200.25',
      },
    ];

    const result = await readPublishedFundActuals(1, new Date('2025-06-30T00:00:00.000Z'));

    expect(result).toMatchObject({
      contractVersion: 'published-fund-actuals/1.0.0',
      status: 'available',
      asOfDate: '2025-06-30',
      vehicleScope: 'main_fund',
      investments: {
        deployedCapital: '100.350000',
        transactionCount: 1,
        companyCount: 1,
      },
      reason: null,
      unsupportedReason:
        'This publication admits investment transactions only; capital calls, paid-in cash, valuations, and distributions need separate admitted evidence.',
    });
    expect(result?.disclosures).toContain('Synthetic publication warning.');
    expect(result?.disclosures).toContain(
      'Published coverage ends on 2025-03-31; later activity is unknown.'
    );
    expect(result?.disclosures).toContain(
      'Excluded 1 published investment transaction(s) from vehicles outside the active main_fund.'
    );
  });

  it('returns unavailable when fund has no active main-fund vehicle', async () => {
    vehicleRows.value = [];
    const result = await readPublishedFundActuals(1, new Date('2025-06-30T00:00:00.000Z'));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'No active main_fund vehicle is available for this fund.',
      investments: null,
    });
    expect(result?.disclosures).toContain(
      'Excluded 1 published investment transaction(s) from vehicles outside the active main_fund.'
    );
  });

  it('chooses unsupported reason from the publication event types', async () => {
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
              {
                eventType: 'lp_capital_call',
                vehicleId: 2,
                perspective: 'lp_net',
                points: [],
              },
            ],
          },
        },
      },
    });
    const result = await readPublishedFundActuals(1, new Date('2025-06-30T00:00:00.000Z'));
    expect(result?.unsupportedReason).toBe(
      "The dashboard does not yet reconcile this publication's capital-call, valuation, or distribution evidence. Review it under LP reporting actuals."
    );
  });

  it('returns a generic unavailable result and logs when reading fails', async () => {
    head.mockRejectedValueOnce(new Error('Synthetic database failure detail.'));
    const result = await readPublishedFundActuals(1, new Date('2025-06-30T00:00:00.000Z'));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'Published investment actuals could not be read.',
      basis: null,
      investments: null,
    });
    expect(result?.reason).not.toContain('Synthetic database failure detail.');
    expect(warn).toHaveBeenCalledWith(
      { fundId: 1, error: expect.any(Error) },
      'Failed to read published fund actuals'
    );
  });
});
