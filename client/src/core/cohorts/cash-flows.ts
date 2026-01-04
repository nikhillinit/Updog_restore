/**
 * Cash Flow Events Stream
 *
 * Generates cash flow events from lots for IRR/TVPI/DPI calculations.
 * Events are attributed to cohorts and sectors for aggregation.
 */

import type { CashFlowEvent, ResolvedInvestment, CompanyCohortKey, CohortUnit } from '@shared/types';

/**
 * Lot data for cash flow generation
 */
export interface LotData {
  id: string;
  investmentId: number;
  lotType: 'initial' | 'follow_on' | 'secondary';
  sharePriceCents: bigint;
  sharesAcquired: string;
  costBasisCents: bigint;
  acquisitionDate?: Date;
  disposalDate?: Date;
  disposalProceeds?: number;
  remainingShares?: number;
  currentPricePerShare?: number;
}

/**
 * Input for cash flow event generation
 */
export interface CashFlowInput {
  lots: LotData[];
  resolvedInvestments: ResolvedInvestment[];
  companyCohortKeys: CompanyCohortKey[];
  unit: CohortUnit;
  asOfDate?: Date | undefined;
}

/**
 * Converts cents to dollars
 */
function centsToDollars(cents: bigint): number {
  return Number(cents) / 100;
}

/**
 * Generates cash flow events from lots
 *
 * @param input Cash flow input data
 * @returns Array of cash flow events
 */
export function getCashFlowEvents(input: CashFlowInput): CashFlowEvent[] {
  const { lots, resolvedInvestments, companyCohortKeys, unit, asOfDate } = input;
  const events: CashFlowEvent[] = [];

  // Build lookup maps
  const investmentMap = new Map<number, ResolvedInvestment>();
  for (const inv of resolvedInvestments) {
    investmentMap.set(inv.investmentId, inv);
  }

  const companyCohortMap = new Map<number, CompanyCohortKey>();
  for (const ck of companyCohortKeys) {
    companyCohortMap.set(ck.companyId, ck);
  }

  for (const lot of lots) {
    const investment = investmentMap.get(lot.investmentId);
    if (!investment) {
      continue; // Skip lots without matching investment
    }

    // Skip excluded investments
    if (investment.companyExcluded || investment.investmentExcluded) {
      continue;
    }

    // Determine cohort key based on unit
    let cohortKey: string | null;
    if (unit === 'company') {
      const companyCohort = companyCohortMap.get(investment.companyId);
      cohortKey = companyCohort?.companyCohortKey ?? null;
    } else {
      cohortKey = investment.resolvedVintageKey;
    }

    if (!cohortKey) {
      continue; // Skip if no cohort key
    }

    // Generate paid-in event (cost basis as negative cash flow)
    const acquisitionDate = lot.acquisitionDate ?? investment.investmentDate;
    if (acquisitionDate && lot.costBasisCents > 0) {
      events.push({
        date: acquisitionDate,
        amount: -centsToDollars(lot.costBasisCents), // Negative = paid-in
        investmentId: investment.investmentId,
        companyId: investment.companyId,
        lotId: lot.id,
        cohortKey,
        sectorId: investment.canonicalSectorId,
        eventType: 'paid_in',
      });
    }

    // Generate distribution event (disposal proceeds as positive cash flow)
    if (lot.disposalDate && lot.disposalProceeds && lot.disposalProceeds > 0) {
      events.push({
        date: lot.disposalDate,
        amount: lot.disposalProceeds, // Positive = distribution
        investmentId: investment.investmentId,
        companyId: investment.companyId,
        lotId: lot.id,
        cohortKey,
        sectorId: investment.canonicalSectorId,
        eventType: 'distribution',
      });
    }

    // Generate residual value event (if marks available and as-of date provided)
    if (
      asOfDate &&
      lot.remainingShares !== undefined &&
      lot.remainingShares > 0 &&
      lot.currentPricePerShare !== undefined
    ) {
      const residualValue = lot.remainingShares * lot.currentPricePerShare;
      events.push({
        date: asOfDate,
        amount: residualValue,
        investmentId: investment.investmentId,
        companyId: investment.companyId,
        lotId: lot.id,
        cohortKey,
        sectorId: investment.canonicalSectorId,
        eventType: 'residual',
      });
    }
  }

  return events;
}

/**
 * Groups cash flow events by cohort and sector
 *
 * @param events Cash flow events
 * @returns Map of (cohortKey, sectorId) to events
 */
export function groupEventsByCohortSector(
  events: CashFlowEvent[]
): Map<string, CashFlowEvent[]> {
  const groups = new Map<string, CashFlowEvent[]>();

  for (const event of events) {
    const key = `${event.cohortKey}:${event.sectorId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return groups;
}

/**
 * Aggregates cash flows by date for XIRR calculation
 *
 * @param events Cash flow events
 * @returns Array of {date, amount} sorted by date
 */
export function aggregateCashFlowsByDate(
  events: CashFlowEvent[]
): Array<{ date: Date; amount: number }> {
  const dateMap = new Map<string, { date: Date; amount: number }>();

  for (const event of events) {
    const dateKey = event.date.toISOString().split('T')[0] ?? '';
    const existing = dateMap.get(dateKey);
    if (existing) {
      existing.amount += event.amount;
    } else {
      dateMap.set(dateKey, { date: event.date, amount: event.amount });
    }
  }

  return Array.from(dateMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

/**
 * Calculates totals from cash flow events
 *
 * @param events Cash flow events
 * @returns Paid-in, distributions, and residual totals
 */
export function calculateCashFlowTotals(events: CashFlowEvent[]): {
  paidIn: number;
  distributions: number;
  residualValue: number;
} {
  let paidIn = 0;
  let distributions = 0;
  let residualValue = 0;

  for (const event of events) {
    if (event.eventType === 'paid_in') {
      paidIn += Math.abs(event.amount);
    } else if (event.eventType === 'distribution') {
      distributions += event.amount;
    } else if (event.eventType === 'residual') {
      residualValue += event.amount;
    }
  }

  return { paidIn, distributions, residualValue };
}

/**
 * Checks if cash flows have residual value data
 *
 * @param events Cash flow events
 * @returns true if any residual events exist
 */
export function hasResidualValue(events: CashFlowEvent[]): boolean {
  return events.some((e) => e.eventType === 'residual');
}
