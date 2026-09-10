import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  calculateCapitalPlanningV1,
  CapitalPlanningCalculationError,
} from '../../../shared/lib/capital-planning/capital-planning-v1';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  AGGREGATE_PREFERENCE_FORECAST_VERSION,
  CAPITAL_PLANNING_DISCLOSURES,
  CapitalPlanningResultV1Schema,
  type CapitalPlanningInputV1,
  type CapitalUnitDeclarationsV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import { makeCapitalInput, makeCapitalRawConfig } from '../../fixtures/capital-planning/fixtures';
import expected from '../../fixtures/capital-planning/expected-values.json';

const money = (value: string | number) => new Decimal(value).toFixed(6);
const ratio = (value: string | number) => new Decimal(value).toFixed(12);
function input(): CapitalPlanningInputV1 {
  const result = makeCapitalInput();
  result.allocations[0]!.initialCheckUsd = money(500000);
  result.allocations[0]!.deploymentPeriodYears = 4;
  result.allocations[0]!.followOnRounds = [
    {
      roundId: 'r1',
      stageId: 's1',
      roundLabel: 'Series A',
      graduationRatio: ratio('0.5'),
      participationRatio: ratio('0.5'),
      checkPolicy: { type: 'fixed_check', checkUsd: money(500000) },
      monthsAfterPreviousRound: 24,
      timeOrigin: 'previous_round',
    },
  ];
  return result;
}
type SourceSetup = (
  raw: ReturnType<typeof makeCapitalRawConfig>,
  declarations: CapitalUnitDeclarationsV1
) => void;
function bundleFor(
  input: CapitalPlanningInputV1,
  commitments = 10000000,
  years = 4,
  configure?: SourceSetup
) {
  const raw = makeCapitalRawConfig();
  raw.fundSize = commitments;
  raw.fundLife = years;
  raw.investmentPeriod = years;
  raw.fundedFromFeesPct = 0;
  raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 0;
  raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0;
  raw.economicsAssumptions!.feeModel!.tiers![0]!.endYear = years;
  raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
  const unitDeclarations: CapitalUnitDeclarationsV1 = {
    'funds.size': 'usd',
    fundSize: 'usd',
    'economicsAssumptions.gpCommitmentModel.commitmentAmount': 'usd',
  };
  raw.capitalPlanAllocations = input.allocations.map((a, index) => {
    for (const field of ['capitalAllocationPct', 'followOnParticipationPct'])
      unitDeclarations[`capitalPlanAllocations[${index}].${field}`] = 'ratio';
    unitDeclarations[`capitalPlanAllocations[${index}].initialCheckAmount`] = 'usd';
    return {
      id: a.allocationId,
      name: a.name,
      entryRound: a.entryRound,
      capitalAllocationPct: Number(a.budgetShareRatio),
      initialCheckStrategy: 'amount',
      initialCheckAmount: Number(a.initialCheckUsd),
      followOnStrategy: 'amount',
      followOnParticipationPct: 0,
      investmentHorizonMonths: a.deploymentPeriodYears * 12,
    };
  });
  raw.pipelineProfiles = input.allocations.map((a, index) => ({
    id: a.pipelineProfileId,
    name: a.name,
    stages: [
      { id: a.entryStageId, name: a.entryRound },
      ...a.followOnRounds.map((r) => ({ id: r.stageId, name: r.roundLabel })),
    ].map((s, si) => {
      for (const field of ['roundSize', 'valuation', 'exitValuation'])
        unitDeclarations[`pipelineProfiles[${index}].stages[${si}].${field}`] = 'usd';
      for (const field of ['graduationRate', 'esopPct'])
        unitDeclarations[`pipelineProfiles[${index}].stages[${si}].${field}`] = 'ratio';
      return {
        ...s,
        roundSize: 2000000,
        valuation: 10000000,
        valuationType: 'pre' as const,
        esopPct: 0,
        graduationRate: 0.5,
        exitRate: 0,
        exitValuation: 0,
        monthsToGraduate: 12,
        monthsToExit: 24,
      };
    }),
  }));
  configure?.(raw, unitDeclarations);
  const materialized = materializeCapitalSource({
    source: {
      fund: { id: 101, size: String(commitments), baseCurrency: 'USD' },
      config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
    },
    inputs: [input],
    unitDeclarations,
  });
  if (!materialized.ok) throw new Error(JSON.stringify(materialized));
  return materialized.sourceBundle;
}
function run(candidate = input(), commitments = 10000000, years = 4, configure?: SourceSetup) {
  const result = calculateCapitalPlanningV1({
    input: candidate,
    sourceBundle: bundleFor(candidate, commitments, years, configure),
  });
  expect(CapitalPlanningResultV1Schema.safeParse(result).success).toBe(true);
  return result;
}

function ownershipInput(): CapitalPlanningInputV1 {
  const candidate = input();
  const a = candidate.allocations[0]!;
  a.initialCheckUsd = money(1200000);
  a.plannedCompanyCount = 1;
  a.entryFinancing = {
    valuationUsd: money(10000000),
    valuationBasis: 'pre_money',
    totalPrimaryRoundUsd: money(2000000),
  };
  a.followOnRounds = [
    {
      ...a.followOnRounds[0]!,
      graduationRatio: ratio(1),
      participationRatio: ratio(1),
      incrementalPreMoneyPoolDilutionRatio: ratio(0),
      checkPolicy: { type: 'pro_rata', proRataExerciseRatio: ratio(1) },
      financing: {
        valuationUsd: money(80000000),
        valuationBasis: 'pre_money',
        totalPrimaryRoundUsd: money(20000000),
      },
    },
  ];
  return candidate;
}

function feeExpense(fees: string, expenses: string, years: number): SourceSetup {
  return (raw, declarations) => {
    raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = new Decimal(fees)
      .div(raw.fundSize!)
      .div(years)
      .toNumber();
    raw.economicsAssumptions!.expenseModel!.annualExpenses = [
      {
        id: 'expense',
        category: 'administration',
        amount: new Decimal(expenses).div(years).toNumber(),
        startYear: 1,
        endYear: years,
      },
    ];
    declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'] = 'usd';
  };
}

describe('capital planning financial truth', () => {
  it.each(expected.sizing)('$id sizes at full precision before quantizing output', (fixture) => {
    const candidate = input();
    candidate.allocations[0]!.initialCheckUsd = money(fixture.initialCheck);
    candidate.allocations[0]!.followOnRounds[0]!.participationRatio = ratio(fixture.participation);
    const result = run(candidate).construction.allocations[0]!;
    expect(result.expectedPerCompanyCostUsd).toBe(money(fixture.costPerEntry));
    expect(result.expected).toMatchObject({
      companyCount: ratio(fixture.expectedCompanies),
      initialDemandUsd: fixture.initial,
      followOnDemandUsd: fixture.followOn,
      totalDemandUsd: money(fixture.budget),
    });
  });

  it('CP009/010 preserves entered and fixed-count stress bases independently', () => {
    const candidate = input();
    candidate.allocations[0]!.plannedCompanyCount = 17;
    const c = run(candidate).construction;
    expect(c.allocations[0]!.expected).toMatchObject({ companyCount: ratio(16) });
    expect(c.allocations[0]!.entered).toMatchObject({
      companyCount: ratio(17),
      totalDemandUsd: money(10625000),
      signedResidualUsd: money(-625000),
    });
    const stress = c.stresses.find(
      (s) => s.name === 'participation_full' && s.countBasis === 'expected'
    );
    expect(stress).toMatchObject({
      state: 'complete',
      plannedReserveGapUsd: money(2000000),
      reconciliation: {
        lifetimeFollowOnUsd: money(4000000),
        lifetimeBudgetShortfallUsd: money(2000000),
      },
    });
  });

  it('CP004/018 graduates conditionally through a skipped investment', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.followOnRounds[0]!.participationRatio = ratio(0);
    a.followOnRounds.push({
      ...a.followOnRounds[0]!,
      roundId: 'r2',
      stageId: 's2',
      roundLabel: 'Series B',
      graduationRatio: ratio('0.6'),
      participationRatio: ratio(1),
      monthsAfterPreviousRound: 18,
    });
    const c = run(candidate).construction;
    expect(
      c.allocations[0]!.rounds.filter((r) => r.countBasis === 'expected').map(
        (r) => r.cumulativeGraduationRatio
      )
    ).toEqual([ratio('0.5'), ratio('0.3')]);
    expect(c.allocations[0]!.rounds[0]!.demandUsd).toBe(money(0));
    expect(c.allocations[0]!.expectedPerCompanyCostUsd).toBe(money(650000));
    expect(c.allocations[0]!.expected).toMatchObject({
      companyCount: ratio('15.384615384615'),
      followOnDemandUsd: '2307692.307692',
    });
    expect(c.allocations[0]!.rounds[1]!).toMatchObject({
      conditionalCheckUsd: money(500000),
      demandUsd: '2307692.307692',
    });
  });

  it('CP007/014 preserves unassigned budget and zero-share entered-count gaps', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.budgetShareRatio = ratio('0.6');
    candidate.allocations.push({
      ...structuredClone(a),
      allocationId: 'a2',
      pipelineProfileId: 'p2',
      budgetShareRatio: ratio('0.3'),
    });
    const c = run(candidate).construction;
    expect(
      c.reconciliation.find((r) => r.countBasis === 'expected')!.unassignedPlanningBudgetUsd
    ).toEqual({ state: 'available', value: money(1000000) });
    const zero = input();
    zero.allocations[0]!.budgetShareRatio = ratio(0);
    zero.allocations[0]!.plannedCompanyCount = 1;
    const z = run(zero).construction;
    expect(z.allocations[0]!.expected).toMatchObject({
      companyCount: ratio(0),
      reserveRatio: {
        state: 'unavailable',
        value: null,
        reason: 'ZERO_ALLOCATED_INVESTMENT_CAPITAL',
      },
    });
    expect(z.allocations[0]!.entered).toMatchObject({
      totalDemandUsd: money(625000),
      signedResidualUsd: money(-625000),
    });
    expect(z.verdicts.allocationBudget).toBe('allocation_gap');
  });

  it('CP008/011/012/013/034 keeps exact monthly lags and reconciles emitted dollars', () => {
    const c = run().construction;
    const follow = c.monthlyDetail.filter(
      (r) => r.kind === 'follow_on' && r.countBasis === 'expected'
    );
    expect(follow).toHaveLength(48);
    expect(follow.find((r) => r.entryMonth === 23)).toMatchObject({
      demandMonth: 47,
      beyondTerm: false,
    });
    expect(follow.find((r) => r.entryMonth === 24)).toMatchObject({
      demandMonth: 48,
      beyondTerm: true,
    });
    const emitted = c.monthlyDetail
      .filter((r) => r.countBasis === 'expected')
      .reduce((sum, r) => sum.plus(r.demandUsd), new Decimal(0));
    expect(emitted.toFixed(6)).toBe('10000000.000032');
    expect(
      c.reconciliation.find((r) => r.countBasis === 'expected')!.signedRoundingResidualUsd
    ).toBe('-0.000032');
    expect(c.verdicts.timing).toBe('includes_beyond_term');
    expect(c.headline.toLowerCase()).toContain('beyond');
    const candidate = input();
    candidate.allocations[0]!.followOnRounds.push({
      ...candidate.allocations[0]!.followOnRounds[0]!,
      roundId: 'r2',
      stageId: 's2',
      roundLabel: 'Series B',
      monthsAfterPreviousRound: 18,
    });
    const rows = run(candidate).construction.monthlyDetail;
    for (const [entry, months] of [
      [0, [24, 42]],
      [12, [36, 54]],
    ] as const) {
      expect(
        rows
          .filter(
            (r) => r.entryMonth === entry && r.kind === 'follow_on' && r.countBasis === 'expected'
          )
          .map((r) => r.demandMonth)
      ).toEqual(months);
    }
  });

  it('CP019/020 keeps the fund ceiling and timing-only stress independent', () => {
    const candidate = input();
    candidate.netInvestableCapitalUsd = money(12000000);
    const c = run(candidate).construction;
    expect(c.budget.availableConstructionCapitalUsd).toBe(money(10000000));
    expect(c.verdicts.lifetimeCapacity).toBe('over_capacity');
    expect(c.headline.toLowerCase()).toContain('modeled assumptions');
    const timing = c.stresses.find(
      (s) => s.name === 'follow_on_6_months_earlier' && s.countBasis === 'expected'
    );
    expect(timing).toMatchObject({
      state: 'complete',
      reconciliation: { lifetimeFollowOnUsd: money(2400000) },
    });
  });

  it('CP031 propagates conditional mean ownership into later pro-rata checks', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.initialCheckUsd = money(1200000);
    a.entryFinancing = {
      valuationUsd: money(10000000),
      valuationBasis: 'pre_money',
      totalPrimaryRoundUsd: money(2000000),
    };
    a.followOnRounds = [
      {
        roundId: 'r1',
        stageId: 's1',
        roundLabel: 'Series A',
        graduationRatio: ratio('0.5'),
        participationRatio: ratio('0.5'),
        monthsAfterPreviousRound: 24,
        timeOrigin: 'previous_round',
        incrementalPreMoneyPoolDilutionRatio: ratio(0),
        checkPolicy: { type: 'pro_rata', proRataExerciseRatio: ratio(1) },
        financing: {
          valuationUsd: money(16000000),
          valuationBasis: 'pre_money',
          totalPrimaryRoundUsd: money(4000000),
        },
      },
      {
        roundId: 'r2',
        stageId: 's2',
        roundLabel: 'Series B',
        graduationRatio: ratio('0.6'),
        participationRatio: ratio(1),
        monthsAfterPreviousRound: 18,
        timeOrigin: 'previous_round',
        incrementalPreMoneyPoolDilutionRatio: ratio(0),
        checkPolicy: { type: 'pro_rata', proRataExerciseRatio: ratio(1) },
        financing: {
          valuationUsd: money(32000000),
          valuationBasis: 'pre_money',
          totalPrimaryRoundUsd: money(8000000),
        },
      },
    ];
    const construction = run(candidate, 15160000).construction;
    const result = construction.allocations[0]!;
    expect(result.expectedPerCompanyCostUsd).toBe(money(1516000));
    expect(result.expected).toMatchObject({
      companyCount: ratio(10),
      initialDemandUsd: money(12000000),
      followOnDemandUsd: money(3160000),
    });
    expect(
      result.rounds.find((r) => r.roundId === 'r2' && r.countBasis === 'expected')!
        .conditionalCheckUsd
    ).toBe(money(720000));
    expect(construction.stresses.find((s) => s.name === 'participation_full')).toMatchObject({
      state: 'complete',
      reconciliation: {
        initialDemandUsd: money(12000000),
        lifetimeFollowOnUsd: money(4400000),
        lifetimeBudgetShortfallUsd: money(1240000),
      },
      plannedReserveGapUsd: money(1240000),
    });
    expect(
      construction.stresses.find((s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct')
    ).toMatchObject({
      state: 'complete',
      label: 'Fixed checks +25%; pro-rata round sizes +25%',
      reconciliation: {
        initialDemandUsd: money(15000000),
        lifetimeFollowOnUsd: '4866071.428571',
        lifetimeBudgetShortfallUsd: '4706071.428571',
      },
      plannedReserveGapUsd: '1706071.428571',
      changedPaths: [
        'allocations[0].initialCheckUsd',
        'allocations[0].followOnRounds[0].financing.totalPrimaryRoundUsd',
        'allocations[0].followOnRounds[1].financing.totalPrimaryRoundUsd',
      ],
    });
  });

  it('CP005 retains graduation and the conditional check when participation is zero', () => {
    const candidate = input();
    candidate.allocations[0]!.followOnRounds[0]!.participationRatio = ratio(0);
    const a = run(candidate).construction.allocations[0]!;
    expect(a.expectedPerCompanyCostUsd).toBe(money(500000));
    expect(a.expected).toMatchObject({
      companyCount: ratio(20),
      initialDemandUsd: money(10000000),
      followOnDemandUsd: money(0),
      reserveRatio: { state: 'available', value: ratio(0) },
    });
    expect(a.rounds[0]).toMatchObject({
      cumulativeGraduationRatio: ratio('0.5'),
      conditionalCheckUsd: money(500000),
      participatingCompanyCount: ratio(0),
      demandUsd: money(0),
    });
  });

  it('CP006/032/035 sizes from supported fee and expense deductions exactly once', () => {
    const c = run(input(), 100000000, 10, (raw, declarations) => {
      raw.economicsAssumptions!.feeModel!.tiers = [
        {
          id: 'fee-1',
          name: 'Years 1-5',
          rate: 0.02,
          basis: 'committed_capital',
          startYear: 1,
          endYear: 5,
        },
        {
          id: 'fee-2',
          name: 'Years 6-10',
          rate: 0.015,
          basis: 'committed_capital',
          startYear: 6,
          endYear: 10,
        },
      ];
      raw.economicsAssumptions!.expenseModel = { source: 'legacy_fund_expenses' };
      raw.fundExpenses = [
        { id: 'expense', category: 'admin', monthlyAmount: 20000, startMonth: 0, endMonth: 119 },
      ];
      declarations['fundExpenses[0].monthlyAmount'] = 'usd';
      declarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
      declarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    }).construction;
    expect(c.budget).toMatchObject({
      lifetimeFeesUsd: money(expected.feeExpense['CP-006'].fees),
      lifetimeExpensesUsd: money(expected.feeExpense['CP-006'].expenses),
      availableConstructionCapitalUsd: money(expected.feeExpense['CP-006'].available),
      planningBudgetUsd: { state: 'available', value: money(80100000) },
    });
    expect(c.allocations[0]!.expected).toMatchObject({ totalDemandUsd: money(80100000) });
  });

  it.each(expected.gp)(
    '$id preserves deemed GP funding and zero/negative capacity states',
    (fixture) => {
      const candidate = makeCapitalInput();
      const configure: SourceSetup = (raw, declarations) => {
        feeExpense(fixture.fees, fixture.expenses, 2)(raw, declarations);
        raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = Number(fixture.gp);
        if (fixture.fraction === null) delete raw.fundedFromFeesPct;
        else raw.fundedFromFeesPct = Number(fixture.fraction);
      };
      const c = run(candidate, Number(fixture.commitment), 2, configure).construction;
      expect(c.budget).toMatchObject({
        lifetimeFeesUsd: money(fixture.fees),
        lifetimeExpensesUsd: money(fixture.expenses),
        gpDeemedContributionUsd: money(fixture.deemed),
        availableConstructionCapitalUsd: money(fixture.available),
      });
      expect(c.disclosures).toEqual({
        timing: CAPITAL_PLANNING_DISCLOSURES.timing,
        budget: CAPITAL_PLANNING_DISCLOSURES.budget,
        gp: CAPITAL_PLANNING_DISCLOSURES.gp,
      });
      if (new Decimal(fixture.available).isNegative()) {
        const unavailable = {
          state: 'unavailable',
          value: null,
          reason: 'NO_CONSTRUCTION_CAPITAL',
        };
        expect(c.budget.planningBudgetUsd).toEqual(unavailable);
        expect(c.allocations[0]!.expected).toEqual(unavailable);
        candidate.netInvestableCapitalUsd = money(10);
        const override = run(candidate, Number(fixture.commitment), 2, configure).construction;
        expect(override.budget.availableConstructionCapitalUsd).toBe(money(-5));
        expect(override.allocations[0]!.expected).toMatchObject({
          companyCount: ratio(10),
          totalDemandUsd: money(10),
        });
        expect(override.reconciliation[0]!.lifetimeBudgetShortfallUsd).toBe(money(15));
      } else {
        expect(c.budget.planningBudgetUsd).toEqual({
          state: 'available',
          value: money(fixture.available),
        });
        expect(c.allocations[0]!.expected).toMatchObject({
          companyCount: ratio(fixture.available),
        });
        if (fixture.available === '0') {
          expect(c.allocations[0]!.expected).toMatchObject({
            reserveRatio: {
              state: 'unavailable',
              value: null,
              reason: 'ZERO_ALLOCATED_INVESTMENT_CAPITAL',
            },
          });
          candidate.allocations[0]!.plannedCompanyCount = 1;
          const entered = run(candidate, Number(fixture.commitment), 2, configure).construction;
          expect(entered.verdicts.lifetimeCapacity).toBe('over_capacity');
          expect(
            entered.reconciliation.find((r) => r.countBasis === 'entered')!
              .lifetimeBudgetShortfallUsd
          ).toBe(money(1));
        }
      }
    }
  );

  it('retains sub-micro-dollar source deductions and their separate bridge residual', () => {
    const c = run(makeCapitalInput(), 100, 2, (raw, declarations) => {
      raw.fundedFromFeesPct = 0.4;
      raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 0.000001;
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.000000002;
      raw.economicsAssumptions!.expenseModel!.annualExpenses = [
        { id: 'expense', category: 'administration', amount: 0.0000002, startYear: 1, endYear: 2 },
      ];
      declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'] = 'usd';
    }).construction;
    expect(c.budget).toMatchObject({
      gpDeemedContributionUsd: money(0),
      lifetimeFeesUsd: money(0),
      lifetimeExpensesUsd: money(0),
      availableConstructionCapitalUsd: '99.999999',
      signedRoundingResidualUsd: '-0.000001',
    });
    expect(c.allocations[0]!.expected).toMatchObject({
      companyCount: '99.999998800000',
      totalDemandUsd: '99.999999',
    });
  });

  it('CP013 emits independent allocation and monthly rounding reconciliations', () => {
    const candidate = makeCapitalInput();
    candidate.allocations = [1, 2, 3].map((i) => ({
      ...structuredClone(candidate.allocations[0]!),
      allocationId: `a${i}`,
      pipelineProfileId: `p${i}`,
      budgetShareRatio: ratio('0.333333333333'),
    }));
    const c = run(candidate, 1, 1).construction;
    expect(c.allocations.map((a) => a.allocationBudgetUsd)).toEqual(
      [1, 2, 3].map(() => ({ state: 'available', value: '0.333333' }))
    );
    expect(c.monthlyDetail).toHaveLength(36);
    for (const row of c.monthlyDetail)
      expect(row).toMatchObject({ demandUsd: '0.027778', kind: 'initial', beyondTerm: false });
    const r = c.reconciliation[0]!;
    expect(r).toMatchObject({
      unassignedPlanningBudgetUsd: { state: 'available', value: money(0) },
      signedRoundingResidualUsd: '-0.000008',
      signedAllocationRoundingResidualUsd: '0.000001',
      signedBudgetResidualUsd: { state: 'available', value: money(0) },
    });
    expect(c.annualSchedule[0]!.totalDemandUsd).toBe('1.000008');
  });

  it('CP017 preserves heterogeneous conditional graduation chains', () => {
    const candidate = input();
    candidate.allocations = [
      [0.9, 0.1],
      [0.1, 0.9],
    ].map((rates, index) => ({
      ...structuredClone(candidate.allocations[0]!),
      allocationId: `a${index + 1}`,
      pipelineProfileId: `p${index + 1}`,
      budgetShareRatio: ratio('0.5'),
      plannedCompanyCount: 1,
      followOnRounds: rates.map((graduation, ri) => ({
        ...candidate.allocations[0]!.followOnRounds[0]!,
        roundId: `r${ri + 1}`,
        stageId: `s${ri + 1}`,
        roundLabel: `Round ${ri + 1}`,
        graduationRatio: ratio(graduation),
        participationRatio: ratio(1),
        checkPolicy: { type: 'fixed_check', checkUsd: money(1000000) },
      })),
    }));
    const c = run(candidate).construction;
    const second = c.allocations.map((a) =>
      a.rounds.find((r) => r.roundId === 'r2' && r.countBasis === 'entered')!
    );
    for (const r of second)
      expect(r).toMatchObject({ eligibleCompanyCount: ratio('0.09'), demandUsd: money(90000) });
    expect(
      second.reduce((sum, r) => sum.plus(r.eligibleCompanyCount), new Decimal(0)).toFixed(12)
    ).toBe(ratio('0.18'));
  });

  it.each([
    ['1', '2000000', '0.1'],
    ['0', '0', '0.08'],
    ['0.5', '1000000', '0.09'],
  ])(
    'CP025 exercise %s distinguishes positive-check participants and ownership',
    (exercise, check, ownership) => {
      const candidate = ownershipInput();
      candidate.allocations[0]!.followOnRounds[0]!.checkPolicy = {
        type: 'pro_rata',
        proRataExerciseRatio: ratio(exercise!),
      };
      const r = run(candidate).construction.allocations[0]!.rounds.find(
        (round) => round.countBasis === 'entered'
      )!;
      expect(r).toMatchObject({
        conditionalCheckUsd: money(check!),
        demandUsd: money(check!),
        participatingCompanyCount: ratio(exercise === '0' ? 0 : 1),
        ownership: {
          state: 'available',
          beforePoolRatio: ratio('0.1'),
          skippedRatio: ratio('0.08'),
          conditionalMeanRatio: ratio(ownership!),
        },
      });
    }
  );

  it('CP026 applies an incremental pool before the pro-rata check', () => {
    const candidate = ownershipInput();
    candidate.allocations[0]!.followOnRounds[0]!.incrementalPreMoneyPoolDilutionRatio =
      ratio('0.1');
    const r = run(candidate).construction.allocations[0]!.rounds[0]!;
    expect(r).toMatchObject({
      conditionalCheckUsd: money(1800000),
      ownership: {
        beforePoolRatio: ratio('0.1'),
        afterPoolRatio: ratio('0.09'),
        skippedRatio: ratio('0.072'),
        participatingRatio: ratio('0.09'),
        conditionalMeanRatio: ratio('0.09'),
      },
    });
  });

  it('CP027/028/030 propagates conditional ownership without scaling it by graduation', () => {
    for (const [
      participation,
      exercise,
      graduation,
      participatingOwnership,
      firstDemand,
      nextCheck,
    ] of [
      ['0.5', '1', '1', '0.1', '1000000', '1800000'],
      ['1', '0.5', '1', '0.09', '1000000', '1800000'],
      ['0.5', '1', '0.5', '0.1', '500000', '1800000'],
      ['0', '1', '1', '0.1', '0', '1600000'],
    ]) {
      const candidate = ownershipInput();
      const a = candidate.allocations[0]!;
      const first = a.followOnRounds[0]!;
      a.followOnRounds.push({
        ...structuredClone(first),
        roundId: 'r2',
        stageId: 's2',
        roundLabel: 'Series B',
      });
      first.participationRatio = ratio(participation!);
      first.graduationRatio = ratio(graduation!);
      first.checkPolicy = { type: 'pro_rata', proRataExerciseRatio: ratio(exercise!) };
      const rounds = run(candidate).construction.allocations[0]!.rounds.filter(
        (r) => r.countBasis === 'entered'
      );
      expect(rounds[0]).toMatchObject({
        demandUsd: money(firstDemand!),
        ownership: {
          participatingRatio: ratio(participatingOwnership!),
          conditionalMeanRatio: ratio(participation === '0' ? '0.08' : '0.09'),
        },
      });
      expect(rounds[1]!.conditionalCheckUsd).toBe(money(nextCheck!));
    }
  });

  it('CP029 normalizes post-money financing with matching provenance', () => {
    const candidate = ownershipInput();
    const a = candidate.allocations[0]!;
    a.initialCheckUsd = money(2430000);
    a.entryFinancing = {
      valuationUsd: money(24300000),
      valuationBasis: 'post_money',
      totalPrimaryRoundUsd: money(4100000),
    };
    const result = run(candidate);
    expect(result.construction.allocations[0]!.rounds[0]).toMatchObject({
      conditionalCheckUsd: money(2000000),
      ownership: { beforePoolRatio: ratio('0.1') },
    });
    expect(result.provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].entryFinancing.valuationBasis',
        effectiveValue: 'post_money',
        sourceValue: 'pre_money',
        origin: 'user_override',
      })
    );
  });

  it('CP010/020 separates allocation and reserve gaps from unassigned fund capacity', () => {
    const candidate = input();
    candidate.allocations[0]!.budgetShareRatio = ratio('0.6');
    const c = run(candidate).construction;
    const stress = c.stresses.find(
      (s) => s.name === 'participation_full' && s.countBasis === 'expected'
    )!;
    expect(c.allocations[0]!.expected).toMatchObject({
      companyCount: ratio('9.6'),
      initialDemandUsd: money(4800000),
      followOnDemandUsd: money(1200000),
    });
    expect(stress).toMatchObject({
      state: 'complete',
      plannedReserveGapUsd: money(1200000),
      verdicts: {
        lifetimeCapacity: 'within_capacity',
        allocationBudget: 'allocation_gap',
        reserveEarmark: 'earmark_gap',
      },
      reconciliation: {
        unassignedPlanningBudgetUsd: { state: 'available', value: money(4000000) },
        lifetimeFollowOnUsd: money(2400000),
        lifetimeBudgetShortfallUsd: money(0),
        signedLifetimeHeadroomUsd: money(2800000),
        allocationGapUsd: { state: 'available', value: money(1200000) },
      },
    });
    candidate.allocations[0]!.budgetShareRatio = ratio(1);
    candidate.allocations[0]!.plannedCompanyCount = 17;
    expect(
      run(candidate).construction.stresses.find(
        (s) => s.name === 'participation_full' && s.countBasis === 'entered'
      )
    ).toMatchObject({
      state: 'complete',
      plannedReserveGapUsd: money(2125000),
      reconciliation: {
        initialDemandUsd: money(8500000),
        lifetimeFollowOnUsd: money(4250000),
        lifetimeBudgetShortfallUsd: money(2750000),
      },
    });
  });

  it('CP008/012/020 reconciles annual leaves and preserves lifetime demand under earlier timing', () => {
    const c = run().construction;
    const rec = c.reconciliation[0]!;
    expect(rec).toMatchObject({
      withinTermFollowOnUsd: money(1000000),
      beyondTermFollowOnUsd: money(1000000),
    });
    expect(
      new Decimal(rec.withinTermFollowOnUsd)
        .plus(rec.beyondTermFollowOnUsd)
        .plus(rec.signedTimingRoundingResidualUsd)
        .toFixed(6)
    ).toBe(rec.lifetimeFollowOnUsd);
    for (const annual of c.annualSchedule) {
      const rows = c.monthlyDetail.filter(
        (r) =>
          r.countBasis === annual.countBasis &&
          Math.floor(r.demandMonth / 12) + 1 === annual.fundYear
      );
      expect(rows.reduce((sum, r) => sum.plus(r.demandUsd), new Decimal(0)).toFixed(6)).toBe(
        annual.totalDemandUsd
      );
      expect(
        new Decimal(annual.initialDemandUsd)
          .plus(annual.withinTermFollowOnUsd)
          .plus(annual.beyondTermFollowOnUsd)
          .toFixed(6)
      ).toBe(annual.totalDemandUsd);
    }
    expect(c.stresses.find((s) => s.name === 'follow_on_6_months_earlier')).toMatchObject({
      state: 'complete',
      reconciliation: {
        lifetimeFollowOnUsd: money(2000000),
        withinTermFollowOnUsd: money(1250000),
        beyondTermFollowOnUsd: money(750000),
      },
    });
    const candidate = input();
    candidate.allocations[0]!.followOnRounds[0]!.monthsAfterPreviousRound = 4;
    const early = run(candidate).construction.stresses.find(
      (s) => s.name === 'follow_on_6_months_earlier'
    )!;
    expect(early).toMatchObject({
      state: 'complete',
      reconciliation: { lifetimeFollowOnUsd: money(2000000), beyondTermFollowOnUsd: money(0) },
    });
  });

  it('CP033 consumes the designated reserve once for its own follow-ons', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.initialCheckUsd = money(5000000);
    a.followOnRounds = [1, 2, 3].map((i) => ({
      ...a.followOnRounds[0]!,
      roundId: `r${i}`,
      stageId: `s${i}`,
      roundLabel: `Round ${i}`,
      graduationRatio: ratio(1),
      participationRatio: ratio(1),
      checkPolicy: { type: 'fixed_check' as const, checkUsd: money(1000000) },
    }));
    const c = run(candidate, 100000000, 10, feeExpense('20000000', '0', 10)).construction;
    expect(c.allocations[0]!).toMatchObject({
      expectedPerCompanyCostUsd: money(8000000),
      designatedFollowOnReserveUsd: { state: 'available', value: money(30000000) },
      expected: {
        companyCount: ratio(10),
        initialDemandUsd: money(50000000),
        followOnDemandUsd: money(30000000),
        signedReserveResidualUsd: { state: 'available', value: money(0) },
      },
    });
    expect(c.reconciliation[0]).toMatchObject({
      lifetimeBudgetShortfallUsd: money(0),
      allocationGapUsd: { state: 'available', value: money(0) },
      reserveEarmarkGapUsd: { state: 'available', value: money(0) },
    });
  });

  it('CP041 reports the first actual budget gap without rounded false positives', () => {
    const candidate = makeCapitalInput();
    candidate.allocations[0]!.plannedCompanyCount = 12;
    const c = run(candidate, 10, 1).construction;
    expect(
      c.reconciliation.find((r) => r.countBasis === 'expected')!.firstBudgetGapMonth
    ).toBeNull();
    expect(c.reconciliation.find((r) => r.countBasis === 'entered')).toMatchObject({
      firstBudgetGapMonth: 10,
      firstGapAllocationId: 'a1',
      firstGapRoundId: null,
      lifetimeBudgetShortfallUsd: money(2),
    });
    expect(c.headline.toLowerCase()).toContain('infeasible');
  });

  it('CP020 preserves a valid base when a generated fixed check exceeds its round', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.followOnRounds[0]!.checkPolicy = { type: 'fixed_check', checkUsd: money(900000) };
    a.followOnRounds[0]!.financing = {
      valuationUsd: money(10000000),
      valuationBasis: 'pre_money',
      totalPrimaryRoundUsd: money(1000000),
    };
    const c = run(candidate).construction;
    expect(c.allocations[0]!.rounds[0]!.conditionalCheckUsd).toBe(money(900000));
    expect(
      c.stresses.find((s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct')
    ).toMatchObject({
      state: 'invalid',
      issues: [
        expect.objectContaining({
          code: 'CHECK_EXCEEDS_ROUND_SIZE',
          path: 'input.allocations[0].followOnRounds[0].checkPolicy.checkUsd',
        }),
      ],
    });
  });

  it.each(['entry', 'follow_on'] as const)(
    'rejects sub-micro stress excess at the exact %s check field',
    (kind) => {
      const candidate = makeCapitalInput();
      const a = candidate.allocations[0]!;
      a.initialCheckUsd = '0.000001';
      const financing = {
        valuationUsd: money(1),
        valuationBasis: 'pre_money' as const,
        totalPrimaryRoundUsd: '0.000001',
      };
      if (kind === 'entry') a.entryFinancing = financing;
      else
        a.followOnRounds = [
          {
            roundId: 'r1',
            stageId: 's1',
            roundLabel: 'Next round',
            graduationRatio: ratio(1),
            participationRatio: ratio(1),
            checkPolicy: { type: 'fixed_check', checkUsd: '0.000001' },
            monthsAfterPreviousRound: 1,
            timeOrigin: 'previous_round',
            financing,
          },
        ];
      const c = run(candidate, 1, 1).construction;
      expect(c.allocations[0]!.expected).toMatchObject({ totalDemandUsd: money(1) });
      // 1.25 micro-dollars still displays as one micro-dollar, but exceeds the exact round.
      expect(
        c.stresses.find((s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct')
      ).toMatchObject({
        state: 'invalid',
        issues: [
          expect.objectContaining({
            code: 'CHECK_EXCEEDS_ROUND_SIZE',
            path:
              kind === 'entry'
                ? 'input.allocations[0].initialCheckUsd'
                : 'input.allocations[0].followOnRounds[0].checkPolicy.checkUsd',
          }),
        ],
      });
    }
  );

  it.each(['initial', 'fixed', 'pro_rata'] as const)(
    'records exact sub-micro monetary changes for %s stress assumptions',
    (kind) => {
      const candidate = makeCapitalInput();
      const a = candidate.allocations[0]!;
      a.initialCheckUsd = '0.000001';
      const paths = ['allocations[0].initialCheckUsd'];
      if (kind !== 'initial') {
        a.followOnRounds = [
          {
            roundId: 'r1',
            stageId: 's1',
            roundLabel: 'Next round',
            graduationRatio: ratio(1),
            participationRatio: ratio(1),
            checkPolicy: { type: 'fixed_check', checkUsd: '0.000001' },
            monthsAfterPreviousRound: 1,
            timeOrigin: 'previous_round',
          },
        ];
        if (kind === 'fixed') paths.push('allocations[0].followOnRounds[0].checkPolicy.checkUsd');
        else {
          a.entryFinancing = {
            valuationUsd: money(1),
            valuationBasis: 'pre_money',
            totalPrimaryRoundUsd: money(1),
          };
          a.followOnRounds[0]!.checkPolicy = { type: 'pro_rata', proRataExerciseRatio: ratio(1) };
          a.followOnRounds[0]!.incrementalPreMoneyPoolDilutionRatio = ratio(0);
          a.followOnRounds[0]!.financing = {
            valuationUsd: '1.000001',
            valuationBasis: 'post_money',
            totalPrimaryRoundUsd: '0.000001',
          };
          paths.push(
            'allocations[0].followOnRounds[0].financing.totalPrimaryRoundUsd',
            'allocations[0].followOnRounds[0].financing.valuationUsd'
          );
        }
      }
      const stress = run(candidate, 1, 1).construction.stresses.find(
        (s) => s.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct'
      );
      expect(stress).toMatchObject({ state: 'complete', changedPaths: paths });
      if (kind === 'initial')
        expect(stress).toMatchObject({
          reconciliation: { initialDemandUsd: '1.250000', lifetimeBudgetShortfallUsd: '0.250000' },
        });
    }
  );

  it('CP024/053/054 freezes all construction output across companion changes', () => {
    for (const entered of [undefined, 17]) {
      const candidate = input();
      if (entered !== undefined) candidate.allocations[0]!.plannedCompanyCount = entered;
      const sourceBundle = bundleFor(candidate);
      const original = structuredClone({ input: candidate, sourceBundle });
      const freeze = (value: unknown): void => {
        if (value && typeof value === 'object') {
          Object.values(value).forEach(freeze);
          Object.freeze(value);
        }
      };
      freeze(candidate);
      freeze(sourceBundle);
      const baseline = calculateCapitalPlanningV1({ input: candidate, sourceBundle });
      for (const exit of [money(0), money('999999999999999')]) {
        const changed: CapitalPlanningInputV1 = {
          ...candidate,
          performanceCase: {
            methodVersion: AGGREGATE_PREFERENCE_FORECAST_VERSION,
            issuerLabel: 'Synthetic issuer',
            issuerKind: 'representative_issuer',
            exitEquityValueUsd: exit,
            exitDate: '2026-01-01',
            asConvertedOwnershipRatio: ratio('0.25'),
            manualOwnershipOverrideRatio: ratio('0.5'),
            fundLiquidationPreferenceUsd: money(4000000),
            preferenceType: 'participating',
            participationCap: { type: 'none' },
            totalPreferencesSeniorUsd: money(2000000),
            totalPreferencesPariPassuUsd: money(4000000),
            totalPreferencesJuniorUsd: money(2000000),
            investedCostUsd: money(2000000),
            positionFmv: { amountUsd: money(7000000), asOfDate: '2026-08-01', basis: 'direct' },
            manualFmvOverride: {
              amountUsd: money(99000000),
              asOfDate: '2026-09-01',
              basis: 'manual',
            },
          },
        };
        const result = calculateCapitalPlanningV1({ input: changed, sourceBundle });
        expect(result.construction).toEqual(baseline.construction);
        expect(result.performance!.input).toEqual(changed.performanceCase);
        expect(result.performance!.constructionFunding).toBe('excluded');
      }
      expect(calculateCapitalPlanningV1({ input: candidate, sourceBundle })).toEqual(baseline);
      expect({ input: candidate, sourceBundle }).toEqual(original);
    }
  });

  it('CP037/039 rejects unsupported policies and invalid sizes at the public boundary', () => {
    const candidate = input();
    const sourceBundle = bundleFor(candidate);
    for (const [mutate, code, path] of [
      [
        (value: CapitalPlanningInputV1) =>
          Object.assign(value.allocations[0]!.followOnRounds[0]!.checkPolicy, {
            type: 'capped_check',
            capUsd: money(1),
          }),
        'POLICY_UNSUPPORTED',
        'input.allocations[0].followOnRounds[0].checkPolicy.type',
      ],
      [
        (value: CapitalPlanningInputV1) => {
          value.allocations[0]!.followOnRounds[0]!.monthsAfterPreviousRound = -1;
        },
        'INVALID_INPUT',
        'input.allocations[0].followOnRounds[0].monthsAfterPreviousRound',
      ],
      [
        (value: CapitalPlanningInputV1) => {
          value.allocations[0]!.deploymentPeriodYears = 11;
        },
        'INVALID_INPUT',
        'input.allocations[0].deploymentPeriodYears',
      ],
    ] as const) {
      const invalid = structuredClone(candidate);
      mutate(invalid);
      try {
        calculateCapitalPlanningV1({ input: invalid, sourceBundle });
        expect.unreachable('Invalid input must be refused');
      } catch (error) {
        expect(error).toBeInstanceOf(CapitalPlanningCalculationError);
        expect((error as CapitalPlanningCalculationError).issues).toContainEqual(
          expect.objectContaining({ code, path })
        );
      }
    }
  });
});
