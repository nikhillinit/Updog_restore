/**
 * FundLifecycleHistoryService
 *
 * Loads the publication history of a fund: every config version that was
 * ever published, with its latest calcRun status. Entries are ordered by
 * version descending (most recent first).
 *
 * Uses `db` from `../db` directly (NOT server/storage.ts).
 *
 * @module server/services/fund-lifecycle-history-service
 */

import { db } from '../db';
import { funds, fundConfigs, calcRuns } from '@shared/schema';
import { fundEvents } from '@shared/schema';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import type {
  FundLifecycleHistoryV1,
  LifecycleHistoryEntry,
} from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type { CalculationStatus } from '@shared/contracts/fund-state-read-v1.contract';
import type { DispatchState } from '@shared/schema/fund';

/**
 * Derive a simplified calculation status from a calcRun row.
 * Full lifecycle derivation lives in fund-state-derivation.ts and checks
 * snapshots; this is a lightweight per-entry summary.
 */
function deriveRunStatus(run: {
  dispatchState: string;
  completedAt: Date | null;
  failedAt: Date | null;
}): CalculationStatus {
  if (run.failedAt) return 'failed';
  if (run.completedAt) return 'ready';
  if (run.dispatchState === 'dispatched' || run.dispatchState === 'partial') return 'calculating';
  if (run.dispatchState === 'pending') return 'submitted';
  return 'calculating';
}

/** Narrow a raw string to the DispatchState union, returning null on mismatch */
function toDispatchState(raw: string): DispatchState | null {
  const valid: DispatchState[] = ['pending', 'dispatched', 'partial', 'failed'];
  return (valid as string[]).includes(raw) ? (raw as DispatchState) : null;
}

export class FundLifecycleHistoryService {
  /**
   * Load the publication history for a fund.
   * Returns null if the fund does not exist.
   */
  async getHistory(fundId: number): Promise<FundLifecycleHistoryV1 | null> {
    // 1. Fund existence check
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });

    if (!fund) return null;

    // 2. All configs that were ever published (publishedAt IS NOT NULL)
    //    When a new version is published, the old version has isPublished=false
    //    but retains its publishedAt timestamp. Query by publishedAt NOT NULL.
    const publishedConfigs = await db
      .select({
        id: fundConfigs.id,
        version: fundConfigs.version,
        publishedAt: fundConfigs.publishedAt,
        config: fundConfigs.config,
      })
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, fundId), isNotNull(fundConfigs.publishedAt)))
      .orderBy(desc(fundConfigs.version));

    // 3. For each published config, find the latest calcRun and the publisher
    const entries: LifecycleHistoryEntry[] = [];

    for (const pc of publishedConfigs) {
      // Latest calcRun targeting this configVersion
      const latestRun = await db.query.calcRuns.findFirst({
        where: and(
          eq(calcRuns.fundId, fundId),
          eq(calcRuns.configVersion, pc.version)
        ),
        orderBy: desc(calcRuns.requestedAt),
      });

      // Best-effort publisher lookup from fund_events (PUBLISHED event
      // closest in time to this config's publishedAt)
      const publishEvent = await db.query.fundEvents.findFirst({
        where: and(
          eq(fundEvents.fundId, fundId),
          eq(fundEvents.eventType, 'PUBLISHED')
        ),
        orderBy: desc(fundEvents.eventTime),
      });

      // Extract fundSize from config JSON blob
      const configBlob = pc.config as Record<string, unknown> | null;
      const rawFundSize = configBlob?.['fundSize'];
      const fundSize = typeof rawFundSize === 'number' ? rawFundSize : null;

      // Extract numCompanies from capitalPlanAllocations array length
      const rawAllocations = configBlob?.['capitalPlanAllocations'];
      const numCompanies =
        Array.isArray(rawAllocations) && rawAllocations.length > 0
          ? rawAllocations.length
          : null;

      // Build calcRun sub-object
      let calcRunEntry: LifecycleHistoryEntry['calcRun'] = null;
      if (latestRun) {
        calcRunEntry = {
          runId: latestRun.id,
          status: deriveRunStatus({
            dispatchState: latestRun.dispatchState,
            completedAt: latestRun.completedAt,
            failedAt: latestRun.failedAt,
          }),
          dispatchState: toDispatchState(latestRun.dispatchState),
          lastCalculatedAt: latestRun.completedAt ? latestRun.completedAt.toISOString() : null,
          correlationId: latestRun.correlationId,
        };
      }

      entries.push({
        version: pc.version,
        publishedAt: pc.publishedAt!.toISOString(),
        publishedBy: publishEvent?.userId ?? null,
        fundSize,
        numCompanies,
        calcRun: calcRunEntry,
      });
    }

    return { fundId, entries };
  }
}

export const fundLifecycleHistoryService = new FundLifecycleHistoryService();
