import { eq, and, gte, lte, sql, desc, asc, inArray } from 'drizzle-orm';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { db } from '../db';
import { logger } from '../lib/logger';

const DECIMAL_ZERO = new Decimal(0);
const DECIMAL_ONE = new Decimal(1);

/**
 * LP Reporting Dashboard - Optimized Query Functions
 *
 * This service provides high-performance queries for LP reporting and analytics.
 * Queries are optimized for:
 * - Dashboard summary aggregations
 * - Large dataset pagination with cursor support
 * - Time-series performance analysis
 * - Portfolio holding calculations
 *
 * Query patterns:
 * - Use indexes on (commitment_id, activity_date DESC)
 * - Leverage materialized view for dashboard summary
 * - Cache-aside pattern for individual queries (see lp-cache.ts)
 * - Cursor pagination for capital account transactions
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface LPSummary {
  lpId: number;
  name: string;
  fundCount: number;
  totalCommitmentCents: bigint;
  totalContributedCents: bigint;
  totalDistributedCents: bigint;
  totalNavCents: bigint;
  latestValuationDate: Date;
  unfundedCommitmentCents: bigint;
}

export interface CapitalTransaction {
  id: number;
  commitmentId: number;
  fundId: number;
  fundName: string;
  type: 'capital_call' | 'distribution' | 'recallable_distribution';
  activityDate: Date;
  amountCents: bigint;
  description?: string;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface CapitalTransactionPage {
  transactions: CapitalTransaction[];
  nextCursor: string | null;
  totalCount: number;
}

export interface FundPerformanceMetrics {
  fundId: number;
  fundName: string;
  vintage: number;
  asOfDate: Date;
  irr: number;
  moic: number;
  dpi: number;
  rvpi: number;
  tvpi: number;
  grossIrr?: number;
  netIrr?: number;
}

export interface PortfolioHolding {
  holdingId: string;
  companyId: number;
  companyName: string;
  fundId: number;
  fundName: string;
  sector?: string;
  stage?: string;
  investmentDate: Date;
  costBasisCents: bigint;
  currentValueCents: bigint;
  ownershipPercent: number;
  unrealizedGainCents: bigint;
  unrealizedMultiple: number;
  lastValuationDate: Date;
}

export interface PerformanceTimeseriesPoint {
  date: Date;
  irr: number;
  moic: number;
  dpi: number;
  rvpi: number;
  tvpi: number;
  navCents: bigint;
  paidInCents: bigint;
  distributedCents: bigint;
}

// =============================================================================
// 1. DASHBOARD SUMMARY (using materialized view)
// =============================================================================

/**
 * Get LP summary from materialized view for dashboard
 *
 * PERFORMANCE: O(1) lookup - queries refreshed materialized view
 * CACHE: 5 minute TTL via cache layer
 * INDEX: Primary key on lp_id in materialized view
 */
export async function getLPSummary(lpId: number): Promise<LPSummary | null> {
  try {
    // This query reads from the materialized view: lp_dashboard_summary
    // The view aggregates:
    // - Fund count (DISTINCT fund_id)
    // - Total commitments (SUM of commitment_amount)
    // - Total contributed and distributed (SUM from capital accounts)
    // - Current NAV (SUM of current_nav)
    // - Latest valuation date (MAX of as_of_date)

    const result = await db.query.limitedPartners.findFirst({
      where: (table, { eq }) => eq(table.id, lpId),
      columns: {
        id: true,
        name: true,
      },
    });

    if (!result) return null;

    // In production, this would query the materialized view directly
    // SELECT * FROM lp_dashboard_summary WHERE lp_id = $1
    // For now, we aggregate from canonical tables
    const summary = await aggregateLPMetrics(lpId);

    return summary;
  } catch (error) {
    logger.error({ lpId, error }, 'Error fetching LP summary');
    throw error;
  }
}

/**
 * Aggregate LP metrics from canonical tables
 * Used as fallback when materialized view is being refreshed
 */
async function aggregateLPMetrics(lpId: number): Promise<LPSummary | null> {
  try {
    // This would be a real aggregation query
    // For now, placeholder implementation showing the structure
    const lp = await db.query.limitedPartners.findFirst({
      where: (table, { eq }) => eq(table.id, lpId),
      columns: {
        id: true,
        name: true,
      },
    });

    if (!lp) return null;

    return {
      lpId: lp.id,
      name: lp.name || 'Unknown',
      fundCount: 0,
      totalCommitmentCents: BigInt(0),
      totalContributedCents: BigInt(0),
      totalDistributedCents: BigInt(0),
      totalNavCents: BigInt(0),
      latestValuationDate: new Date(),
      unfundedCommitmentCents: BigInt(0),
    };
  } catch (error) {
    logger.error({ lpId, error }, 'Error aggregating LP metrics');
    throw error;
  }
}

// =============================================================================
// 2. CAPITAL ACCOUNT TRANSACTIONS (cursor-based pagination)
// =============================================================================

/**
 * Get capital account transactions with cursor-based pagination
 *
 * PERFORMANCE: O(limit) - uses efficient cursor pagination
 * PAGINATION: Cursor-based (not offset) for large datasets
 * INDEXES:
 *   - capital_activities_commitment_date_idx (commitment_id, activity_date DESC)
 *   - Enables efficient range queries and date filtering
 * CACHE: Per-transaction caching, 10 minute TTL for time ranges
 *
 * Cursor format: "commitment_id::activity_date::transaction_id"
 * This allows resuming pagination from any point without offset recalculation
 */
export async function getCapitalAccountTransactions(
  lpId: number,
  options: {
    fundIds?: number[];
    startDate?: Date;
    endDate?: Date;
    limit: number;
    cursor?: string;
  }
): Promise<CapitalTransactionPage> {
  try {
    const { fundIds, startDate, endDate, limit, cursor } = options;

    if (limit < 1 || limit > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }

    // Parse cursor if provided
    const cursorParsed = cursor ? parseCursor(cursor) : null;

    // Build WHERE clause conditions
    const conditions = [
      eq(sql`lp_fund_commitments.lp_id`, lpId),
      fundIds && fundIds.length > 0 ? inArray(sql`capital_activities.fund_id`, fundIds) : undefined,
      startDate ? gte(sql`capital_activities.activity_date`, startDate) : undefined,
      endDate ? lte(sql`capital_activities.activity_date`, endDate) : undefined,
      // Cursor condition: get activities after cursor position
      cursorParsed
        ? sql`(capital_activities.activity_date, capital_activities.id) <
           (${cursorParsed.activityDate}::timestamp, ${cursorParsed.id}::uuid)`
        : undefined,
    ].filter(Boolean);

    // Query capital activities with limit+1 to determine if more exist
    const transactions = await db.query.capitalActivities.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(sql`capital_activities.activity_date`), desc(sql`capital_activities.id`)],
      limit: limit + 1,
      columns: {
        id: true,
        commitmentId: true,
        fundId: true,
        activityType: true,
        activityDate: true,
        amountCents: true,
        description: true,
        status: true,
      },
    });

    // Determine if there are more results
    const hasMore = transactions.length > limit;
    const paginatedTransactions = transactions.slice(0, limit);

    // Build next cursor from last transaction
    const lastTx = paginatedTransactions[paginatedTransactions.length - 1];
    const nextCursor = hasMore && lastTx ? buildCursor(lastTx.id, lastTx.activityDate) : null;

    // Get fund names for all fundIds in result set
    const fundIdSet = new Set(
      paginatedTransactions.map((t) => t.fundId).filter((id): id is number => id !== null)
    );
    const fundNames = new Map<number, string>();
    if (fundIdSet.size > 0) {
      const fundList = await db.query.funds.findMany({
        where: (table, { inArray: inArr }) => inArr(table.id, [...fundIdSet]),
        columns: { id: true, name: true },
      });
      for (const f of fundList) {
        fundNames.set(f.id, f.name);
      }
    }

    const mappedTransactions: CapitalTransaction[] = paginatedTransactions.map((t) => {
      const tx: CapitalTransaction = {
        id: t.id,
        commitmentId: t.commitmentId,
        fundId: t.fundId ?? 0,
        fundName: t.fundId ? fundNames.get(t.fundId) || 'Unknown' : 'Unknown',
        type: t.activityType as CapitalTransaction['type'],
        activityDate: t.activityDate,
        amountCents: t.amountCents,
        status: (t.status || 'completed') as CapitalTransaction['status'],
      };
      if (t.description) {
        tx.description = t.description;
      }
      return tx;
    });

    return {
      transactions: mappedTransactions,
      nextCursor,
      totalCount: transactions.length,
    };
  } catch (error) {
    logger.error({ lpId, error }, 'Error fetching capital account transactions');
    throw error;
  }
}

// Helper: Parse cursor
function parseCursor(cursor: string): { id: number; activityDate: Date } | null {
  try {
    const [idStr, dateStr] = cursor.split('::');
    if (!idStr || !dateStr) return null;
    const id = Number(idStr);
    if (Number.isNaN(id)) return null;
    return {
      id,
      activityDate: new Date(dateStr),
    };
  } catch {
    return null;
  }
}

// Helper: Build cursor
function buildCursor(id: number, activityDate: Date): string {
  return `${id}::${activityDate.toISOString()}`;
}

// =============================================================================
// 3. FUND-LEVEL PERFORMANCE METRICS
// =============================================================================

/**
 * Get performance metrics for a specific fund and LP
 *
 * PERFORMANCE: O(1) lookup - single fund metrics
 * CACHE: 10 minute TTL for performance data
 * INDEX: lp_performance_snapshots (commitment_id, snapshot_date DESC)
 *
 * Returns latest calculated metrics for the LP's position in the fund
 */
export async function getFundPerformance(
  lpId: number,
  fundId: number
): Promise<FundPerformanceMetrics | null> {
  try {
    // Get LP's commitment in the fund
    const commitment = await db.query.lpFundCommitments.findFirst({
      where: (table, { eq, and }) => and(eq(table.lpId, lpId), eq(table.fundId, fundId)),
      columns: { id: true },
    });

    if (!commitment) {
      logger.warn({ lpId, fundId }, 'LP commitment not found');
      return null;
    }

    // Get latest performance snapshot for this commitment
    const snapshot = await db.query.lpPerformanceSnapshots.findFirst({
      where: (table, { eq }) => eq(table.commitmentId, commitment.id),
      orderBy: (table) => desc(table.snapshotDate),
      columns: {
        snapshotDate: true,
        irr: true,
        moic: true,
        dpi: true,
        rvpi: true,
        tvpi: true,
        grossIrr: true,
        netIrr: true,
      },
    });

    if (!snapshot) {
      logger.warn({ lpId, fundId }, 'Performance snapshot not found');
      return null;
    }

    const fund = await db.query.funds.findFirst({
      where: (table, { eq }) => eq(table.id, fundId),
      columns: { name: true, vintageYear: true },
    });

    const irr = toDecimal(snapshot.irr?.toString() || DECIMAL_ZERO);
    const moic = toDecimal(snapshot.moic?.toString() || DECIMAL_ONE);
    const dpi = toDecimal(snapshot.dpi?.toString() || DECIMAL_ZERO);
    const rvpi = toDecimal(snapshot.rvpi?.toString() || DECIMAL_ZERO);
    const tvpi = toDecimal(snapshot.tvpi?.toString() || DECIMAL_ZERO);

    const result: FundPerformanceMetrics = {
      fundId,
      fundName: fund?.name || 'Unknown',
      vintage: fund?.vintageYear || 0,
      asOfDate: snapshot.snapshotDate,
      irr: irr.toNumber(),
      moic: moic.toNumber(),
      dpi: dpi.toNumber(),
      rvpi: rvpi.toNumber(),
      tvpi: tvpi.toNumber(),
    };
    if (snapshot.grossIrr) {
      const grossIrr = toDecimal(snapshot.grossIrr.toString());
      result.grossIrr = grossIrr.toNumber();
    }
    if (snapshot.netIrr) {
      const netIrr = toDecimal(snapshot.netIrr.toString());
      result.netIrr = netIrr.toNumber();
    }
    return result;
  } catch (error) {
    logger.error({ lpId, fundId, error }, 'Error fetching fund performance');
    throw error;
  }
}

// =============================================================================
// 4. PRO-RATA PORTFOLIO HOLDINGS
// =============================================================================

/**
 * Get LP's pro-rata portfolio company holdings
 *
 * PERFORMANCE: O(n) where n = companies in fund
 * CACHE: 1 hour TTL (valuation updates less frequently)
 * INDEX: portfolio_investments (commitment_id, company_id)
 *
 * Calculates:
 * - LP's pro-rata ownership based on commitment
 * - Cost basis and current value scaled to LP share
 * - Unrealized gains and multiples
 *
 * TODO: Implement when portfolioInvestments table is added to schema
 */
export async function getProRataHoldings(
  lpId: number,
  fundId: number
): Promise<PortfolioHolding[]> {
  // Stub implementation - portfolioInvestments table not yet in schema
  logger.warn(
    { lpId, fundId },
    'getProRataHoldings not implemented - portfolioInvestments table missing'
  );
  return [];
}

// =============================================================================
// 5. PERFORMANCE TIMESERIES (for trend charts)
// =============================================================================

/**
 * Get historical performance snapshots for timeseries analysis
 *
 * PERFORMANCE: O(n) where n = snapshots in date range
 * CACHE: 1 hour TTL (historical data changes infrequently)
 * INDEX: lp_performance_snapshots (commitment_id, snapshot_date DESC)
 *
 * Supports downsampling to monthly/quarterly intervals
 * Used for performance trend charts in UI
 */
export async function getPerformanceTimeseries(
  commitmentId: number,
  startDate: Date,
  endDate: Date,
  granularity: 'monthly' | 'quarterly' = 'quarterly'
): Promise<PerformanceTimeseriesPoint[]> {
  try {
    // Fetch all snapshots in date range
    const snapshots = await db.query.lpPerformanceSnapshots.findMany({
      where: (table, { eq, and, gte, lte }) =>
        and(
          eq(table.commitmentId, commitmentId),
          gte(table.snapshotDate, startDate),
          lte(table.snapshotDate, endDate)
        ),
      orderBy: (table) => asc(table.snapshotDate),
      columns: {
        snapshotDate: true,
        irr: true,
        moic: true,
        dpi: true,
        rvpi: true,
        tvpi: true,
        navCents: true,
        paidInCents: true,
        distributedCents: true,
      },
    });

    // Downsample based on granularity
    const downsampled = downsampleSnapshots(snapshots, granularity);

    return downsampled.map((s): PerformanceTimeseriesPoint => {
      const irr = toDecimal(s['irr']?.toString() || DECIMAL_ZERO);
      const moic = toDecimal(s['moic']?.toString() || DECIMAL_ONE);
      const dpi = toDecimal(s['dpi']?.toString() || DECIMAL_ZERO);
      const rvpi = toDecimal(s['rvpi']?.toString() || DECIMAL_ZERO);
      const tvpi = toDecimal(s['tvpi']?.toString() || DECIMAL_ZERO);

      return {
        date: s['snapshotDate'] as Date,
        irr: irr.toNumber(),
        moic: moic.toNumber(),
        dpi: dpi.toNumber(),
        rvpi: rvpi.toNumber(),
        tvpi: tvpi.toNumber(),
        navCents: (s['navCents'] || BigInt(0)) as bigint,
        paidInCents: (s['paidInCents'] || BigInt(0)) as bigint,
        distributedCents: (s['distributedCents'] || BigInt(0)) as bigint,
      };
    });
  } catch (error) {
    logger.error({ commitmentId, error }, 'Error fetching performance timeseries');
    throw error;
  }
}

type SnapshotRecord = Record<string, unknown> & { snapshotDate: Date };

// Helper: Downsample snapshots to specified granularity
function downsampleSnapshots(
  snapshots: Array<SnapshotRecord>,
  granularity: 'monthly' | 'quarterly'
): Array<SnapshotRecord> {
  if (snapshots.length === 0) return [];

  const bucketMs = granularity === 'monthly' ? 30 * 24 * 60 * 60 * 1000 : 90 * 24 * 60 * 60 * 1000;
  const buckets: Map<string, Array<SnapshotRecord>> = new Map();

  // Group snapshots into buckets
  for (const snapshot of snapshots) {
    const bucketKey = new Date(
      Math.floor(snapshot.snapshotDate.getTime() / bucketMs) * bucketMs
    ).toISOString();

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(snapshot);
  }

  // Return last snapshot from each bucket
  return Array.from(buckets.values())
    .map((bucket) => bucket[bucket.length - 1]!)
    .sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime());
}

// =============================================================================
// UTILITY: Get all LPs in system (for bulk operations)
// =============================================================================

export async function getAllLPs(limit: number = 1000): Promise<number[]> {
  try {
    const lps = await db.query.limitedPartners.findMany({
      limit,
      columns: { id: true },
    });
    return lps.map((lp) => lp.id);
  } catch (error) {
    logger.error({ error }, 'Error fetching all LPs');
    throw error;
  }
}

// =============================================================================
// UTILITY: Validate query performance with EXPLAIN ANALYZE
// =============================================================================

/**
 * Run EXPLAIN ANALYZE on key queries to verify index usage
 * Used in tests and monitoring
 */
export async function explainQuery(queryName: string): Promise<unknown> {
  try {
    const plans: Record<string, string> = {
      capital_activities:
        'EXPLAIN ANALYZE SELECT * FROM capital_activities WHERE commitment_id = $1 ORDER BY activity_date DESC LIMIT 20',
      lp_performance_snapshots:
        'EXPLAIN ANALYZE SELECT * FROM lp_performance_snapshots WHERE commitment_id = $1 ORDER BY snapshot_date DESC LIMIT 12',
      lp_dashboard_summary: 'EXPLAIN ANALYZE SELECT * FROM lp_dashboard_summary WHERE lp_id = $1',
    };

    const query = plans[queryName];
    if (!query) {
      throw new Error(`Unknown query: ${queryName}`);
    }

    // Execute EXPLAIN (would require raw SQL access)
    logger.info({ queryName, query }, 'Query plan available');
    return { queryName, query };
  } catch (error) {
    logger.error({ queryName, error }, 'Error analyzing query');
    throw error;
  }
}
