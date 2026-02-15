/**
 * Async data fetchers for LP report generation.
 * @module server/services/pdf-generation/data-fetchers
 */

import { db } from '../../db';
import { limitedPartners, lpFundCommitments, capitalActivities } from '@shared/schema-lp-reporting';
import { funds } from '@shared/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { toDecimal } from '@shared/lib/decimal-utils';
import { getFundPerformance } from '../lp-queries';
import { calculateFundMetrics } from '../fund-metrics-calculator';
import { storage } from '../../storage';
import type { LPReportData, ReportMetrics } from './types.js';

/** Convert cents (bigint) to dollars */
function centsToDollars(cents: bigint | null): number {
  if (!cents) return 0;
  return Number(cents) / 100;
}

/** Fetch LP data for report generation */
export async function fetchLPReportData(
  lpId: number,
  fundIdFilter?: number[]
): Promise<LPReportData> {
  // Fetch LP profile
  const [lp] = await db
    .select({
      id: limitedPartners.id,
      name: limitedPartners.name,
      email: limitedPartners.email,
    })
    .from(limitedPartners)
    .where(eq(limitedPartners.id, lpId))
    .limit(1);

  if (!lp) {
    throw new Error(`LP not found: ${lpId}`);
  }

  // Fetch commitments with fund names
  const rawCommitments = await db
    .select({
      commitmentId: lpFundCommitments.id,
      fundId: lpFundCommitments.fundId,
      fundName: funds.name,
      commitmentAmountCents: lpFundCommitments.commitmentAmountCents,
      ownershipPercentage: lpFundCommitments.commitmentPercentage,
    })
    .from(lpFundCommitments)
    .innerJoin(funds, eq(lpFundCommitments.fundId, funds.id))
    .where(eq(lpFundCommitments.lpId, lpId));

  // Convert cents to dollars and filter if needed
  const commitments = rawCommitments
    .filter((c) => !fundIdFilter || fundIdFilter.includes(c.fundId))
    .map((c) => ({
      commitmentId: c.commitmentId,
      fundId: c.fundId,
      fundName: c.fundName || `Fund ${c.fundId}`,
      commitmentAmount: centsToDollars(c.commitmentAmountCents),
      ownershipPercentage: c.ownershipPercentage ? toDecimal(c.ownershipPercentage).toNumber() : 0,
    }));

  // Get commitment IDs for transaction query
  const commitmentIds = commitments.map((c) => c.commitmentId);

  // Fetch transactions for these commitments
  const rawTransactions =
    commitmentIds.length > 0
      ? await db
          .select({
            commitmentId: capitalActivities.commitmentId,
            fundId: capitalActivities.fundId,
            date: capitalActivities.activityDate,
            type: capitalActivities.activityType,
            amountCents: capitalActivities.amountCents,
            description: capitalActivities.description,
          })
          .from(capitalActivities)
          .where(inArray(capitalActivities.commitmentId, commitmentIds))
          .orderBy(desc(capitalActivities.activityDate))
      : [];

  // Convert cents to dollars
  const transactions = rawTransactions.map((t) => ({
    commitmentId: t.commitmentId,
    fundId: t.fundId,
    date: t.date,
    type: t.type,
    amount: centsToDollars(t.amountCents),
    description: t.description,
  }));

  return { lp, commitments, transactions };
}

/**
 * Prefetch real fund metrics for report generation.
 * Returns null if no data available (callers fall back to placeholders).
 */
export async function prefetchReportMetrics(
  lpId: number,
  fundId: number
): Promise<ReportMetrics | null> {
  const perf = await getFundPerformance(lpId, fundId);
  const companies = await storage.getPortfolioCompanies(fundId);

  if (!perf && companies.length === 0) return null;

  const fallback = !perf ? await calculateFundMetrics(fundId) : null;

  const portfolioCompanies = companies
    .filter((c) => {
      const status = (c.status ?? '').toLowerCase();
      return status !== 'exited' && status !== 'liquidated' && status !== 'written-off';
    })
    .map((c) => {
      const invested = toDecimal(c.investmentAmount).toNumber();
      const value = toDecimal(c.currentValuation ?? 0).toNumber();
      return { name: c.name, invested, value, moic: invested > 0 ? value / invested : 0 };
    });

  return {
    irr: perf ? perf.irr : fallback!.irr,
    tvpi: perf ? perf.tvpi : fallback!.tvpi,
    dpi: perf ? perf.dpi : fallback!.dpi,
    portfolioCompanies,
  };
}
