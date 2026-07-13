import Decimal from '../../../shared/lib/decimal-config';
import {
  AllocationCompanyActualsDriftV1Schema,
  type AllocationCompanyActualsDriftV1,
  type AllocationDriftComparisonV1,
} from '../../../shared/contracts/allocations/allocation-actuals-drift-v1.contract';
import type { FundCompanyActualsFact } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const CENTS_PER_UNIT = new Decimal(100);
const MATERIALITY_ABSOLUTE_FLOOR_CENTS = new Decimal(100_000);
const MATERIALITY_RELATIVE_RATE = new Decimal('0.01');
const MAX_DECIMAL_PLACES = 6;

type AllocationDriftBasis = AllocationDriftComparisonV1['basis'];
type UnavailableReason = NonNullable<AllocationDriftComparisonV1['unavailableReason']>;

export interface AllocationPlanRow {
  companyId: number;
  deployedReservesCents: number;
  investmentAmount: string;
  allocationVersion: number;
  lastAllocationAt: Date | string | null;
}

interface ActualCents {
  cents: Decimal;
  subCentRemainder: string | null;
}

function decimalString(value: Decimal): string {
  return value.toDecimalPlaces(MAX_DECIMAL_PLACES, Decimal.ROUND_HALF_UP).toString();
}

function integerCentString(value: Decimal): string {
  return value.toFixed(0);
}

function dollarsToCents(value: string): Decimal {
  return new Decimal(value).times(CENTS_PER_UNIT).toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

function actualDollarsToCents(value: Decimal): ActualCents {
  const exactCents = value.times(CENTS_PER_UNIT);
  const cents = exactCents.toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const remainder = exactCents.minus(cents);

  return {
    cents,
    subCentRemainder: remainder.isZero() ? null : decimalString(remainder),
  };
}

function lastAllocationAt(value: AllocationPlanRow['lastAllocationAt']): string | null {
  if (value === null) {
    return null;
  }
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function planCentsForBasis(allocation: AllocationPlanRow, basis: AllocationDriftBasis): Decimal {
  if (basis === 'deployed_reserves_vs_observed_follow_on') {
    return new Decimal(allocation.deployedReservesCents.toString());
  }
  return dollarsToCents(allocation.investmentAmount);
}

function unavailableComparison(
  allocation: AllocationPlanRow,
  basis: AllocationDriftBasis,
  unavailableReason: UnavailableReason
): AllocationDriftComparisonV1 {
  return {
    basis,
    state: 'unavailable',
    planCents: integerCentString(planCentsForBasis(allocation, basis)),
    actualCents: null,
    deltaCents: null,
    relativeDelta: null,
    material: false,
    subCentRemainder: null,
    unavailableReason,
  };
}

function comparison(
  allocation: AllocationPlanRow,
  basis: AllocationDriftBasis,
  actual: ActualCents
): AllocationDriftComparisonV1 {
  const planCents = planCentsForBasis(allocation, basis);
  const deltaCents = actual.cents.minus(planCents);
  const relativeDelta = planCents.isZero() ? null : decimalString(deltaCents.div(planCents));
  const materialityThreshold = Decimal.max(
    MATERIALITY_ABSOLUTE_FLOOR_CENTS,
    planCents.abs().times(MATERIALITY_RELATIVE_RATE)
  );

  return {
    basis,
    state: deltaCents.isZero() ? 'exact' : 'drifted',
    planCents: integerCentString(planCents),
    actualCents: integerCentString(actual.cents),
    deltaCents: integerCentString(deltaCents),
    relativeDelta,
    material: deltaCents.abs().gte(materialityThreshold),
    subCentRemainder: actual.subCentRemainder,
    unavailableReason: null,
  };
}

function unavailableDrift(input: {
  allocation: AllocationPlanRow;
  fact: FundCompanyActualsFact | null;
  asOfDate: string;
  reason: UnavailableReason;
  trustState: AllocationCompanyActualsDriftV1['trustState'];
}): AllocationCompanyActualsDriftV1 {
  const { allocation, fact } = input;

  return AllocationCompanyActualsDriftV1Schema.parse({
    contractVersion: 'allocation-actuals-drift-v1',
    companyId: allocation.companyId,
    asOfDate: input.asOfDate,
    allocationVersion: allocation.allocationVersion,
    lastAllocationAt: lastAllocationAt(allocation.lastAllocationAt),
    factsInputHash: fact?.inputHash ?? null,
    trustState: input.trustState,
    planningFmvStatus: fact?.planningFmvStatus ?? 'none',
    currencyStatus: fact?.currencyStatus ?? 'unknown',
    activeRoundIds: fact?.activeRoundIds ?? [],
    supersedeLineage: fact?.supersedeLineage ?? [],
    comparisons: [
      unavailableComparison(allocation, 'deployed_reserves_vs_observed_follow_on', input.reason),
      unavailableComparison(allocation, 'legacy_invested_vs_observed_total', input.reason),
    ],
    warnings: fact?.warnings ?? [],
  });
}

export function buildAllocationActualsDrift(input: {
  allocation: AllocationPlanRow;
  fact: FundCompanyActualsFact | null;
  asOfDate: string;
}): AllocationCompanyActualsDriftV1 {
  if (input.fact === null) {
    return unavailableDrift({
      ...input,
      reason: 'facts_missing',
      trustState: 'UNAVAILABLE',
    });
  }

  if (input.fact.currencyStatus === 'mismatch_blocked') {
    return unavailableDrift({
      ...input,
      reason: 'currency_blocked',
      trustState: input.fact.provenance.trustState,
    });
  }

  const observedFollowOn = actualDollarsToCents(new Decimal(input.fact.followOnInvestmentAmount));
  const observedTotal = actualDollarsToCents(
    new Decimal(input.fact.initialInvestmentAmount).plus(input.fact.followOnInvestmentAmount)
  );

  return AllocationCompanyActualsDriftV1Schema.parse({
    contractVersion: 'allocation-actuals-drift-v1',
    companyId: input.allocation.companyId,
    asOfDate: input.asOfDate,
    allocationVersion: input.allocation.allocationVersion,
    lastAllocationAt: lastAllocationAt(input.allocation.lastAllocationAt),
    factsInputHash: input.fact.inputHash,
    trustState: input.fact.provenance.trustState,
    planningFmvStatus: input.fact.planningFmvStatus,
    currencyStatus: input.fact.currencyStatus,
    activeRoundIds: input.fact.activeRoundIds,
    supersedeLineage: input.fact.supersedeLineage,
    comparisons: [
      comparison(input.allocation, 'deployed_reserves_vs_observed_follow_on', observedFollowOn),
      comparison(input.allocation, 'legacy_invested_vs_observed_total', observedTotal),
    ],
    warnings: input.fact.warnings,
  });
}

export function buildFailedAllocationActualsDrift(input: {
  allocation: AllocationPlanRow;
  asOfDate: string;
}): AllocationCompanyActualsDriftV1 {
  return unavailableDrift({
    ...input,
    fact: null,
    reason: 'facts_failed',
    trustState: 'FAILED',
  });
}
