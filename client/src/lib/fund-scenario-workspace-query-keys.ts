export function workspaceQueryKey(fundId: string) {
  return ['fund-scenario-workspace', fundId] as const;
}

export function fundScenarioSeedsQueryKey(fundId: string) {
  return ['fund-scenario-analysis', fundId, 'seeds'] as const;
}

export function companyScenarioListQueryKey(companyId: string) {
  return ['company-scenarios', companyId] as const;
}

export function scenarioSetListQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets'] as const;
}

export function scenarioSourceConfigQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', 'source-config'] as const;
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

export function capitalScenarioSourceQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'capital-plan-v1', 'source'] as const;
}
export function capitalScenarioListQueryKey(fundId: string, includeArchived = false) {
  return [...workspaceQueryKey(fundId), 'capital-plan-v1', 'list', { includeArchived }] as const;
}
export function capitalScenarioDetailQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'capital-plan-v1', 'detail', scenarioSetId] as const;
}
export function capitalScenarioResultsQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'capital-plan-v1', 'results', scenarioSetId] as const;
}
export function capitalScenarioComparisonQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'capital-plan-v1', 'comparison', scenarioSetId] as const;
}
