/**
 * FundResultsReadService
 *
 * DB-backed service that composes fund identity, lifecycle state, and
 * attributed snapshots into the FundResultsReadV1 DTO. Uses two-tier
 * snapshot queries: prefer configVersion-attributed snapshots, fall back
 * to unattributed legacy rows when none exist.
 *
 * Uses `db` from `../db` directly (same pattern as fund-state-read-service).
 *
 * @module server/services/fund-results-read-service
 */

import { db } from '../db';
import { funds, fundSnapshots } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { fundStateReadService } from './fund-state-read-service';
import { mapReserveSnapshot, mapPacingSnapshot } from './fund-results-mappers';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { ReserveSummary, PacingSummary } from '@shared/types';

/** Unavailable section helper */
function unavailable(reason: string) {
  return { status: 'unavailable' as const, reason };
}

export class FundResultsReadService {
  /**
   * Load fund results composite DTO.
   * Returns null if the fund does not exist or lifecycle cannot be derived.
   */
  async getResults(fundId: number): Promise<FundResultsReadV1 | null> {
    // 1. Fund existence + identity
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });
    if (!fund) return null;

    // 2. Lifecycle truth from fund-state-read-service
    const lifecycle = await fundStateReadService.getState(fundId);
    if (!lifecycle) return null;

    // 3. Published config version (may be null if never published)
    const publishedVersion = lifecycle.configState.publishedVersion;

    // 4. Derive top-level status from lifecycle (Decision 7)
    const calcStatus = lifecycle.calculationState.status;
    let status: FundResultsReadV1['status'];
    if (calcStatus === 'failed') {
      status = 'failed';
    } else if (calcStatus === 'not_requested') {
      status = 'pending';
    } else if (calcStatus === 'submitted' || calcStatus === 'calculating') {
      status = 'calculating';
    } else {
      status = 'ready';
    }

    // 5. Load snapshot sections with two-tier query (Decision 9)
    const reserveSection = await this.loadSection(fundId, 'RESERVE', publishedVersion, (payload) =>
      mapReserveSnapshot(payload as ReserveSummary, Number(fund.size))
    );

    const pacingSection = await this.loadSection(fundId, 'PACING', publishedVersion, (payload) =>
      mapPacingSnapshot(payload as PacingSummary)
    );

    return {
      status,
      fundId,
      fund: {
        name: fund.name,
        vintageYear: fund.vintageYear,
        size: Number(fund.size),
      },
      lifecycle,
      sections: {
        reserve: reserveSection,
        pacing: pacingSection,
        scorecard: unavailable('No authoritative source'),
        scenarios: unavailable('No authoritative source'),
        waterfall: unavailable('No authoritative source'),
      },
    };
  }

  /**
   * Two-tier snapshot query:
   * Tier 1: attributed snapshot matching publishedVersion
   * Tier 2: legacy fallback (any snapshot for this fund+type)
   */
  private async loadSection<T>(
    fundId: number,
    snapshotType: string,
    publishedVersion: number | null,
    mapper: (payload: Record<string, unknown>) => T
  ) {
    // Tier 1: attributed snapshot for published config version
    let snapshot = null;
    let legacyEvidence = false;

    if (publishedVersion != null) {
      snapshot = await db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, snapshotType),
          eq(fundSnapshots.configVersion, publishedVersion)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      });
    }

    // Tier 2: legacy fallback (unattributed, latest by createdAt)
    if (!snapshot) {
      snapshot = await db.query.fundSnapshots.findFirst({
        where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, snapshotType)),
        orderBy: desc(fundSnapshots.createdAt),
      });

      if (snapshot) {
        legacyEvidence = true;
      }
    }

    if (!snapshot) {
      return unavailable('No calculation results available');
    }

    const payload = mapper(snapshot.payload as Record<string, unknown>);

    return {
      status: 'available' as const,
      calculatedAt: snapshot.snapshotTime?.toISOString() ?? null,
      source: 'fund_snapshots' as const,
      legacyEvidence,
      payload,
    };
  }
}

export const fundResultsReadService = new FundResultsReadService();
