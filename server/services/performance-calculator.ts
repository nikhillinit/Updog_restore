/**
 * Performance Calculator Service
 *
 * Provides calculation logic for Portfolio Performance Dashboard endpoints:
 * - Time-series metrics with interpolation
 * - Breakdown by sector/stage/company
 * - Point-in-time comparisons
 *
 * @module server/services/performance-calculator
 */

import { db } from '../db';
import { storage } from '../storage';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { fundMetrics, portfolioCompanies, fundDistributions } from '@shared/schema';
import { xirrNewtonBisection, type CashFlow as XirrCashFlow } from '@shared/lib/finance/xirr';
import type {
  TimeseriesPoint,
  BreakdownGroup,
  BreakdownTotals,
  MetricComparison,
  MetricDelta,
  Granularity,
  MetricTrend,
} from '@shared/types/performance-api';
import type { ActualMetrics } from '@shared/types/metrics';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate date points for a given range and granularity
 */
function generateDatePoints(
  startDate: string,
  endDate: string,
  granularity: Granularity
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (dateStr) dates.push(dateStr);

    switch (granularity) {
      case 'daily':
        current.setDate(current.getDate() + 1);
        break;
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'quarterly':
        current.setMonth(current.getMonth() + 3);
        break;
    }
  }

  return dates;
}

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Determine trend direction based on metric semantics
 */
function determineTrend(metric: string, values: number[], change: number): MetricTrend {
  // Small threshold for "stable"
  const threshold = 0.02; // 2% change

  const firstValue = values[0] ?? 0;
  const percentChange = firstValue !== 0 ? Math.abs(change / firstValue) : 0;

  if (percentChange < threshold) {
    return 'stable';
  }

  // For most metrics, positive change = improving
  const improvingMetrics = ['irr', 'tvpi', 'dpi', 'moic', 'currentValue', 'totalValue'];
  const decliningMetrics = ['writeOffs', 'losses'];

  const isImproving = change > 0;
  const metricLower = metric.toLowerCase();

  if (improvingMetrics.some((m) => metricLower.includes(m.toLowerCase()))) {
    return isImproving ? 'improving' : 'declining';
  }

  if (decliningMetrics.some((m) => metricLower.includes(m.toLowerCase()))) {
    return isImproving ? 'declining' : 'improving';
  }

  return isImproving ? 'improving' : 'declining';
}

function calculateCanonicalIrr(cashflows: XirrCashFlow[]): number | null {
  const meaningful = cashflows.filter((cashflow) =>
    Number.isFinite(cashflow.amount) && cashflow.amount !== 0
  );

  if (meaningful.length < 2) {
    return null;
  }

  const hasContribution = meaningful.some((cashflow) => cashflow.amount < 0);
  const hasReturn = meaningful.some((cashflow) => cashflow.amount > 0);

  if (!hasContribution || !hasReturn) {
    return null;
  }

  const result = xirrNewtonBisection(meaningful);
  return result.converged && result.irr !== null ? result.irr : null;
}

type PerformanceCompany = {
  id: number;
  name: string;
  sector: string;
  stage: string;
  status: string;
  currentValuation: unknown;
  investmentAmount: unknown;
  investmentDate: Date | null;
  createdAt: Date | null;
};

type DistributionRecord = {
  companyId: number | null;
  amount: unknown;
  distributionDate: Date;
};

function buildCompanyCashflows(
  companies: PerformanceCompany[],
  distributionsByCompany: Map<number, DistributionRecord[]>,
  asOfDate: string
): XirrCashFlow[] {
  const terminalDate = new Date(asOfDate);
  const cashflows: XirrCashFlow[] = [];

  for (const company of companies) {
    const investmentDate = company.investmentDate ?? company.createdAt;
    const investmentAmount = Number(company.investmentAmount) || 0;
    const currentValue = Number(company.currentValuation) || 0;

    if (investmentDate && investmentAmount > 0) {
      cashflows.push({
        date: investmentDate,
        amount: -Math.abs(investmentAmount),
      });
    }

    const distributions = distributionsByCompany.get(company.id) ?? [];
    for (const distribution of distributions) {
      const amount = Number(distribution.amount) || 0;
      if (amount > 0) {
        cashflows.push({
          date: distribution.distributionDate,
          amount,
        });
      }
    }

    if (currentValue > 0 && (!investmentDate || terminalDate.getTime() >= investmentDate.getTime())) {
      cashflows.push({
        date: terminalDate,
        amount: currentValue,
      });
    }
  }

  return cashflows.sort((left, right) => left.date.getTime() - right.date.getTime());
}

// ============================================================================
// PERFORMANCE CALCULATOR CLASS
// ============================================================================

export class PerformanceCalculator {
  /**
   * Calculate timeseries metrics with interpolation for missing data points
   */
  async calculateTimeseries(
    fundId: number,
    startDate: string,
    endDate: string,
    granularity: Granularity,
    metrics?: string[]
  ): Promise<TimeseriesPoint[]> {
    // Generate all date points for the range
    const datePoints = generateDatePoints(startDate, endDate, granularity);

    // Fetch actual metrics from database
    const dbMetrics = await db
      .select({
        metricDate: fundMetrics.metricDate,
        asOfDate: fundMetrics.asOfDate,
        totalValue: fundMetrics.totalValue,
        irr: fundMetrics.irr,
        tvpi: fundMetrics.tvpi,
        dpi: fundMetrics.dpi,
        multiple: fundMetrics.multiple,
      })
      .from(fundMetrics)
      .where(
        and(
          eq(fundMetrics.fundId, fundId),
          gte(fundMetrics.metricDate, new Date(startDate)),
          lte(fundMetrics.metricDate, new Date(endDate))
        )
      )
      .orderBy(fundMetrics.metricDate);

    // Create lookup map for database metrics
    const metricsMap = new Map<string, (typeof dbMetrics)[0]>();
    for (const m of dbMetrics) {
      const dateKey = new Date(m.metricDate).toISOString().split('T')[0];
      if (dateKey) metricsMap.set(dateKey, m);
    }

    // Build timeseries with interpolation
    const result: TimeseriesPoint[] = [];
    let prevPoint: TimeseriesPoint | null = null;

    for (let i = 0; i < datePoints.length; i++) {
      const date = datePoints[i] ?? '';
      if (!date) continue;
      const dbMetric = metricsMap.get(date);

      if (dbMetric) {
        const actual: Partial<ActualMetrics> = {
          asOfDate: new Date(dbMetric.asOfDate).toISOString(),
        };

        const totalValue = dbMetric.totalValue === null ? undefined : Number(dbMetric.totalValue);
        if (totalValue !== undefined) {
          actual.totalValue = totalValue;
        }

        const irr = dbMetric.irr === null ? null : Number(dbMetric.irr);
        if (irr !== null) {
          actual.irr = irr;
        }

        const tvpi = dbMetric.tvpi === null ? undefined : Number(dbMetric.tvpi);
        if (tvpi !== undefined) {
          actual.tvpi = tvpi;
        }

        const dpi = dbMetric.dpi === null ? null : Number(dbMetric.dpi);
        if (dpi !== null) {
          actual.dpi = dpi;
        }

        // Direct database value
        const point: TimeseriesPoint = {
          date,
          actual,
          _source: 'database',
        };
        result.push(point);
        prevPoint = point;
      } else if (prevPoint) {
        // Find next database point for interpolation
        let nextPoint: (typeof dbMetrics)[0] | null = null;
        for (let j = i + 1; j < datePoints.length; j++) {
          const nextDateKey = datePoints[j];
          if (nextDateKey) {
            const nextDb = metricsMap.get(nextDateKey);
            if (nextDb) {
              nextPoint = nextDb;
              break;
            }
          }
        }

        if (nextPoint) {
          // Interpolate between prev and next
          const prevDate = new Date(prevPoint.date).getTime();
          const currDate = new Date(date).getTime();
          const nextDate = new Date(nextPoint.metricDate).getTime();
          const t = (currDate - prevDate) / (nextDate - prevDate);

          const interpolatedActual: Partial<ActualMetrics> = { asOfDate: date };

          const previousTotalValue = prevPoint.actual.totalValue;
          const nextTotalValue =
            nextPoint.totalValue === null ? undefined : Number(nextPoint.totalValue);
          if (previousTotalValue != null && nextTotalValue !== undefined) {
            interpolatedActual.totalValue = lerp(previousTotalValue, nextTotalValue, t);
          }

          const previousIrr = prevPoint.actual.irr;
          const nextIrr = nextPoint.irr === null ? undefined : Number(nextPoint.irr);
          if (previousIrr != null && nextIrr !== undefined) {
            interpolatedActual.irr = lerp(previousIrr, nextIrr, t);
          }

          const previousTvpi = prevPoint.actual.tvpi;
          const nextTvpi = nextPoint.tvpi === null ? undefined : Number(nextPoint.tvpi);
          if (previousTvpi != null && nextTvpi !== undefined) {
            interpolatedActual.tvpi = lerp(previousTvpi, nextTvpi, t);
          }

          const previousDpi = prevPoint.actual.dpi;
          const nextDpi = nextPoint.dpi === null ? undefined : Number(nextPoint.dpi);
          if (previousDpi != null && nextDpi !== undefined) {
            interpolatedActual.dpi = lerp(previousDpi, nextDpi, t);
          }

          const interpolated: TimeseriesPoint = {
            date,
            actual: interpolatedActual,
            _source: 'interpolated',
          };
          result.push(interpolated);
        } else {
          // No next point - carry forward last known value
          const carriedActual: Partial<ActualMetrics> = { ...prevPoint.actual };
          Object.assign(carriedActual, { asOfDate: date });
          const carried: TimeseriesPoint = {
            date,
            actual: carriedActual,
            _source: 'interpolated',
          };
          result.push(carried);
        }
      } else {
        // No previous point - skip or use placeholder
        const placeholderActual: Partial<ActualMetrics> = {};
        Object.assign(placeholderActual, { asOfDate: date });
        result.push({
          date,
          actual: placeholderActual,
          _source: 'unavailable',
        });
      }
    }

    // Filter metrics if specified
    if (metrics && metrics.length > 0) {
      const metricSet = new Set(metrics);
      for (const point of result) {
        const asOfDateValue = point.actual.asOfDate;
        const filtered: Partial<ActualMetrics> = {};
        if (asOfDateValue) {
          Object.assign(filtered, { asOfDate: asOfDateValue });
        }
        for (const key of metricSet) {
          if (key in point.actual) {
            (filtered as Record<string, unknown>)[key] = (point.actual as Record<string, unknown>)[
              key
            ];
          }
        }
        point.actual = filtered;
      }
    }

    return result;
  }

  /**
   * Calculate metrics breakdown by dimension (sector/stage/company)
   */
  async calculateBreakdown(
    fundId: number,
    asOfDate: string,
    groupBy: 'sector' | 'stage' | 'company',
    includeExited: boolean
  ): Promise<{
    breakdown: BreakdownGroup[];
    totals: BreakdownTotals;
  }> {
    // Get fund info
    const fund = await storage.getFund(fundId);
    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    // Fetch portfolio companies with investments
    const companies = await db
      .select({
        id: portfolioCompanies.id,
        name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
        stage: portfolioCompanies.stage,
        status: portfolioCompanies.status,
        currentValuation: portfolioCompanies.currentValuation,
        investmentAmount: portfolioCompanies.investmentAmount,
        investmentDate: portfolioCompanies.investmentDate,
        createdAt: portfolioCompanies.createdAt,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId));

    // Filter by status if not including exited
    const filteredCompanies = includeExited
      ? companies
      : companies.filter(
          (c) => !['exited', 'closed', 'liquidated'].includes(c.status?.toLowerCase() || '')
        );

    // Group companies
    const groups = new Map<
      string,
      {
        companies: typeof filteredCompanies;
        totalDeployed: number;
        currentValue: number;
      }
    >();

    for (const company of filteredCompanies) {
      const groupKey =
        groupBy === 'company'
          ? company.name
          : groupBy === 'sector'
            ? company.sector
            : company.stage;

      const existing = groups.get(groupKey) || {
        companies: [],
        totalDeployed: 0,
        currentValue: 0,
      };

      existing.companies.push(company);
      existing.totalDeployed += Number(company.investmentAmount) || 0;
      existing.currentValue += Number(company.currentValuation) || 0;
      groups.set(groupKey, existing);
    }

    // Calculate totals first
    let totalDeployedSum = 0;
    let totalCurrentValue = 0;
    let totalCompanyCount = 0;

    for (const [, group] of groups) {
      totalDeployedSum += group.totalDeployed;
      totalCurrentValue += group.currentValue;
      totalCompanyCount += group.companies.length;
    }

    // Get distributions for DPI calculations
    const distributions = await db
      .select({
        companyId: fundDistributions.companyId,
        amount: fundDistributions.amount,
        distributionDate: fundDistributions.distributionDate,
      })
      .from(fundDistributions)
      .where(eq(fundDistributions.fundId, fundId));

    const distributionsByCompany = new Map<number, DistributionRecord[]>();
    for (const dist of distributions) {
      if (dist.companyId) {
        const companyDistributions = distributionsByCompany.get(dist.companyId) ?? [];
        companyDistributions.push(dist);
        distributionsByCompany.set(dist.companyId, companyDistributions);
      }
    }

    // Build breakdown array
    const breakdown: BreakdownGroup[] = [];

    for (const [groupName, group] of groups) {
      const moic = group.totalDeployed > 0 ? group.currentValue / group.totalDeployed : 0;

      // Sum distributions for this group
      const irr = calculateCanonicalIrr(
        buildCompanyCashflows(group.companies, distributionsByCompany, asOfDate)
      );

      breakdown.push({
        group: groupName,
        companyCount: group.companies.length,
        totalDeployed: group.totalDeployed,
        currentValue: group.currentValue,
        moic,
        irr,
        unrealizedGain: group.currentValue - group.totalDeployed,
        percentOfPortfolio:
          totalDeployedSum > 0 ? (group.totalDeployed / totalDeployedSum) * 100 : 0,
      });
    }

    // Sort by MOIC descending
    breakdown.sort((a, b) => b.moic - a.moic);

    // Calculate portfolio-level IRR
    const portfolioIRR = calculateCanonicalIrr(
      buildCompanyCashflows(filteredCompanies, distributionsByCompany, asOfDate)
    );

    const totals: BreakdownTotals = {
      companyCount: totalCompanyCount,
      totalDeployed: totalDeployedSum,
      currentValue: totalCurrentValue,
      averageMOIC: totalDeployedSum > 0 ? totalCurrentValue / totalDeployedSum : 0,
      portfolioIRR,
    };

    return { breakdown, totals };
  }

  /**
   * Calculate side-by-side metric comparisons across dates
   */
  async calculateComparison(
    fundId: number,
    dates: string[],
    metrics?: string[]
  ): Promise<{
    comparisons: MetricComparison[];
    deltas: MetricDelta[];
  }> {
    // Fetch metrics for each date
    const comparisons: MetricComparison[] = [];

    for (const date of dates) {
      // Find closest metric snapshot to this date
      const snapshot = await db
        .select({
          metricDate: fundMetrics.metricDate,
          asOfDate: fundMetrics.asOfDate,
          totalValue: fundMetrics.totalValue,
          irr: fundMetrics.irr,
          tvpi: fundMetrics.tvpi,
          dpi: fundMetrics.dpi,
          multiple: fundMetrics.multiple,
        })
        .from(fundMetrics)
        .where(and(eq(fundMetrics.fundId, fundId), lte(fundMetrics.metricDate, new Date(date))))
        .orderBy(desc(fundMetrics.metricDate))
        .limit(1);

      if (snapshot.length > 0) {
        const s = snapshot[0];
        if (s) {
          const actual: Partial<ActualMetrics> = {
            asOfDate: new Date(s.asOfDate).toISOString(),
          };

          const totalValue = s.totalValue === null ? undefined : Number(s.totalValue);
          if (totalValue !== undefined) {
            actual.totalValue = totalValue;
          }

          const irr = s.irr === null ? null : Number(s.irr);
          if (irr !== null) {
            actual.irr = irr;
          }

          const tvpi = s.tvpi === null ? undefined : Number(s.tvpi);
          if (tvpi !== undefined) {
            actual.tvpi = tvpi;
          }

          const dpi = s.dpi === null ? null : Number(s.dpi);
          if (dpi !== null) {
            actual.dpi = dpi;
          }

          comparisons.push({
            date,
            actual,
          });
        }
      } else {
        // No data for this date
        const emptyActual: Partial<ActualMetrics> = {};
        Object.assign(emptyActual, { asOfDate: date });
        comparisons.push({
          date,
          actual: emptyActual,
        });
      }
    }

    // Calculate deltas
    const deltas: MetricDelta[] = [];
    const metricKeys = metrics || ['irr', 'tvpi', 'dpi', 'totalValue'];

    for (const metricKey of metricKeys) {
      const values: number[] = [];
      for (const c of comparisons) {
        const val = (c.actual as Record<string, unknown>)[metricKey];
        if (typeof val !== 'number' || Number.isNaN(val)) {
          values.length = 0;
          break;
        }
        values.push(val);
      }

      if (values.length >= 2) {
        const firstVal = values[0] ?? 0;
        const lastVal = values[values.length - 1] ?? 0;
        const absoluteChange = lastVal - firstVal;
        const percentChange =
          firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100 : 0;

        deltas.push({
          metric: metricKey,
          values,
          absoluteChange,
          percentChange,
          trend: determineTrend(metricKey, values, absoluteChange),
        });
      }
    }

    return { comparisons, deltas };
  }
}

// Export singleton instance
export const performanceCalculator = new PerformanceCalculator();
