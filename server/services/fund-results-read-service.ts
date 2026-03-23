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
import { eq, and, desc, isNull } from 'drizzle-orm';
import { fundStateReadService } from './fund-state-read-service';
import { mapReserveSnapshot, mapPacingSnapshot } from './fund-results-mappers';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { ReserveSummary, PacingSummary } from '@shared/types';

/** Unavailable section helper */
function unavailable(reason: string) {
  return { status: 'unavailable' as const, reason };
}

/** Pending section helper */
function pending(reason: string) {
  return { status: 'pending' as const, reason };
}

/** Failed section helper */
function failed(reason: string) {
  return { status: 'failed' as const, reason };
}

function missingSectionForLifecycle(lifecycle: FundStateReadV1) {
  const { status, lastError } = lifecycle.calculationState;

  if (status === 'not_requested') {
    return pending('Calculations not yet requested');
  }

  if (status === 'submitted' || status === 'calculating') {
    return pending('Calculations are still in progress');
  }

  if (status === 'failed') {
    return failed(lastError ?? 'Calculation failed before results were produced');
  }

  return unavailable('No calculation results available');
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
    const reserveSection = await this.loadSection(
      fundId,
      'RESERVE',
      publishedVersion,
      (payload) => mapReserveSnapshot(payload as ReserveSummary, Number(fund.size)),
      lifecycle
    );

    const pacingSection = await this.loadSection(
      fundId,
      'PACING',
      publishedVersion,
      (payload) => mapPacingSnapshot(payload as PacingSummary),
      lifecycle
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
   * Tier 2: legacy fallback (unattributed snapshot for this fund+type)
   */
  private async loadSection<T>(
    fundId: number,
    snapshotType: string,
    publishedVersion: number | null,
    mapper: (payload: Record<string, unknown>) => T,
    lifecycle: FundStateReadV1
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

    // Tier 2: legacy fallback only when lifecycle derivation proved legacy evidence.
    if (!snapshot && lifecycle.calculationState.legacyEvidence) {
      snapshot = await db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, snapshotType),
          isNull(fundSnapshots.configVersion)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      });

      if (snapshot) {
        legacyEvidence = true;
      }
    }

    if (!snapshot) {
      return missingSectionForLifecycle(lifecycle);
    }

    const payload = mapper(snapshot.payload as Record<string, unknown>);

    return {
      status: 'available' as const,
      calculatedAt:
        snapshot.snapshotTime?.toISOString() ?? snapshot.createdAt?.toISOString() ?? null,
      source: 'fund_snapshots' as const,
      legacyEvidence,
      payload,
    };
  }
}

export const fundResultsReadService = new FundResultsReadService();
