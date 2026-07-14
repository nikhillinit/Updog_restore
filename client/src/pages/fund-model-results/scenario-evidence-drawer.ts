/**
 * Scenario-section evidence drawer derivation (Plan 9 Wave 9B1).
 *
 * The Scenario Analysis section is the ONE fund-model-results section whose
 * contract exposes evidence today (FundScenarioComparisonV1 via
 * evidenceFromScenarioComparison). This pure helper maps the section's
 * comparison fetch state onto FinancialEvidenceDrawer presentation state
 * (D-C: loading / empty / failed / ready), so the page component stays thin.
 *
 * @module client/pages/fund-model-results/scenario-evidence-drawer
 */

import { evidenceFromScenarioComparison, type FinancialEvidence } from '@/components/fund-results';
import type { DecisionState } from '@/components/fund-results/DecisionStateBadge';
import {
  comparisonEvidenceState,
  comparisonStatusCopy,
} from '@/components/fund-results/scenario-comparison-evidence';
import type { ScenarioComparisonState } from './types';

export const SCENARIO_FACTS_DOMAIN_NOUN = 'scenario comparisons';

interface ScenarioEvidenceDrawerCommon {
  entityLabel: string;
  decisionState: DecisionState;
  decisionReason?: string;
}

/**
 * Discriminated exactly like FinancialEvidenceDrawerProps so the page can
 * spread this slice straight into the drawer: 'ready' carries non-null
 * evidence and 'failed' carries its reason.
 */
export type ScenarioEvidenceDrawerState = ScenarioEvidenceDrawerCommon &
  (
    | { status: 'ready'; evidence: FinancialEvidence }
    | { status: 'loading' | 'empty'; evidence: null }
    | { status: 'failed'; evidence: null; statusReason: string }
  );

/**
 * Comparison evidence state -> generic decision state. Mapped verbatim from
 * the contract's own staleness vocabulary; nothing is invented.
 */
function decisionFromEvidenceState(state: string): {
  decisionState: DecisionState;
  decisionReason?: string;
} {
  switch (state) {
    case 'CURRENT':
      return { decisionState: 'actionable' };
    case 'STALE_PUBLISH':
    case 'STALE_CONFIG':
      return {
        decisionState: 'indicative',
        decisionReason: 'Stale since the published configuration changed',
      };
    case 'CALCULATING':
      return { decisionState: 'indicative', decisionReason: 'Calculation in progress' };
    case 'FAILED':
      return { decisionState: 'not_actionable', decisionReason: 'Comparison calculation failed' };
    default:
      return { decisionState: 'not_actionable' };
  }
}

export function scenarioEvidenceDrawerState(
  state: ScenarioComparisonState
): ScenarioEvidenceDrawerState {
  if (state.kind === 'error') {
    return {
      status: 'failed',
      evidence: null,
      entityLabel: 'Scenario comparison',
      decisionState: 'not_actionable',
      statusReason: state.message,
    };
  }

  const comparison = state.comparisons[0];

  if (comparison === undefined) {
    if (state.kind === 'loading') {
      return {
        status: 'loading',
        evidence: null,
        entityLabel: 'Scenario comparison',
        decisionState: 'not_actionable',
      };
    }
    // Per-set fetch failures land in failedScenarioSetIds (kind 'data');
    // with no loadable comparison at all this is a FAILED disclosure (D-C),
    // never a silent empty.
    if (state.failedScenarioSetIds.length > 0) {
      return {
        status: 'failed',
        evidence: null,
        entityLabel: 'Scenario comparison',
        decisionState: 'not_actionable',
        statusReason: 'Scenario comparison could not be loaded for this scenario set.',
      };
    }
    return {
      status: 'empty',
      evidence: null,
      entityLabel: 'Scenario comparison',
      decisionState: 'not_actionable',
    };
  }

  // Multiple comparisons can exist; the drawer discloses the FIRST set's
  // evidence and names it truthfully (never an invented aggregate).
  const evidence = evidenceFromScenarioComparison(comparison, comparison.staleness ?? null);
  const decision = decisionFromEvidenceState(comparisonEvidenceState(comparison));
  const decisionReason =
    decision.decisionReason ??
    (decision.decisionState === 'not_actionable' ? comparisonStatusCopy(comparison) : undefined);

  return {
    status: 'ready',
    evidence,
    entityLabel: comparison.scenarioSet.name,
    decisionState: decision.decisionState,
    ...(decisionReason !== undefined ? { decisionReason } : {}),
  };
}
