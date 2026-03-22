/**
 * Fund State Derivation -- Pure function for lifecycle status
 *
 * All fund lifecycle status MUST be derived through this function.
 * Deriving status elsewhere re-creates the scattered-derivation problem
 * (R1 feedback loop) this service exists to solve.
 *
 * This module is intentionally free of DB imports. It accepts a plain
 * DerivationInput and returns a FundStateReadV1 DTO. This separation
 * makes it trivially unit-testable with zero mocking.
 *
 * @module server/services/fund-state-derivation
 */

import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import { EXPECTED_SNAPSHOT_TYPES } from '@shared/contracts/fund-state-read-v1.contract';
import type { DispatchState } from '@shared/schema/fund';

// ============================================================================
// Input type
// ============================================================================

export interface DerivationInput {
  fundId: number;
  draftConfig: { version: number; updatedAt: Date | null } | null;
  publishedConfig: {
    version: number;
    publishedAt: Date | null;
    updatedAt: Date | null;
  } | null;
  latestVersion: number | null;
  latestRun: {
    id: number;
    configVersion: number;
    correlationId: string;
    dispatchState: DispatchState;
    lastError: string | null;
  } | null;
  attributedSnapshots: Array<{
    type: string;
    configVersion: number | null;
    snapshotTime: Date | null;
    createdAt: Date | null;
  }>;
  engineResultsPresent: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function snapshotsSatisfyExpected(types: Set<string>): boolean {
  return EXPECTED_SNAPSHOT_TYPES.every((t) => types.has(t));
}

/**
 * Find the latest snapshot timestamp from a list of snapshots.
 * Prefers snapshotTime, falls back to createdAt.
 */
function latestSnapshotTimestamp(snapshots: DerivationInput['attributedSnapshots']): Date | null {
  let latest: Date | null = null;
  for (const s of snapshots) {
    const ts = s.snapshotTime ?? s.createdAt;
    if (ts && (!latest || ts.getTime() > latest.getTime())) {
      latest = ts;
    }
  }
  return latest;
}

// ============================================================================
// Derivation
// ============================================================================

export function deriveReadState(input: DerivationInput): FundStateReadV1 {
  const {
    fundId,
    draftConfig,
    publishedConfig,
    latestVersion,
    latestRun,
    attributedSnapshots,
    engineResultsPresent,
  } = input;

  // -- Config axis (Rule 1) --------------------------------------------------
  const configState: FundStateReadV1['configState'] = {
    latestVersion: latestVersion,
    draftVersion: draftConfig?.version ?? null,
    publishedVersion: publishedConfig?.version ?? null,
    hasDraft: draftConfig !== null,
    hasPublished: publishedConfig !== null,
    publishedAt: toIso(publishedConfig?.publishedAt),
    draftUpdatedAt: toIso(draftConfig?.updatedAt),
    publishedUpdatedAt: toIso(publishedConfig?.updatedAt),
  };

  // -- Calculation axis (Rules 2-8) ------------------------------------------

  // Rule 2: No published config -> not_requested
  if (!publishedConfig) {
    return {
      fundId,
      configState,
      calculationState: {
        status: 'not_requested',
        configVersion: null,
        runId: null,
        correlationId: null,
        dispatchState: null,
        availableSnapshotTypes: [],
        expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
        lastCalculatedAt: null,
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent },
    };
  }

  // Rule 3: Published but no calcRun -> not_requested
  // configVersion is null because no calcRun targets any version yet
  if (!latestRun) {
    return {
      fundId,
      configState,
      calculationState: {
        status: 'not_requested',
        configVersion: null,
        runId: null,
        correlationId: null,
        dispatchState: null,
        availableSnapshotTypes: [],
        expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
        lastCalculatedAt: null,
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent },
    };
  }

  // Shared: filter attributed snapshots for published configVersion
  const attributedForVersion = attributedSnapshots.filter(
    (s) => s.configVersion === publishedConfig.version && s.configVersion !== null
  );
  const attributedTypes = new Set(attributedForVersion.map((s) => s.type));

  // Shared: filter unattributed (legacy) snapshots
  const unattributedSnapshots = attributedSnapshots.filter((s) => s.configVersion === null);
  const unattributedTypes = new Set(unattributedSnapshots.map((s) => s.type));

  const ds = latestRun.dispatchState;

  // Rule 4: pending -> submitted
  if (ds === 'pending') {
    return {
      fundId,
      configState,
      calculationState: {
        status: 'submitted',
        configVersion: latestRun.configVersion,
        runId: latestRun.id,
        correlationId: latestRun.correlationId,
        dispatchState: ds,
        availableSnapshotTypes: [...attributedTypes],
        expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
        lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
        lastError: latestRun.lastError,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent },
    };
  }

  // Rule 5: dispatched or partial -> check snapshot coverage
  if (ds === 'dispatched' || ds === 'partial') {
    // Attributed snapshots satisfy expected -> ready
    if (snapshotsSatisfyExpected(attributedTypes)) {
      return {
        fundId,
        configState,
        calculationState: {
          status: 'ready',
          configVersion: latestRun.configVersion,
          runId: latestRun.id,
          correlationId: latestRun.correlationId,
          dispatchState: ds,
          availableSnapshotTypes: [...attributedTypes],
          expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
          lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
          lastError: latestRun.lastError,
          legacyEvidence: false,
        },
        legacy: { engineResultsPresent },
      };
    }

    // Legacy fallback: no attributed snapshots match, but unattributed do
    if (attributedForVersion.length === 0 && snapshotsSatisfyExpected(unattributedTypes)) {
      return {
        fundId,
        configState,
        calculationState: {
          status: 'ready',
          configVersion: latestRun.configVersion,
          runId: latestRun.id,
          correlationId: latestRun.correlationId,
          dispatchState: ds,
          availableSnapshotTypes: [...unattributedTypes],
          expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
          lastCalculatedAt: toIso(latestSnapshotTimestamp(unattributedSnapshots)),
          lastError: latestRun.lastError,
          legacyEvidence: true,
        },
        legacy: { engineResultsPresent },
      };
    }

    // Partial coverage -> calculating (Rule 7 / default)
    return {
      fundId,
      configState,
      calculationState: {
        status: 'calculating',
        configVersion: latestRun.configVersion,
        runId: latestRun.id,
        correlationId: latestRun.correlationId,
        dispatchState: ds,
        availableSnapshotTypes: [...attributedTypes],
        expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
        lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
        lastError: latestRun.lastError,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent },
    };
  }

  // Rule 6: failed -> check if prior attributed snapshots still satisfy
  if (ds === 'failed') {
    // Prior attributed snapshots valid -> ready
    if (snapshotsSatisfyExpected(attributedTypes)) {
      return {
        fundId,
        configState,
        calculationState: {
          status: 'ready',
          configVersion: latestRun.configVersion,
          runId: latestRun.id,
          correlationId: latestRun.correlationId,
          dispatchState: ds,
          availableSnapshotTypes: [...attributedTypes],
          expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
          lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
          lastError: latestRun.lastError,
          legacyEvidence: false,
        },
        legacy: { engineResultsPresent },
      };
    }

    // No prior evidence -> failed
    return {
      fundId,
      configState,
      calculationState: {
        status: 'failed',
        configVersion: latestRun.configVersion,
        runId: latestRun.id,
        correlationId: latestRun.correlationId,
        dispatchState: ds,
        availableSnapshotTypes: [...attributedTypes],
        expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
        lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
        lastError: latestRun.lastError,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent },
    };
  }

  // Rule 7: Default -> calculating
  return {
    fundId,
    configState,
    calculationState: {
      status: 'calculating',
      configVersion: latestRun.configVersion,
      runId: latestRun.id,
      correlationId: latestRun.correlationId,
      dispatchState: ds,
      availableSnapshotTypes: [...attributedTypes],
      expectedSnapshotTypes: [...EXPECTED_SNAPSHOT_TYPES],
      lastCalculatedAt: toIso(latestSnapshotTimestamp(attributedForVersion)),
      lastError: latestRun.lastError,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent },
  };
}
