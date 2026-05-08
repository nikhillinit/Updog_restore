/**
 * Pure snapshot-to-section mappers for fund results.
 *
 * These transform raw snapshot payloads (ReserveSummary, PacingSummary)
 * into the section payload shapes defined in the fund-results-v1 contract.
 * No I/O -- pure functions only.
 *
 * @module server/services/fund-results-mappers
 */

import type { ReserveSummary, PacingSummary } from '@shared/types';
import type {
  EconomicsResultsSection,
  ReserveResultsSection,
  PacingResultsSection,
} from '@shared/contracts/fund-results-v1.contract';
import { EconomicsResultV1Schema } from '@shared/contracts/economics-v1.contract';

/**
 * Map a ReserveSummary snapshot to the ReserveResultsSection payload.
 * Derives reserveRatio from totalAllocation / fundSize; returns 0 when
 * fundSize is zero to avoid division error.
 */
export function mapReserveSnapshot(
  snapshot: ReserveSummary,
  fundSize: number
): ReserveResultsSection {
  return {
    totalAllocation: snapshot.totalAllocation,
    reserveRatio: fundSize > 0 ? snapshot.totalAllocation / fundSize : 0,
    avgConfidence: snapshot.avgConfidence,
    allocations: snapshot.allocations.map((a) => ({
      allocation: a.allocation,
      confidence: a.confidence,
      rationale: a.rationale,
    })),
  };
}

/**
 * Map a PacingSummary snapshot to the PacingResultsSection payload.
 * Derives yearsToFullDeploy from totalQuarters / 4 and deploymentRate
 * from avgQuarterlyDeployment.
 */
export function mapPacingSnapshot(snapshot: PacingSummary): PacingResultsSection {
  return {
    deploymentRate: snapshot.avgQuarterlyDeployment,
    yearsToFullDeploy: snapshot.totalQuarters / 4,
    totalQuarters: snapshot.totalQuarters,
    marketCondition: snapshot.marketCondition,
    deployments: snapshot.deployments.map((d) => ({
      quarter: d.quarter,
      deployment: d.deployment,
      note: d.note,
    })),
  };
}

export function mapEconomicsSnapshot(
  snapshot: Record<string, unknown>
): Extract<EconomicsResultsSection, { status: 'available' }>['payload'] {
  return EconomicsResultV1Schema.parse(snapshot);
}
