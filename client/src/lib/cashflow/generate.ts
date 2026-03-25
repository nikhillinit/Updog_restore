import type { CashFlow } from '@/lib/finance/xirr';

export interface FundDataLite {
  fundSize: number;                     // 100% called now
  startDate: Date;
  fundLifeYears: number;                // e.g., 10
  exitSchedule: Array<{ monthOffset: number; amount: number }>; // deterministic exits
}

interface FundDataInput {
  totalCommittedCapital?: string;
  size?: string;
  startDate?: string | Date;
  lifeYears?: string;
  fundLife?: string;
  exitSchedule?: Array<{ monthOffset: number; amount: number }>;
  gpCommitmentPercent?: string;
  carryPercentage?: string;
  preferredReturnRate?: string;
  exitRecycling?: {
    enabled?: boolean;
    recyclePercentage?: number;
    recycleWindowMonths?: number;
  };
}

type NumericLike = string | number | null | undefined;

function firstPresent(...values: NumericLike[]): NumericLike {
  for (const value of values) {
    if (typeof value === 'string') {
      if (value.trim() !== '') {
        return value;
      }
      continue;
    }

    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function parseNumericInput(value: NumericLike, fallback: number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (normalized === '') {
      return fallback;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function parseIntegerInput(value: NumericLike, fallback: number): number {
  return Math.trunc(parseNumericInput(value, fallback));
}

/** Deterministic CFs: one initial contribution + scheduled distributions */
export function generateCashFlowsFromFundLite(d: FundDataLite): CashFlow[] {
  const flows: CashFlow[] = [];
  flows.push({ date: d.startDate, amount: -Math.abs(d.fundSize) });

  for (const e of d.exitSchedule) {
    const dt = new Date(d.startDate);
    dt.setMonth(dt.getMonth() + e.monthOffset);
    flows.push({ date: dt, amount: Math.max(0, e.amount) });
  }
  return flows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Generate sample exit schedule based on fund parameters
 * This creates a realistic distribution of exits over fund life
 */
export function generateSampleExitSchedule(
  fundSize: number,
  fundLifeYears: number,
  targetMultiple: number = 2.5
): Array<{ monthOffset: number; amount: number }> {
  const totalReturns = fundSize * targetMultiple;
  const exitSchedule: Array<{ monthOffset: number; amount: number }> = [];
  
  // Early years (3-5): small exits (failed/early exits)
  // Middle years (5-8): major exits
  // Late years (8-10): final harvesting
  
  const distributions = [
    { yearOffset: 3, percent: 0.05 },
    { yearOffset: 4, percent: 0.08 },
    { yearOffset: 5, percent: 0.15 },
    { yearOffset: 6, percent: 0.20 },
    { yearOffset: 7, percent: 0.25 },
    { yearOffset: 8, percent: 0.15 },
    { yearOffset: 9, percent: 0.08 },
    { yearOffset: 10, percent: 0.04 },
  ];
  
  distributions.forEach(({ yearOffset, percent }) => {
    if (yearOffset <= fundLifeYears) {
      exitSchedule.push({
        monthOffset: yearOffset * 12,
        amount: totalReturns * percent
      });
    }
  });
  
  return exitSchedule;
}

/**
 * Convert fund data from wizard format to cash flows
 */
export function convertFundDataToCashFlows(fundData: FundDataInput): CashFlow[] {
  const fundSize = parseNumericInput(
    firstPresent(fundData.totalCommittedCapital, fundData.size),
    0
  );
  const startDate = new Date(fundData.startDate || new Date());
  const fundLifeYears = parseIntegerInput(
    firstPresent(fundData.lifeYears, fundData.fundLife),
    10
  );
  const exitSchedule = fundData.exitSchedule || generateSampleExitSchedule(fundSize, fundLifeYears);

  return generateCashFlowsFromFundLite({
    fundSize,
    startDate,
    fundLifeYears,
    exitSchedule
  });
}

/**
 * Generate waterfall inputs from fund data
 */
export function generateWaterfallInputs(fundData: FundDataInput) {
  const fundSize = parseNumericInput(
    firstPresent(fundData.totalCommittedCapital, fundData.size),
    0
  );
  const carryPercent = parseNumericInput(fundData.carryPercentage, 20) / 100;

  const contributions = [
    { quarter: 1, amount: fundSize * 0.25 },
    { quarter: 2, amount: fundSize * 0.25 },
    { quarter: 3, amount: fundSize * 0.25 },
    { quarter: 4, amount: fundSize * 0.25 },
  ];
  
  const exitSchedule =
    fundData.exitSchedule ||
    generateSampleExitSchedule(
      fundSize,
      parseIntegerInput(firstPresent(fundData.lifeYears, fundData.fundLife), 10)
    );

  const exits = exitSchedule.map((exit) => ({
    quarter: Math.floor(exit.monthOffset / 3) || 1, // Convert months to quarters
    grossProceeds: exit.amount,
  }));

  const config = {
    carryPct: carryPercent,
    hurdleRate: parseNumericInput(fundData.preferredReturnRate, 0) / 100,
    recyclingEnabled: fundData.exitRecycling?.enabled ?? false,
    recyclingCapPctOfCommitted: (fundData.exitRecycling?.recyclePercentage ?? 0) / 100,
    recyclingWindowQuarters: (fundData.exitRecycling?.recycleWindowMonths ?? 0) / 3,
    recyclingTakePctPerEvent: 0.5, // Conservative default
  };

  return { config, contributions, exits };
}
