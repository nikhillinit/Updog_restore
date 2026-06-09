export function workspaceQueryKey(fundId: string) {
  return ['fund-scenario-workspace', fundId] as const;
}

export function scenarioSetListQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets'] as const;
}

export function scenarioSetDetailQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'detail'] as const;
}

export function scenarioSetStatusQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'status'] as const;
}

export function fundResultsQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'results'] as const;
}

export function scenarioComparisonQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'comparison'] as const;
}
