/**
 * Capital Calculations Utility
 *
 * Provides calculations for:
 * - Net investable capital from fund financials
 * - Capital utilization tracking
 * - Allocation validation
 */


export interface YearlyProjection {
  year: number;
  calledCapital: number;
  gpCashCommitment: number;
  gpCashlessCommitment: number;
  managementFeeRate: number;
  managementFeeAfterCashless: number;
}

/**
 * Calculate net investable capital from fund financials
 *
 * Net Investable Capital = Fund Size - Org Expense - Total Mgmt Fees - Total GP Cash
 */
export function calculateNetInvestableCapital(
  fundSize: number,
  organizationExpense: number,
  projections: Array<{
    managementFeeAfterCashless: number;
    gpCashCommitment: number;
  }>
): number {
  const totalManagementFees = projections.reduce(
    (sum, p) => sum + p.managementFeeAfterCashless,
    0
  );
  const totalGPCash = projections.reduce(
    (sum, p) => sum + p.gpCashCommitment,
    0
  );

  return fundSize - organizationExpense - totalManagementFees - totalGPCash;
}

/**
 * Calculate capital utilization percentage
 *
 * Utilization = (Invested + Reserved) / Net Investable Capital * 100
 */
export function calculateCapitalUtilization(
  totalInvested: number,
  totalReserves: number,
  netInvestableCapital: number
): number {
  if (netInvestableCapital === 0) return 0;
  return ((totalInvested + totalReserves) / netInvestableCapital) * 100;
}

/**
 * Validate capital allocation doesn't exceed available capital
 *
 * Returns validation result with error details if over-allocated
 */
export function validateCapitalAllocation(
  totalInvested: number,
  netInvestableCapital: number
): { valid: boolean; error?: string; excess?: number } {
  if (totalInvested > netInvestableCapital) {
    const excess = totalInvested - netInvestableCapital;
    return {
      valid: false,
      error: `Portfolio exceeds net investable capital by ${formatCurrency(excess)}`,
      excess
    };
  }
  return { valid: true };
}

/**
 * Format currency for display
 * Internal wrapper around formatUSD utility
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Capital call schedule types
 */
export type CapitalCallScheduleType = 'even' | 'front-loaded' | 'back-loaded' | 'custom';

/**
 * Get capital call distribution percentages for a given schedule type
 */
export function getSchedulePattern(
  type: CapitalCallScheduleType,
  investmentPeriod: number,
  customSchedule?: Array<{ year: number; percentage: number }>
): number[] {
  const pattern: number[] = new Array(investmentPeriod).fill(0);

  switch (type) {
    case 'even':
      // Equal distribution
      pattern.fill(100 / investmentPeriod);
      break;

    case 'front-loaded':
      // 40-30-20-10 pattern (or scaled equivalent)
      if (investmentPeriod === 3) {
        return [50, 30, 20];
      } else if (investmentPeriod === 4) {
        return [40, 30, 20, 10];
      } else if (investmentPeriod === 5) {
        return [35, 25, 20, 12, 8];
      } else {
        // Default front-loaded: decreasing by ~7-10% each year
        let remaining = 100;
        for (let i = 0; i < investmentPeriod; i++) {
          const pct = remaining / (investmentPeriod - i) * 1.3;
          pattern[i] = Math.min(pct, remaining);
          remaining -= pattern[i];
        }
      }
      break;

    case 'back-loaded':
      // Opposite of front-loaded: 10-20-30-40 pattern
      const frontLoaded = getSchedulePattern('front-loaded', investmentPeriod);
      return frontLoaded.reverse();

    case 'custom':
      if (!customSchedule) {
        throw new Error('Custom schedule requires customSchedule parameter');
      }
      // Map custom schedule to pattern array
      for (const item of customSchedule) {
        if (item.year >= 1 && item.year <= investmentPeriod) {
          pattern[item.year - 1] = item.percentage;
        }
      }
      break;
  }

  return pattern;
}

/**
 * Calculate 10-year projections based on fund financials
 */
export function calculateProjections(data: {
  targetFundSize: number;
  investmentPeriod: number;
  gpCommitment: number;
  cashlessSplit: number;
  managementFeeRate: number;
  stepDownEnabled: boolean;
  stepDownYear?: number;
  stepDownRate?: number;
  scheduleType?: CapitalCallScheduleType;
  customSchedule?: Array<{ year: number; percentage: number }>;
  additionalExpenses?: Array<{
    id: string;
    name: string;
    amount: number;
    type?: 'one-time' | 'annual';
    description?: string;
    year?: number;
  }>;
}): YearlyProjection[] {
  const projections: YearlyProjection[] = [];

  // Get capital call schedule pattern
  const scheduleType = data.scheduleType || 'even';
  const schedule = getSchedulePattern(
    scheduleType,
    data.investmentPeriod,
    data.customSchedule
  );

  for (let year = 1; year <= 10; year++) {
    const isInvestmentPeriod = year <= data.investmentPeriod;

    // Calculate called capital based on schedule
    let calledCapital = 0;
    if (isInvestmentPeriod) {
      const yearIndex = year - 1;
      const percentage = schedule[yearIndex] / 100;
      calledCapital = data.targetFundSize * percentage;
    }

    // Calculate GP commitment split
    const gpCashCommitment = calledCapital * (data.gpCommitment / 100) * ((100 - data.cashlessSplit) / 100);
    const gpCashlessCommitment = calledCapital * (data.gpCommitment / 100) * (data.cashlessSplit / 100);

    // Determine management fee rate (with step-down)
    const managementFeeRate = (data.stepDownEnabled && year >= (data.stepDownYear || 6))
      ? (data.stepDownRate || data.managementFeeRate)
      : data.managementFeeRate;

    // Calculate management fee after cashless capital
    const managementFeeAfterCashless = (calledCapital - gpCashlessCommitment) * (managementFeeRate / 100);

    projections.push({
      year,
      calledCapital,
      gpCashCommitment,
      gpCashlessCommitment,
      managementFeeRate,
      managementFeeAfterCashless
    });
  }

  return projections;
}
