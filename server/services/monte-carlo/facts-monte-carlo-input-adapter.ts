import type { FundCompanyActualsFactsResponse } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  FactsMonteCarloInputV1Schema,
  type FactsMonteCarloCompanyV1,
  type FactsMonteCarloInputV1,
} from '../../../shared/contracts/monte-carlo/facts-input-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const CONTRACT_VERSION = 'monte-carlo-facts-input-v1' as const;

function normalizeMetadata(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildCompany(
  fact: FundCompanyActualsFactsResponse['facts'][number],
  metadata: { stage: string | null; sector: string | null } | undefined
): FactsMonteCarloCompanyV1 {
  const trustState = fact.provenance.trustState;
  const moneyUnavailable =
    fact.currencyStatus === 'mismatch_blocked' ||
    trustState === 'FAILED' ||
    trustState === 'UNAVAILABLE';

  return {
    companyId: fact.companyId,
    observedInitialInvestment: moneyUnavailable ? null : fact.initialInvestmentAmount,
    observedFollowOnInvestment: moneyUnavailable ? null : fact.followOnInvestmentAmount,
    planningFmv:
      !moneyUnavailable &&
      fact.planningFmvStatus === 'active' &&
      fact.currencyStatus === 'base_currency'
        ? fact.latestPlanningFmvValue
        : null,
    planningFmvStatus: fact.planningFmvStatus,
    stage: normalizeMetadata(metadata?.stage),
    sector: normalizeMetadata(metadata?.sector),
    trustState,
    currencyStatus: fact.currencyStatus,
    warnings: fact.warnings,
  };
}

export function buildFactsMonteCarloInput(input: {
  fundId: number;
  asOfDate: string;
  facts: FundCompanyActualsFactsResponse;
  companyMetadata: ReadonlyMap<number, { stage: string | null; sector: string | null }>;
}): FactsMonteCarloInputV1 {
  if (input.facts.fundId !== input.fundId) {
    throw new Error(
      `Facts fundId ${input.facts.fundId} does not match requested fundId ${input.fundId}`
    );
  }
  if (input.facts.asOfDate !== input.asOfDate) {
    throw new Error(
      `Facts asOfDate ${input.facts.asOfDate} does not match requested asOfDate ${input.asOfDate}`
    );
  }
  const mismatchedCompany = input.facts.facts.find((fact) => fact.fundId !== input.fundId);
  if (mismatchedCompany) {
    throw new Error(
      `Company ${mismatchedCompany.companyId} facts fundId ${mismatchedCompany.fundId} does not match requested fundId ${input.fundId}`
    );
  }

  const normalized = {
    contractVersion: CONTRACT_VERSION,
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    sourceFactsInputHash: input.facts.inputHash,
    companies: [...input.facts.facts]
      .sort((left, right) => left.companyId - right.companyId)
      .map((fact) => buildCompany(fact, input.companyMetadata.get(fact.companyId))),
  } satisfies Omit<FactsMonteCarloInputV1, 'factsInputHash'>;

  return FactsMonteCarloInputV1Schema.parse({
    ...normalized,
    factsInputHash: canonicalSha256(normalized),
  });
}
