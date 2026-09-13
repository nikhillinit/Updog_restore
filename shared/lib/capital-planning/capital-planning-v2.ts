import { Decimal } from '../decimal-config';
import { capitalAssumptionProvenance } from './source-materialization-core';
import {
  CAPITAL_PLANNING_V2_VERSION,
  CAPITAL_PLANNING_V2_ROUNDING_POLICY,
  CapitalPlanningInputV2Schema,
  CapitalPlanningResultV2Schema,
  type CapitalPlanningInputV2,
  type CapitalPlanningResultV2,
  type CapitalAllocationInputV2,
  type CapitalFollowOnRoundV2,
  type CapitalFinancingV2,
  type CapitalConstructionResultV2,
} from '../../contracts/capital-planning-v2.contract';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CAPITAL_PLANNING_DISCLOSURES,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CapitalSourceBundleV1Schema,
  type CapitalSourceBundleV1,
  type CapitalMoneySourceFactV1,
  type CapitalRateSourceFactV1,
  type CapitalMonthlyDetailV1,
  type CapitalStressResultV1,
} from '../../contracts/capital-planning-v1.contract';
import {
  assertCalculationSize,
  parseCalculation,
  refuseCalculation,
  CapitalPlanningCalculationError,
} from './calculation-support';

// Calculation-local precision: historical engines retain their own rounding policies.
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const d = (v: Decimal.Value) => new D(v);
const sum = (values: Decimal[]) => values.reduce((a, b) => a.plus(b), d(0));
const q = (v: Decimal, n: number) =>
  v.toDecimalPlaces(n, D.ROUND_HALF_UP).isZero() ? d(0).toFixed(n) : v.toFixed(n, D.ROUND_HALF_UP);
const money = (v: Decimal) => q(v, 6);
const ratio = (v: Decimal) => q(v, 12);
const available = (v: Decimal) => ({ state: 'available' as const, value: money(v) });
const unavailable = () => ({
  state: 'unavailable' as const,
  value: null,
  reason: 'NO_CONSTRUCTION_CAPITAL' as const,
});
const positive = (v: Decimal) => D.max(0, v);

function sourceValue(fact: CapitalMoneySourceFactV1 | CapitalRateSourceFactV1) {
  let v: Decimal;
  try {
    v = d(fact.rawValue)
      .times(fact.sourceUnit === 'usd_millions' ? 1000000 : 1)
      .div(fact.sourceUnit === 'percent_points' ? 100 : 1);
  } catch {
    return refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      fact.path,
      'Pinned source fact is not numeric'
    );
  }
  const isRate = fact.unitClass === 'resolved_ratio';
  if (
    !v.isFinite() ||
    v.lt(0) ||
    (isRate && v.gt(1)) ||
    (!isRate && v.gte('100000000000000000')) ||
    (isRate ? ratio(v) : money(v)) !== fact.normalizedValue
  )
    refuseCalculation(
      'SOURCE_BUNDLE_INCONSISTENT',
      fact.path,
      'Pinned raw value, unit and normalized value disagree'
    );
  return v;
}
function funding(input: CapitalPlanningInputV2, source: CapitalSourceBundleV1) {
  const commitments = sourceValue(source.fundSize),
    gp = source.gp.resolved;
  const gpValue = gp.source === 'zero_fallback' ? d(0) : sourceValue(gp.fact);
  const gpPct = gp.source === 'nested_percent' ? gpValue : d(0);
  const gpFixed = gp.source === 'nested_percent' ? d(0) : gpValue;
  const commitment = commitments.times(gpPct).plus(gpFixed);
  if (commitment.gt(commitments))
    refuseCalculation(
      'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
      'sourceBundle.gp',
      'GP commitment exceeds fund commitments'
    );
  const fraction =
    source.gp.fundedFromFeesPct.state === 'absent'
      ? d(0)
      : sourceValue(source.gp.fundedFromFeesPct.fact);
  const coefficient = sum(
    source.feeExpense.feeTiers.map((t) => {
      if (t.basis !== 'committed_capital')
        refuseCalculation(
          'POLICY_UNSUPPORTED',
          'sourceBundle.feeExpense.feeTiers',
          'Only affine committed-capital fees are supported',
          'unsupported'
        );
      const months = Math.max(
        0,
        Math.min(t.period.normalizedEndMonth, source.fundLife.effectiveValue * 12 - 1) -
          t.period.normalizedStartMonth +
          1
      );
      return sourceValue(t.rate).times(months).div(12);
    })
  );
  const expenses = sum(
    source.feeExpense.expenses.map((e) =>
      sourceValue(e.amount)
        .times(
          Math.max(
            0,
            Math.min(e.period.normalizedEndMonth, source.fundLife.effectiveValue * 12 - 1) -
              e.period.normalizedStartMonth +
              1
          )
        )
        .div(e.frequency === 'annual' ? 12 : 1)
    )
  );
  const deemed = commitment.times(fraction),
    fees = commitments.times(coefficient),
    capacity = commitments.minus(deemed).minus(fees).minus(expenses);
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
      ? positive(capacity)
      : d(input.netInvestableCapitalUsd);
  const bridge: CapitalConstructionResultV2['budgetBridge'] = {
    committedCapitalUsd: money(commitments),
    gpCommitmentUsd: money(commitment),
    fundedFromFeesRatio: ratio(fraction),
    gpDeemedContributionUsd: money(deemed),
    lifetimeFeesUsd: money(fees),
    lifetimeExpensesUsd: money(expenses),
    availableConstructionCapitalUsd: money(capacity),
    signedRoundingResidualUsd: money(
      d(money(capacity))
        .minus(money(commitments))
        .plus(money(deemed))
        .plus(money(fees))
        .plus(money(expenses))
    ),
    planningBudgetUsd:
      capacity.lt(0) && input.netInvestableCapitalUsd === undefined
        ? unavailable()
        : available(budget),
    planningBudgetOrigin:
      input.netInvestableCapitalUsd === undefined
        ? 'derived_available_capital'
        : 'explicit_override',
    overrideDifferenceUsd:
      input.netInvestableCapitalUsd === undefined
        ? available(d(0))
        : available(budget.minus(capacity)),
    feePopulation: 'full_fund_committed_capital',
    fundingAssumption: 'callable_as_needed',
  };
  return {
    capacity,
    budget,
    bridge,
    a: d(1).minus(coefficient).minus(gpPct.times(fraction)),
    b: expenses.plus(gpFixed.times(fraction)),
    gpFixed,
  };
}
function financing(f: CapitalFinancingV2, check: Decimal) {
  const p = f.primaryCapital;
  const total =
    p.basis === 'total_primary_including_fund_check'
      ? d(p.totalPrimaryAmountUsd)
      : d(p.externalPrimaryAmountUsd).plus(check);
  if (check.gt(total))
    refuseCalculation(
      'CHECK_EXCEEDS_ROUND_SIZE',
      'financing',
      'Fund check exceeds total primary capital'
    );
  const pre = f.valuationBasis === 'pre_money' ? d(f.valuationUsd) : d(f.valuationUsd).minus(total);
  if (pre.lte(0))
    refuseCalculation(
      'OWNERSHIP_INPUT_UNRESOLVED',
      'financing',
      'Positive pre-money valuation required',
      'incomplete'
    );
  return { pre, total, post: pre.plus(total) };
}
type Path = {
  history: string;
  parent: string;
  round: number;
  state: 'live' | 'stopped';
  outcome: 'participated' | 'eligible_zero_election' | 'ineligible' | 'non_graduation';
  mass: Decimal;
  ownership: Decimal;
  check: Decimal;
  demand: Decimal;
};
type Round = {
  input: CapitalFollowOnRoundV2;
  lag: number;
  eligible: Decimal;
  participating: Decimal;
  demand: Decimal;
  paths: Path[];
  current: Path[];
  splits: { history: string; mass: Decimal; children: Decimal[] }[];
};
function historyModel(a: CapitalAllocationInputV2) {
  const entry = financing(a.entryFinancing, d(a.initialCheckUsd));
  let live: Path[] = [
    {
      history: '',
      parent: '',
      round: 0,
      state: 'live',
      outcome: 'participated',
      mass: d(1),
      ownership: d(a.initialCheckUsd).div(entry.post),
      check: d(0),
      demand: d(0),
    },
  ];
  const stopped: Path[] = [];
  let lag = 0;
  const rounds: Round[] = [];
  a.followOnRounds.forEach((r, index) => {
    const eligibleHistories = live
      .filter(
        (p) =>
          r.eligibility.type === 'all' ||
          r.eligibility.eligibleParticipationHistories.includes(p.history)
      )
      .map((p) => p.history);
    if (
      r.eligibility.type === 'by_history' &&
      r.eligibility.eligibleParticipationHistories.some((h) => !live.some((p) => p.history === h))
    )
      refuseCalculation(
        'INVALID_INPUT',
        `allocations.${a.allocationId}.followOnRounds[${index}].eligibility`,
        'Eligibility contains unreachable history'
      );
    if (r.participationPolicy.type === 'conditional_probability_by_history') {
      const keys = Object.keys(r.participationPolicy.probabilitiesByReachableHistory);
      if (
        keys.length !== eligibleHistories.length ||
        keys.some((k) => !eligibleHistories.includes(k))
      )
        refuseCalculation(
          'INVALID_INPUT',
          `allocations.${a.allocationId}.followOnRounds[${index}].participationPolicy`,
          'History policy must contain exactly every reachable eligible history'
        );
    }
    const next: Path[] = [],
      current: Path[] = [],
      splits: Round['splits'] = [];
    let eligible = d(0),
      participating = d(0);
    for (const p of live) {
      const isEligible = eligibleHistories.includes(p.history),
        graduated = p.mass.times(r.graduationRatio),
        nonGraduated = p.mass.minus(graduated);
      const policy = r.participationPolicy;
      const probability =
        !isEligible || policy.type === 'none'
          ? d(0)
          : policy.type === 'all_eligible'
            ? d(1)
            : policy.type === 'homogeneous_conditional_probability'
              ? d(policy.probability)
              : d(policy.probabilitiesByReachableHistory[p.history]!);
      const elected = graduated.times(probability),
        skipped = graduated.minus(elected);
      eligible = eligible.plus(isEligible ? graduated : 0);
      participating = participating.plus(elected);
      const poolOwnership = p.ownership.times(d(1).minus(r.incrementalPreMoneyPoolDilutionRatio));
      let check = d(0);
      if (elected.gt(0)) {
        if (r.checkPolicy.type === 'fixed_check') check = d(r.checkPolicy.checkUsd);
        else {
          const primary = r.financing.primaryCapital;
          if (primary.basis === 'external_primary_excluding_fund_check' && poolOwnership.gte(1))
            refuseCalculation(
              'OWNERSHIP_INPUT_UNRESOLVED',
              'financing',
              'External pro-rata requires ownership below one',
              'incomplete'
            );
          check = (
            primary.basis === 'total_primary_including_fund_check'
              ? poolOwnership.times(primary.totalPrimaryAmountUsd)
              : poolOwnership.times(primary.externalPrimaryAmountUsd).div(d(1).minus(poolOwnership))
          ).times(r.checkPolicy.proRataExerciseRatio);
        }
      }
      const children: Decimal[] = [];
      if (nonGraduated.gt(0)) {
        const child: Path = {
          ...p,
          parent: p.history,
          round: index + 1,
          state: 'stopped',
          outcome: 'non_graduation',
          mass: nonGraduated,
          check: d(0),
          demand: d(0),
        };
        stopped.push(child);
        current.push(child);
        children.push(nonGraduated);
      }
      for (const [bit, mass, x] of [
        ['1', elected, check],
        ['0', skipped, d(0)],
      ] as const) {
        if (mass.isZero()) continue;
        const f = financing(r.financing, x);
        const child: Path = {
          history: p.history + bit,
          parent: p.history,
          round: index + 1,
          state: 'live',
          outcome:
            bit === '1' ? 'participated' : isEligible ? 'eligible_zero_election' : 'ineligible',
          mass,
          ownership: poolOwnership.times(f.pre).plus(x).div(f.post),
          check: x,
          demand: mass.times(x),
        };
        next.push(child);
        current.push(child);
        children.push(mass);
      }
      splits.push({ history: p.history, mass: p.mass, children });
    }
    live = next;
    lag += r.lagMonthsFromPreviousRound;
    if (live.length > 64 || stopped.length > 63 || live.length + stopped.length > 127)
      refuseCalculation(
        'INPUT_TOO_LARGE',
        'allocations.followOnRounds',
        'Six-round retained history bound exceeded'
      );
    rounds.push({
      input: r,
      lag,
      eligible,
      participating,
      demand: sum(current.map((p) => p.demand)),
      paths: [...stopped, ...live],
      current,
      splits,
    });
  });
  return { input: a, rounds, reserve: sum(rounds.map((r) => r.demand)) };
}
type Model = ReturnType<typeof historyModel>;
function schedule(models: Model[], counts: Decimal[], source: CapitalSourceBundleV1) {
  const raw: { row: CapitalMonthlyDetailV1; amount: Decimal }[] = [];
  models.forEach((m, i) => {
    const n = counts[i]!,
      months = m.input.deploymentPeriodYears * 12;
    for (let entryMonth = 0; entryMonth < months; entryMonth++) {
      const add = (round: Round | null) => {
        const demandMonth = entryMonth + (round?.lag ?? 0),
          amount = n.times(round?.demand ?? d(m.input.initialCheckUsd)).div(months);
        raw.push({
          row: {
            allocationId: m.input.allocationId,
            entryMonth,
            demandMonth,
            roundId: round?.input.roundId ?? null,
            kind: round ? 'follow_on' : 'initial',
            countBasis: 'expected',
            companyCount: ratio(n.times(round?.participating ?? d(1)).div(months)),
            demandUsd: money(amount),
            beyondTerm: demandMonth >= source.fundLife.effectiveValue * 12,
          },
          amount,
        });
      };
      add(null);
      m.rounds.forEach(add);
    }
  });
  const years = new Map<number, { initial: Decimal; within: Decimal; beyond: Decimal }>();
  for (const { row, amount } of raw) {
    const year = Math.floor(row.demandMonth / 12) + 1;
    const value = years.get(year) ?? { initial: d(0), within: d(0), beyond: d(0) };
    const key = row.kind === 'initial' ? 'initial' : row.beyondTerm ? 'beyond' : 'within';
    value[key] = value[key].plus(amount);
    years.set(year, value);
  }
  const annual = [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, v]) => ({
      fundYear: year,
      calendarYear: source.vintageYear + year - 1,
      countBasis: 'expected' as const,
      initialDemandUsd: money(v.initial),
      withinTermFollowOnUsd: money(v.within),
      beyondTermFollowOnUsd: money(v.beyond),
      totalDemandUsd: money(v.initial.plus(v.within).plus(v.beyond)),
    }));
  return { raw, annual, monthly: raw.map((x) => x.row) };
}
function validateLinks(input: CapitalPlanningInputV2, source: CapitalSourceBundleV1) {
  for (const [i, a] of input.allocations.entries()) {
    const profile = source.construction.pipelineProfiles.find((p) => p.id === a.pipelineProfileId);
    if (!source.construction.capitalPlanAllocations.some((x) => x.id === a.allocationId))
      refuseCalculation(
        'ALLOCATION_LINK_UNRESOLVED',
        `input.allocations[${i}].allocationId`,
        'Allocation is absent from pinned source',
        'incomplete'
      );
    if (!profile)
      refuseCalculation(
        'PROFILE_LINK_UNRESOLVED',
        `input.allocations[${i}].pipelineProfileId`,
        'Profile is absent from pinned source',
        'incomplete'
      );
    if (
      !source.construction.links.some(
        (l) =>
          l.allocationId === a.allocationId &&
          l.pipelineProfileId === a.pipelineProfileId &&
          l.entryStageId === a.entryStageId
      )
    )
      refuseCalculation(
        'SOURCE_BUNDLE_INCONSISTENT',
        `input.allocations[${i}]`,
        'Selected source link does not match'
      );
    for (const id of [a.entryStageId, ...a.followOnRounds.map((r) => r.stageId)])
      if (!profile.stages.some((s) => s.id === id))
        refuseCalculation(
          'STAGE_LINK_UNRESOLVED',
          `input.allocations[${i}]`,
          'Stage is absent from selected profile',
          'incomplete'
        );
    if (a.deploymentPeriodYears > source.investmentPeriod.effectiveValue)
      refuseCalculation(
        'INVALID_INPUT',
        `input.allocations[${i}].deploymentPeriodYears`,
        'Deployment exceeds source investment period'
      );
  }
}
function stresses(
  input: CapitalPlanningInputV2,
  base: Model[],
  counts: Decimal[],
  source: CapitalSourceBundleV1,
  fund: ReturnType<typeof funding>
): CapitalStressResultV1[] {
  const names = [
    'graduation_plus_10pp',
    'participation_full',
    'fixed_checks_and_pro_rata_rounds_plus_25pct',
    'follow_on_6_months_earlier',
  ] as const;
  const baseReserve = sum(base.map((m, i) => m.reserve.times(counts[i]!)));
  return names.map((name) => {
    const changed = structuredClone(input);
    const changedPaths: string[] = [];
    changed.allocations.forEach((a, ai) =>
      a.followOnRounds.forEach((r, ri) => {
        const p = `allocations[${ai}].followOnRounds[${ri}]`;
        if (name === 'graduation_plus_10pp') {
          r.graduationRatio = D.min(1, d(r.graduationRatio).plus('.1')).toString();
          changedPaths.push(`${p}.graduationRatio`);
        }
        if (name === 'participation_full') {
          r.participationPolicy = { type: 'all_eligible' };
          changedPaths.push(`${p}.participationPolicy`);
        }
        if (name === 'follow_on_6_months_earlier') {
          r.lagMonthsFromPreviousRound = Math.max(0, r.lagMonthsFromPreviousRound - 6);
          changedPaths.push(`${p}.lagMonthsFromPreviousRound`);
        }
        if (name === 'fixed_checks_and_pro_rata_rounds_plus_25pct') {
          if (r.checkPolicy.type === 'fixed_check') {
            r.checkPolicy.checkUsd = d(r.checkPolicy.checkUsd).times('1.25').toString();
            changedPaths.push(`${p}.checkPolicy.checkUsd`);
          } else {
            const f = r.financing.primaryCapital;
            if (f.basis === 'total_primary_including_fund_check') {
              const originalPrimary = d(f.totalPrimaryAmountUsd);
              f.totalPrimaryAmountUsd = originalPrimary.times('1.25').toString();
              if (r.financing.valuationBasis === 'post_money') {
                r.financing.valuationUsd = d(r.financing.valuationUsd)
                  .minus(originalPrimary)
                  .plus(f.totalPrimaryAmountUsd)
                  .toString();
                changedPaths.push(`${p}.financing.valuationUsd`);
              }
            } else
              f.externalPrimaryAmountUsd = d(f.externalPrimaryAmountUsd).times('1.25').toString();
            changedPaths.push(`${p}.financing.primaryCapital`);
          }
        }
      })
    );
    try {
      const models = changed.allocations.map(historyModel),
        s = schedule(models, counts, source),
        initial = sum(models.map((m, i) => d(m.input.initialCheckUsd).times(counts[i]!))),
        reserve = sum(models.map((m, i) => m.reserve.times(counts[i]!))),
        total = initial.plus(reserve),
        within = sum(
          s.raw.filter((x) => x.row.kind === 'follow_on' && !x.row.beyondTerm).map((x) => x.amount)
        ),
        beyond = sum(
          s.raw.filter((x) => x.row.kind === 'follow_on' && x.row.beyondTerm).map((x) => x.amount)
        );
      let cumulative = d(0);
      const first = [...s.raw]
        .sort(
          (a, b) =>
            a.row.demandMonth - b.row.demandMonth ||
            a.row.allocationId.localeCompare(b.row.allocationId)
        )
        .find((x) => {
          cumulative = cumulative.plus(x.amount);
          return cumulative.gt(fund.budget);
        });
      return {
        state: 'complete',
        name,
        label: name.replaceAll('_', ' '),
        countBasis: 'expected',
        changedPaths,
        plannedReserveGapUsd: money(positive(reserve.minus(baseReserve))),
        annualSchedule: s.annual,
        verdicts: {
          inputSupport: 'complete',
          lifetimeCapacity: total.gt(fund.capacity) ? 'over_capacity' : 'within_capacity',
          allocationBudget: total.gt(fund.budget) ? 'allocation_gap' : 'within_allocation',
          reserveEarmark: reserve.gt(baseReserve) ? 'earmark_gap' : 'within_earmark',
          timing: beyond.isZero()
            ? 'within_term'
            : within.isZero()
              ? 'all_beyond_term'
              : 'includes_beyond_term',
          staleness: 'unknown_current_source',
        },
        reconciliation: {
          countBasis: 'expected',
          initialDemandUsd: money(initial),
          lifetimeFollowOnUsd: money(reserve),
          withinTermFollowOnUsd: money(within),
          beyondTermFollowOnUsd: money(beyond),
          unassignedPlanningBudgetUsd: available(d(0)),
          signedAllocationRoundingResidualUsd: money(d(0)),
          signedRoundingResidualUsd: money(
            d(money(total)).minus(sum(s.raw.map((x) => d(x.row.demandUsd))))
          ),
          signedDemandRoundingResidualUsd: money(
            d(money(total)).minus(money(initial)).minus(money(reserve))
          ),
          signedTimingRoundingResidualUsd: money(
            d(money(reserve)).minus(money(within)).minus(money(beyond))
          ),
          signedBudgetResidualUsd: available(fund.budget.minus(total)),
          signedLifetimeHeadroomUsd: money(fund.capacity.minus(total)),
          lifetimeBudgetShortfallUsd: money(positive(total.minus(fund.capacity))),
          allocationGapUsd: available(positive(total.minus(fund.budget))),
          reserveEarmarkGapUsd: available(positive(reserve.minus(baseReserve))),
          firstBudgetGapMonth: first?.row.demandMonth ?? null,
          firstGapAllocationId: first?.row.allocationId ?? null,
          firstGapRoundId: first?.row.roundId ?? null,
        },
      };
    } catch (error) {
      if (!(error instanceof CapitalPlanningCalculationError)) throw error;
      return {
        state: 'invalid',
        name,
        label: name.replaceAll('_', ' '),
        countBasis: 'expected',
        issues: [error.issues[0]!, ...error.issues.slice(1)],
      };
    }
  });
}
export function calculateCapitalPlanningV2(args: {
  input: CapitalPlanningInputV2;
  sourceBundle: CapitalSourceBundleV1;
}): CapitalPlanningResultV2 {
  assertCalculationSize(args.input, limits.maxInputBytes, 'input');
  assertCalculationSize(args.sourceBundle, limits.maxSnapshotBytes, 'sourceBundle');
  const input = parseCalculation(CapitalPlanningInputV2Schema, args.input, 'input'),
    source = parseCalculation(CapitalSourceBundleV1Schema, args.sourceBundle, 'sourceBundle');
  if (source.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION)
    refuseCalculation(
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'sourceBundle.interpretationVersion',
      'Pinned interpretation unsupported',
      'unsupported'
    );
  validateLinks(input, source);
  const fund = funding(input, source),
    models = input.allocations.map(historyModel);
  const denominator = sum(
    models.map((m) => d(m.input.initialPoolShareRatio).div(m.input.initialCheckUsd))
  );
  const initial =
    input.solve.mode === 'fixed_fund'
      ? fund.budget.div(
          d(1).plus(
            sum(
              models.map((m) =>
                d(m.input.initialPoolShareRatio).times(m.reserve).div(m.input.initialCheckUsd)
              )
            )
          )
        )
      : d(input.solve.totalExpectedCompanyCount).div(denominator);
  const counts = models.map((m) =>
    initial.times(m.input.initialPoolShareRatio).div(m.input.initialCheckUsd)
  );
  const reserves = models.map((m, i) => m.reserve.times(counts[i]!)),
    reserve = sum(reserves),
    capital = initial.plus(reserve);
  let required: CapitalConstructionResultV2['solution']['requiredCommittedCapitalUsd'] =
    unavailable();
  if (input.solve.mode === 'fixed_portfolio') {
    if (fund.a.lte(0))
      refuseCalculation(
        'POLICY_UNSUPPORTED',
        'sourceBundle.feeExpense',
        'Commitment bridge must have positive affine slope',
        'unsupported'
      );
    const raw = capital.plus(fund.b).div(fund.a),
      rounded = d(money(raw));
    if (raw.lt(fund.gpFixed) || money(rounded.times(fund.a).minus(fund.b)) !== money(capital))
      refuseCalculation(
        'POLICY_UNSUPPORTED',
        'solve',
        'Required commitments are not representable under the recorded affine bridge',
        'unsupported'
      );
    required = available(raw);
  }
  const s = schedule(models, counts, source);
  if (s.monthly.length > limits.maxExpandedRows)
    refuseCalculation(
      'INPUT_TOO_LARGE',
      'result.monthlyDetail',
      'Expanded monthly row limit exceeded'
    );
  const totalCount =
    input.solve.mode === 'fixed_portfolio' ? d(input.solve.totalExpectedCompanyCount) : sum(counts);
  const allocations = models.map((m, i) => {
    const n = counts[i]!,
      initialDemand = initial.times(m.input.initialPoolShareRatio);
    return {
      allocationId: m.input.allocationId,
      name: m.input.name,
      initialPoolShareRatio: m.input.initialPoolShareRatio,
      initialCheckUsd: m.input.initialCheckUsd,
      expectedCompanyCount: ratio(n),
      initialDemandUsd: money(initialDemand),
      reserveUsd: money(reserves[i]!),
      ...(m.input.plannedCompanyCount === undefined
        ? {}
        : {
            entered: {
              companyCount: ratio(d(m.input.plannedCompanyCount)),
              initialDemandUsd: money(
                d(m.input.plannedCompanyCount).times(m.input.initialCheckUsd)
              ),
              reserveUsd: money(d(m.input.plannedCompanyCount).times(m.reserve)),
              totalDemandUsd: money(
                d(m.input.plannedCompanyCount).times(d(m.input.initialCheckUsd).plus(m.reserve))
              ),
              signedBudgetResidualUsd: money(
                n
                  .minus(m.input.plannedCompanyCount)
                  .times(d(m.input.initialCheckUsd).plus(m.reserve))
              ),
            },
          }),
      initialScheduleRoundingResidualUsd: money(
        d(money(initialDemand)).minus(
          sum(
            s.monthly
              .filter((r) => r.allocationId === m.input.allocationId && r.kind === 'initial')
              .map((r) => d(r.demandUsd))
          )
        )
      ),
      followOnScheduleRoundingResidualUsd: money(
        d(money(reserves[i]!)).minus(
          sum(
            s.monthly
              .filter((r) => r.allocationId === m.input.allocationId && r.kind === 'follow_on')
              .map((r) => d(r.demandUsd))
          )
        )
      ),
      rounds: m.rounds.map((r) => ({
        roundId: r.input.roundId,
        stageId: r.input.stageId,
        roundLabel: r.input.roundLabel,
        eligibleCompanyCount: ratio(n.times(r.eligible)),
        participatingCompanyCount: ratio(n.times(r.participating)),
        demandUsd: money(n.times(r.demand)),
        pathDemandRoundingResidualUsd: money(
          d(money(n.times(r.demand))).minus(sum(r.current.map((p) => d(money(n.times(p.demand))))))
        ),
        cumulativeLagMonths: r.lag,
        paths: r.paths.map((p) => ({
          participationHistory: p.history,
          parentParticipationHistory: p.parent,
          roundIndex: p.round,
          state: p.state,
          outcome: p.outcome,
          probability: ratio(p.mass),
          ownershipRatio: ratio(p.ownership),
          checkUsd: money(p.check),
          demandUsd: money(n.times(p.demand)),
        })),
        splits: r.splits.map((p) => ({
          parentParticipationHistory: p.history,
          parentProbability: ratio(p.mass),
          pathProbabilityRoundingResidual: ratio(
            d(ratio(p.mass)).minus(sum(p.children.map((c) => d(ratio(c)))))
          ),
        })),
      })),
    };
  });
  const result: CapitalPlanningResultV2 = {
    contractVersion: CAPITAL_PLANNING_V2_VERSION,
    roundingPolicy: CAPITAL_PLANNING_V2_ROUNDING_POLICY,
    input,
    sourceBundle: source,
    provenance: capitalAssumptionProvenance(input, source),
    construction: {
      methodVersion: CAPITAL_PLANNING_V2_VERSION,
      roundingPolicy: CAPITAL_PLANNING_V2_ROUNDING_POLICY,
      budgetBridge: fund.bridge,
      solution: {
        mode: input.solve.mode,
        countBasis: 'expected',
        initialPoolUsd: money(initial),
        totalExpectedCompanyCount: ratio(totalCount),
        totalReserveUsd: money(reserve),
        requiredConstructionCapitalUsd: money(capital),
        requiredCommittedCapitalUsd: required,
        sourceCapacityGapUsd: money(capital.minus(fund.capacity)),
        feasible: capital.lte(fund.capacity),
        expectedCountRoundingResidual: ratio(
          d(ratio(totalCount)).minus(sum(counts.map((n) => d(ratio(n)))))
        ),
        initialAllocationRoundingResidualUsd: money(
          d(money(initial)).minus(sum(allocations.map((a) => d(a.initialDemandUsd))))
        ),
        capitalRoundingResidualUsd: money(
          d(money(capital))
            .minus(money(initial))
            .minus(sum(reserves.map((r) => d(money(r)))))
        ),
      },
      allocations,
      monthlyDetail: s.monthly,
      annualSchedule: s.annual,
      stresses: stresses(input, models, counts, source, fund),
      disclosures: {
        timing: CAPITAL_PLANNING_DISCLOSURES.timing,
        budget: CAPITAL_PLANNING_DISCLOSURES.budget,
        gp: CAPITAL_PLANNING_DISCLOSURES.gp,
      },
      assumptions: {
        countBasis: 'expected',
        historyAwareParticipation: true,
        timingBasis: 'interval_from_previous_round',
        poolBasis: 'incremental_pre_money',
        deploymentCadence: 'uniform_monthly_over_deployment_period',
      },
    },
  };
  assertCalculationSize(result, limits.maxSnapshotBytes, 'result');
  return parseCalculation(CapitalPlanningResultV2Schema, result, 'result');
}
