import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  buildFundCompanyActualsFacts,
  buildFundCompanyActualsFactsFromRows,
  FundActualsFactsServiceError,
  type FundCompanyActualsFactsRows,
} from '../../../../server/services/fund-actuals/fund-company-actuals-facts-service';
import { FundCompanyActualsFactsResponseSchema } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const FUND_ID = 10;
const AS_OF_DATE = '2026-06-30';
const NOW = new Date('2026-06-30T12:00:00.000Z');

function createRows(overrides: Partial<FundCompanyActualsFactsRows> = {}): FundCompanyActualsFactsRows {
  return {
    fund: { id: FUND_ID, baseCurrency: 'USD' },
    companies: [{ id: 101, fundId: FUND_ID, name: 'Acme Robotics' }],
    investments: [{ id: 201, fundId: FUND_ID, companyId: 101 }],
    allRounds: [
      {
        id: 1,
        fundId: FUND_ID,
        investmentId: 201,
        roundDate: '2024-01-15',
        createdAt: new Date('2024-01-16T00:00:00.000Z'),
        securityType: 'equity',
        currency: 'USD',
        investmentAmount: '500000.000000',
        preMoneyValuation: '10000000.000000',
        roundSize: null,
        supersedesRoundId: null,
      },
    ],
    activeOverrides: [],
    planningMarks: [
      {
        id: 301,
        fundId: FUND_ID,
        companyId: 101,
        markDate: '2026-06-01',
        fairValue: '12000000.000000',
        currency: 'USD',
        status: 'approved',
      },
    ],
    ...overrides,
  };
}

function build(rows: FundCompanyActualsFactsRows = createRows()) {
  const response = buildFundCompanyActualsFactsFromRows({
    fundId: FUND_ID,
    asOfDate: AS_OF_DATE,
    now: NOW,
    rows,
  });
  expect(FundCompanyActualsFactsResponseSchema.parse(response)).toEqual(response);
  return response;
}

function factFor(response: ReturnType<typeof build>, companyId = 101) {
  const fact = response.facts.find((candidate) => candidate.companyId === companyId);
  expect(fact).toBeDefined();
  return fact!;
}

function warningCodes(fact: ReturnType<typeof factFor>) {
  return fact.warnings.map((warning) => warning.code);
}

type FactsDatabase = typeof db;

class FundNotFoundDb {
  asDatabase(): FactsDatabase {
    return this as unknown as FactsDatabase;
  }

  select(_projection?: unknown) {
    return {
      from: (_table: unknown) => ({
        where: (_condition: unknown) => ({
          limit: (_count: number) => Promise.resolve([]),
        }),
      }),
    };
  }
}

describe('buildFundCompanyActualsFactsFromRows', () => {
  it('ignores cross-fund investments, rounds, and marks before building facts', () => {
    const response = build(
      createRows({
        companies: [
          { id: 101, fundId: FUND_ID, name: 'Acme Robotics' },
          { id: 999, fundId: 99, name: 'Wrong Fund Co' },
        ],
        investments: [
          { id: 201, fundId: FUND_ID, companyId: 101 },
          { id: 999, fundId: 99, companyId: 999 },
        ],
        allRounds: [
          ...createRows().allRounds,
          {
            id: 999,
            fundId: 99,
            investmentId: 999,
            roundDate: '2026-01-01',
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            securityType: 'equity',
            currency: 'USD',
            investmentAmount: '999999.000000',
            preMoneyValuation: '9999999.000000',
            roundSize: null,
            supersedesRoundId: null,
          },
        ],
        planningMarks: [
          ...createRows().planningMarks,
          {
            id: 999,
            fundId: 99,
            companyId: 101,
            markDate: '2026-06-29',
            fairValue: '9999999.000000',
            currency: 'USD',
            status: 'approved',
          },
        ],
      })
    );

    expect(response.facts).toHaveLength(1);
    expect(response.facts[0]?.companyId).toBe(101);
    expect(response.facts[0]?.approvedPlanningFmvMarkId).toBe(301);
    expect(response.facts[0]?.activeRoundIds).toEqual([1]);
  });

  it('includes active non-superseded rounds in activeRoundIds and model amounts', () => {
    const fact = factFor(build());

    expect(fact.activeRoundIds).toEqual([1]);
    expect(fact.initialInvestmentAmount).toBe('500000.000000');
    expect(fact.followOnInvestmentAmount).toBe('0.000000');
  });

  it('excludes superseded rounds from active amounts while preserving supersede lineage', () => {
    const fact = factFor(
      build(
        createRows({
          allRounds: [
            {
              ...createRows().allRounds[0]!,
              id: 1,
              investmentAmount: '500000.000000',
              preMoneyValuation: '10000000.000000',
            },
            {
              ...createRows().allRounds[0]!,
              id: 2,
              roundDate: '2025-01-15',
              investmentAmount: '750000.000000',
              preMoneyValuation: '12000000.000000',
              supersedesRoundId: 1,
            },
          ],
        })
      )
    );

    expect(fact.activeRoundIds).toEqual([2]);
    expect(fact.initialInvestmentAmount).toBe('750000.000000');
    expect(fact.supersedeLineage).toEqual([
      { roundId: 1, supersedesRoundId: null },
      { roundId: 2, supersedesRoundId: 1 },
    ]);
  });

  it('selects the latest approved or locked planning mark with id as same-day tiebreaker', () => {
    const fact = factFor(
      build(
        createRows({
          planningMarks: [
            {
              id: 301,
              fundId: FUND_ID,
              companyId: 101,
              markDate: '2026-06-01',
              fairValue: '12000000.000000',
              currency: 'USD',
              status: 'approved',
            },
            {
              id: 302,
              fundId: FUND_ID,
              companyId: 101,
              markDate: '2026-06-15',
              fairValue: '13000000.000000',
              currency: 'USD',
              status: 'locked',
            },
            {
              id: 303,
              fundId: FUND_ID,
              companyId: 101,
              markDate: '2026-06-15',
              fairValue: '14000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      )
    );

    expect(fact.approvedPlanningFmvMarkId).toBe(303);
    expect(fact.latestPlanningFmvDate).toBe('2026-06-15');
    expect(fact.latestPlanningFmvValue).toBe('14000000.000000');
  });

  it('keeps draft or superseded marks pre-filtered and ignores future planning marks', () => {
    const fact = factFor(
      build(
        createRows({
          planningMarks: [
            {
              id: 399,
              fundId: FUND_ID,
              companyId: 101,
              markDate: '2026-07-01',
              fairValue: '15000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      )
    );

    expect(fact.approvedPlanningFmvMarkId).toBeNull();
    expect(fact.latestPlanningFmvDate).toBeNull();
    expect(fact.latestPlanningFmvValue).toBeNull();
    expect(fact.planningFmvStatus).toBe('none');
    expect(warningCodes(fact)).toContain('PLANNING_FMV_MISSING');
  });

  it('marks missing planning FMV as PARTIAL with null FMV values', () => {
    const fact = factFor(build(createRows({ planningMarks: [] })));

    expect(fact.planningFmvStatus).toBe('none');
    expect(fact.approvedPlanningFmvMarkId).toBeNull();
    expect(fact.latestPlanningFmvDate).toBeNull();
    expect(fact.latestPlanningFmvValue).toBeNull();
    expect(warningCodes(fact)).toContain('PLANNING_FMV_MISSING');
    expect(fact.provenance.trustState).toBe('PARTIAL');
  });

  it('marks planning FMV older than the local threshold as stale and PARTIAL', () => {
    const fact = factFor(
      build(
        createRows({
          planningMarks: [
            {
              id: 301,
              fundId: FUND_ID,
              companyId: 101,
              markDate: '2026-03-01',
              fairValue: '12000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      )
    );

    expect(fact.planningFmvStatus).toBe('stale');
    expect(fact.approvedPlanningFmvMarkId).toBe(301);
    expect(warningCodes(fact)).toContain('PLANNING_FMV_STALE');
    expect(fact.provenance.trustState).toBe('PARTIAL');
  });

  it('marks fresh planning FMV and base-currency equity rounds as LIVE', () => {
    const fact = factFor(build());

    expect(fact.planningFmvStatus).toBe('active');
    expect(fact.currencyStatus).toBe('base_currency');
    expect(fact.warnings).toEqual([]);
    expect(fact.provenance.trustState).toBe('LIVE');
  });

  it('blocks currency mismatches and overrides planning FMV status to blocked', () => {
    const fact = factFor(
      build(
        createRows({
          allRounds: [
            {
              ...createRows().allRounds[0]!,
              currency: 'EUR',
            },
          ],
        })
      )
    );

    expect(fact.currency).toBe('EUR');
    expect(fact.currencyStatus).toBe('mismatch_blocked');
    expect(fact.planningFmvStatus).toBe('blocked');
    expect(warningCodes(fact)).toContain('CURRENCY_MISMATCH_BLOCK');
    expect(fact.provenance.trustState).toBe('UNAVAILABLE');
  });

  it('keeps non-equity rounds amount-only without conversion math', () => {
    const fact = factFor(
      build(
        createRows({
          allRounds: [
            {
              ...createRows().allRounds[0]!,
              id: 5,
              securityType: 'safe',
              investmentAmount: '125000.000000',
              preMoneyValuation: null,
            },
          ],
        })
      )
    );

    expect(fact.activeRoundIds).toEqual([5]);
    expect(fact.initialInvestmentAmount).toBe('0.000000');
    expect(fact.followOnInvestmentAmount).toBe('0.000000');
    expect(fact.amountOnlyNonEquityAmount).toBe('125000.000000');
    expect(fact.latestRoundDate).toBeNull();
    expect(fact.latestRoundValuation).toBeNull();
    expect(warningCodes(fact)).toContain('NON_EQUITY_AMOUNT_ONLY');
  });

  it('uses preMoneyValuation from the latest active equity round and never roundSize', () => {
    const fact = factFor(
      build(
        createRows({
          allRounds: [
            {
              ...createRows().allRounds[0]!,
              id: 1,
              roundDate: '2024-01-15',
              preMoneyValuation: '10000000.000000',
              roundSize: null,
            },
            {
              ...createRows().allRounds[0]!,
              id: 2,
              roundDate: '2025-01-15',
              investmentAmount: '250000.000000',
              preMoneyValuation: null,
              roundSize: '99999999.000000',
            },
          ],
        })
      )
    );

    expect(fact.latestRoundDate).toBe('2025-01-15');
    expect(fact.latestRoundValuation).toBeNull();
  });

  it('changes hashes for active round, selected planning mark, or applied override changes', () => {
    const baseline = build();
    const baselineAgain = build();
    const roundChanged = build(
      createRows({
        allRounds: [
          {
            ...createRows().allRounds[0]!,
            investmentAmount: '600000.000000',
          },
        ],
      })
    );
    const markChanged = build(
      createRows({
        planningMarks: [
          {
            ...createRows().planningMarks[0]!,
            fairValue: '13000000.000000',
          },
        ],
      })
    );
    const overrideChanged = build(
      createRows({
        activeOverrides: [
          {
            id: 401,
            fundId: FUND_ID,
            roundId: 1,
            overrideRole: 'follow_on',
            supersedesOverrideId: null,
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
          },
        ],
      })
    );

    expect(factFor(baseline).inputHash).toBe(factFor(baselineAgain).inputHash);
    expect(baseline.inputHash).toBe(baselineAgain.inputHash);
    expect(factFor(roundChanged).inputHash).not.toBe(factFor(baseline).inputHash);
    expect(roundChanged.inputHash).not.toBe(baseline.inputHash);
    expect(factFor(markChanged).inputHash).not.toBe(factFor(baseline).inputHash);
    expect(markChanged.inputHash).not.toBe(baseline.inputHash);
    expect(factFor(overrideChanged).initialInvestmentAmount).toBe('0.000000');
    expect(factFor(overrideChanged).followOnInvestmentAmount).toBe('500000.000000');
    expect(factFor(overrideChanged).inputHash).not.toBe(factFor(baseline).inputHash);
    expect(overrideChanged.inputHash).not.toBe(baseline.inputHash);
  });
});

describe('buildFundCompanyActualsFacts', () => {
  it('throws FundActualsFactsServiceError when the fund is not found', async () => {
    await expect(
      buildFundCompanyActualsFacts({
        fundId: 404,
        asOfDate: AS_OF_DATE,
        now: NOW,
        database: new FundNotFoundDb().asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'fund_not_found',
    });

    await expect(
      buildFundCompanyActualsFacts({
        fundId: 404,
        asOfDate: AS_OF_DATE,
        now: NOW,
        database: new FundNotFoundDb().asDatabase(),
      })
    ).rejects.toBeInstanceOf(FundActualsFactsServiceError);
  });
});
