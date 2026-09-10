import {
  CAPITAL_PLANNING_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CAPITAL_PLANNING_DISCLOSURES,
  CapitalPlanningInputV1Schema,
  CapitalPlanningResultV1Schema,
  CapitalSourceBundleV1Schema,
  type CapitalPlanningInputV1,
  type CapitalPlanningResultV1,
  type CapitalAllocationInputV1,
  type CapitalFollowOnRoundV1,
  type CapitalSourceBundleV1,
  type CapitalConstructionResultV1,
  type CapitalCountViewV1,
  type CapitalMonthlyDetailV1,
  type CapitalStressResultV1,
  type CapitalVerdictAxesV1,
  type CapitalAssumptionProvenanceV1,
  type CapitalMoneySourceFactV1,
  type CapitalRateSourceFactV1,
} from '../../contracts/capital-planning-v1.contract';
import { Decimal } from '../decimal-config';
import { computeCapitalLifetimeFees } from './fee-tiers-to-fee-profile';
import { calculateAggregatePreferenceForecastV1 } from './aggregate-preference-forecast-v1';
import {
  CapitalPlanningCalculationError,
  assertCalculationSize,
  money,
  ratio,
  parseCalculation,
  refuseCalculation,
} from './calculation-support';

export { CapitalPlanningCalculationError } from './calculation-support';

type Basis = CapitalCountViewV1['countBasis'];
type AllocationResult = CapitalConstructionResultV1['allocations'][number];
type RoundResult = AllocationResult['rounds'][number];
type Reconciliation = CapitalConstructionResultV1['reconciliation'][number];
type AnnualRow = CapitalConstructionResultV1['annualSchedule'][number];
type OptionalMoney = AllocationResult['allocationBudgetUsd'];
const zero = () => new Decimal(0);
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sum = (values: Decimal[]) => values.reduce((total, value) => total.plus(value), zero());
const positive = (value: Decimal) => Decimal.max(0, value);
const available = (value: Decimal): OptionalMoney => ({ state: 'available', value: money(value) });
const noCapital = (): OptionalMoney => ({
  state: 'unavailable',
  value: null,
  reason: 'NO_CONSTRUCTION_CAPITAL',
});
const optional = (value: Decimal | null): OptionalMoney =>
  value === null ? noCapital() : available(value);
function sourceValue(fact: CapitalMoneySourceFactV1 | CapitalRateSourceFactV1): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(fact.rawValue);
  } catch {
    refuseCalculation('SOURCE_BUNDLE_INCONSISTENT', fact.path, 'Pinned source fact is not numeric');
  }
  const isRate = fact.unitClass === 'resolved_ratio';
  value = value
    .times(fact.sourceUnit === 'usd_millions' ? 1_000_000 : 1)
    .div(fact.sourceUnit === 'percent_points' ? 100 : 1);
  if (
    !value.isFinite() ||
    value.lt(0) ||
    (isRate && value.gt(1)) ||
    (!isRate && value.gte('100000000000000000')) ||
    (isRate ? ratio(value) : money(value)) !== fact.normalizedValue
  )
    refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      fact.path,
      'Pinned raw value, unit and normalized value disagree'
    );
  return value;
}

function funding(input: CapitalPlanningInputV1, source: CapitalSourceBundleV1) {
  const commitments = sourceValue(source.fundSize);
  const gp = source.gp.resolved;
  const commitment =
    gp.source === 'zero_fallback'
      ? zero()
      : gp.source === 'nested_percent'
        ? commitments.times(sourceValue(gp.fact))
        : sourceValue(gp.fact);
  const fraction =
    source.gp.fundedFromFeesPct.state === 'absent'
      ? zero()
      : sourceValue(source.gp.fundedFromFeesPct.fact);
  if (commitment.gt(commitments))
    refuseCalculation(
      'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
      'sourceBundle.gp',
      'GP commitment exceeds fund commitments'
    );
  const deemed = commitment.times(fraction);
  source.feeExpense.feeTiers.forEach((tier) => sourceValue(tier.rate));
  const fees = computeCapitalLifetimeFees(
    commitments,
    source.fundLife.effectiveValue,
    source.feeExpense.feeTiers
  );
  const expenses = sum(
    source.feeExpense.expenses.map((expense) => {
      const months = Math.max(
        0,
        Math.min(expense.period.normalizedEndMonth, source.fundLife.effectiveValue * 12 - 1) -
          expense.period.normalizedStartMonth +
          1
      );
      return sourceValue(expense.amount)
        .times(months)
        .div(expense.frequency === 'annual' ? 12 : 1);
    })
  );
  const capacity = commitments.minus(deemed).minus(fees).minus(expenses);
  if (
    money(commitment) !== gp.commitmentUsd ||
    money(deemed) !== source.gp.deemedContributionUsd ||
    money(fees) !== source.feeExpense.lifetimeFeesUsd ||
    money(expenses) !== source.feeExpense.lifetimeExpensesUsd ||
    money(commitments) !== source.feeExpense.feeBasisUsd
  )
    refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      'sourceBundle',
      'Pinned funding totals differ from their source facts'
    );
  const budget =
    input.netInvestableCapitalUsd === undefined
      ? capacity.isNegative()
        ? null
        : capacity
      : new Decimal(input.netInvestableCapitalUsd);
  const bridge: CapitalConstructionResultV1['budget'] = {
    committedCapitalUsd: money(commitments),
    gpCommitmentUsd: money(commitment),
    fundedFromFeesRatio: ratio(fraction),
    gpDeemedContributionUsd: money(deemed),
    lifetimeFeesUsd: money(fees),
    lifetimeExpensesUsd: money(expenses),
    availableConstructionCapitalUsd: money(capacity),
    signedRoundingResidualUsd: money(
      new Decimal(money(capacity))
        .minus(money(commitments))
        .plus(money(deemed))
        .plus(money(fees))
        .plus(money(expenses))
    ),
    planningBudgetUsd: optional(budget),
    planningBudgetOrigin:
      input.netInvestableCapitalUsd === undefined
        ? 'derived_available_capital'
        : 'explicit_override',
    overrideDifferenceUsd:
      budget === null
        ? noCapital()
        : available(input.netInvestableCapitalUsd === undefined ? zero() : budget.minus(capacity)),
    feePopulation: 'full_fund_committed_capital',
    fundingAssumption: 'callable_as_needed',
  };
  return { capacity, budget, bridge };
}

function financing(value: NonNullable<CapitalFollowOnRoundV1['financing']>) {
  const round = new Decimal(value.totalPrimaryRoundUsd);
  const pre = new Decimal(value.valuationUsd).minus(
    value.valuationBasis === 'post_money' ? round : 0
  );
  return { round, pre, post: pre.plus(round) };
}

function modelAllocation(
  input: CapitalAllocationInputV1,
  scaleChecksAndRounds = false,
  path = 'input.allocations'
) {
  const factor = new Decimal(scaleChecksAndRounds ? '1.25' : '1');
  const initial = new Decimal(input.initialCheckUsd).times(factor);
  if (input.entryFinancing && initial.gt(input.entryFinancing.totalPrimaryRoundUsd))
    refuseCalculation(
      'CHECK_EXCEEDS_ROUND_SIZE',
      `${path}.initialCheckUsd`,
      'Stressed initial check exceeds its financing round'
    );
  let ownership = input.entryFinancing ? initial.div(financing(input.entryFinancing).post) : null;
  let graduation = new Decimal(1);
  let lag = 0;
  const rounds = input.followOnRounds.map((round, index) => {
    graduation = graduation.times(round.graduationRatio);
    lag += round.monthsAfterPreviousRound;
    const financial = round.financing ? financing(round.financing) : null;
    if (scaleChecksAndRounds && financial && round.checkPolicy.type === 'pro_rata') {
      financial.round = financial.round.times(factor);
      financial.post = financial.pre.plus(financial.round);
    }
    const before = ownership;
    const after =
      before !== null && round.incrementalPreMoneyPoolDilutionRatio !== undefined
        ? before.times(new Decimal(1).minus(round.incrementalPreMoneyPoolDilutionRatio))
        : null;
    const check =
      round.checkPolicy.type === 'fixed_check'
        ? new Decimal(round.checkPolicy.checkUsd).times(factor)
        : after!.times(financial!.round).times(round.checkPolicy.proRataExerciseRatio);
    if (financial && check.gt(financial.round))
      refuseCalculation(
        'CHECK_EXCEEDS_ROUND_SIZE',
        `${path}.followOnRounds[${index}].checkPolicy.${round.checkPolicy.type === 'fixed_check' ? 'checkUsd' : 'proRataExerciseRatio'}`,
        'Stressed follow-on check exceeds its financing round'
      );
    const participation = new Decimal(round.participationRatio);
    let detail: RoundResult['ownership'];
    if (after !== null && financial !== null) {
      const skipped = after.times(financial.pre).div(financial.post);
      const participating = after.times(financial.pre).plus(check).div(financial.post);
      ownership = after.times(financial.pre).plus(participation.times(check)).div(financial.post);
      detail = {
        state: 'available',
        label: 'Conditional mean ownership',
        beforePoolRatio: ratio(before!),
        afterPoolRatio: ratio(after),
        participatingRatio: ratio(participating),
        skippedRatio: ratio(skipped),
        conditionalMeanRatio: ratio(ownership),
      };
    } else {
      ownership = null;
      detail = { state: 'unavailable', reason: 'OWNERSHIP_UNAVAILABLE', issues: [] };
    }
    return {
      input: round,
      graduation,
      participation,
      check,
      lag,
      ownership: detail,
      cost: graduation.times(participation).times(check),
    };
  });
  return {
    input,
    rounds,
    initial,
    cost: initial.plus(sum(rounds.map((round) => round.cost))),
  };
}
type AllocationModel = ReturnType<typeof modelAllocation>;
type BasisAmounts = { count: Decimal; initial: Decimal; followOn: Decimal; total: Decimal };
type BaseAllocation = {
  model: AllocationModel;
  budget: Decimal | null;
  reserve: Decimal | null;
  expected: BasisAmounts | null;
  entered: BasisAmounts | null;
};

function baseAllocation(model: AllocationModel, budget: Decimal | null): BaseAllocation {
  const assigned = budget?.times(model.input.budgetShareRatio) ?? null;
  const initial = assigned?.times(model.initial).div(model.cost) ?? null;
  // Algebraically total = B, even when B/E has a repeating decimal expansion.
  const expected =
    assigned === null
      ? null
      : {
          count: assigned.div(model.cost),
          initial: initial!,
          followOn: assigned.minus(initial!),
          total: assigned,
        };
  const count = model.input.plannedCompanyCount;
  const entered =
    count === undefined
      ? null
      : {
          count: new Decimal(count),
          initial: model.initial.times(count),
          followOn: model.cost.minus(model.initial).times(count),
          total: model.cost.times(count),
        };
  return { model, budget: assigned, reserve: expected?.followOn ?? null, expected, entered };
}

function changedAmounts(
  base: BaseAllocation,
  model: AllocationModel,
  basis: Basis
): BasisAmounts | null {
  const original = base[basis];
  if (original === null) return null;
  const initial = original.initial.plus(
    original.count.times(model.initial.minus(base.model.initial))
  );
  const total = original.total.plus(original.count.times(model.cost.minus(base.model.cost)));
  return { count: original.count, initial, total, followOn: total.minus(initial) };
}

function countView(
  amounts: BasisAmounts | null,
  base: BaseAllocation,
  basis: Basis
): AllocationResult['expected'] {
  if (amounts === null)
    return {
      state: 'unavailable',
      value: null,
      reason: basis === 'expected' ? 'NO_CONSTRUCTION_CAPITAL' : 'NOT_ENTERED',
    };
  return {
    countBasis: basis,
    label: basis === 'expected' ? 'Expected companies' : 'Entered company count',
    companyCount: ratio(amounts.count),
    initialDemandUsd: money(amounts.initial),
    followOnDemandUsd: money(amounts.followOn),
    totalDemandUsd: money(amounts.total),
    // With no nonnegative planning budget, the signed fund ceiling is reported separately.
    signedResidualUsd: base.budget === null ? noCapital() : money(base.budget.minus(amounts.total)),
    signedReserveResidualUsd: optional(base.reserve?.minus(amounts.followOn) ?? null),
    reserveRatio: amounts.total.isZero()
      ? { state: 'unavailable', value: null, reason: 'ZERO_ALLOCATED_INVESTMENT_CAPITAL' }
      : { state: 'available', value: ratio(amounts.followOn.div(amounts.total)) },
    reserveRatioDenominator: 'allocated_investment_capital',
  };
}

function roundResults(
  model: AllocationModel,
  amounts: BasisAmounts | null,
  basis: Basis
): RoundResult[] {
  if (amounts === null) return [];
  return model.rounds.map((round) => ({
    roundId: round.input.roundId,
    stageId: round.input.stageId,
    roundLabel: round.input.roundLabel,
    countBasis: basis,
    cumulativeGraduationRatio: ratio(round.graduation),
    eligibleCompanyCount: ratio(amounts.count.times(round.graduation)),
    participatingCompanyCount: ratio(
      round.check.isZero()
        ? zero()
        : amounts.count.times(round.graduation).times(round.participation)
    ),
    conditionalCheckUsd: money(round.check),
    demandUsd: money(amounts.count.times(round.cost)),
    cumulativeLagMonths: round.lag,
    ownership: round.ownership,
  }));
}

function monthlyRows(
  model: AllocationModel,
  amounts: BasisAmounts | null,
  basis: Basis,
  termMonths: number
): CapitalMonthlyDetailV1[] {
  if (amounts === null) return [];
  const months = model.input.deploymentPeriodYears * 12;
  const rows: CapitalMonthlyDetailV1[] = [];
  for (let entryMonth = 0; entryMonth < months; entryMonth++) {
    rows.push({
      allocationId: model.input.allocationId,
      entryMonth,
      demandMonth: entryMonth,
      roundId: null,
      kind: 'initial',
      countBasis: basis,
      companyCount: ratio(amounts.count.div(months)),
      demandUsd: money(amounts.initial.div(months)),
      beyondTerm: false,
    });
    for (const round of model.rounds) {
      const demandMonth = entryMonth + round.lag;
      rows.push({
        allocationId: model.input.allocationId,
        entryMonth,
        demandMonth,
        roundId: round.input.roundId,
        kind: 'follow_on',
        countBasis: basis,
        companyCount: ratio(
          round.check.isZero()
            ? zero()
            : amounts.count.times(round.graduation).times(round.participation).div(months)
        ),
        demandUsd: money(amounts.count.times(round.cost).div(months)),
        beyondTerm: demandMonth >= termMonths,
      });
    }
  }
  return rows;
}

function annualRows(rows: CapitalMonthlyDetailV1[], vintageYear: number): AnnualRow[] {
  const annual = new Map<string, AnnualRow>();
  for (const row of rows) {
    const year = Math.floor(row.demandMonth / 12) + 1;
    const key = `${row.countBasis}:${year}`;
    let result = annual.get(key);
    if (!result) {
      result = {
        fundYear: year,
        calendarYear: vintageYear + year - 1,
        countBasis: row.countBasis,
        initialDemandUsd: money(zero()),
        withinTermFollowOnUsd: money(zero()),
        beyondTermFollowOnUsd: money(zero()),
        totalDemandUsd: money(zero()),
      };
      annual.set(key, result);
    }
    const field =
      row.kind === 'initial'
        ? 'initialDemandUsd'
        : row.beyondTerm
          ? 'beyondTermFollowOnUsd'
          : 'withinTermFollowOnUsd';
    result[field] = money(new Decimal(result[field]).plus(row.demandUsd));
    result.totalDemandUsd = money(new Decimal(result.totalDemandUsd).plus(row.demandUsd));
  }
  return [...annual.values()].sort(
    (a, b) => compareIds(a.countBasis, b.countBasis) || a.fundYear - b.fundYear
  );
}

function reconcile(
  bases: BaseAllocation[],
  models: AllocationModel[],
  amounts: (BasisAmounts | null)[],
  rows: CapitalMonthlyDetailV1[],
  basis: Basis,
  capacity: Decimal,
  budget: Decimal | null
): { reconciliation: Reconciliation; verdicts: CapitalVerdictAxesV1 } {
  const total = sum(amounts.map((value) => value?.total ?? zero()));
  const exactInitial = sum(amounts.map((value) => value?.initial ?? zero()));
  const exactFollow = sum(amounts.map((value) => value?.followOn ?? zero()));
  const initial = sum(
    rows.filter((row) => row.kind === 'initial').map((row) => new Decimal(row.demandUsd))
  );
  const within = sum(
    rows
      .filter((row) => row.kind === 'follow_on' && !row.beyondTerm)
      .map((row) => new Decimal(row.demandUsd))
  );
  const beyond = sum(rows.filter((row) => row.beyondTerm).map((row) => new Decimal(row.demandUsd)));
  const unassigned =
    budget?.times(
      new Decimal(1).minus(sum(bases.map((base) => new Decimal(base.model.input.budgetShareRatio))))
    ) ?? null;
  const gaps = bases.map((base, index) => {
    const demand = amounts[index];
    if (!demand || base.budget === null || base.reserve === null)
      return { allocation: zero(), reserve: zero() };
    return {
      allocation: Decimal.max(
        0,
        demand.total.minus(base.budget),
        demand.initial.minus(base.expected!.initial)
      ),
      reserve: positive(demand.followOn.minus(base.reserve)),
    };
  });
  const allocationGap = sum(gaps.map((gap) => gap.allocation));
  const reserveGap = sum(gaps.map((gap) => gap.reserve));
  const overCapacity = total.gt(capacity);
  // Compare full-precision cohort accruals only on dimensions with a real lifetime gap.
  // Emitted monthly rounding must never invent a first budget shortfall.
  const accrued = bases.map(() => ({ initialMonths: 0, rounds: new Map<string, number>() }));
  let first: CapitalMonthlyDetailV1 | null = null;
  const sorted = [...rows].sort(
    (a, b) =>
      a.demandMonth - b.demandMonth ||
      compareIds(a.allocationId, b.allocationId) ||
      compareIds(a.roundId ?? '', b.roundId ?? '')
  );
  const byId = new Map(bases.map((base, index) => [base.model.input.allocationId, index]));
  for (const row of sorted) {
    const index = byId.get(row.allocationId)!;
    if (amounts[index]?.count.isZero()) continue;
    const state = accrued[index]!;
    if (row.kind === 'initial') state.initialMonths++;
    else state.rounds.set(row.roundId!, (state.rounds.get(row.roundId!) ?? 0) + 1);
    if (!overCapacity && allocationGap.isZero() && reserveGap.isZero()) continue;
    const cumulative = accrued.map((entry, ai) => {
      const demand = amounts[ai];
      if (!demand) return { initial: zero(), follow: zero() };
      const model = models[ai]!;
      const months = model.input.deploymentPeriodYears * 12;
      return {
        initial: demand.initial.times(entry.initialMonths).div(months),
        follow: sum(
          model.rounds.map((round) =>
            demand.count
              .times(round.cost)
              .times(entry.rounds.get(round.input.roundId) ?? 0)
              .div(months)
          )
        ),
      };
    });
    const current = cumulative[index]!;
    const base = bases[index]!;
    const gap = gaps[index]!;
    const allocationExceeded =
      gap.allocation.gt(0) &&
      base.budget !== null &&
      base.reserve !== null &&
      (current.initial.plus(current.follow).gt(base.budget) ||
        current.initial.gt(base.expected!.initial));
    const reserveExceeded =
      gap.reserve.gt(0) && base.reserve !== null && current.follow.gt(base.reserve);
    if (
      allocationExceeded ||
      reserveExceeded ||
      (overCapacity &&
        sum(cumulative.map((value) => value.initial.plus(value.follow))).gt(capacity))
    ) {
      first = row;
      break;
    }
  }
  const exactBeyond = sum(
    models.map((model, index) => {
      const demand = amounts[index];
      if (!demand) return zero();
      const months = model.input.deploymentPeriodYears * 12;
      return sum(
        model.rounds.map((round) => {
          const outside = rows.filter(
            (row) =>
              row.allocationId === model.input.allocationId &&
              row.roundId === round.input.roundId &&
              row.beyondTerm
          ).length;
          return demand.count.times(round.cost).times(outside).div(months);
        })
      );
    })
  );
  const allBeyond =
    exactFollow.gt(0) &&
    models.every(
      (model, index) =>
        !amounts[index] ||
        model.rounds.every(
          (round) =>
            round.cost.isZero() ||
            rows
              .filter(
                (row) =>
                  row.allocationId === model.input.allocationId &&
                  row.roundId === round.input.roundId
              )
              .every((row) => row.beyondTerm)
        )
    );
  return {
    reconciliation: {
      countBasis: basis,
      initialDemandUsd: money(exactInitial),
      lifetimeFollowOnUsd: money(exactFollow),
      withinTermFollowOnUsd: money(exactFollow.minus(exactBeyond)),
      beyondTermFollowOnUsd: money(exactBeyond),
      unassignedPlanningBudgetUsd: optional(unassigned),
      signedAllocationRoundingResidualUsd:
        budget === null
          ? money(zero())
          : money(
              new Decimal(money(budget))
                .minus(money(unassigned!))
                .minus(sum(bases.map((base) => new Decimal(money(base.budget!)))))
            ),
      signedRoundingResidualUsd: money(
        new Decimal(money(total)).minus(initial).minus(within).minus(beyond)
      ),
      signedDemandRoundingResidualUsd: money(
        new Decimal(money(total)).minus(money(exactInitial)).minus(money(exactFollow))
      ),
      signedTimingRoundingResidualUsd: money(
        new Decimal(money(exactFollow))
          .minus(money(exactFollow.minus(exactBeyond)))
          .minus(money(exactBeyond))
      ),
      signedBudgetResidualUsd:
        budget === null ? noCapital() : available(budget.minus(unassigned!).minus(total)),
      signedLifetimeHeadroomUsd: money(capacity.minus(total)),
      lifetimeBudgetShortfallUsd: money(positive(total.minus(capacity))),
      allocationGapUsd: budget === null ? noCapital() : available(allocationGap),
      reserveEarmarkGapUsd: budget === null ? noCapital() : available(reserveGap),
      firstBudgetGapMonth: first?.demandMonth ?? null,
      firstGapAllocationId: first?.allocationId ?? null,
      firstGapRoundId: first?.roundId ?? null,
    },
    verdicts: {
      inputSupport: 'complete',
      lifetimeCapacity: overCapacity ? 'over_capacity' : 'within_capacity',
      allocationBudget:
        budget === null
          ? 'unavailable'
          : allocationGap.gt(0)
            ? 'allocation_gap'
            : 'within_allocation',
      reserveEarmark:
        budget === null ? 'unavailable' : reserveGap.gt(0) ? 'earmark_gap' : 'within_earmark',
      timing: amounts.every((value) => value === null)
        ? 'unavailable'
        : exactBeyond.isZero()
          ? 'within_term'
          : allBeyond
            ? 'all_beyond_term'
            : 'includes_beyond_term',
      staleness: 'unknown_current_source',
    },
  };
}

const stressLabels = {
  graduation_plus_10pp: 'Graduation +10 percentage points',
  participation_full: 'Full participation',
  fixed_checks_and_pro_rata_rounds_plus_25pct: 'Fixed checks +25%; pro-rata round sizes +25%',
  follow_on_6_months_earlier: 'Follow-ons six months earlier',
} as const;
type StressName = keyof typeof stressLabels;

function stressInput(input: CapitalPlanningInputV1, name: StressName) {
  const changed = structuredClone(input);
  const paths: string[] = [];
  const change = (path: string, before: unknown, after: unknown) => {
    if (before !== after) paths.push(path);
  };
  changed.allocations.forEach((allocation, ai) => {
    const prefix = `allocations[${ai}]`;
    if (name === 'fixed_checks_and_pro_rata_rounds_plus_25pct') {
      const increased = money(new Decimal(allocation.initialCheckUsd).times('1.25'));
      paths.push(`${prefix}.initialCheckUsd`);
      allocation.initialCheckUsd = increased;
    }
    allocation.followOnRounds.forEach((round, ri) => {
      const path = `${prefix}.followOnRounds[${ri}]`;
      if (name === 'graduation_plus_10pp') {
        const value = ratio(Decimal.min(1, new Decimal(round.graduationRatio).plus('0.1')));
        change(`${path}.graduationRatio`, round.graduationRatio, value);
        round.graduationRatio = value;
      } else if (name === 'participation_full') {
        change(`${path}.participationRatio`, round.participationRatio, ratio(new Decimal(1)));
        round.participationRatio = ratio(new Decimal(1));
      } else if (name === 'follow_on_6_months_earlier') {
        const value = Math.max(0, round.monthsAfterPreviousRound - 6);
        change(`${path}.monthsAfterPreviousRound`, round.monthsAfterPreviousRound, value);
        round.monthsAfterPreviousRound = value;
      } else if (round.checkPolicy.type === 'fixed_check') {
        const value = money(new Decimal(round.checkPolicy.checkUsd).times('1.25'));
        paths.push(`${path}.checkPolicy.checkUsd`);
        round.checkPolicy.checkUsd = value;
      } else if (round.financing) {
        const original = financing(round.financing);
        const value = money(original.round.times('1.25'));
        paths.push(`${path}.financing.totalPrimaryRoundUsd`);
        round.financing.totalPrimaryRoundUsd = value;
        if (round.financing.valuationBasis === 'post_money') {
          const post = money(original.pre.plus(value));
          paths.push(`${path}.financing.valuationUsd`);
          round.financing.valuationUsd = post;
        }
      }
    });
  });
  return {
    input: parseCalculation(CapitalPlanningInputV1Schema, changed, 'input'),
    changedPaths: paths,
  };
}

function stressResults(
  input: CapitalPlanningInputV1,
  bases: BaseAllocation[],
  source: CapitalSourceBundleV1,
  capacity: Decimal,
  budget: Decimal | null,
  basesToShow: Basis[]
): CapitalStressResultV1[] {
  const results: CapitalStressResultV1[] = [];
  for (const name of Object.keys(stressLabels) as StressName[]) {
    try {
      const changed = stressInput(input, name);
      // Revalidate the generated boundary, but do not calculate from its money6 display.
      const scaled = name === 'fixed_checks_and_pro_rata_rounds_plus_25pct';
      const models = (scaled ? input : changed.input).allocations.map((allocation, index) =>
        modelAllocation(allocation, scaled, `input.allocations[${index}]`)
      );
      for (const basis of basesToShow) {
        const amounts = bases.map((base, index) => changedAmounts(base, models[index]!, basis));
        const rows = models.flatMap((model, index) =>
          monthlyRows(model, amounts[index]!, basis, source.fundLife.effectiveValue * 12)
        );
        const reconciled = reconcile(bases, models, amounts, rows, basis, capacity, budget);
        const delta = sum(
          amounts.map((amount, index) =>
            (amount?.followOn ?? zero()).minus(bases[index]![basis]?.followOn ?? zero())
          )
        );
        results.push({
          state: 'complete',
          name,
          label: stressLabels[name],
          countBasis: basis,
          changedPaths: changed.changedPaths,
          ...reconciled,
          plannedReserveGapUsd: money(positive(delta)),
          annualSchedule: annualRows(rows, source.vintageYear),
        });
      }
    } catch (error) {
      if (!(error instanceof CapitalPlanningCalculationError)) throw error;
      for (const basis of basesToShow)
        results.push({
          state: 'invalid',
          name,
          label: stressLabels[name],
          countBasis: basis,
          issues: [error.issues[0]!, ...error.issues.slice(1)],
        });
    }
  }
  return results;
}

function provenance(
  input: CapitalPlanningInputV1,
  bundle: CapitalSourceBundleV1
): CapitalAssumptionProvenanceV1[] {
  const result: CapitalAssumptionProvenanceV1[] = [];
  type Value = CapitalAssumptionProvenanceV1['effectiveValue'];
  const add = (
    inputPath: string,
    value: Value,
    sourcePath: string | null = null,
    sourceValue: Value | null = null,
    profileId: string | null = null,
    stageId: string | null = null,
    note: string | null = null
  ) => {
    result.push({
      inputPath,
      effectiveValue: value,
      sourcePath,
      sourceValue,
      origin:
        sourceValue === null
          ? 'user_entered'
          : sourceValue === value
            ? 'source_derived'
            : 'user_override',
      profileId,
      stageId,
      effectiveDate: bundle.modelInputsAsOfDate,
      sourceVintage: String(bundle.vintageYear),
      note,
      benchmark: null,
    });
  };
  if (input.netInvestableCapitalUsd !== undefined)
    add(
      'netInvestableCapitalUsd',
      input.netInvestableCapitalUsd,
      null,
      null,
      null,
      null,
      'Explicit planning budget; does not change available construction capital.'
    );
  input.allocations.forEach((allocation, ai) => {
    const path = `allocations[${ai}]`;
    const source = bundle.construction.capitalPlanAllocations.find(
      (item) => item.id === allocation.allocationId
    );
    if (!source)
      refuseCalculation(
        'ALLOCATION_LINK_UNRESOLVED',
        `${path}.allocationId`,
        'Allocation is absent from the pinned source bundle',
        'incomplete'
      );
    const profile = bundle.construction.pipelineProfiles.find(
      (item) => item.id === allocation.pipelineProfileId
    );
    if (!profile)
      refuseCalculation(
        'PROFILE_LINK_UNRESOLVED',
        `${path}.pipelineProfileId`,
        'Profile is absent from the pinned source bundle',
        'incomplete'
      );
    const entry = profile.stages.find((stage) => stage.id === allocation.entryStageId);
    if (!entry)
      refuseCalculation(
        'STAGE_LINK_UNRESOLVED',
        `${path}.entryStageId`,
        'Entry stage is absent from the selected profile',
        'incomplete'
      );
    const link = bundle.construction.links.find(
      (item) =>
        item.allocationId === allocation.allocationId &&
        item.pipelineProfileId === profile.id &&
        item.entryStageId === entry.id
    );
    if (!link)
      refuseCalculation(
        'SOURCE_BUNDLE_INCONSISTENT',
        path,
        'Scenario links differ from the pinned source bundle'
      );
    const sourcePath = source.capitalAllocationPct.path.replace(/\.capitalAllocationPct$/, '');
    const mapped = (
      suffix: string,
      value: Value,
      fact: CapitalMoneySourceFactV1 | CapitalRateSourceFactV1 | null,
      stageId: string | null = null
    ) =>
      add(
        `${path}.${suffix}`,
        value,
        fact?.path ?? null,
        fact?.normalizedValue ?? null,
        profile.id,
        stageId
      );
    add(`${path}.allocationId`, allocation.allocationId, `${sourcePath}.id`, source.id, profile.id);
    add(
      `${path}.pipelineProfileId`,
      profile.id,
      null,
      null,
      profile.id,
      null,
      'Explicit scenario link.'
    );
    add(
      `${path}.entryStageId`,
      entry.id,
      null,
      null,
      profile.id,
      entry.id,
      'Explicit scenario link.'
    );
    add(`${path}.name`, allocation.name, `${sourcePath}.name`, source.name, profile.id);
    add(
      `${path}.entryRound`,
      allocation.entryRound,
      `${sourcePath}.entryRound`,
      source.entryRound,
      profile.id,
      entry.id
    );
    mapped('budgetShareRatio', allocation.budgetShareRatio, source.capitalAllocationPct);
    mapped(
      'initialCheckUsd',
      allocation.initialCheckUsd,
      source.initialCheckStrategy === 'amount' ? source.initialCheckAmount : null,
      entry.id
    );
    add(
      `${path}.deploymentPeriodYears`,
      allocation.deploymentPeriodYears,
      `${sourcePath}.investmentHorizonMonths`,
      source.investmentHorizonMonths % 12 === 0 ? source.investmentHorizonMonths / 12 : null,
      profile.id
    );
    if (allocation.plannedCompanyCount !== undefined)
      add(`${path}.plannedCompanyCount`, allocation.plannedCompanyCount, null, null, profile.id);
    const addFinancing = (
      prefix: string,
      value: NonNullable<CapitalFollowOnRoundV1['financing']>,
      stage: typeof entry
    ) => {
      mapped(`${prefix}.valuationUsd`, value.valuationUsd, stage.valuation, stage.id);
      mapped(
        `${prefix}.totalPrimaryRoundUsd`,
        value.totalPrimaryRoundUsd,
        stage.roundSize,
        stage.id
      );
      add(
        `${path}.${prefix}.valuationBasis`,
        value.valuationBasis,
        stage.graduationRate.path.replace(/graduationRate$/, 'valuationType'),
        stage.valuationType === 'pre' ? 'pre_money' : 'post_money',
        profile.id,
        stage.id
      );
    };
    if (allocation.entryFinancing) addFinancing('entryFinancing', allocation.entryFinancing, entry);
    let previous = entry;
    allocation.followOnRounds.forEach((round, ri) => {
      const prefix = `followOnRounds[${ri}]`;
      const stage = profile.stages.find((item) => item.id === round.stageId);
      if (!stage)
        refuseCalculation(
          'STAGE_LINK_UNRESOLVED',
          `${path}.${prefix}.stageId`,
          'Round stage is absent from the selected profile',
          'incomplete'
        );
      add(`${path}.${prefix}.roundId`, round.roundId, null, null, profile.id, stage.id);
      add(
        `${path}.${prefix}.stageId`,
        stage.id,
        null,
        null,
        profile.id,
        stage.id,
        'Explicit scenario link.'
      );
      add(
        `${path}.${prefix}.roundLabel`,
        round.roundLabel,
        stage.graduationRate.path.replace(/graduationRate$/, 'name'),
        stage.name,
        profile.id,
        stage.id
      );
      mapped(
        `${prefix}.graduationRatio`,
        round.graduationRatio,
        previous.graduationRate,
        previous.id
      );
      mapped(
        `${prefix}.participationRatio`,
        round.participationRatio,
        source.followOnParticipationPct,
        stage.id
      );
      const originKnown = previous.timeOrigin === 'previous_round';
      add(
        `${path}.${prefix}.monthsAfterPreviousRound`,
        round.monthsAfterPreviousRound,
        originKnown
          ? previous.graduationRate.path.replace(/graduationRate$/, 'monthsToGraduate')
          : null,
        originKnown ? previous.monthsToGraduate : null,
        profile.id,
        previous.id,
        originKnown
          ? null
          : 'Source time origin is unresolved; interval is an explicit previous-round assumption.'
      );
      add(
        `${path}.${prefix}.timeOrigin`,
        round.timeOrigin,
        null,
        null,
        profile.id,
        previous.id,
        'Explicit previous-round time origin.'
      );
      add(
        `${path}.${prefix}.checkPolicy.type`,
        round.checkPolicy.type,
        `${sourcePath}.followOnStrategy`,
        source.followOnStrategy === 'amount' ? 'fixed_check' : 'pro_rata',
        profile.id,
        stage.id
      );
      if (round.checkPolicy.type === 'fixed_check')
        mapped(
          `${prefix}.checkPolicy.checkUsd`,
          round.checkPolicy.checkUsd,
          source.followOnStrategy === 'amount' ? source.followOnAmount : null,
          stage.id
        );
      else
        add(
          `${path}.${prefix}.checkPolicy.proRataExerciseRatio`,
          round.checkPolicy.proRataExerciseRatio,
          null,
          null,
          profile.id,
          stage.id
        );
      if (round.financing) addFinancing(`${prefix}.financing`, round.financing, stage);
      if (round.incrementalPreMoneyPoolDilutionRatio !== undefined) {
        const fact = stage.poolSemantics === 'incremental_pre_money' ? stage.esopPct : null;
        add(
          `${path}.${prefix}.incrementalPreMoneyPoolDilutionRatio`,
          round.incrementalPreMoneyPoolDilutionRatio,
          fact?.path ?? null,
          fact?.normalizedValue ?? null,
          profile.id,
          stage.id,
          fact
            ? null
            : 'Explicit incremental pre-money pool dilution; not inferred from total ESOP.'
        );
      }
      previous = stage;
    });
  });
  if (input.performanceCase) {
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        add(
          path,
          value,
          null,
          null,
          null,
          null,
          path === 'performanceCase.manualOwnershipOverrideRatio'
            ? (input.performanceCase?.ownershipOverrideExplanation ?? null)
            : path === 'performanceCase.manualFmvOverride.amountUsd'
              ? (input.performanceCase?.manualFmvOverride?.explanation ?? null)
              : null
        );
      else if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value))
          if (key !== 'explanation' && key !== 'ownershipOverrideExplanation')
            walk(child, `${path}.${key}`);
    };
    walk(input.performanceCase, 'performanceCase');
  }
  return result;
}

/** Deterministic preview/snapshot calculation from explicit input and pinned facts. */
export function calculateCapitalPlanningV1(args: {
  input: CapitalPlanningInputV1;
  sourceBundle: CapitalSourceBundleV1;
}): CapitalPlanningResultV1 {
  assertCalculationSize(args, limits.maxSnapshotBytes, 'calculation');
  assertCalculationSize(args?.input, limits.maxInputBytes, 'input');
  const input = parseCalculation(CapitalPlanningInputV1Schema, args.input, 'input');
  const source = parseCalculation(CapitalSourceBundleV1Schema, args.sourceBundle, 'sourceBundle');
  if (source.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION)
    refuseCalculation(
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'sourceBundle.interpretationVersion',
      'Pinned interpretation version is unsupported',
      'unsupported'
    );
  const basesToShow: Basis[] = input.allocations.some(
    (allocation) => allocation.plannedCompanyCount !== undefined
  )
    ? ['expected', 'entered']
    : ['expected'];
  let expanded = 0;
  input.allocations.forEach((allocation, index) => {
    if (allocation.deploymentPeriodYears > source.investmentPeriod.effectiveValue)
      refuseCalculation(
        'INVALID_INPUT',
        `input.allocations[${index}].deploymentPeriodYears`,
        'Deployment period exceeds the investment period'
      );
    expanded +=
      allocation.deploymentPeriodYears *
      12 *
      (1 + allocation.followOnRounds.length) *
      (allocation.plannedCompanyCount === undefined ? 1 : 2);
  });
  if (expanded > limits.maxExpandedRows)
    throw new CapitalPlanningCalculationError([
      {
        code: 'INPUT_TOO_LARGE',
        path: 'input.allocations',
        message: 'Expanded schedule exceeds provisional row bound',
        support: 'invalid',
        limit: limits.maxExpandedRows,
        observed: expanded,
      },
    ]);
  const assumptions = provenance(input, source);
  const { capacity, budget, bridge } = funding(input, source);
  const models = input.allocations.map((allocation, index) =>
    modelAllocation(allocation, false, `input.allocations[${index}]`)
  );
  const bases = models.map((model) => baseAllocation(model, budget));
  // Refuse numeric output bounds before expanding monthly cohorts.
  for (const base of bases) {
    money(base.model.cost);
    for (const basis of basesToShow) {
      const amounts = base[basis];
      if (amounts) {
        ratio(amounts.count);
        money(amounts.total);
      }
    }
  }
  const monthlyDetail = basesToShow.flatMap((basis) =>
    bases.flatMap((base) =>
      monthlyRows(base.model, base[basis], basis, source.fundLife.effectiveValue * 12)
    )
  );
  const reconciled = basesToShow.map((basis) =>
    reconcile(
      bases,
      models,
      bases.map((base) => base[basis]),
      monthlyDetail.filter((row) => row.countBasis === basis),
      basis,
      capacity,
      budget
    )
  );
  const verdicts: CapitalConstructionResultV1['verdicts'] = {
    ...reconciled[0]!.verdicts,
    inputSupport: 'complete',
  };
  for (const value of reconciled) {
    if (value.verdicts.lifetimeCapacity === 'over_capacity')
      verdicts.lifetimeCapacity = 'over_capacity';
    if (value.verdicts.allocationBudget === 'allocation_gap')
      verdicts.allocationBudget = 'allocation_gap';
    if (value.verdicts.reserveEarmark === 'earmark_gap') verdicts.reserveEarmark = 'earmark_gap';
    if (value.verdicts.timing !== 'unavailable' && value.verdicts.timing !== 'within_term')
      verdicts.timing = value.verdicts.timing;
  }
  const qualifications: CapitalConstructionResultV1['qualifications'] = [];
  if (capacity.isZero()) qualifications.push('ZERO_CONSTRUCTION_CAPITAL');
  if (capacity.isNegative()) qualifications.push('NO_CONSTRUCTION_CAPITAL');
  if (bases.some((base) => base.expected && !base.expected.count.isInteger()))
    qualifications.push('EXPECTED_COUNTS_ARE_FRACTIONAL');
  const beyond =
    verdicts.timing === 'includes_beyond_term' || verdicts.timing === 'all_beyond_term';
  if (beyond) qualifications.push('INCLUDES_BEYOND_TERM');
  const infeasible =
    verdicts.lifetimeCapacity === 'over_capacity' ||
    verdicts.allocationBudget === 'allocation_gap' ||
    verdicts.reserveEarmark === 'earmark_gap';
  if (infeasible) qualifications.push('INFEASIBLE_UNDER_MODELED_ASSUMPTIONS');
  const headline = [
    infeasible ? 'Infeasible under modeled assumptions.' : 'Within lifetime capacity.',
    ...(beyond
      ? reconciled
          .filter(
            (value) =>
              value.verdicts.timing === 'includes_beyond_term' ||
              value.verdicts.timing === 'all_beyond_term'
          )
          .map(
            (value) =>
              `${value.reconciliation.countBasis === 'expected' ? 'Expected companies' : 'Entered company count'}: includes $${value.reconciliation.beyondTermFollowOnUsd} beyond fund term.`
          )
      : []),
    ...(capacity.isZero()
      ? ['Zero construction capital.']
      : capacity.isNegative()
        ? ['No construction capital; the signed funding deficit is retained.']
        : []),
  ].join(' ');
  const result: CapitalPlanningResultV1 = {
    contractVersion: CAPITAL_PLANNING_VERSION,
    input,
    sourceBundle: source,
    provenance: assumptions,
    construction: {
      methodVersion: CAPITAL_PLANNING_VERSION,
      budget: bridge,
      allocations: bases.map((base) => ({
        allocationId: base.model.input.allocationId,
        name: base.model.input.name,
        allocationBudgetUsd: optional(base.budget),
        expectedPerCompanyCostUsd: money(base.model.cost),
        expected: countView(base.expected, base, 'expected'),
        entered: countView(base.entered, base, 'entered'),
        designatedFollowOnReserveUsd: optional(base.reserve),
        rounds: basesToShow.flatMap((basis) => roundResults(base.model, base[basis], basis)),
      })),
      verdicts,
      headline,
      qualifications,
      reconciliation: reconciled.map((value) => value.reconciliation),
      monthlyDetail,
      annualSchedule: annualRows(monthlyDetail, source.vintageYear),
      stresses: stressResults(input, bases, source, capacity, budget, basesToShow),
      disclosures: {
        timing: CAPITAL_PLANNING_DISCLOSURES.timing,
        budget: CAPITAL_PLANNING_DISCLOSURES.budget,
        gp: CAPITAL_PLANNING_DISCLOSURES.gp,
      },
      assumptions: {
        homogeneousAllocation: true,
        graduationAndParticipationIndependentOfOwnershipHistory: true,
        affineCheckAndOwnershipUpdates: true,
      },
    },
    performance: input.performanceCase
      ? calculateAggregatePreferenceForecastV1(input.performanceCase, {
          vintageYear: source.vintageYear,
          fundLifeYears: source.fundLife.effectiveValue,
        })
      : null,
  };
  assertCalculationSize(result, limits.maxSnapshotBytes, 'result');
  return parseCalculation(CapitalPlanningResultV1Schema, result, 'result');
}
