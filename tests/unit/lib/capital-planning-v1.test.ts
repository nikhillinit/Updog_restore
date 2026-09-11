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
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';
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

  it('CP041 keeps no-gap cohorts separate from a later multi-allocation stress gap', () => {
    const candidate = makeCapitalInput();
    const original = candidate.allocations[0]!;
    candidate.allocations = [4, 6, 0].map((count, index) => ({
      ...original,
      allocationId: `a${index + 1}`,
      name: `Allocation ${index + 1}`,
      pipelineProfileId: `p${index + 1}`,
      budgetShareRatio: ratio(new Decimal(count).div(10).toString()),
      plannedCompanyCount: count,
    }));

    const c = run(candidate, 10, 1).construction;
    expect(c.monthlyDetail).toHaveLength(72);
    for (const reconciliation of c.reconciliation) {
      expect(reconciliation).toMatchObject({
        firstBudgetGapMonth: null,
        firstGapAllocationId: null,
        firstGapRoundId: null,
        lifetimeBudgetShortfallUsd: money(0),
        allocationGapUsd: { state: 'available', value: money(0) },
        reserveEarmarkGapUsd: { state: 'available', value: money(0) },
      });
    }
    for (const countBasis of ['expected', 'entered']) {
      expect(
        c.stresses.find(
          (stress) =>
            stress.name === 'fixed_checks_and_pro_rata_rounds_plus_25pct' &&
            stress.countBasis === countBasis
        )
      ).toMatchObject({
        state: 'complete',
        reconciliation: {
          firstBudgetGapMonth: 9,
          firstGapAllocationId: 'a1',
          firstGapRoundId: null,
          lifetimeBudgetShortfallUsd: money('2.5'),
        },
      });
    }
  });

  it('CP041 retains other allocation accruals across initial and follow-on cohorts', () => {
    const candidate = makeCapitalInput();
    candidate.netInvestableCapitalUsd = money(20);
    const original = candidate.allocations[0]!;
    candidate.allocations = [0, 4, 4].map((count, index) => ({
      ...original,
      allocationId: ['a0', 'b1', 'c1'][index]!,
      name: `Allocation ${index + 1}`,
      pipelineProfileId: `p${index + 1}`,
      budgetShareRatio: ratio(index === 0 ? 0 : '0.5'),
      plannedCompanyCount: count,
      followOnRounds: [
        {
          roundId: 'follow',
          stageId: 'next',
          roundLabel: 'Follow-on',
          graduationRatio: ratio(1),
          participationRatio: ratio(1),
          checkPolicy: { type: 'fixed_check', checkUsd: money(1) },
          monthsAfterPreviousRound: 0,
          timeOrigin: 'previous_round',
        },
      ],
    }));

    const c = run(candidate, 10, 1).construction;
    expect(c.monthlyDetail).toHaveLength(144);
    expect(c.reconciliation.find((value) => value.countBasis === 'expected')).toMatchObject({
      firstBudgetGapMonth: 6,
      firstGapAllocationId: 'b1',
      firstGapRoundId: null,
      lifetimeBudgetShortfallUsd: money(10),
      allocationGapUsd: { state: 'available', value: money(0) },
      reserveEarmarkGapUsd: { state: 'available', value: money(0) },
    });
    expect(c.reconciliation.find((value) => value.countBasis === 'entered')).toMatchObject({
      firstBudgetGapMonth: 7,
      firstGapAllocationId: 'c1',
      firstGapRoundId: null,
      lifetimeBudgetShortfallUsd: money(6),
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

describe('B4 construction recovery regressions', () => {
  it.each(['explicit', 'omitted'] as const)(
    'CP032/035 retains 80m capacity with contractual GP included and %s zero deemed fraction',
    (fraction) => {
      const candidate = makeCapitalInput();
      candidate.allocations[0]!.initialCheckUsd = '1000000.000000';
      let rawSource: ReturnType<typeof makeCapitalRawConfig> | undefined;
      let rawBefore = '';
      const sourceBundle = bundleFor(candidate, 100000000, 10, (raw, declarations) => {
        feeExpense('18000000', '2000000', 10)(raw, declarations);
        raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 10000000;
        if (fraction === 'omitted') delete raw.fundedFromFeesPct;
        rawSource = raw;
        rawBefore = JSON.stringify(raw);
      });
      const bundleBefore = structuredClone(sourceBundle);
      const result = calculateCapitalPlanningV1({ input: candidate, sourceBundle });
      expect(result.construction.budget).toMatchObject({
        committedCapitalUsd: '100000000.000000',
        gpCommitmentUsd: '10000000.000000',
        fundedFromFeesRatio: '0.000000000000',
        gpDeemedContributionUsd: '0.000000',
        lifetimeFeesUsd: '18000000.000000',
        lifetimeExpensesUsd: '2000000.000000',
        availableConstructionCapitalUsd: '80000000.000000',
        planningBudgetUsd: { state: 'available', value: '80000000.000000' },
        planningBudgetOrigin: 'derived_available_capital',
        feePopulation: 'full_fund_committed_capital',
        fundingAssumption: 'callable_as_needed',
      });
      expect(result.construction.allocations[0]!.expected).toMatchObject({
        companyCount: '80.000000000000',
        initialDemandUsd: '80000000.000000',
        followOnDemandUsd: '0.000000',
        totalDemandUsd: '80000000.000000',
      });
      expect(sourceBundle.gp.resolved).toMatchObject({
        source: 'nested_amount',
        commitmentUsd: '10000000.000000',
        fact: { path: 'economicsAssumptions.gpCommitmentModel.commitmentAmount' },
      });
      expect(sourceBundle.gp.fundedFromFeesPct).toMatchObject(
        fraction === 'omitted'
          ? {
              state: 'absent',
              effectiveValue: '0.000000000000',
              defaultReason: 'ADR_070_MISSING_FRACTION_ZERO',
            }
          : {
              state: 'present',
              effectiveValue: '0.000000000000',
              defaultReason: null,
              fact: { path: 'fundedFromFeesPct', rawValue: 0 },
            }
      );
      expect(JSON.stringify(rawSource)).toBe(rawBefore);
      expect(Object.hasOwn(rawSource!, 'fundedFromFeesPct')).toBe(fraction === 'explicit');
      expect(sourceBundle).toEqual(bundleBefore);
    }
  );

  it('CALC-R3-005 keeps fixed-check construction complete when ownership is unavailable', () => {
    const result = run();
    expect(result.construction.verdicts.inputSupport).toBe('complete');
    expect(result.construction.allocations[0]!.expected).toMatchObject({
      companyCount: '16.000000000000',
      totalDemandUsd: '10000000.000000',
      followOnDemandUsd: '2000000.000000',
    });
    expect(result.construction.allocations[0]!.rounds[0]!.ownership).toEqual({
      state: 'unavailable',
      reason: 'OWNERSHIP_UNAVAILABLE',
      issues: [],
    });
    expect(result.provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].initialCheckUsd',
        origin: 'source_derived',
        effectiveValue: '500000.000000',
      })
    );
    expect(result.provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[0].checkPolicy.checkUsd',
        origin: 'user_entered',
        effectiveValue: '500000.000000',
        sourceValue: null,
      })
    );
    expect(result.provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[0].participationRatio',
        origin: 'user_override',
        effectiveValue: '0.500000000000',
        sourceValue: '0.000000000000',
      })
    );
  });

  it('CALC-R3-002 does not infer incremental dilution from a raw twelve-percent total pool', () => {
    const candidate = ownershipInput();
    const round = candidate.allocations[0]!.followOnRounds[0]!;
    round.checkPolicy = { type: 'fixed_check', checkUsd: '2000000.000000' };
    delete round.incrementalPreMoneyPoolDilutionRatio;
    const sourceBundle = bundleFor(candidate, 10000000, 4, (raw) => {
      raw.pipelineProfiles![0]!.stages[1]!.esopPct = 0.12;
    });
    const before = structuredClone(sourceBundle);
    const result = calculateCapitalPlanningV1({ input: candidate, sourceBundle });
    expect(result.construction.allocations[0]!.rounds[0]).toMatchObject({
      conditionalCheckUsd: '2000000.000000',
      ownership: { state: 'unavailable', reason: 'OWNERSHIP_UNAVAILABLE' },
    });
    expect(
      result.provenance.some((p) => p.inputPath.endsWith('incrementalPreMoneyPoolDilutionRatio'))
    ).toBe(false);
    round.incrementalPreMoneyPoolDilutionRatio = '0.000000000000';
    const explicit = calculateCapitalPlanningV1({ input: candidate, sourceBundle });
    expect(explicit.construction.allocations[0]!.rounds[0]!.ownership).toMatchObject({
      state: 'available',
      beforePoolRatio: '0.100000000000',
      afterPoolRatio: '0.100000000000',
      conditionalMeanRatio: '0.100000000000',
    });
    expect(explicit.provenance).toContainEqual(
      expect.objectContaining({
        inputPath: 'allocations[0].followOnRounds[0].incrementalPreMoneyPoolDilutionRatio',
        origin: 'user_entered',
        sourceValue: null,
        effectiveValue: '0.000000000000',
      })
    );
    expect(sourceBundle).toEqual(before);
  });

  it('does not classify zero-cost beyond-term rows as funded beyond-term demand', () => {
    const candidate = input();
    candidate.allocations[0]!.followOnRounds[0]!.participationRatio = '0.000000000000';
    const c = run(candidate).construction;
    expect(c.monthlyDetail.some((r) => r.kind === 'follow_on' && r.beyondTerm)).toBe(true);
    expect(c.reconciliation[0]).toMatchObject({
      lifetimeFollowOnUsd: '0.000000',
      withinTermFollowOnUsd: '0.000000',
      beyondTermFollowOnUsd: '0.000000',
    });
    expect(c.verdicts.timing).toBe('within_term');
  });

  function timingInput(intervals: number[]) {
    const candidate = makeCapitalInput();
    candidate.allocations[0]!.plannedCompanyCount = 3;
    candidate.allocations[0]!.followOnRounds = intervals.map((months, index) => ({
      roundId: `r${index + 1}`,
      stageId: `s${index + 1}`,
      roundLabel: `Round ${index + 1}`,
      graduationRatio: '1.000000000000',
      participationRatio: '1.000000000000',
      checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
      monthsAfterPreviousRound: months,
      timeOrigin: 'previous_round',
    }));
    return candidate;
  }

  it('CALC-R3-008 subtracts six months from each interval in a two-round fixed-count stress', () => {
    const candidate = timingInput([18, 12]);
    const c = run(candidate, 36, 2).construction;
    expect(c.allocations[0]!.expected).toMatchObject({
      companyCount: '12.000000000000',
      initialDemandUsd: '12.000000',
      followOnDemandUsd: '24.000000',
      totalDemandUsd: '36.000000',
    });
    expect(
      c.allocations[0]!.rounds.filter((r) => r.countBasis === 'expected').map(
        (r) => r.cumulativeLagMonths
      )
    ).toEqual([18, 30]);
    const changed = timingInput([12, 6]);
    const shifted = run(changed, 36, 2).construction;
    expect(
      shifted.monthlyDetail
        .filter((r) => r.entryMonth === 0 && r.kind === 'follow_on' && r.countBasis === 'expected')
        .map((r) => r.demandMonth)
    ).toEqual([12, 18]);
    for (const [countBasis, baseWithin, baseBeyond, within, beyond, initial, follow] of [
      ['expected', '6.000000', '18.000000', '18.000000', '6.000000', '12.000000', '24.000000'],
      ['entered', '1.500000', '4.500000', '4.500000', '1.500000', '3.000000', '6.000000'],
    ]) {
      const baseline = c.reconciliation.find((r) => r.countBasis === countBasis)!;
      expect(baseline).toMatchObject({
        initialDemandUsd: initial,
        lifetimeFollowOnUsd: follow,
        withinTermFollowOnUsd: baseWithin,
        beyondTermFollowOnUsd: baseBeyond,
      });
      const stress = c.stresses.find(
        (s) => s.name === 'follow_on_6_months_earlier' && s.countBasis === countBasis
      )!;
      expect(stress.state).toBe('complete');
      if (stress.state !== 'complete') throw new Error('Expected complete timing stress');
      expect(stress.changedPaths).toEqual([
        'allocations[0].followOnRounds[0].monthsAfterPreviousRound',
        'allocations[0].followOnRounds[1].monthsAfterPreviousRound',
      ]);
      expect(stress.reconciliation).toMatchObject({
        initialDemandUsd: initial,
        lifetimeFollowOnUsd: follow,
        withinTermFollowOnUsd: within,
        beyondTermFollowOnUsd: beyond,
        signedLifetimeHeadroomUsd: baseline.signedLifetimeHeadroomUsd,
        lifetimeBudgetShortfallUsd: '0.000000',
      });
      expect(stress.reconciliation).toEqual(
        shifted.reconciliation.find((r) => r.countBasis === countBasis)
      );
      expect(stress.annualSchedule).toEqual(
        shifted.annualSchedule.filter((r) => r.countBasis === countBasis)
      );
      expect(stress.plannedReserveGapUsd).toBe('0.000000');
    }
    expect(
      c.stresses.find((s) => s.name === 'follow_on_6_months_earlier' && s.countBasis === 'expected')
    ).toMatchObject({
      annualSchedule: [
        { fundYear: 1, totalDemandUsd: '12.000000' },
        { fundYear: 2, totalDemandUsd: '18.000000' },
        { fundYear: 3, totalDemandUsd: '6.000000' },
      ],
    });
  });

  it('floors each earlier round interval at zero before accumulating two-round timing', () => {
    const c = run(timingInput([4, 8]), 36, 2).construction;
    const shifted = run(timingInput([0, 2]), 36, 2).construction;
    expect(
      shifted.allocations[0]!.rounds.filter((r) => r.countBasis === 'expected').map(
        (r) => r.cumulativeLagMonths
      )
    ).toEqual([0, 2]);
    expect(
      shifted.monthlyDetail
        .filter((r) => r.entryMonth === 0 && r.kind === 'follow_on' && r.countBasis === 'expected')
        .map((r) => r.demandMonth)
    ).toEqual([0, 2]);
    const stress = c.stresses.find(
      (s) => s.name === 'follow_on_6_months_earlier' && s.countBasis === 'expected'
    )!;
    expect(stress).toMatchObject({
      state: 'complete',
      plannedReserveGapUsd: '0.000000',
      changedPaths: [
        'allocations[0].followOnRounds[0].monthsAfterPreviousRound',
        'allocations[0].followOnRounds[1].monthsAfterPreviousRound',
      ],
      reconciliation: {
        initialDemandUsd: '12.000000',
        lifetimeFollowOnUsd: '24.000000',
        withinTermFollowOnUsd: '24.000000',
        beyondTermFollowOnUsd: '0.000000',
        lifetimeBudgetShortfallUsd: '0.000000',
        signedLifetimeHeadroomUsd: '0.000000',
      },
      annualSchedule: [
        { fundYear: 1, totalDemandUsd: '34.000000' },
        { fundYear: 2, totalDemandUsd: '2.000000' },
      ],
    });
    if (stress.state !== 'complete') throw new Error('Expected complete timing stress');
    expect(stress.annualSchedule).toEqual(
      shifted.annualSchedule.filter((r) => r.countBasis === 'expected')
    );
    expect(shifted.allocations[0]!.expected).toEqual(c.allocations[0]!.expected);
  });

  it.each([
    [
      ['a1', 'shared'],
      ['a2', 'shared'],
    ],
    [
      ['a:shared', 'round'],
      ['a', 'shared:round'],
    ],
  ])(
    'keeps allocation/round identities separate across within-term and beyond-term demand: %j',
    (first, second) => {
      const candidate = timingInput([6]);
      const a = candidate.allocations[0]!;
      a.allocationId = first![0]!;
      a.followOnRounds[0]!.roundId = first![1]!;
      a.budgetShareRatio = '0.500000000000';
      const other = structuredClone(a);
      other.allocationId = second![0]!;
      other.pipelineProfileId = 'p2';
      other.followOnRounds[0]!.roundId = second![1]!;
      other.followOnRounds[0]!.monthsAfterPreviousRound = 24;
      delete other.plannedCompanyCount;
      candidate.allocations.push(other);
      const c = run(candidate, 48, 2).construction;
      expect(c.reconciliation.find((r) => r.countBasis === 'expected')).toMatchObject({
        initialDemandUsd: '24.000000',
        lifetimeFollowOnUsd: '24.000000',
        withinTermFollowOnUsd: '12.000000',
        beyondTermFollowOnUsd: '12.000000',
        signedLifetimeHeadroomUsd: '0.000000',
      });
      expect(c.reconciliation.find((r) => r.countBasis === 'entered')).toMatchObject({
        initialDemandUsd: '3.000000',
        lifetimeFollowOnUsd: '3.000000',
        withinTermFollowOnUsd: '3.000000',
        beyondTermFollowOnUsd: '0.000000',
      });
      expect(
        c.monthlyDetail.filter(
          (r) => r.allocationId === other.allocationId && r.countBasis === 'entered'
        )
      ).toEqual([]);
      expect(c.verdicts.timing).toBe('includes_beyond_term');
    }
  );

  it.each([
    ['zero_cost', '0.500000000000', '1.000000', '12.000000', 'all_beyond_term'],
    ['zero_count', '0.000000000000', '1.000000', '24.000000', 'includes_beyond_term'],
  ] as const)(
    'preserves %s row semantics when all positive follow-on demand is beyond term',
    (kind, share, check, follow, timing) => {
      const candidate = timingInput([0]);
      const a = candidate.allocations[0]!;
      delete a.plannedCompanyCount;
      a.budgetShareRatio = share;
      a.followOnRounds[0]!.checkPolicy = { type: 'fixed_check', checkUsd: check };
      if (kind === 'zero_cost') a.followOnRounds[0]!.participationRatio = '0.000000000000';
      const other = structuredClone(a);
      other.allocationId = 'a2';
      other.pipelineProfileId = 'p2';
      other.budgetShareRatio = kind === 'zero_count' ? '1.000000000000' : '0.500000000000';
      other.followOnRounds[0]!.checkPolicy = { type: 'fixed_check', checkUsd: '1.000000' };
      other.followOnRounds[0]!.monthsAfterPreviousRound = 24;
      other.followOnRounds[0]!.participationRatio = '1.000000000000';
      candidate.allocations.push(other);
      const c = run(candidate, 48, 2).construction;
      expect(c.reconciliation[0]).toMatchObject({
        lifetimeFollowOnUsd: follow,
        withinTermFollowOnUsd: '0.000000',
        beyondTermFollowOnUsd: follow,
        lifetimeBudgetShortfallUsd: '0.000000',
      });
      expect(c.verdicts.timing).toBe(timing);
      expect(
        c.monthlyDetail.filter((r) => r.allocationId === a.allocationId && r.kind === 'follow_on')
      ).toHaveLength(12);
      for (const row of c.monthlyDetail.filter(
        (r) => r.allocationId === a.allocationId && r.kind === 'follow_on'
      ))
        expect(row).toMatchObject({ demandUsd: '0.000000', beyondTerm: false });
    }
  );
});

describe('B4 admitted funding and output obligations', () => {
  function sourceCase() {
    const raw = makeCapitalRawConfig();
    const candidate = makeCapitalInput();
    const unitDeclarations = makeCapitalDeclarations();
    const source = {
      fund: { id: 101, size: '100', baseCurrency: 'USD' },
      config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
    };
    return {
      raw,
      candidate,
      source,
      unitDeclarations,
      materialize: () =>
        materializeCapitalSource({ source, inputs: [candidate], unitDeclarations }),
      calculate: () => {
        const admitted = materializeCapitalSource({
          source,
          inputs: [candidate],
          unitDeclarations,
        });
        if (!admitted.ok) throw new Error(JSON.stringify(admitted));
        return calculateCapitalPlanningV1({
          input: candidate,
          sourceBundle: admitted.sourceBundle,
        });
      },
    };
  }
  function legacyFee() {
    const f = sourceCase();
    delete f.raw.economicsAssumptions!.feeModel!.tiers;
    f.raw.feeProfiles = [
      {
        id: 'legacy-fee',
        name: 'Legacy',
        feeTiers: [
          {
            id: 'legacy-tier',
            name: 'Committed fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 23,
          },
        ],
      },
    ];
    f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = 'percent_points';
    f.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_zero_based';
    return f;
  }
  function legacyExpense() {
    const f = sourceCase();
    f.source.fund.size = '1000';
    f.raw.fundSize = 1000;
    f.raw.fundedFromFeesPct = 0;
    f.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 0;
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0;
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    f.raw.fundExpenses = [
      { id: 'monthly', category: 'admin', monthlyAmount: 10, startMonth: 0, endMonth: 23 },
    ];
    f.unitDeclarations['fundExpenses[0].monthlyAmount'] = 'usd';
    f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    return f;
  }
  function expectRefusal(
    f: ReturnType<typeof sourceCase>,
    code: string,
    path: string,
    status = 422
  ) {
    const result = f.materialize();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected refusal before calculation');
    expect(result.status).toBe(status);
    expect(result.issues).toContainEqual(expect.objectContaining({ code, path }));
  }

  it.each(['explicit', 'omitted'] as const)(
    'GP-R3-006 calculates zero fallback with %s zero fraction without inventing raw GP',
    (fraction) => {
      const candidate = makeCapitalInput();
      const result = run(candidate, 100, 2, (raw, declarations) => {
        feeExpense('10', '2', 2)(raw, declarations);
        delete raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
        delete declarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
        if (fraction === 'omitted') delete raw.fundedFromFeesPct;
      });
      expect(result.construction.budget).toMatchObject({
        gpCommitmentUsd: '0.000000',
        gpDeemedContributionUsd: '0.000000',
        availableConstructionCapitalUsd: '88.000000',
      });
      expect(result.sourceBundle.gp.resolved).toEqual({
        source: 'zero_fallback',
        commitmentUsd: '0.000000',
        defaultReason: 'GP_COMMITMENT_SOURCES_ABSENT',
      });
      expect(result.sourceBundle.gp.fundedFromFeesPct.state).toBe(
        fraction === 'omitted' ? 'absent' : 'present'
      );
    }
  );

  it('GP-R3-008/009/022 retains fee population, period, units and method when deemed fraction changes', () => {
    const zero = sourceCase();
    zero.raw.fundedFromFeesPct = 0;
    const deemed = sourceCase();
    const a = zero.calculate();
    const b = deemed.calculate();
    expect(a.sourceBundle.feeExpense).toEqual(b.sourceBundle.feeExpense);
    expect(a.construction.budget).toMatchObject({
      committedCapitalUsd: '100.000000',
      gpCommitmentUsd: '10.000000',
      lifetimeFeesUsd: '4.000000',
      gpDeemedContributionUsd: '0.000000',
      availableConstructionCapitalUsd: '94.000000',
    });
    expect(b.construction.budget).toMatchObject({
      committedCapitalUsd: '100.000000',
      gpCommitmentUsd: '10.000000',
      lifetimeFeesUsd: '4.000000',
      gpDeemedContributionUsd: '4.000000',
      availableConstructionCapitalUsd: '90.000000',
      feePopulation: 'full_fund_committed_capital',
    });
    expect(b.sourceBundle.feeExpense).toMatchObject({
      feeBasisUsd: '100.000000',
      lifetimeFeesUsd: '4.000000',
      feeSelection: 'explicit_tiers',
      feeTiers: [
        {
          rate: {
            path: 'economicsAssumptions.feeModel.tiers[0].rate',
            rawValue: 0.02,
            sourceUnit: 'ratio',
            normalizedValue: '0.020000000000',
          },
          period: { normalizedStartMonth: 0, normalizedEndMonth: 23 },
        },
      ],
    });
    expect(b.sourceBundle.gp.methodVersion).toBe('capital-gp-deemed/1.0.0');
  });

  it('FEE-R3-009 uses selected nested life and keeps later fee facts without accruing them', () => {
    const f = sourceCase();
    f.raw.economicsAssumptions!.timeline = { fundLifeYears: 1, period: 'annual' };
    const result = f.calculate();
    expect(result.construction.budget).toMatchObject({
      lifetimeFeesUsd: '2.000000',
      lifetimeExpensesUsd: '1.000000',
      availableConstructionCapitalUsd: '93.000000',
    });
    expect(result.sourceBundle.fundLife.effectiveValue).toBe(1);
    expect(result.sourceBundle.feeExpense.feeTiers[0]!.period.normalizedEndMonth).toBe(23);
    const pinned = structuredClone(result.sourceBundle);
    f.raw.fundLife = 10;
    f.raw.economicsAssumptions!.timeline!.fundLifeYears = 10;
    expect(calculateCapitalPlanningV1({ input: f.candidate, sourceBundle: pinned })).toEqual(
      result
    );
  });

  it.each(['fund_month_zero_based', 'fund_month_one_based'] as const)(
    'FEE-R3-009 calculates matching inclusive annual fee amount from %s months',
    (origin) => {
      const f = legacyFee();
      const tier = f.raw.feeProfiles![0]!.feeTiers[0]!;
      tier.startMonth = origin === 'fund_month_zero_based' ? 0 : 1;
      tier.endMonth = origin === 'fund_month_zero_based' ? 11 : 12;
      f.unitDeclarations['feeProfiles[0].feeTiers[0].startMonth'] = origin;
      f.unitDeclarations['feeProfiles[0].feeTiers[0].endMonth'] = origin;
      const result = f.calculate();
      expect(result.construction.budget).toMatchObject({
        lifetimeFeesUsd: '2.000000',
        lifetimeExpensesUsd: '2.000000',
        availableConstructionCapitalUsd: '92.000000',
      });
      expect(result.sourceBundle.feeExpense.feeTiers[0]!.period).toMatchObject({
        normalizedStartMonth: 0,
        normalizedEndMonth: 11,
      });
    }
  );

  it('CP015 refuses a month-six fee change and unsupported basis despite an explicit planning override', () => {
    const f = legacyFee();
    f.candidate.netInvestableCapitalUsd = '100.000000';
    f.raw.feeProfiles![0]!.feeTiers[0]!.endMonth = 5;
    expectRefusal(f, 'FEE_PERIOD_NOT_REPRESENTABLE', 'feeProfiles[0].feeTiers[0].endMonth');
    f.raw.feeProfiles![0]!.feeTiers[0]!.endMonth = 23;
    f.raw.feeProfiles![0]!.feeTiers[0]!.feeBasis = 'cumulative_invested';
    expectRefusal(f, 'FEE_BASIS_UNSUPPORTED', 'feeProfiles[0].feeTiers[0].feeBasis');
  });

  it('CP015 distinguishes missing expenses from explicitly empty expenses before construction', () => {
    const f = sourceCase();
    delete f.raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete f.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    expectRefusal(f, 'EXPENSE_MODEL_UNRESOLVED', 'fundExpenses');
    f.raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
    expect(f.calculate().construction.budget).toMatchObject({
      lifetimeExpensesUsd: '0.000000',
      availableConstructionCapitalUsd: '92.000000',
    });
  });

  it.each([
    [0, 0, 'fund_month_zero_based', '10.000000', '990.000000'],
    [0, 5, 'fund_month_zero_based', '60.000000', '940.000000'],
    [6, 11, 'fund_month_zero_based', '60.000000', '940.000000'],
    [0, 11, 'fund_month_zero_based', '120.000000', '880.000000'],
    [1, 1, 'fund_month_one_based', '10.000000', '990.000000'],
    [1, 12, 'fund_month_one_based', '120.000000', '880.000000'],
    [0, 35, 'fund_month_zero_based', '240.000000', '760.000000'],
  ] as const)(
    'FEE-R3-013 charges monthly window %s through %s with %s origin exactly once',
    (start, end, origin, expenses, available) => {
      const f = legacyExpense();
      f.raw.fundExpenses![0]!.startMonth = start;
      f.raw.fundExpenses![0]!.endMonth = end;
      f.unitDeclarations['fundExpenses[0].startMonth'] = origin;
      f.unitDeclarations['fundExpenses[0].endMonth'] = origin;
      const result = f.calculate();
      expect(result.construction.budget).toMatchObject({
        lifetimeExpensesUsd: expenses,
        availableConstructionCapitalUsd: available,
      });
      expect(result.construction.allocations[0]!.expected).toMatchObject({
        totalDemandUsd: available,
      });
      expect(result.sourceBundle.feeExpense.expenses[0]!.period.normalizedEndMonth).toBe(
        origin === 'fund_month_one_based' ? end - 1 : end
      );
    }
  );

  it('FEE-R3-013 preserves an absent expense end and adds one formation charge to recurring expenses', () => {
    const f = legacyExpense();
    delete f.raw.fundExpenses![0]!.endMonth;
    delete f.unitDeclarations['fundExpenses[0].endMonth'];
    f.raw.fundExpenses!.push({
      id: 'formation',
      category: 'formation',
      monthlyAmount: 5,
      startMonth: 0,
      endMonth: 0,
    });
    f.unitDeclarations['fundExpenses[1].monthlyAmount'] = 'usd';
    f.unitDeclarations['fundExpenses[1].startMonth'] = 'fund_month_zero_based';
    f.unitDeclarations['fundExpenses[1].endMonth'] = 'fund_month_zero_based';
    const result = f.calculate();
    expect(result.construction.budget).toMatchObject({
      lifetimeExpensesUsd: '245.000000',
      availableConstructionCapitalUsd: '755.000000',
    });
    expect(result.sourceBundle.feeExpense.expenses[0]!.period.end).toMatchObject({
      state: 'absent',
      effectiveValue: 23,
      defaultReason: 'FINITE_FUND_HORIZON_END',
    });
    expect(f.raw.fundExpenses![0]).not.toHaveProperty('endMonth');
  });

  it('FEE-R3-014 changes calculated periods without rewriting raw identity and replays each pinned origin', () => {
    const f = legacyExpense();
    f.raw.fundExpenses![0]!.startMonth = 1;
    f.raw.fundExpenses![0]!.endMonth = 24;
    const zero = f.calculate();
    f.unitDeclarations['fundExpenses[0].startMonth'] = 'fund_month_one_based';
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_one_based';
    const one = f.calculate();
    expect(zero.sourceBundle.projection).toEqual(one.sourceBundle.projection);
    expect(zero.sourceBundle.sourceBundleHash).toBe(one.sourceBundle.sourceBundleHash);
    expect(zero.construction.budget).toMatchObject({
      lifetimeExpensesUsd: '230.000000',
      availableConstructionCapitalUsd: '770.000000',
    });
    expect(one.construction.budget).toMatchObject({
      lifetimeExpensesUsd: '240.000000',
      availableConstructionCapitalUsd: '760.000000',
    });
    expect(zero.sourceBundle.feeExpense.expenses[0]!.period).toMatchObject({
      normalizedStartMonth: 1,
      normalizedEndMonth: 24,
    });
    expect(one.sourceBundle.feeExpense.expenses[0]!.period).toMatchObject({
      normalizedStartMonth: 0,
      normalizedEndMonth: 23,
    });
    for (const result of [zero, one])
      expect(
        calculateCapitalPlanningV1({ input: f.candidate, sourceBundle: result.sourceBundle })
      ).toEqual(result);
    delete f.unitDeclarations['fundExpenses[0].endMonth'];
    expectRefusal(f, 'TIME_ORIGIN_UNRESOLVED', 'fundExpenses[0].endMonth');
    f.unitDeclarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    expectRefusal(f, 'TIME_ORIGIN_UNRESOLVED', 'fundExpenses[0].endMonth');
  });

  it.each([
    [-1, 'percent_points'],
    [101, 'percent_points'],
    [1.01, 'ratio'],
    [Infinity, 'percent_points'],
  ] as const)(
    'FEE-R3-015 refuses invalid selected legacy rate %s declared %s before construction',
    (rate, unit) => {
      const f = legacyFee();
      f.raw.feeProfiles![0]!.feeTiers[0]!.percentage = rate;
      f.unitDeclarations['feeProfiles[0].feeTiers[0].percentage'] = unit;
      expectRefusal(f, 'FEE_RATE_INVALID', 'feeProfiles[0].feeTiers[0].percentage');
    }
  );

  it.each([
    [0, '0.000000', '94.000000'],
    [100, '200.000000', '-106.000000'],
  ] as const)(
    'FEE-R3-015 calculates admitted %s percent rate with signed capacity',
    (rate, fees, capacity) => {
      const f = legacyFee();
      f.raw.feeProfiles![0]!.feeTiers[0]!.percentage = rate;
      expect(f.calculate().construction.budget).toMatchObject({
        lifetimeFeesUsd: fees,
        availableConstructionCapitalUsd: capacity,
      });
    }
  );

  it.each([-1, Infinity])(
    'FEE-R3-016 refuses selected monthly expense %s before construction',
    (amount) => {
      const f = legacyExpense();
      f.raw.fundExpenses![0]!.monthlyAmount = amount;
      expectRefusal(f, 'EXPENSE_AMOUNT_INVALID', 'fundExpenses[0].monthlyAmount');
    }
  );

  it('FEE-R3-016 calculates selected zero monthly expense and retains stricter annual schema refusals', () => {
    const f = legacyExpense();
    f.raw.fundExpenses![0]!.monthlyAmount = 0;
    expect(f.calculate().construction.budget).toMatchObject({
      lifetimeExpensesUsd: '0.000000',
      availableConstructionCapitalUsd: '1000.000000',
    });
    const explicit = sourceCase();
    explicit.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = -1;
    expectRefusal(
      explicit,
      'INVALID_INPUT',
      'economicsAssumptions.expenseModel.annualExpenses[0].amount',
      409
    );
    explicit.raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = 1;
    explicit.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = -1;
    expectRefusal(explicit, 'INVALID_INPUT', 'economicsAssumptions.feeModel.tiers[0].rate', 409);
  });

  it('CP019 preserves construction when undated recycling annotations change', () => {
    const f = sourceCase();
    const before = f.calculate();
    f.raw.economicsAssumptions!.feeModel!.tiers![0]!.recyclingEligiblePct = 1;
    f.raw.economicsAssumptions!.recyclingModel = {
      enabled: true,
      sources: ['exit_proceeds'],
      capPctOfCommitments: 1,
      timing: 'before_waterfall',
    };
    const after = f.calculate();
    expect(after.construction).toEqual(before.construction);
    expect(after.construction.budget.availableConstructionCapitalUsd).toBe('90.000000');
    expect(after.sourceBundle.feeExpense.feeTiers[0]!.recyclingAnnotation).toEqual({
      path: 'economicsAssumptions.feeModel.tiers[0].recyclingEligiblePct',
      state: 'present',
      rawValue: 1,
    });
  });

  it('CP020 raises each conditional graduation by ten points and clips each at one', () => {
    const candidate = input();
    const a = candidate.allocations[0]!;
    a.initialCheckUsd = '1.000000';
    a.deploymentPeriodYears = 1;
    a.followOnRounds = ['0.950000000000', '0.990000000000'].map((graduation, i) => ({
      ...a.followOnRounds[0]!,
      roundId: `r${i + 1}`,
      stageId: `s${i + 1}`,
      graduationRatio: graduation,
      participationRatio: '1.000000000000',
      checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
    }));
    const c = run(candidate, 57.81, 2).construction;
    expect(c.allocations[0]!.expected).toMatchObject({
      companyCount: '20.000000000000',
      initialDemandUsd: '20.000000',
      followOnDemandUsd: '37.810000',
      totalDemandUsd: '57.810000',
    });
    expect(c.stresses.find((s) => s.name === 'graduation_plus_10pp')).toMatchObject({
      state: 'complete',
      changedPaths: [
        'allocations[0].followOnRounds[0].graduationRatio',
        'allocations[0].followOnRounds[1].graduationRatio',
      ],
      plannedReserveGapUsd: '2.190000',
      reconciliation: {
        initialDemandUsd: '20.000000',
        lifetimeFollowOnUsd: '40.000000',
        lifetimeBudgetShortfallUsd: '2.190000',
      },
    });
  });

  it.each([
    'minimum_check',
    'ownership_threshold',
    'milestone',
    'reserve_constrained_cap',
    'executable_rule',
  ])(
    'CALC-R3-003 rejects unsupported nonlinear %s policy at the public calculation boundary',
    (type) => {
      const candidate = input();
      const sourceBundle = bundleFor(candidate);
      Object.assign(candidate.allocations[0]!.followOnRounds[0]!.checkPolicy, { type });
      try {
        calculateCapitalPlanningV1({ input: candidate, sourceBundle });
        expect.unreachable('Unsupported policy must refuse');
      } catch (error) {
        expect(error).toBeInstanceOf(CapitalPlanningCalculationError);
        expect((error as CapitalPlanningCalculationError).issues).toContainEqual(
          expect.objectContaining({
            code: 'POLICY_UNSUPPORTED',
            path: 'input.allocations[0].followOnRounds[0].checkPolicy.type',
          })
        );
      }
    }
  );

  it('CALC-R3-001 calculates conditional graduation without requiring an outcome partition', () => {
    const candidate = input();
    candidate.allocations[0]!.followOnRounds[0]!.graduationRatio = '0.600000000000';
    const result = run(candidate, 6500000);
    expect(result.construction.allocations[0]!.expected).toMatchObject({
      companyCount: '10.000000000000',
      initialDemandUsd: '5000000.000000',
      followOnDemandUsd: '1500000.000000',
    });
    expect(result.construction.verdicts.inputSupport).toBe('complete');
    expect(result.construction.qualifications).toEqual(['INCLUDES_BEYOND_TERM']);
    expect(result.input.allocations[0]).not.toHaveProperty('exitRate');
    expect(result.input.allocations[0]).not.toHaveProperty('failureRate');
  });

  it('CALC-R3-007 qualifies the headline with the beyond-term amount despite fitting lifetime capacity', () => {
    const c = run().construction;
    expect(c.verdicts.lifetimeCapacity).toBe('within_capacity');
    expect(c.headline).toContain('includes $1000000.000000 beyond fund term');
    expect(c.headline).not.toMatch(/^feasible[.!]?$/i);
    expect(c.disclosures).toEqual({
      timing: CAPITAL_PLANNING_DISCLOSURES.timing,
      budget: CAPITAL_PLANNING_DISCLOSURES.budget,
      gp: CAPITAL_PLANNING_DISCLOSURES.gp,
    });
  });

  it('CP052/PERF-R3-006 changes ownership proceeds while all construction and FMV-independent returns remain pinned', () => {
    const candidate = input();
    candidate.performanceCase = {
      methodVersion: AGGREGATE_PREFERENCE_FORECAST_VERSION,
      issuerLabel: 'Synthetic issuer',
      issuerKind: 'representative_issuer',
      exitEquityValueUsd: '20.000000',
      exitDate: '2026-01-01',
      asConvertedOwnershipRatio: '0.250000000000',
      fundLiquidationPreferenceUsd: '4.000000',
      preferenceType: 'participating',
      participationCap: { type: 'none' },
      totalPreferencesSeniorUsd: '2.000000',
      totalPreferencesPariPassuUsd: '4.000000',
      totalPreferencesJuniorUsd: '2.000000',
      investedCostUsd: '2.000000',
      positionFmv: { amountUsd: '7.000000', asOfDate: '2026-08-01', basis: 'direct' },
    };
    const sourceBundle = bundleFor(candidate);
    const original = calculateCapitalPlanningV1({ input: candidate, sourceBundle });
    const edited = structuredClone(candidate);
    edited.performanceCase!.manualOwnershipOverrideRatio = '0.500000000000';
    const override = calculateCapitalPlanningV1({ input: edited, sourceBundle });
    expect(override.performance).toMatchObject({
      adjustedProceedsUsd: '8.000000',
      adjustedMoic: { state: 'available', value: '4.000000000000' },
    });
    expect(override.construction).toEqual(original.construction);
    edited.performanceCase!.manualFmvOverride = {
      amountUsd: '99.000000',
      asOfDate: '2026-09-01',
      basis: 'manual',
    };
    const fmv = calculateCapitalPlanningV1({ input: edited, sourceBundle });
    expect(fmv.performance).toMatchObject({
      adjustedProceedsUsd: '8.000000',
      adjustedMoic: { state: 'available', value: '4.000000000000' },
      input: {
        positionFmv: candidate.performanceCase.positionFmv,
        manualFmvOverride: edited.performanceCase!.manualFmvOverride,
      },
    });
    expect(fmv.performance!.baselineMoic).toEqual(override.performance!.baselineMoic);
    expect(fmv.performance!.effectiveFmv).toEqual({
      amountUsd: '99.000000',
      asOfDate: '2026-09-01',
      basis: 'manual',
    });
    expect(original.performance!.effectiveFmv).toEqual({
      amountUsd: '7.000000',
      asOfDate: '2026-08-01',
      basis: 'direct',
    });
    expect(fmv.construction).toEqual(original.construction);
    delete edited.performanceCase!.manualOwnershipOverrideRatio;
    delete edited.performanceCase!.manualFmvOverride;
    expect(calculateCapitalPlanningV1({ input: edited, sourceBundle })).toEqual(original);
    expect(original.performance).toMatchObject({
      adjustedProceedsUsd: '6.000000',
      adjustedMoic: { state: 'available', value: '3.000000000000' },
    });
  });
});
