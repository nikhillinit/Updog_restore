import { apiRequest } from '@/lib/queryClient';
import {
  FundScenarioSetListResponseV1Schema,
  FundScenarioSourceConfigResponseV1Schema,
  type FundScenarioSourceConfigResponseV1,
  CAPITAL_PLAN_REPRESENTATION,
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioCapitalListResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
  FundScenarioCapitalCreateResponseV1Schema,
  FundScenarioCapitalCalculateResponseV1Schema,
  FundScenarioCapitalArchiveResponseV1Schema,
  type CreateFundScenarioSetV3,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { FundScenarioCapitalComparisonV1Schema } from '@shared/contracts/fund-scenario-comparison-v1.contract';
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
  if (!COMPANY_ID_PATTERN.test(companyId) || !Number.isSafeInteger(parsed) || parsed <= 0) {
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
  const raw = await apiRequest(
    'POST',
    companyScenariosApiPath(companyId),
    {},
    {
      headers: { 'Idempotency-Key': idempotencyKey },
    }
  );
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

export async function fetchScenarioSourceConfig(
  fundId: string
): Promise<FundScenarioSourceConfigResponseV1> {
  const raw = await apiRequest('GET', scenarioApiPath(fundId, '/scenario-sets/source-config'));
  return FundScenarioSourceConfigResponseV1Schema.parse(raw);
}

function capitalPath(path: string): string {
  return `${path}?representation=${CAPITAL_PLAN_REPRESENTATION}`;
}

export async function fetchCapitalScenarioSource(fundId: string) {
  return FundScenarioCapitalSourceResponseV1Schema.parse(
    await apiRequest('GET', capitalPath(scenarioApiPath(fundId, '/scenario-sets/source-config')))
  );
}

export async function fetchCapitalScenarioList(fundId: string, includeArchived = false) {
  return FundScenarioCapitalListResponseV1Schema.parse(
    await apiRequest(
      'GET',
      `${capitalPath(scenarioApiPath(fundId, '/scenario-sets'))}&includeArchived=${includeArchived}`
    )
  );
}

export async function fetchCapitalScenarioDetail(fundId: string, scenarioSetId: string) {
  return FundScenarioCapitalDetailResponseV1Schema.parse(
    await apiRequest('GET', capitalPath(scenarioSetApiPath(fundId, scenarioSetId)))
  );
}

export async function fetchCapitalScenarioResults(fundId: string, scenarioSetId: string) {
  return FundScenarioCapitalResultsResponseV1Schema.parse(
    await apiRequest('GET', capitalPath(scenarioSetApiPath(fundId, scenarioSetId, '/results')))
  );
}

export async function fetchCapitalScenarioComparison(fundId: string, scenarioSetId: string) {
  return FundScenarioCapitalComparisonV1Schema.parse(
    await apiRequest('GET', capitalPath(scenarioSetApiPath(fundId, scenarioSetId, '/comparison')))
  );
}

export async function createCapitalScenario(
  fundId: string,
  request: CreateFundScenarioSetV3,
  idempotencyKey: string
) {
  return FundScenarioCapitalCreateResponseV1Schema.parse(
    await apiRequest(
      'POST',
      capitalPath(scenarioApiPath(fundId, '/scenario-sets')),
      CreateFundScenarioSetV3Schema.parse(request),
      { headers: { 'Idempotency-Key': idempotencyKey } }
    )
  );
}

export async function calculateCapitalScenario(fundId: string, scenarioSetId: string) {
  return FundScenarioCapitalCalculateResponseV1Schema.parse(
    await apiRequest('POST', capitalPath(scenarioSetApiPath(fundId, scenarioSetId, '/calculate')))
  );
}

export async function archiveCapitalScenario(fundId: string, scenarioSetId: string) {
  return FundScenarioCapitalArchiveResponseV1Schema.parse(
    await apiRequest('POST', capitalPath(scenarioSetApiPath(fundId, scenarioSetId, '/archive')), {})
  );
}
