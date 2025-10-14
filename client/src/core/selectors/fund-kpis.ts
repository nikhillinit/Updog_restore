/**
 * Fund KPI Selectors
 *
 * Pure selector functions for calculating VC fund Key Performance Indicators (KPIs).
 * All functions are designed to be composable, testable, and free of side effects.
 *
 * KPIs Implemented:
 * - Committed Capital: Total LP commitments
 * - Called Capital: Capital drawn from LPs via capital calls
 * - Uncalled Capital: Remaining callable capital (committed - called)
 * - Invested Capital: Capital deployed into portfolio companies
 * - NAV (Net Asset Value): Current portfolio value + cash - liabilities
 * - DPI (Distributions to Paid-In): Total distributions / called capital
 * - TVPI (Total Value to Paid-In): (Distributions + NAV) / called capital
 * - IRR (Internal Rate of Return): Time-weighted return using XIRR
 *
 * @module fund-kpis
 */

import type {
  FundData,
  FundKPIs,
  Investment,
  Valuation,
  CashFlowEvent,
} from '../types/fund-domain';
import { calculateXIRR, XIRRCalculationError } from './xirr';

/**
 * Filter items by date ("as of" snapshot)
 *
 * @param items - Array of items with date properties
 * @param dateField - Name of the date field to filter on
 * @param asOf - Optional cutoff date (ISO string)
 * @returns Filtered array of items on or before asOf date
 */
function filterByDate<T extends { [K in keyof T]: T[K] }>(
  items: T[],
  dateField: keyof T,
  asOf?: string
): T[] {
  if (!asOf) return items;

  const cutoffDate = new Date(asOf);
  return items.filter((item) => {
    const fieldValue = item[dateField];
    // Field should be a string date
    if (typeof fieldValue !== 'string') return true;
    const itemDate = new Date(fieldValue);
    return itemDate <= cutoffDate;
  });
}

/**
 * Select committed capital
 *
 * Total committed capital is the fund size - the total amount LPs have committed to invest.
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Committed capital amount
 *
 * @example
 * ```typescript
 * const committed = selectCommitted(fundData); // 100000000 ($100M fund)
 * ```
 */
export function selectCommitted(data: FundData, asOf?: string): number {
  // Fund size is the total committed capital
  // For historical snapshots, we assume fund size doesn't change
  // (In reality, you might have closes at different times, but that's beyond scope)
  return data.fund.size;
}

/**
 * Select called capital (capital drawn from LPs)
 *
 * Sum of all capital calls that have been issued and received.
 * Only includes calls with status 'received' or 'partial' (with actual amounts).
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Total called capital amount
 *
 * @example
 * ```typescript
 * const called = selectCalled(fundData); // 60000000 ($60M called)
 * const calledHistorical = selectCalled(fundData, '2023-12-31');
 * ```
 */
export function selectCalled(data: FundData, asOf?: string): number {
  const relevantCalls = filterByDate(data.capitalCalls, 'callDate', asOf);

  return relevantCalls
    .filter((call) => call.status === 'received' || call.status === 'partial')
    .reduce((total, call) => total + call.amount, 0);
}

/**
 * Select uncalled capital (remaining callable capital)
 *
 * Difference between committed and called capital.
 * This is the "dry powder" available for future capital calls.
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Uncalled capital amount
 *
 * @example
 * ```typescript
 * const uncalled = selectUncalled(fundData); // 40000000 ($40M remaining)
 * ```
 */
export function selectUncalled(data: FundData, asOf?: string): number {
  const committed = selectCommitted(data, asOf);
  const called = selectCalled(data, asOf);
  return committed - called;
}

/**
 * Select invested capital (deployed to portfolio companies)
 *
 * Sum of all capital deployed into portfolio companies through initial
 * investments and follow-on rounds.
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Total invested capital amount
 *
 * @example
 * ```typescript
 * const invested = selectInvested(fundData); // 55000000 ($55M invested)
 * ```
 */
export function selectInvested(data: FundData, asOf?: string): number {
  const relevantInvestments = filterByDate(data.investments, 'investmentDate', asOf);

  return relevantInvestments
    .filter((inv) => inv.isActive || inv.exitDate) // Include active and exited investments
    .reduce((total, inv) => total + inv.totalInvested, 0);
}

/**
 * Select latest valuation for an investment
 *
 * Returns the most recent valuation for an investment as of the given date.
 * If investment has exited, uses exit amount. Otherwise uses latest fair value.
 *
 * @param investment - Investment to get valuation for
 * @param valuations - All valuations
 * @param asOf - Optional "as of" date
 * @returns Current value of the investment
 */
function selectInvestmentValue(
  investment: Investment,
  valuations: Valuation[],
  asOf?: string
): number {
  // If investment has exited, use exit amount (if exit was before asOf)
  if (investment.exitDate && investment.exitAmount !== undefined) {
    const exitDate = new Date(investment.exitDate);
    const cutoffDate = asOf ? new Date(asOf) : new Date();

    if (exitDate <= cutoffDate) {
      return investment.exitAmount;
    }
  }

  // Otherwise, find latest valuation for this investment
  const relevantValuations = valuations
    .filter((v) => v.investmentId === investment.id)
    .filter((v) => !asOf || new Date(v.valuationDate) <= new Date(asOf))
    .sort((a, b) => new Date(b.valuationDate).getTime() - new Date(a.valuationDate).getTime());

  if (relevantValuations.length > 0) {
    return relevantValuations[0]!.fairValue;
  }

  // No valuation found - use cost basis (total invested)
  return investment.totalInvested;
}

/**
 * Select total distributions (cash returned to LPs)
 *
 * Sum of all distributions paid to LPs.
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Total distributions amount
 *
 * @example
 * ```typescript
 * const distributions = selectDistributions(fundData); // 15000000 ($15M distributed)
 * ```
 */
export function selectDistributions(data: FundData, asOf?: string): number {
  const relevantDistributions = filterByDate(data.distributions, 'distributionDate', asOf);

  return relevantDistributions
    .filter((dist) => dist.status === 'executed')
    .reduce((total, dist) => total + dist.amount, 0);
}

/**
 * Select NAV (Net Asset Value)
 *
 * Current value of the fund's portfolio:
 * NAV = Portfolio Value + Cash - Liabilities
 *
 * Where:
 * - Portfolio Value = Sum of latest valuations for all investments
 * - Cash = Called capital - Invested capital - Fees paid
 * - Liabilities = Fees owed but not yet paid
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Net Asset Value
 *
 * @example
 * ```typescript
 * const nav = selectNAV(fundData); // 75000000 ($75M NAV)
 * ```
 */
export function selectNAV(data: FundData, asOf?: string): number {
  const relevantInvestments = filterByDate(data.investments, 'investmentDate', asOf);

  // Calculate portfolio value (sum of current investment values)
  const portfolioValue = relevantInvestments
    .filter((inv) => inv.isActive || (inv.exitDate && (!asOf || new Date(inv.exitDate) <= new Date(asOf))))
    .reduce((total, inv) => {
      return total + selectInvestmentValue(inv, data.valuations, asOf);
    }, 0);

  // Calculate cash position
  const called = selectCalled(data, asOf);
  const invested = selectInvested(data, asOf);
  const distributions = selectDistributions(data, asOf);

  // Calculate fees paid
  const relevantFees = filterByDate(data.feeExpenses, 'expenseDate', asOf);
  const feesPaid = relevantFees
    .filter((fee) => fee.isPaid)
    .reduce((total, fee) => total + fee.amount, 0);

  // Cash = Called - Invested - Distributions - Fees Paid
  const cash = called - invested - distributions - feesPaid;

  // For simplicity, we don't track liabilities separately
  // In production, you'd want to include accrued fees and other payables
  const liabilities = 0;

  // NAV = Portfolio Value + Cash - Liabilities
  return portfolioValue + cash - liabilities;
}

/**
 * Select DPI (Distributions to Paid-In Capital)
 *
 * DPI = Total Distributions / Called Capital
 *
 * Measures cash-on-cash returns. A DPI of 1.5x means LPs have received
 * 150% of their called capital back in distributions.
 *
 * Returns 0 if called capital is 0 (avoid division by zero).
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns DPI multiple
 *
 * @example
 * ```typescript
 * const dpi = selectDPI(fundData); // 0.25 (0.25x - 25% of called capital returned)
 * ```
 */
export function selectDPI(data: FundData, asOf?: string): number {
  const distributions = selectDistributions(data, asOf);
  const called = selectCalled(data, asOf);

  if (called === 0) return 0;

  return distributions / called;
}

/**
 * Select TVPI (Total Value to Paid-In Capital)
 *
 * TVPI = (Total Distributions + NAV) / Called Capital
 *
 * Measures total value creation including both realized (distributions)
 * and unrealized (NAV) returns. A TVPI of 2.5x means the fund has created
 * 2.5x the called capital in total value.
 *
 * Returns 0 if called capital is 0 (avoid division by zero).
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns TVPI multiple
 *
 * @example
 * ```typescript
 * const tvpi = selectTVPI(fundData); // 1.75 (1.75x total value)
 * ```
 */
export function selectTVPI(data: FundData, asOf?: string): number {
  const distributions = selectDistributions(data, asOf);
  const nav = selectNAV(data, asOf);
  const called = selectCalled(data, asOf);

  if (called === 0) return 0;

  return (distributions + nav) / called;
}

/**
 * Build cash flow events for IRR calculation
 *
 * Creates chronological series of cash flows:
 * - Outflows: Capital calls (negative)
 * - Inflows: Distributions (positive)
 * - Final inflow: Current NAV (only if asOf not provided, representing current value)
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Array of cash flow events
 */
function buildCashFlows(data: FundData, asOf?: string): CashFlowEvent[] {
  const cashFlows: CashFlowEvent[] = [];

  // Add capital calls (outflows)
  const relevantCalls = filterByDate(data.capitalCalls, 'callDate', asOf)
    .filter((call) => call.status === 'received' || call.status === 'partial');

  for (const call of relevantCalls) {
    cashFlows.push({
      date: call.callDate,
      amount: -call.amount, // Negative for outflow
      type: 'capital_call',
    });
  }

  // Add distributions (inflows)
  const relevantDistributions = filterByDate(data.distributions, 'distributionDate', asOf)
    .filter((dist) => dist.status === 'executed');

  for (const dist of relevantDistributions) {
    cashFlows.push({
      date: dist.distributionDate,
      amount: dist.amount, // Positive for inflow
      type: 'distribution',
    });
  }

  // If calculating current IRR (no asOf), add current NAV as final inflow
  if (!asOf) {
    const nav = selectNAV(data);
    if (nav > 0) {
      cashFlows.push({
        date: new Date().toISOString(),
        amount: nav,
        type: 'distribution', // Treat NAV as hypothetical distribution
      });
    }
  } else {
    // For historical IRR, add NAV as of that date
    const nav = selectNAV(data, asOf);
    if (nav > 0) {
      cashFlows.push({
        date: asOf,
        amount: nav,
        type: 'distribution',
      });
    }
  }

  return cashFlows;
}

/**
 * Select IRR (Internal Rate of Return)
 *
 * Calculates the annualized time-weighted return using XIRR.
 * IRR considers both the timing and magnitude of cash flows.
 *
 * Returns 0 if:
 * - Insufficient cash flows for calculation (< 2 flows)
 * - All cash flows are same sign (no investments or no returns)
 * - XIRR calculation fails to converge
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns IRR as decimal (e.g., 0.25 = 25% annualized)
 *
 * @example
 * ```typescript
 * const irr = selectIRR(fundData); // 0.28 (28% annualized IRR)
 * const irrFormatted = `${(irr * 100).toFixed(1)}%`; // "28.0%"
 * ```
 */
export function selectIRR(data: FundData, asOf?: string): number {
  try {
    const cashFlows = buildCashFlows(data, asOf);

    // Need at least 2 cash flows for IRR
    if (cashFlows.length < 2) {
      return 0;
    }

    const result = calculateXIRR(cashFlows);
    return result.converged ? result.rate : 0;
  } catch (error) {
    // XIRR calculation failed (invalid cash flows, no convergence, etc.)
    if (error instanceof XIRRCalculationError) {
      console.warn('IRR calculation failed:', error.message);
    }
    return 0;
  }
}

/**
 * Select all KPIs at once
 *
 * Convenience function to calculate all KPIs in a single call.
 * More efficient than calling each selector individually if you need all KPIs.
 *
 * @param data - Fund data
 * @param asOf - Optional "as of" date for historical snapshots
 * @returns Complete KPI snapshot
 *
 * @example
 * ```typescript
 * const kpis = selectAllKPIs(fundData);
 * console.log(`Fund Performance:
 *   TVPI: ${kpis.tvpi.toFixed(2)}x
 *   DPI: ${kpis.dpi.toFixed(2)}x
 *   IRR: ${(kpis.irr * 100).toFixed(1)}%
 *   NAV: $${(kpis.nav / 1e6).toFixed(1)}M
 * `);
 * ```
 */
export function selectAllKPIs(data: FundData, asOf?: string): FundKPIs {
  const committed = selectCommitted(data, asOf);
  const called = selectCalled(data, asOf);
  const uncalled = selectUncalled(data, asOf);
  const invested = selectInvested(data, asOf);
  const nav = selectNAV(data, asOf);
  const dpi = selectDPI(data, asOf);
  const tvpi = selectTVPI(data, asOf);
  const irr = selectIRR(data, asOf);

  return {
    committed,
    called,
    uncalled,
    invested,
    nav,
    dpi,
    tvpi,
    irr,
    calculatedAt: new Date().toISOString(),
    ...(asOf !== undefined ? { asOf } : {}),
  };
}

/**
 * Format KPI for display
 *
 * @param value - KPI value
 * @param type - Type of KPI for appropriate formatting
 * @returns Formatted string
 */
export function formatKPI(
  value: number,
  type: 'currency' | 'multiple' | 'percentage'
): string {
  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'multiple':
      return `${value.toFixed(2)}x`;
    case 'percentage':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return value.toString();
  }
}
