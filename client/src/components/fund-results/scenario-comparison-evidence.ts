/**
 * scenario-comparison-evidence -- derives truthful evidence-band data from a
 * FundScenarioComparisonV1.
 *
 * This is comparison-specific evidence: it answers "compared to what, and can I
 * trust this comparison" (baseline identity + comparison status), complementing
 * the per-set ScenarioEvidenceHeader that ScenarioSetsSummary already renders.
 * It must not re-print the set-calculation line.
 *
 * Pure derivation only (no rendering); shared by ScenarioComparisonTable and
 * CrossSetScenarioComparisonTable so the two surfaces never drift, mirroring the
 * shared scenarioDeltaCopy idiom.
 *
 * @module client/components/fund-results/scenario-comparison-evidence
 */

import type {
  FundScenarioComparisonV1,
  ScenarioComparisonStalenessV1,
  ScenarioComparisonUnavailableReasonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { ScenarioEvidenceStateV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';

/** Resolve the evidence state from the staleness union (string or object form). */
export function comparisonStalenessState(
  staleness: ScenarioComparisonStalenessV1 | null
): ScenarioEvidenceStateV1 | null {
  if (staleness == null) return null;
  return typeof staleness === 'string' ? staleness : staleness.state;
}

/**
 * The glanceable Tier-1 evidence state for a comparison band. The badge reflects
 * whether a trustworthy comparison exists: a non-comparable comparison reads
 * UNAVAILABLE (the status copy explains why), and a comparable one carries its
 * own scenario staleness state.
 */
export function comparisonEvidenceState(
  comparison: FundScenarioComparisonV1
): ScenarioEvidenceStateV1 {
  if (comparison.comparisonStatus !== 'comparable') return 'UNAVAILABLE';
  return comparisonStalenessState(comparison.staleness) ?? 'UNAVAILABLE';
}

/** Latest published config version, only when the staleness object carries it. */
export function comparisonPublishedConfigVersion(
  comparison: FundScenarioComparisonV1
): number | null {
  const staleness = comparison.staleness;
  if (staleness == null || typeof staleness === 'string') return null;
  return staleness.currentPublishedConfigVersion;
}

const SCENARIO_COMPARISON_UNAVAILABLE_COPY: Record<ScenarioComparisonUnavailableReasonV1, string> =
  {
    ECONOMICS_DISABLED: 'Scenario comparison unavailable because economics is disabled.',
    ECONOMICS_ASSUMPTIONS_MISSING:
      'Scenario comparison unavailable because economics assumptions are missing.',
    BASELINE_ECONOMICS_SNAPSHOT_MISSING:
      'Scenario calculated; comparison unavailable because baseline economics is missing.',
    BASELINE_ECONOMICS_SNAPSHOT_STALE:
      'Scenario calculated; comparison stale because baseline economics belongs to an older config.',
    VARIANT_ECONOMICS_FAILED:
      'Scenario calculated; comparison unavailable because variant economics failed.',
    SOURCE_CONFIG_STALE_UNPINNED:
      'Scenario comparison unavailable because the source config is stale.',
    UNSUPPORTED_OVERRIDE_TYPE: 'Scenario comparison unavailable for this override type.',
  };

/** Comparison-specific explanation: why this comparison is or is not usable. */
export function comparisonStatusCopy(comparison: FundScenarioComparisonV1): string {
  if (comparison.unavailableReason) {
    return SCENARIO_COMPARISON_UNAVAILABLE_COPY[comparison.unavailableReason];
  }
  if (comparison.comparisonStatus === 'no_scenario_results') {
    return 'Calculate this scenario set to compare it with the authoritative economics baseline.';
  }
  if (comparison.comparisonStatus === 'baseline_unavailable') {
    return `Authoritative economics baseline is unavailable for source config v${comparison.scenarioSet.sourceConfigVersion}.`;
  }
  if (comparison.comparisonStatus === 'unsupported_override_type') {
    return 'Scenario comparison is not supported for reserve-allocation scenario sets yet.';
  }
  return 'Scenario comparison is unavailable.';
}

/**
 * Baseline identity for the comparison band: the authoritative economics result
 * pinned to the scenario set's source config version. Stated as identity (not a
 * raw storage source string), so the claim is exactly what the contract
 * guarantees -- the baseline the per-set deltas were computed against.
 */
export function comparisonBaselineLabel(comparison: FundScenarioComparisonV1): string {
  return `BASELINE authoritative economics v${comparison.scenarioSet.sourceConfigVersion}`;
}
