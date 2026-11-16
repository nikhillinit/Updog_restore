import { describe, expect, it } from 'vitest';
import { calculateCapitalPlanningV2 } from '../../../shared/lib/capital-planning/capital-planning-v2';
import { CapitalPlanningInputV2Schema } from '../../../shared/contracts/capital-planning-v2.contract';
import { v2Bundle, v2Input, v2Round } from '../../fixtures/capital-planning/v2-fixtures';

function ownerFunding(gp = 400000, exempt: boolean | undefined = true, cashless = 0) {
  const input = v2Input();
  const sourceBundle = v2Bundle(input, 15320000, (raw, declarations) => {
    raw.fundedFromFeesPct = cashless;
    raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = gp;
    const fees = raw.economicsAssumptions!.feeModel!;
    if (exempt !== undefined) fees.gpCommitmentExempt = exempt;
    fees.tiers![0]!.rate = 0.02;
    raw.economicsAssumptions!.expenseModel!.annualExpenses = [
      { id: 'organization', category: 'Organization', amount: 100000, startYear: 1, endYear: 1 },
      { id: 'operating', category: 'Operating', amount: 75000, startYear: 1, endYear: 10 },
    ];
    for (let i = 0; i < 2; i++)
      declarations[`economicsAssumptions.expenseModel.annualExpenses[${i}].amount`] = 'usd';
  });
  return { input, sourceBundle };
}

describe('owner-model funding policy', () => {
  it('preserves the original 150-month expense reference without extending fees or fund term', () => {
    const input = v2Input();
    const bundle = (horizon?: number) =>
      v2Bundle(input, 20000000, (raw, declarations) => {
        raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 400000;
        raw.economicsAssumptions!.feeModel!.gpCommitmentExempt = true;
        raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.02;
        raw.economicsAssumptions!.expenseModel = {
          source: 'economics_override',
          ...(horizon === undefined ? {} : { horizonMonths: horizon }),
          annualExpenses: [
            { id: 'org', category: 'Organization', amount: 100000, startYear: 1, endYear: 1 },
            { id: 'op', category: 'Operating', amount: 75000, startYear: 1 },
          ],
        };
        for (let i = 0; i < 2; i++)
          declarations[`economicsAssumptions.expenseModel.annualExpenses[${i}].amount`] = 'usd';
      });
    const original = bundle(150);
    expect(original.fundLife.effectiveValue).toBe(10);
    expect(original.feeExpense.expenses[1]!.period).toMatchObject({
      normalizedEndMonth: 149,
      endDefaultReason: 'EXPLICIT_EXPENSE_HORIZON_END',
    });
    expect(
      calculateCapitalPlanningV2({ input, sourceBundle: original }).construction.budgetBridge
    ).toMatchObject({
      lifetimeFeesUsd: '3920000.000000',
      lifetimeExpensesUsd: '1037500.000000',
      availableConstructionCapitalUsd: '15042500.000000',
    });
    const legacy = bundle();
    expect(legacy.feeExpense.expenseHorizon).toBeUndefined();
    expect(legacy.feeExpense.expenses[1]!.period).toMatchObject({
      normalizedEndMonth: 119,
      endDefaultReason: 'FINITE_FUND_HORIZON_END',
    });
    expect(
      calculateCapitalPlanningV2({ input, sourceBundle: bundle(120) }).construction.budgetBridge
    ).toEqual(
      calculateCapitalPlanningV2({ input, sourceBundle: legacy }).construction.budgetBridge
    );
    for (const invalid of [0, -1, 1.5, 841]) expect(() => bundle(invalid)).toThrow();
  });

  it('excludes fixed GP capital from fees while retaining it as investment capital', () => {
    const args = ownerFunding();
    expect(args.sourceBundle.feeExpense.feeBasisUsd).toBe('14920000.000000');
    const bridge = calculateCapitalPlanningV2(args).construction.budgetBridge;
    expect(bridge).toMatchObject({
      committedCapitalUsd: '15320000.000000',
      gpCommitmentUsd: '400000.000000',
      gpDeemedContributionUsd: '0.000000',
      lifetimeFeesUsd: '2984000.000000',
      lifetimeExpensesUsd: '850000.000000',
      availableConstructionCapitalUsd: '11486000.000000',
      planningBudgetOrigin: 'derived_available_capital',
      feePopulation: 'committed_capital_excluding_gp',
    });
    expect(calculateCapitalPlanningV2(JSON.parse(JSON.stringify(args)))).toEqual(
      calculateCapitalPlanningV2(args)
    );
  });

  it('preserves full-fund fees when exemption is absent or false', () => {
    const args = ownerFunding(400000, false);
    const bridge = calculateCapitalPlanningV2(args).construction.budgetBridge;
    expect(bridge.lifetimeFeesUsd).toBe('3064000.000000');
    expect(bridge.availableConstructionCapitalUsd).toBe('11406000.000000');
    expect(bridge.feePopulation).toBe('full_fund_committed_capital');
    delete args.sourceBundle.feeExpense.gpExemption;
    expect(calculateCapitalPlanningV2(args).construction.budgetBridge).toEqual(bridge);
  });

  it('supports an explicit zero GP amount and keeps fee-funded contributions separate', () => {
    expect(
      calculateCapitalPlanningV2(ownerFunding(0)).construction.budgetBridge.lifetimeFeesUsd
    ).toBe('3064000.000000');
    const bridge = calculateCapitalPlanningV2(ownerFunding(400000, true, 0.25)).construction
      .budgetBridge;
    expect(bridge.lifetimeFeesUsd).toBe('2984000.000000');
    expect(bridge.gpDeemedContributionUsd).toBe('100000.000000');
    expect(bridge.availableConstructionCapitalUsd).toBe('11386000.000000');
  });

  it('rejects excessive GP capital and tampered pinned fee populations', () => {
    expect(() => ownerFunding(15320001)).toThrow();
    const args = ownerFunding();
    args.sourceBundle.feeExpense.feeBasisUsd = '15320000.000000';
    expect(() => calculateCapitalPlanningV2(args)).toThrow();
  });

  it('solves inverse capital with fixed exempt GP without repricing source commitments', () => {
    const args = ownerFunding();
    args.input.solve = { mode: 'fixed_portfolio', totalExpectedCompanyCount: '10.000000000000' };
    // $10M investment demand = 0.8 * commitments + $80k GP fee saving - $850k expenses.
    const result = calculateCapitalPlanningV2(args).construction;
    expect(result.solution.requiredCommittedCapitalUsd).toEqual({
      state: 'available',
      value: '13462500.000000',
    });
    expect(result.budgetBridge.committedCapitalUsd).toBe('15320000.000000');
  });
});

describe('explicit entry and pro-rata conventions', () => {
  function model() {
    const input = v2Input();
    const allocation = input.allocations[0]!;
    allocation.initialCheckUsd = '350000.000000';
    allocation.plannedCompanyCount = 1;
    allocation.entryFinancing = {
      valuationUsd: '8500000.000000',
      valuationBasis: 'post_money',
      primaryCapital: { basis: 'not_supplied' },
    };
    const round = v2Round();
    round.graduationRatio = '0.300000000000';
    round.incrementalPreMoneyPoolDilutionRatio = '0.100000000000';
    round.proRataOwnershipBasis = 'before_pool_dilution';
    round.financing = {
      valuationUsd: '15000000.000000',
      valuationBasis: 'post_money',
      primaryCapital: {
        basis: 'total_primary_including_fund_check',
        totalPrimaryAmountUsd: '3000000.000000',
        primary_only_excludes_secondary: true,
      },
    };
    allocation.followOnRounds = [round];
    return input;
  }

  it('derives entry ownership without supplying whole-round capital', () => {
    const input = model();
    expect(CapitalPlanningInputV2Schema.safeParse(input).success).toBe(true);
    const result = calculateCapitalPlanningV2({ input, sourceBundle: v2Bundle(input) });
    const allocation = result.construction.allocations[0]!;
    expect(allocation.entered?.totalDemandUsd).toBe('387058.823529');
    expect(
      allocation.rounds[0]!.paths.find((path) => path.outcome === 'participated')
    ).toMatchObject({ checkUsd: '123529.411765', ownershipRatio: '0.037882352941' });
  });

  it('keeps legacy post-pool sizing distinct from workbook pre-pool sizing', () => {
    const input = model();
    delete input.allocations[0]!.followOnRounds[0]!.proRataOwnershipBasis;
    const result = calculateCapitalPlanningV2({ input, sourceBundle: v2Bundle(input) });
    expect(result.construction.allocations[0]!.entered?.totalDemandUsd).toBe('383352.941176');
    expect(
      result.construction.allocations[0]!.rounds[0]!.paths.find(
        (path) => path.outcome === 'participated'
      )
    ).toMatchObject({ checkUsd: '111176.470588', ownershipRatio: '0.037058823529' });
    input.allocations[0]!.followOnRounds[0]!.proRataOwnershipBasis = 'after_pool_dilution';
    expect(
      calculateCapitalPlanningV2({ input, sourceBundle: v2Bundle(input) }).construction
    ).toEqual(result.construction);
  });

  it('rejects unknown follow-on financing and impossible entry ownership', () => {
    const input = model();
    input.allocations[0]!.entryFinancing.valuationUsd = '300000.000000';
    expect(CapitalPlanningInputV2Schema.safeParse(input).success).toBe(false);
    const unknownRound = model();
    const invalid = JSON.parse(JSON.stringify(unknownRound));
    invalid.allocations[0].followOnRounds[0].financing.primaryCapital = { basis: 'not_supplied' };
    expect(CapitalPlanningInputV2Schema.safeParse(invalid).success).toBe(false);
  });
});
