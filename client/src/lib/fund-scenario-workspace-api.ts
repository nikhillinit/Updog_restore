import { apiRequest } from '@/lib/queryClient';
import { FundScenarioSetListResponseV1Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';

const FUND_ID_PATTERN = /^\d+$/;
const SCENARIO_SET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertFundId(fundId: string): void {
  if (!FUND_ID_PATTERN.test(fundId)) {
    throw new Error(`Invalid fund ID: ${fundId}`);
  }
}

export function assertScenarioSetId(scenarioSetId: string): void {
  if (!SCENARIO_SET_ID_PATTERN.test(scenarioSetId)) {
    throw new Error(`Invalid scenario set ID: ${scenarioSetId}`);
  }
}

export function scenarioApiPath(fundId: string, suffix: string): string {
  assertFundId(fundId);
  return `/api/funds/${encodeURIComponent(fundId)}${suffix}`;
}

export function scenarioSetApiPath(fundId: string, scenarioSetId: string, suffix = ''): string {
  assertScenarioSetId(scenarioSetId);
  return scenarioApiPath(fundId, `/scenario-sets/${encodeURIComponent(scenarioSetId)}${suffix}`);
}

/**
 * Fetches the fund's scenario-set list (extracted verbatim from
 * fund-scenario-workspace.tsx for reuse by the Summary readiness rollup;
 * Plan 9 Wave 9B2 fix round F1).
 */
export async function fetchScenarioSetList(fundId: string) {
  const raw = await apiRequest('GET', scenarioApiPath(fundId, '/scenario-sets'));
  return FundScenarioSetListResponseV1Schema.parse(raw).scenarioSets;
}
