import type {
  ScenarioEvidenceStateV1,
  ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export interface ScenarioEvidenceSourceV1 {
  scenarioSetId: string | null;
  scenarioSetName: string | null;
  calculationMode: string | null;
  sourceConfigVersion: number | null;
  currentPublishedConfigVersion: number | null;
  calculatedAt: string | null;
  source: 'fund_snapshots' | null;
  state: ScenarioEvidenceStateV1;
  reason?: string | null;
}

const SCENARIO_EVIDENCE_PRECEDENCE: Record<ScenarioEvidenceStateV1, number> = {
  CURRENT: 0,
  UNAVAILABLE: 1,
  CALCULATING: 2,
  STALE_PUBLISH: 3,
  STALE_CONFIG: 4,
  FAILED: 5,
};

export function scenarioEvidenceFromSet(set: ScenarioSetResultSummaryV1): ScenarioEvidenceSourceV1 {
  return {
    scenarioSetId: set.scenarioSetId,
    scenarioSetName: set.name,
    calculationMode: null,
    sourceConfigVersion: set.sourceConfigVersion,
    currentPublishedConfigVersion: set.currentPublishedConfigVersion,
    calculatedAt: set.calculatedAt,
    source: 'fund_snapshots',
    state: set.staleness,
  };
}

export function aggregateScenarioEvidenceState(
  states: ScenarioEvidenceStateV1[]
): ScenarioEvidenceStateV1 {
  if (states.length === 0) {
    return 'UNAVAILABLE';
  }

  return states.reduce((worst, next) =>
    SCENARIO_EVIDENCE_PRECEDENCE[next] > SCENARIO_EVIDENCE_PRECEDENCE[worst] ? next : worst
  );
}

export function aggregateScenarioEvidenceCopy(state: ScenarioEvidenceStateV1): string {
  switch (state) {
    case 'FAILED':
      return 'One or more scenario calculations failed.';
    case 'STALE_CONFIG':
      return 'One or more scenarios reference configuration entities that may no longer be valid.';
    case 'STALE_PUBLISH':
      return 'One or more scenario results are stale relative to the latest published configuration.';
    case 'CALCULATING':
      return 'One or more scenario calculations are still in progress.';
    case 'UNAVAILABLE':
      return 'Scenario evidence is unavailable for one or more scenario sets.';
    case 'CURRENT':
      return 'All scenario results are current.';
  }
}
