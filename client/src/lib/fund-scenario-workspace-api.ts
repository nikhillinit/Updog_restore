import { apiRequest } from '@/lib/queryClient';
import { FundScenarioSetListResponseV1Schema } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { z } from 'zod';

const FUND_ID_PATTERN = /^\d+$/;
const COMPANY_ID_PATTERN = /^[1-9]\d*$/;
const SCENARIO_SET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CompanyScenarioSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
    isLocked: z.boolean(),
    caseCount: z.number().int().nonnegative(),
  })
  .strict();

export const CompanyScenarioListResponseSchema = z.array(CompanyScenarioSummarySchema);

export const CompanyScenarioCreateResponseSchema = z
  .object({
    scenario: CompanyScenarioSummarySchema,
    replay: z.boolean(),
  })
  .strict();

export type CompanyScenarioSummary = z.infer<typeof CompanyScenarioSummarySchema>;

export function assertFundId(fundId: string): void {
  if (!FUND_ID_PATTERN.test(fundId)) {
    throw new Error(`Invalid fund ID: ${fundId}`);
  }
}

export function assertCompanyId(companyId: string): void {
  const parsed = Number(companyId);
  if (
    !COMPANY_ID_PATTERN.test(companyId) ||
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(`Invalid company ID: ${companyId}`);
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

export function companyScenariosApiPath(companyId: string): string {
  assertCompanyId(companyId);
  return `/api/companies/${encodeURIComponent(companyId)}/scenarios`;
}

export async function fetchCompanyScenarios(companyId: string): Promise<CompanyScenarioSummary[]> {
  const raw = await apiRequest('GET', companyScenariosApiPath(companyId));
  return CompanyScenarioListResponseSchema.parse(raw);
}

export async function createCompanyScenario(
  companyId: string,
  idempotencyKey: string
): Promise<z.infer<typeof CompanyScenarioCreateResponseSchema>> {
  const raw = await apiRequest('POST', companyScenariosApiPath(companyId), {}, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return CompanyScenarioCreateResponseSchema.parse(raw);
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
