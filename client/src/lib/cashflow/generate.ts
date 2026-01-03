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
  const fundSize = parseFloat(fundData.totalCommittedCapital?.replace(/,/g, '') || fundData.size || '0');
  const startDate = new Date(fundData.startDate || new Date());
  const fundLifeYears = parseInt(fundData.lifeYears || fundData.fundLife || '10');
  
  // Generate a sample exit schedule if not provided
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
  const fundSize = parseFloat(fundData.totalCommittedCapital?.replace(/,/g, '') || fundData.size || '0');
  const _gpCommitmentPercent = parseFloat(fundData.gpCommitmentPercent || '2') / 100;
  const carryPercent = parseFloat(fundData.carryPercentage || '20') / 100;
  
  // Simple contribution schedule - can be enhanced later
  const contributions = [
    { quarter: 1, amount: fundSize * 0.25 },
    { quarter: 2, amount: fundSize * 0.25 },
    { quarter: 3, amount: fundSize * 0.25 },
    { quarter: 4, amount: fundSize * 0.25 },
  ];
  
  // Generate exits based on exit schedule
  const exitSchedule = fundData.exitSchedule || generateSampleExitSchedule(fundSize, 
    parseInt(fundData.lifeYears || '10'));
  
  const exits = exitSchedule.map(exit => ({
    quarter: Math.floor(exit.monthOffset / 3) || 1, // Convert months to quarters
    grossProceeds: exit.amount
  }));
  
  const config = {
    carryPct: carryPercent,
    hurdleRate: parseFloat(fundData.preferredReturnRate || '0') / 100,
    recyclingEnabled: fundData.exitRecycling?.enabled || false,
    recyclingCapPctOfCommitted: (fundData.exitRecycling?.recyclePercentage || 0) / 100,
    recyclingWindowQuarters: (fundData.exitRecycling?.recycleWindowMonths || 0) / 3,
    recyclingTakePctPerEvent: 0.5 // Conservative default
  };
  
  return { config, contributions, exits };
}