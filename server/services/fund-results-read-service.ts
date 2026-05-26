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
import { logger } from '../lib/logger';
import { funds, fundConfigs, fundSnapshots } from '@shared/schema';
import { eq, and, desc, isNull, ne } from 'drizzle-orm';
import { fundStateReadService } from './fund-state-read-service';
import {
  mapEconomicsSnapshot,
  mapReserveSnapshot,
  mapPacingSnapshot,
} from './fund-results-mappers';
import {
  mapPublishedConfigToWaterfallSetup,
  mapScorecardFromEvidence,
} from './fund-results-rich-mappers';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { EconomicsResultReasonCode } from '@shared/contracts/economics-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { ReserveSummary, PacingSummary } from '@shared/types';
import { isFlagEnabled } from '@shared/flags/getFlag';
import { hasEconomicsAssumptions } from '@shared/lib/economics/economics-engine';

const log = logger.child({ module: 'fund-results-read' });

type ReasonCode =
  | 'NO_PUBLISHED_CONFIG'
  | 'CALCULATION_PENDING'
  | 'STALE_EVIDENCE'
  | 'INVALID_PUBLISHED_CONFIG'
  | 'NO_AUTHORITATIVE_SOURCE';

/** Unavailable section helper */
function unavailable(reason: string, reasonCode?: ReasonCode) {
  return {
    status: 'unavailable' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

/** Pending section helper */
function pending(reason: string, reasonCode?: ReasonCode) {
  return {
    status: 'pending' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

/** Failed section helper */
function failed(reason: string, reasonCode?: ReasonCode) {
  return {
    status: 'failed' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

function economicsUnavailable(reason: string, reasonCode?: EconomicsResultReasonCode) {
  return {
    status: 'unavailable' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

function economicsPending(reason: string, reasonCode?: EconomicsResultReasonCode) {
  return {
    status: 'pending' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

function economicsFailed(reason: string, reasonCode?: EconomicsResultReasonCode) {
  return {
    status: 'failed' as const,
    reason,
    ...(reasonCode != null && { reasonCode }),
  };
}

function missingSectionForLifecycle(lifecycle: FundStateReadV1, staleEvidence = false) {
  const { status, lastError } = lifecycle.calculationState;

  if (status === 'failed') {
    return failed(lastError ?? 'Calculation failed before results were produced');
  }

  if (staleEvidence) {
    return pending(
      'A newer configuration was published. Request recalculation to update.',
      'STALE_EVIDENCE'
    );
  }

  if (status === 'not_requested') {
    return pending('Calculations not yet requested');
  }

  if (status === 'submitted' || status === 'calculating') {
    return pending('Calculations are still in progress');
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

    const waterfallSection = await this.loadWaterfallSection(fundId, lifecycle);
    const economicsSection = await this.loadEconomicsSection(fundId, lifecycle);

    const fundIdentity = {
      name: fund.name,
      vintageYear: fund.vintageYear,
      size: Number(fund.size),
    };

    const scorecardSection = this.buildScorecardSection(
      fundId,
      fundIdentity,
      reserveSection,
      pacingSection,
      lifecycle
    );

    return {
      status,
      fundId,
      fund: fundIdentity,
      lifecycle,
      sections: {
        reserve: reserveSection,
        pacing: pacingSection,
        scorecard: scorecardSection,
        scenarios: unavailable('No authoritative source', 'NO_AUTHORITATIVE_SOURCE'),
        waterfall: waterfallSection,
        economics: economicsSection,
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
    let staleEvidence = false;

    if (publishedVersion != null) {
      snapshot = await db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, snapshotType),
          eq(fundSnapshots.configVersion, publishedVersion),
          isNull(fundSnapshots.scenarioSetId)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      });

      if (!snapshot) {
        const staleSnapshot = await db.query.fundSnapshots.findFirst({
          where: and(
            eq(fundSnapshots.fundId, fundId),
            eq(fundSnapshots.type, snapshotType),
            ne(fundSnapshots.configVersion, publishedVersion),
            isNull(fundSnapshots.scenarioSetId)
          ),
          orderBy: desc(fundSnapshots.createdAt),
        });
        staleEvidence = staleSnapshot != null;
      }
    }

    // Tier 2: legacy fallback only when lifecycle derivation proved legacy evidence.
    if (!snapshot && lifecycle.calculationState.legacyEvidence) {
      snapshot = await db.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, snapshotType),
          isNull(fundSnapshots.configVersion),
          isNull(fundSnapshots.scenarioSetId)
        ),
        orderBy: desc(fundSnapshots.createdAt),
      });

      if (snapshot) {
        legacyEvidence = true;
      }
    }

    if (!snapshot) {
      return missingSectionForLifecycle(lifecycle, staleEvidence);
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

  private buildScorecardSection(
    fundId: number,
    fund: { name: string; vintageYear: number; size: number },
    reserveSection: {
      status: string;
      reason?: string;
      reasonCode?: string;
      legacyEvidence?: boolean;
      payload?: Record<string, unknown>;
    },
    pacingSection: {
      status: string;
      reason?: string;
      reasonCode?: string;
      legacyEvidence?: boolean;
      payload?: Record<string, unknown>;
    },
    lifecycle: FundStateReadV1
  ) {
    // Version coherence: if one section is legacy and the other is not,
    // only include the non-legacy (current-version) section's facts
    const reserveIsLegacy = reserveSection.status === 'available' && reserveSection.legacyEvidence;
    const pacingIsLegacy = pacingSection.status === 'available' && pacingSection.legacyEvidence;
    const mixedEvidence =
      reserveSection.status === 'available' &&
      pacingSection.status === 'available' &&
      reserveIsLegacy !== pacingIsLegacy;

    const effectiveReserve =
      mixedEvidence && reserveIsLegacy ? { status: 'unavailable' as const } : reserveSection;
    const effectivePacing =
      mixedEvidence && pacingIsLegacy ? { status: 'unavailable' as const } : pacingSection;

    if (mixedEvidence) {
      log.warn(
        { fundId, section: 'scorecard' },
        'Mixed-version evidence detected, omitting stale section'
      );
    }

    const lastCalc = lifecycle.calculationState.lastCalculatedAt ?? null;
    const payload = mapScorecardFromEvidence(
      fund,
      effectiveReserve as Parameters<typeof mapScorecardFromEvidence>[1],
      effectivePacing as Parameters<typeof mapScorecardFromEvidence>[2],
      lastCalc
    );

    // Scorecard requires fundSize + at least one snapshot-backed fact to be "available"
    const hasSnapshotFact =
      payload.reserveRatio != null ||
      payload.avgConfidence != null ||
      payload.yearsToFullDeploy != null;

    if (!hasSnapshotFact) {
      const staleEvidence =
        reserveSection.reasonCode === 'STALE_EVIDENCE' ||
        pacingSection.reasonCode === 'STALE_EVIDENCE';

      const missingSection = missingSectionForLifecycle(lifecycle, staleEvidence);
      log.info(
        {
          fundId,
          section: 'scorecard',
          reasonCode: missingSection.reasonCode,
          status: missingSection.status,
        },
        'Scorecard not available: no snapshot-backed facts'
      );
      return missingSection;
    }

    return {
      status: 'available' as const,
      payload,
    };
  }

  private async loadWaterfallSection(fundId: number, lifecycle: FundStateReadV1) {
    const publishedVersion = lifecycle.configState.publishedVersion;
    if (publishedVersion == null || !lifecycle.configState.hasPublished) {
      return unavailable('No published config available', 'NO_PUBLISHED_CONFIG');
    }

    const publishedConfig = await db.query.fundConfigs.findFirst({
      where: and(
        eq(fundConfigs.fundId, fundId),
        eq(fundConfigs.isPublished, true),
        eq(fundConfigs.version, publishedVersion)
      ),
    });

    if (!publishedConfig) {
      return failed('Published config version could not be loaded');
    }

    const parsedConfig = FundDraftWriteV1Schema.safeParse(publishedConfig.config);
    if (!parsedConfig.success) {
      log.warn(
        {
          fundId,
          section: 'waterfall',
          reasonCode: 'INVALID_PUBLISHED_CONFIG',
          configVersion: publishedConfig.version,
          issues: parsedConfig.error.issues.map((i) => i.message),
        },
        'Published config failed validation'
      );
      return failed('Published config is invalid', 'INVALID_PUBLISHED_CONFIG');
    }

    const payload = mapPublishedConfigToWaterfallSetup(parsedConfig.data);
    if (!payload) {
      return unavailable(
        'Published config does not include waterfall setup',
        'NO_AUTHORITATIVE_SOURCE'
      );
    }

    return {
      status: 'available' as const,
      source: 'fund_config' as const,
      configVersion: publishedConfig.version,
      publishedAt: publishedConfig.publishedAt?.toISOString() ?? null,
      payload,
    };
  }

  private async loadEconomicsSection(fundId: number, lifecycle: FundStateReadV1) {
    if (!isFlagEnabled('enable_gp_economics_engine')) {
      return economicsUnavailable('GP economics engine is disabled', 'ECONOMICS_DISABLED');
    }

    const publishedVersion = lifecycle.configState.publishedVersion;
    if (publishedVersion == null || !lifecycle.configState.hasPublished) {
      return economicsUnavailable(
        'Published economics assumptions are not configured',
        'ECONOMICS_NOT_CONFIGURED'
      );
    }

    const publishedConfig = await db.query.fundConfigs.findFirst({
      where: and(
        eq(fundConfigs.fundId, fundId),
        eq(fundConfigs.isPublished, true),
        eq(fundConfigs.version, publishedVersion)
      ),
    });

    if (!publishedConfig) {
      return economicsFailed(
        'Published config version could not be loaded',
        'ECONOMICS_ENGINE_FAILED'
      );
    }

    const parsedConfig = FundDraftWriteV1Schema.safeParse(publishedConfig.config);
    if (!parsedConfig.success) {
      log.warn(
        {
          fundId,
          section: 'economics',
          reasonCode: 'ECONOMICS_INPUT_INVALID',
          configVersion: publishedConfig.version,
          issues: parsedConfig.error.issues.map((i) => i.message),
        },
        'Published config failed economics validation'
      );
      return economicsFailed(
        'Published config is invalid for economics',
        'ECONOMICS_INPUT_INVALID'
      );
    }

    if (!hasEconomicsAssumptions(parsedConfig.data)) {
      return economicsUnavailable(
        'Published economics assumptions are not configured',
        'ECONOMICS_NOT_CONFIGURED'
      );
    }

    const currentSnapshot = await db.query.fundSnapshots.findFirst({
      where: and(
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, 'ECONOMICS'),
        eq(fundSnapshots.configVersion, publishedVersion),
        isNull(fundSnapshots.scenarioSetId)
      ),
      orderBy: desc(fundSnapshots.createdAt),
    });

    if (currentSnapshot) {
      try {
        return {
          status: 'available' as const,
          source: 'fund_snapshots' as const,
          configVersion: publishedVersion,
          calculatedAt:
            currentSnapshot.snapshotTime?.toISOString() ??
            currentSnapshot.createdAt?.toISOString() ??
            null,
          payload: mapEconomicsSnapshot(currentSnapshot.payload as Record<string, unknown>),
        };
      } catch (error) {
        log.warn(
          {
            fundId,
            section: 'economics',
            reasonCode: 'ECONOMICS_ENGINE_FAILED',
            configVersion: publishedVersion,
            error: error instanceof Error ? error.message : String(error),
          },
          'Economics snapshot failed result-contract validation'
        );
        return economicsFailed('Economics snapshot is invalid', 'ECONOMICS_ENGINE_FAILED');
      }
    }

    const staleSnapshot = await db.query.fundSnapshots.findFirst({
      where: and(
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, 'ECONOMICS'),
        ne(fundSnapshots.configVersion, publishedVersion),
        isNull(fundSnapshots.scenarioSetId)
      ),
      orderBy: desc(fundSnapshots.createdAt),
    });
    if (staleSnapshot) {
      return economicsPending(
        'Economics snapshot is stale for the latest published configuration',
        'ECONOMICS_STALE_CONFIG_VERSION'
      );
    }

    const { status, lastError } = lifecycle.calculationState;
    if (status === 'failed' && lastError) {
      const reasonCode = lastError.toLowerCase().includes('invariant')
        ? 'ECONOMICS_INVARIANT_FAILED'
        : 'ECONOMICS_ENGINE_FAILED';
      return economicsFailed(lastError, reasonCode);
    }

    return economicsPending(
      'Economics snapshot has not been produced for the latest published configuration',
      'ECONOMICS_SNAPSHOT_PENDING'
    );
  }
}

export const fundResultsReadService = new FundResultsReadService();
