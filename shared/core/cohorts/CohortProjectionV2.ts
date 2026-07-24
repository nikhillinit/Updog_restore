/**
 * Methodology note: cohort-projection-v2/1.0.0 is a deterministic, RNG-free
 * Exit-EV projection with an actual-calibrated fund-level j-curve ramp.
 * Graduation assumptions are validated for stage completeness but are not a
 * value input in V1. Existing direct FMV is held flat, fees use the pinned
 * flat deployable-capital drag, and net IRR is net of that modeled drag but
 * gross of carry. Money remains Decimal until one contract-boundary format.
 * The required canonical XIRR solver is inherently floating point; converting
 * formatted cash-flow amounts with Number is the only explicit financial float
 * boundary in this engine. Fractional expected company counts remain Decimal
 * until the integer CurrentForecastV2 contract boundary, where they are rounded
 * half-up.
 */
import {
  ENGINE_VERSION,
  METHODOLOGY_VERSION,
  type CurrentForecastSeriesPointV1,
  type CurrentForecastUnavailableReasonDetail,
  type CurrentForecastV2,
  type CurrentForecastV2Input,
} from '../../contracts/current-forecast-v2.contract';
import type { CurrentPlanVersionV1 } from '../../contracts/current-plan-version-v1.contract';
import type { PersistedFinancialFactsSnapshotV1 } from '../../contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../../lib/canonical-hash';
import { Decimal } from '../../lib/decimal-config';
import { canonicalizeDecimalLeaves, toFixedDecimalString } from '../../lib/decimal-string';
import { calculateCanonicalIrr, type CashFlow } from '../../lib/finance/xirr';
import { computeJCurvePath } from '../../lib/jcurve';

export { ENGINE_VERSION };

export type CurrentForecastBasisMismatchCode =
  | 'FUND_ID_MISMATCH'
  | 'AS_OF_DATE_MISMATCH'
  | 'KNOWLEDGE_CUTOFF_MISMATCH'
  | 'FINANCIAL_FACTS_SNAPSHOT_ID_MISMATCH'
  | 'CURRENT_PLAN_VERSION_ID_MISMATCH';

export class CurrentForecastBasisMismatchError extends Error {
  override readonly name = 'CurrentForecastBasisMismatchError';

  constructor(
    readonly code: CurrentForecastBasisMismatchCode,
    message: string
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type FactsWithId = PersistedFinancialFactsSnapshotV1 & { readonly id: number };
type ForecastStatus = CurrentForecastV2['status'];

interface QuarterPeriod {
  readonly ordinal: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

interface InternalSeriesPoint extends QuarterPeriod {
  readonly source: 'actual' | 'projected';
  readonly deployedUsd: Decimal;
  readonly contributionsUsd: Decimal;
  readonly distributionsUsd: Decimal;
  readonly navUsd: Decimal;
  readonly tvpi: Decimal;
  readonly dpi: Decimal;
  readonly activeCompanyCount: number;
  readonly projectedCohortCount: number;
}

interface QuarterCashFlowBucket {
  contributions: Decimal;
  distributions: Decimal;
  deployed: Decimal;
}

interface StageCohort {
  readonly deploymentQuarter: number;
  readonly stage: string;
  readonly capital: Decimal;
  readonly terminalMultiple: Decimal;
  readonly exitQuarter: number;
  readonly expectedCompanyCount: Decimal;
}

interface BridgeFields {
  readonly committedCapitalUsd: Decimal;
  readonly calledToDateUsd: Decimal;
  readonly projectedFeesRemainingUsd: Decimal;
  readonly recallableDistributionsUsd: Decimal;
  readonly uncalledCapitalUsd: Decimal;
}

interface FinalizeForecastInput {
  readonly input: CurrentForecastV2Input;
  readonly plan: CurrentPlanVersionV1;
  readonly status: ForecastStatus;
  readonly internalSeries: readonly InternalSeriesPoint[];
  readonly remainingDeployableCapitalUsd: Decimal;
  readonly bridge: BridgeFields;
  readonly inputHash: string;
  readonly unavailableReasons: CurrentForecastUnavailableReasonDetail[];
  readonly warnings: string[];
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const MONEY_PLACES = 6;
const RATIO_PLACES = 12;

function validateBasis(
  input: CurrentForecastV2Input,
  plan: CurrentPlanVersionV1,
  facts: FactsWithId
): void {
  if (input.fundId !== facts.fundId || input.fundId !== plan.fundId) {
    throw new CurrentForecastBasisMismatchError(
      'FUND_ID_MISMATCH',
      'input, facts, and plan must reference the same fundId.'
    );
  }
  if (input.asOfDate !== facts.asOfDate) {
    throw new CurrentForecastBasisMismatchError(
      'AS_OF_DATE_MISMATCH',
      'input and facts must reference the same asOfDate.'
    );
  }
  if (input.knowledgeCutoff !== facts.knowledgeCutoff) {
    throw new CurrentForecastBasisMismatchError(
      'KNOWLEDGE_CUTOFF_MISMATCH',
      'input and facts must reference the same knowledgeCutoff.'
    );
  }
  if (input.financialFactsSnapshotId !== String(facts.id)) {
    throw new CurrentForecastBasisMismatchError(
      'FINANCIAL_FACTS_SNAPSHOT_ID_MISMATCH',
      'input financialFactsSnapshotId must identify the supplied facts snapshot.'
    );
  }
  if (input.currentPlanVersionId !== plan.id) {
    throw new CurrentForecastBasisMismatchError(
      'CURRENT_PLAN_VERSION_ID_MISMATCH',
      'input currentPlanVersionId must identify the supplied plan.'
    );
  }
}

function inputHashFor(input: CurrentForecastV2Input): string {
  return canonicalSha256(
    canonicalizeDecimalLeaves({
      fundId: input.fundId,
      financialFactsSnapshotId: input.financialFactsSnapshotId,
      currentPlanVersionId: input.currentPlanVersionId,
      asOfDate: input.asOfDate,
      knowledgeCutoff: input.knowledgeCutoff,
      clock: input.clock,
    })
  );
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function dateAtUtcMidnight(value: string): Date {
  return new Date(`${dateOnly(value)}T00:00:00.000Z`);
}

function quarterOrdinalFor(value: string): number {
  const date = dateAtUtcMidnight(value);
  return date.getUTCFullYear() * 4 + Math.floor(date.getUTCMonth() / 3);
}

function formatDate(year: number, monthIndex: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(monthIndex + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function quarterPeriod(ordinal: number): QuarterPeriod {
  const year = Math.floor(ordinal / 4);
  const quarterIndex = ordinal - year * 4;
  const startMonth = quarterIndex * 3;
  const endDate = new Date(Date.UTC(year, startMonth + 3, 0));

  return {
    ordinal,
    periodStart: formatDate(year, startMonth, 1),
    periodEnd: formatDate(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  };
}

function periodsBetween(startOrdinal: number, endOrdinal: number): QuarterPeriod[] {
  const periods: QuarterPeriod[] = [];
  for (let ordinal = startOrdinal; ordinal <= endOrdinal; ordinal += 1) {
    periods.push(quarterPeriod(ordinal));
  }
  return periods;
}

function factsActivityDates(facts: FactsWithId): string[] {
  const dates: string[] = [];
  for (const series of facts.payload.cashFlowSeries.series) {
    for (const point of series.points) dates.push(dateOnly(point.effectiveAt));
  }
  for (const mark of facts.payload.marksSeries.marks) dates.push(mark.effectiveAt);
  for (const nav of facts.payload.marksSeries.periodNav) dates.push(nav.periodEnd);
  return dates;
}

function actualPeriodsFor(facts: FactsWithId, asOfDate: string): QuarterPeriod[] {
  const asOfOrdinal = quarterOrdinalFor(asOfDate);
  const activityOrdinals = factsActivityDates(facts)
    .map(quarterOrdinalFor)
    .filter((ordinal) => ordinal <= asOfOrdinal);
  if (activityOrdinals.length === 0) return [];

  return periodsBetween(Math.min(...activityOrdinals), asOfOrdinal);
}

function isFactsUnavailable(facts: FactsWithId, asOfDate: string): boolean {
  const asOfOrdinal = quarterOrdinalFor(asOfDate);
  return !factsActivityDates(facts).some(
    (activityDate) => quarterOrdinalFor(activityDate) <= asOfOrdinal
  );
}

function newCashFlowBucket(): QuarterCashFlowBucket {
  return {
    contributions: new Decimal(0),
    distributions: new Decimal(0),
    deployed: new Decimal(0),
  };
}

function actualCashFlowBuckets(facts: FactsWithId): Map<number, QuarterCashFlowBucket> {
  const buckets = new Map<number, QuarterCashFlowBucket>();

  for (const series of facts.payload.cashFlowSeries.series) {
    for (const point of series.points) {
      const ordinal = quarterOrdinalFor(point.effectiveAt);
      const bucket = buckets.get(ordinal) ?? newCashFlowBucket();
      const amount = new Decimal(point.amount);

      if (series.eventType === 'lp_capital_call') {
        bucket.contributions = bucket.contributions.plus(amount);
      } else if (series.eventType === 'recallable_distribution') {
        bucket.contributions = bucket.contributions.minus(amount);
      } else if (
        series.eventType === 'lp_distribution' ||
        series.eventType === 'realized_proceeds'
      ) {
        bucket.distributions = bucket.distributions.plus(amount);
      } else if (series.eventType === 'portfolio_investment') {
        bucket.deployed = bucket.deployed.plus(amount);
      }

      buckets.set(ordinal, bucket);
    }
  }

  return buckets;
}

function latestActualNavAt(facts: FactsWithId, periodEnd: string): Decimal {
  let latestDate = '';
  let latestNav = new Decimal(0);
  for (const point of facts.payload.marksSeries.periodNav) {
    if (point.periodEnd <= periodEnd && point.periodEnd >= latestDate) {
      latestDate = point.periodEnd;
      latestNav = new Decimal(point.nav);
    }
  }
  return latestNav;
}

function buildActualSeries(
  periods: readonly QuarterPeriod[],
  facts: FactsWithId
): InternalSeriesPoint[] {
  const buckets = actualCashFlowBuckets(facts);
  const activeCompanyCount = facts.payload.companyActuals.facts.length;
  const series: InternalSeriesPoint[] = [];
  let cumulativeContributions = new Decimal(0);
  let cumulativeDistributions = new Decimal(0);
  let cumulativeDeployed = new Decimal(0);

  for (const period of periods) {
    const bucket = buckets.get(period.ordinal) ?? newCashFlowBucket();
    cumulativeContributions = cumulativeContributions.plus(bucket.contributions);
    cumulativeDistributions = cumulativeDistributions.plus(bucket.distributions);
    cumulativeDeployed = cumulativeDeployed.plus(bucket.deployed);
    const nav = latestActualNavAt(facts, period.periodEnd);
    const tvpi = cumulativeContributions.isZero()
      ? new Decimal(0)
      : cumulativeDistributions.plus(nav).div(cumulativeContributions);
    const dpi = cumulativeContributions.isZero()
      ? new Decimal(0)
      : cumulativeDistributions.div(cumulativeContributions);

    series.push({
      ...period,
      source: 'actual',
      deployedUsd: cumulativeDeployed,
      contributionsUsd: bucket.contributions,
      distributionsUsd: bucket.distributions,
      navUsd: nav,
      tvpi,
      dpi,
      activeCompanyCount,
      projectedCohortCount: 0,
    });
  }

  return series;
}

function deployedActualFor(facts: FactsWithId): Decimal {
  let deployed = new Decimal(0);
  for (const series of facts.payload.cashFlowSeries.series) {
    if (series.eventType !== 'portfolio_investment') continue;
    for (const point of series.points) deployed = deployed.plus(point.amount);
  }
  return deployed;
}

function missingStageAssumptions(plan: CurrentPlanVersionV1): string[] {
  return plan.cohortAssumptions.stageDistribution
    .filter((distribution) => {
      const hasExit = plan.cohortAssumptions.exitAssumptions.some(
        (assumption) => assumption.stage === distribution.stage
      );
      const hasGraduation = plan.cohortAssumptions.graduationMatrix.some(
        (assumption) => assumption.fromStage === distribution.stage
      );
      return !hasExit || !hasGraduation;
    })
    .map((distribution) => distribution.stage);
}

function buildStageCohorts(
  plan: CurrentPlanVersionV1,
  remainingDeployable: Decimal
): StageCohort[] {
  const exitByStage = new Map(
    plan.cohortAssumptions.exitAssumptions.map((assumption) => [assumption.stage, assumption])
  );
  const averageInitialCheck = new Decimal(plan.cohortAssumptions.averageInitialCheckUsd);
  const cohorts: StageCohort[] = [];

  for (
    let deploymentQuarter = 1;
    deploymentQuarter <= plan.pacingAssumptions.deploymentQuarters;
    deploymentQuarter += 1
  ) {
    const deploymentPct = plan.pacingAssumptions.quarterlyDeploymentPcts[deploymentQuarter - 1];
    const deployment = deploymentPct ? remainingDeployable.mul(deploymentPct) : new Decimal(0);

    for (const distribution of plan.cohortAssumptions.stageDistribution) {
      const exit = exitByStage.get(distribution.stage);
      if (!exit) continue;
      const capital = deployment.mul(distribution.pct);
      if (capital.isZero()) continue;
      const terminalMultiple = new Decimal(exit.exitMultiple).mul(ONE.minus(exit.failureRate));

      cohorts.push({
        deploymentQuarter,
        stage: distribution.stage,
        capital,
        terminalMultiple,
        exitQuarter: deploymentQuarter + exit.quartersToExit,
        expectedCompanyCount: averageInitialCheck.gt(0)
          ? capital.div(averageInitialCheck)
          : new Decimal(0),
      });
    }
  }

  return cohorts;
}

function projectedPeriodCountFor(plan: CurrentPlanVersionV1, remainingDeployable: Decimal): number {
  if (remainingDeployable.lte(0) || plan.pacingAssumptions.deploymentQuarters === 0) {
    return 0;
  }
  const maxExitQuarters = plan.cohortAssumptions.exitAssumptions.reduce(
    (maximum, assumption) => Math.max(maximum, assumption.quartersToExit),
    0
  );
  return plan.pacingAssumptions.deploymentQuarters + maxExitQuarters;
}

function blendedTerminalMultiple(cohorts: readonly StageCohort[]): Decimal {
  const totalCapital = cohorts.reduce((sum, cohort) => sum.plus(cohort.capital), new Decimal(0));
  if (totalCapital.isZero()) return new Decimal(1);
  const terminalValue = cohorts.reduce(
    (sum, cohort) => sum.plus(cohort.capital.mul(cohort.terminalMultiple)),
    new Decimal(0)
  );
  return terminalValue.div(totalCapital);
}

function buildProgressRamp(
  actualSeries: readonly InternalSeriesPoint[],
  projectedPeriodCount: number,
  plan: CurrentPlanVersionV1,
  targetTVPI: Decimal
): Decimal[] {
  const totalPeriodCount = actualSeries.length + projectedPeriodCount;
  const zeroFeeTimeline = Array.from({ length: totalPeriodCount }, () => new Decimal(0));
  const actualCalls = actualSeries.map((point) => point.contributionsUsd);
  const actualDistributions = actualSeries.map((point) => point.distributionsUsd);
  const path = computeJCurvePath(
    {
      kind: 'logistic',
      horizonYears: totalPeriodCount / 4,
      investYears: plan.pacingAssumptions.deploymentQuarters / 4,
      targetTVPI,
      startTVPI: new Decimal(1),
      step: 'quarter',
      pacingStrategy: 'flat',
    },
    zeroFeeTimeline,
    actualCalls,
    actualDistributions
  );

  const denominator = targetTVPI.minus(ONE);
  if (denominator.isZero()) {
    return path.tvpi.map(() => new Decimal(0));
  }

  const ramp: Decimal[] = [];
  let previous = new Decimal(0);
  for (const tvpi of path.tvpi) {
    const normalized = Decimal.min(ONE, Decimal.max(ZERO, tvpi.minus(ONE).div(denominator)));
    const monotonic = Decimal.max(previous, normalized);
    ramp.push(monotonic);
    previous = monotonic;
  }
  return ramp;
}

function progressAtHoldingPeriod(
  ramp: readonly Decimal[],
  holdingPeriods: number,
  quartersToExit: number
): Decimal {
  if (ramp.length === 0 || holdingPeriods <= 0 || quartersToExit <= 0) {
    return new Decimal(0);
  }

  const lastIndex = ramp.length - 1;
  const position = new Decimal(holdingPeriods).div(quartersToExit).mul(lastIndex);
  const lowerIndex = position.floor().toNumber();
  const upperIndex = Math.min(lastIndex, lowerIndex + 1);
  const lower = ramp[lowerIndex] ?? ZERO;
  const upper = ramp[upperIndex] ?? lower;
  return lower.plus(upper.minus(lower).mul(position.minus(lowerIndex)));
}

function latestExistingCompanyNav(facts: FactsWithId, asOfDate: string): Decimal {
  const latestByCompany = new Map<
    number,
    { readonly effectiveAt: string; readonly markId: number; readonly fairValue: string }
  >();

  for (const mark of facts.payload.marksSeries.marks) {
    if (mark.effectiveAt > asOfDate) continue;
    const current = latestByCompany.get(mark.companyId);
    if (
      !current ||
      mark.effectiveAt > current.effectiveAt ||
      (mark.effectiveAt === current.effectiveAt && mark.markId > current.markId)
    ) {
      latestByCompany.set(mark.companyId, mark);
    }
  }

  if (latestByCompany.size > 0) {
    return [...latestByCompany.values()].reduce(
      (sum, mark) => sum.plus(mark.fairValue),
      new Decimal(0)
    );
  }

  return latestActualNavAt(facts, quarterPeriod(quarterOrdinalFor(asOfDate)).periodEnd);
}

function integerCountBoundary(expectedCount: Decimal): number {
  return expectedCount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function buildProjectedSeries(
  actualSeries: readonly InternalSeriesPoint[],
  facts: FactsWithId,
  plan: CurrentPlanVersionV1,
  deployedActual: Decimal,
  cohorts: readonly StageCohort[],
  projectedPeriodCount: number
): InternalSeriesPoint[] {
  if (projectedPeriodCount === 0) return [];

  const targetTVPI = blendedTerminalMultiple(cohorts);
  const progressRamp = buildProgressRamp(actualSeries, projectedPeriodCount, plan, targetTVPI);
  const existingCompanyNav = latestExistingCompanyNav(facts, facts.asOfDate);
  const existingCompanyCount = facts.payload.companyActuals.facts.length;
  const flatFeePerQuarter = new Decimal(plan.pacingAssumptions.annualFeeDragPct)
    .div(4)
    .mul(plan.deployableCapitalUsd);
  const firstProjectedOrdinal = quarterOrdinalFor(facts.asOfDate) + 1;
  const series: InternalSeriesPoint[] = [];
  let cumulativeDeployed = new Decimal(deployedActual);
  let cumulativeContributions = actualSeries.reduce(
    (sum, point) => sum.plus(point.contributionsUsd),
    new Decimal(0)
  );
  let cumulativeDistributions = actualSeries.reduce(
    (sum, point) => sum.plus(point.distributionsUsd),
    new Decimal(0)
  );

  for (let projectedQuarter = 1; projectedQuarter <= projectedPeriodCount; projectedQuarter += 1) {
    const contributions = cohorts
      .filter((cohort) => cohort.deploymentQuarter === projectedQuarter)
      .reduce((sum, cohort) => sum.plus(cohort.capital), new Decimal(0));
    const distributions = cohorts
      .filter((cohort) => cohort.exitQuarter === projectedQuarter)
      .reduce(
        (sum, cohort) => sum.plus(cohort.capital.mul(cohort.terminalMultiple)),
        new Decimal(0)
      );
    const activeCohorts = cohorts.filter(
      (cohort) =>
        cohort.deploymentQuarter <= projectedQuarter && projectedQuarter < cohort.exitQuarter
    );
    const cohortNavParts = activeCohorts.map((cohort) => {
      const progress = progressAtHoldingPeriod(
        progressRamp,
        projectedQuarter - cohort.deploymentQuarter,
        cohort.exitQuarter - cohort.deploymentQuarter
      );
      return cohort.capital.mul(ONE.plus(cohort.terminalMultiple.minus(ONE).mul(progress)));
    });
    const cohortNav = cohortNavParts.reduce((sum, nav) => sum.plus(nav), new Decimal(0));
    const conservationCheck = cohortNavParts.reduce((sum, nav) => sum.plus(nav), new Decimal(0));
    if (!conservationCheck.eq(cohortNav)) {
      throw new Error('Projected cohort NAV failed full-precision conservation.');
    }

    cumulativeDeployed = cumulativeDeployed.plus(contributions);
    cumulativeContributions = cumulativeContributions.plus(contributions);
    cumulativeDistributions = cumulativeDistributions.plus(distributions);
    const cumulativeFeeDrag = flatFeePerQuarter.mul(projectedQuarter);
    const nav = Decimal.max(ZERO, cohortNav.plus(existingCompanyNav).minus(cumulativeFeeDrag));
    const tvpi = cumulativeContributions.isZero()
      ? new Decimal(0)
      : cumulativeDistributions.plus(nav).div(cumulativeContributions);
    const dpi = cumulativeContributions.isZero()
      ? new Decimal(0)
      : cumulativeDistributions.div(cumulativeContributions);
    const activeProjectedCompanyCount = activeCohorts.reduce(
      (sum, cohort) => sum.plus(cohort.expectedCompanyCount),
      new Decimal(0)
    );
    const activeDeploymentCohorts = new Set(
      activeCohorts.map((cohort) => cohort.deploymentQuarter)
    );

    series.push({
      ...quarterPeriod(firstProjectedOrdinal + projectedQuarter - 1),
      source: 'projected',
      deployedUsd: cumulativeDeployed,
      contributionsUsd: contributions,
      distributionsUsd: distributions,
      navUsd: nav,
      tvpi,
      dpi,
      activeCompanyCount: existingCompanyCount + integerCountBoundary(activeProjectedCompanyCount),
      projectedCohortCount: activeDeploymentCohorts.size,
    });
  }

  return series;
}

function bridgeFields(
  facts: FactsWithId,
  plan: CurrentPlanVersionV1,
  actualQuarterCount: number,
  projectedQuarterCount: number
): BridgeFields {
  const deployableCapital = new Decimal(plan.deployableCapitalUsd);
  const annualFeeDrag = new Decimal(plan.pacingAssumptions.annualFeeDragPct);
  const gridYears = new Decimal(actualQuarterCount + projectedQuarterCount).div(4);
  const elapsedYears = new Decimal(actualQuarterCount).div(4);
  const totalModeledFees = annualFeeDrag.mul(deployableCapital).mul(gridYears);
  const feesPaidToDate = annualFeeDrag.mul(deployableCapital).mul(elapsedYears);
  const projectedFeesRemaining = Decimal.max(ZERO, totalModeledFees.minus(feesPaidToDate));
  const committedCapital = deployableCapital.plus(totalModeledFees);
  const calledToDate = new Decimal(facts.payload.cashFlowSeries.totals.contributions);
  const recallableDistributions = new Decimal(
    facts.payload.cashFlowSeries.totals.recallableDistributions
  );

  return {
    committedCapitalUsd: committedCapital,
    calledToDateUsd: calledToDate,
    projectedFeesRemainingUsd: projectedFeesRemaining,
    recallableDistributionsUsd: recallableDistributions,
    uncalledCapitalUsd: committedCapital
      .minus(calledToDate)
      .minus(projectedFeesRemaining)
      .plus(recallableDistributions),
  };
}

function boundarySeries(
  internalSeries: readonly InternalSeriesPoint[]
): CurrentForecastSeriesPointV1[] {
  return internalSeries.map((point) => ({
    periodStart: point.periodStart,
    periodEnd: point.periodEnd,
    source: point.source,
    deployedUsd: toFixedDecimalString(point.deployedUsd, MONEY_PLACES),
    contributionsUsd: toFixedDecimalString(point.contributionsUsd, MONEY_PLACES),
    distributionsUsd: toFixedDecimalString(point.distributionsUsd, MONEY_PLACES),
    navUsd: toFixedDecimalString(point.navUsd, MONEY_PLACES),
    tvpi: toFixedDecimalString(point.tvpi, RATIO_PLACES),
    dpi: toFixedDecimalString(point.dpi, RATIO_PLACES),
    activeCompanyCount: point.activeCompanyCount,
    projectedCohortCount: point.projectedCohortCount,
  }));
}

function dateForCanonicalIrr(periodEnd: string): Date {
  const utcDate = dateAtUtcMidnight(periodEnd);
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

function netIrrFor(series: readonly CurrentForecastSeriesPointV1[]): string | null {
  const flows: CashFlow[] = [];
  for (const point of series) {
    const date = dateForCanonicalIrr(point.periodEnd);
    if (!new Decimal(point.contributionsUsd).isZero()) {
      // Sanctioned boundary: the canonical XIRR solver accepts number cash flows.
      flows.push({ date, amount: -Number(point.contributionsUsd) });
    }
    if (!new Decimal(point.distributionsUsd).isZero()) {
      // Sanctioned boundary: the canonical XIRR solver accepts number cash flows.
      flows.push({ date, amount: Number(point.distributionsUsd) });
    }
  }

  const terminal = series.at(-1);
  if (terminal && new Decimal(terminal.navUsd).gt(0)) {
    // Sanctioned boundary: the canonical XIRR solver accepts number cash flows.
    flows.push({ date: dateForCanonicalIrr(terminal.periodEnd), amount: Number(terminal.navUsd) });
  }

  const irr = calculateCanonicalIrr(flows);
  return irr === null ? null : toFixedDecimalString(new Decimal(irr), RATIO_PLACES);
}

function factsWarnings(facts: FactsWithId): string[] {
  const messages = [
    ...facts.payload.cashFlowSeries.warnings,
    ...facts.payload.marksSeries.warnings,
    ...facts.payload.marksSeries.periodNav.flatMap((point) => point.warnings),
  ].map((warning) => warning.message);
  return [...new Set(messages)];
}

function finalizeForecast(value: FinalizeForecastInput): CurrentForecastV2 {
  const series = boundarySeries(value.internalSeries);
  const remainingDeployableCapitalUsd = toFixedDecimalString(
    value.remainingDeployableCapitalUsd,
    MONEY_PLACES
  );
  const committedCapitalUsd = toFixedDecimalString(value.bridge.committedCapitalUsd, MONEY_PLACES);
  const calledToDateUsd = toFixedDecimalString(value.bridge.calledToDateUsd, MONEY_PLACES);
  const projectedFeesRemainingUsd = toFixedDecimalString(
    value.bridge.projectedFeesRemainingUsd,
    MONEY_PLACES
  );
  const recallableDistributionsUsd = toFixedDecimalString(
    value.bridge.recallableDistributionsUsd,
    MONEY_PLACES
  );
  const uncalledCapitalUsd = toFixedDecimalString(value.bridge.uncalledCapitalUsd, MONEY_PLACES);
  const netIrr = netIrrFor(series);
  const resultPreimage = {
    fundId: value.input.fundId,
    financialFactsSnapshotId: value.input.financialFactsSnapshotId,
    currentPlanVersionId: value.input.currentPlanVersionId,
    asOfDate: value.input.asOfDate,
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    status: value.status,
    series,
    remainingDeployableCapitalUsd,
    committedCapitalUsd,
    calledToDateUsd,
    projectedFeesRemainingUsd,
    recallableDistributionsUsd,
    uncalledCapitalUsd,
    netIrr,
  };

  return {
    contractVersion: 'current-forecast-v2',
    ...resultPreimage,
    inputHash: value.inputHash,
    assumptionsHash: value.plan.assumptionsHash,
    resultHash: canonicalSha256(canonicalizeDecimalLeaves(resultPreimage)),
    unavailableReasons: value.unavailableReasons,
    warnings: value.warnings,
  };
}

function failedForecast(
  input: CurrentForecastV2Input,
  plan: CurrentPlanVersionV1,
  inputHash: string,
  error: unknown
): CurrentForecastV2 {
  const message = error instanceof Error ? error.message : 'Unknown projection failure.';
  const zeroMoney = toFixedDecimalString(ZERO, MONEY_PLACES);
  return {
    contractVersion: 'current-forecast-v2',
    fundId: input.fundId,
    financialFactsSnapshotId: input.financialFactsSnapshotId,
    currentPlanVersionId: input.currentPlanVersionId,
    asOfDate: input.asOfDate,
    status: 'failed',
    series: [],
    remainingDeployableCapitalUsd: zeroMoney,
    committedCapitalUsd: zeroMoney,
    calledToDateUsd: zeroMoney,
    projectedFeesRemainingUsd: zeroMoney,
    recallableDistributionsUsd: zeroMoney,
    uncalledCapitalUsd: zeroMoney,
    netIrr: null,
    inputHash,
    assumptionsHash: plan.assumptionsHash,
    resultHash: null,
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    unavailableReasons: [],
    warnings: [`Projection failed: ${message}`],
  };
}

export function runCohortProjectionV2(
  input: CurrentForecastV2Input,
  plan: CurrentPlanVersionV1,
  facts: FactsWithId
): CurrentForecastV2 {
  validateBasis(input, plan, facts);
  const inputHash = inputHashFor(input);

  try {
    const deployedActual = deployedActualFor(facts);
    const deployableCapital = new Decimal(plan.deployableCapitalUsd);
    const remainingDeployable = Decimal.max(ZERO, deployableCapital.minus(deployedActual));
    const warnings = factsWarnings(facts);

    if (isFactsUnavailable(facts, input.asOfDate)) {
      return finalizeForecast({
        input,
        plan,
        status: 'unavailable',
        internalSeries: [],
        remainingDeployableCapitalUsd: remainingDeployable,
        bridge: bridgeFields(facts, plan, 0, 0),
        inputHash,
        unavailableReasons: [
          {
            code: 'FACTS_UNAVAILABLE',
            detail: 'No cash-flow or mark activity exists at or before the forecast basis date.',
          },
        ],
        warnings,
      });
    }

    const actualPeriods = actualPeriodsFor(facts, input.asOfDate);
    const actualSeries = buildActualSeries(actualPeriods, facts);
    const incompleteStages = missingStageAssumptions(plan);
    if (incompleteStages.length > 0) {
      return finalizeForecast({
        input,
        plan,
        status: 'unavailable',
        internalSeries: actualSeries,
        remainingDeployableCapitalUsd: remainingDeployable,
        bridge: bridgeFields(facts, plan, actualSeries.length, 0),
        inputHash,
        unavailableReasons: [
          {
            code: 'ASSUMPTION_STAGE_INCOMPLETE',
            detail: `Missing exit or graduation assumptions for: ${incompleteStages.join(', ')}.`,
          },
        ],
        warnings,
      });
    }

    const cohorts = buildStageCohorts(plan, remainingDeployable);
    const projectedPeriodCount = projectedPeriodCountFor(plan, remainingDeployable);
    const projectedSeries = buildProjectedSeries(
      actualSeries,
      facts,
      plan,
      deployedActual,
      cohorts,
      projectedPeriodCount
    );
    const hasNeutralProjectedValue =
      cohorts.length > 0 && cohorts.every((cohort) => cohort.terminalMultiple.eq(ONE));

    return finalizeForecast({
      input,
      plan,
      status: hasNeutralProjectedValue ? 'indicative' : 'available',
      internalSeries: [...actualSeries, ...projectedSeries],
      remainingDeployableCapitalUsd: remainingDeployable,
      bridge: bridgeFields(facts, plan, actualSeries.length, projectedPeriodCount),
      inputHash,
      unavailableReasons: [],
      warnings,
    });
  } catch (error) {
    if (error instanceof CurrentForecastBasisMismatchError) throw error;
    return failedForecast(input, plan, inputHash, error);
  }
}
