import type {
  ScenarioEvidenceStateV1,
  ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export interface ScenarioEvidenceSourceV1 {
  scenarioSetId: string | null;
  scenarioSetName: string | null;
  calculationMode: ScenarioSetResultSummaryV1['calculationMode'] | null;
  sourceConfigVersion: number | null;
  currentPublishedConfigVersion: number | null;
  calculatedAt: string | null;
  source: 'fund_snapshots' | null;
  state: ScenarioEvidenceStateV1;
  reason?: string | null;
}

/** Shared state -> Tailwind token map for every scenario evidence band. */
export function scenarioStateClasses(state: ScenarioEvidenceStateV1): string {
  switch (state) {
    case 'CURRENT':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'STALE_PUBLISH':
    case 'CALCULATING':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'STALE_CONFIG':
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'UNAVAILABLE':
      return 'border-beige-200 bg-beige-50 text-charcoal-500';
  }
}

/** Shared plain-language explanation for a scenario evidence state. */
export function scenarioStateExplanation(state: ScenarioEvidenceStateV1): string {
  switch (state) {
    case 'CURRENT':
      return 'Scenario results were calculated against the current published configuration.';
    case 'STALE_PUBLISH':
      return 'A newer configuration has been published since this scenario was calculated.';
    case 'STALE_CONFIG':
      return 'Scenario overrides reference entities that are no longer valid in the current configuration.';
    case 'CALCULATING':
      return 'Scenario calculation is in progress.';
    case 'FAILED':
      return 'Scenario calculation failed.';
    case 'UNAVAILABLE':
      return 'Scenario evidence is unavailable.';
  }
}

/** Shared "CALCULATED ..." timestamp formatting for scenario evidence bands. */
export function scenarioCalculatedTimestamp(value: string | null): string {
  if (!value) return 'CALCULATED UNAVAILABLE';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'CALCULATED UNAVAILABLE';

  return `CALCULATED ${new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)}`;
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
    calculationMode: set.calculationMode,
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
