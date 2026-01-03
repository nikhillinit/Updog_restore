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
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { fundMetrics, portfolioCompanies, investments, fundDistributions } from '@shared/schema';
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
function determineTrend(
  metric: string,
  values: number[],
  change: number
): MetricTrend {
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

/**
 * Calculate simple IRR approximation (CAGR)
 */
function calculateSimpleIRR(
  totalInvested: number,
  totalValue: number,
  totalDistributions: number,
  years: number
): number {
  if (totalInvested <= 0 || years <= 0) return 0;

  const totalReturn = (totalValue + totalDistributions - totalInvested) / totalInvested;
  const annualized = Math.pow(1 + totalReturn, 1 / years) - 1;

  // Cap at reasonable bounds
  return Math.max(-0.5, Math.min(2.0, annualized));
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
    const metricsMap = new Map<string, typeof dbMetrics[0]>();
    for (const m of dbMetrics) {
      const dateKey = new Date(m.metricDate).toISOString().split('T')[0];
      if (dateKey) metricsMap.set(dateKey, m);
    }

    // Build timeseries with interpolation
    const result: TimeseriesPoint[] = [];
    let prevPoint: TimeseriesPoint | null = null;
    let nextDbIndex = 0;

    for (let i = 0; i < datePoints.length; i++) {
      const date = datePoints[i] ?? '';
      if (!date) continue;
      const dbMetric = metricsMap.get(date);

      if (dbMetric) {
        // Direct database value
        const point: TimeseriesPoint = {
          date,
          actual: {
            asOfDate: new Date(dbMetric.asOfDate).toISOString(),
            totalValue: Number(dbMetric.totalValue) || 0,
            irr: Number(dbMetric.irr) || 0,
            tvpi: Number(dbMetric.tvpi) || 0,
            dpi: Number(dbMetric.dpi) || null,
          } as Partial<ActualMetrics>,
          _source: 'database',
        };
        result.push(point);
        prevPoint = point;
        nextDbIndex = i + 1;
      } else if (prevPoint) {
        // Find next database point for interpolation
        let nextPoint: typeof dbMetrics[0] | null = null;
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

          const interpolated: TimeseriesPoint = {
            date,
            actual: {
              asOfDate: date,
              totalValue: lerp(
                prevPoint.actual.totalValue || 0,
                Number(nextPoint.totalValue) || 0,
                t
              ),
              irr: lerp(
                prevPoint.actual.irr || 0,
                Number(nextPoint.irr) || 0,
                t
              ),
              tvpi: lerp(
                prevPoint.actual.tvpi || 0,
                Number(nextPoint.tvpi) || 0,
                t
              ),
              dpi: lerp(
                prevPoint.actual.dpi || 0,
                Number(nextPoint.dpi) || 0,
                t
              ),
            } as Partial<ActualMetrics>,
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
          _source: 'calculated',
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
            (filtered as Record<string, unknown>)[key] = (point.actual as Record<string, unknown>)[key];
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

    const fundStartDate = fund.createdAt || new Date();
    const yearsInvested = Math.max(
      0.5,
      (new Date(asOfDate).getTime() - new Date(fundStartDate).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    );

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
      })
      .from(fundDistributions)
      .where(eq(fundDistributions.fundId, fundId));

    const distributionsByCompany = new Map<number, number>();
    for (const dist of distributions) {
      if (dist.companyId) {
        distributionsByCompany.set(
          dist.companyId,
          (distributionsByCompany.get(dist.companyId) || 0) + Number(dist.amount)
        );
      }
    }

    // Build breakdown array
    const breakdown: BreakdownGroup[] = [];

    for (const [groupName, group] of groups) {
      const moic =
        group.totalDeployed > 0
          ? group.currentValue / group.totalDeployed
          : 0;

      // Sum distributions for this group
      let groupDistributions = 0;
      for (const c of group.companies) {
        groupDistributions += distributionsByCompany.get(c.id) || 0;
      }

      const irr = calculateSimpleIRR(
        group.totalDeployed,
        group.currentValue,
        groupDistributions,
        yearsInvested
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
          totalDeployedSum > 0
            ? (group.totalDeployed / totalDeployedSum) * 100
            : 0,
      });
    }

    // Sort by MOIC descending
    breakdown.sort((a, b) => b.moic - a.moic);

    // Calculate portfolio-level IRR
    const totalDistributions = distributions.reduce(
      (sum, d) => sum + Number(d.amount),
      0
    );
    const portfolioIRR = calculateSimpleIRR(
      totalDeployedSum,
      totalCurrentValue,
      totalDistributions,
      yearsInvested
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
        .where(
          and(
            eq(fundMetrics.fundId, fundId),
            lte(fundMetrics.metricDate, new Date(date))
          )
        )
        .orderBy(desc(fundMetrics.metricDate))
        .limit(1);

      if (snapshot.length > 0) {
        const s = snapshot[0];
        if (s) {
          comparisons.push({
            date,
            actual: {
              asOfDate: new Date(s.asOfDate).toISOString(),
              totalValue: Number(s.totalValue) || 0,
              irr: Number(s.irr) || 0,
              tvpi: Number(s.tvpi) || 0,
              dpi: Number(s.dpi) || null,
            } as Partial<ActualMetrics>,
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
        values.push(typeof val === 'number' ? val : 0);
      }

      if (values.length >= 2) {
        const firstVal = values[0] ?? 0;
        const lastVal = values[values.length - 1] ?? 0;
        const absoluteChange = lastVal - firstVal;
        const percentChange =
          firstVal !== 0
            ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100
            : 0;

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
