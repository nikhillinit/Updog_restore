import type { FundCompanyActualsFact } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  ScenarioCaseSeedV1Schema,
  type ScenarioCaseSeedV1,
} from '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';

function buildObservedMoneyField(
  fact: FundCompanyActualsFact,
  value: string,
  source: string
): ScenarioCaseSeedV1['fields']['investment'] {
  if (fact.currencyStatus !== 'base_currency') {
    return { status: 'unavailable', value: null, reason: 'currency_blocked' };
  }
  if (fact.provenance.trustState === 'FAILED') {
    return { status: 'unavailable', value: null, reason: 'facts_unavailable' };
  }
  if (fact.provenance.trustState === 'UNAVAILABLE') {
    return { status: 'unavailable', value: null, reason: 'facts_unavailable' };
  }
  if (fact.activeRoundIds.length === 0) {
    return { status: 'unavailable', value: null, reason: 'source_missing' };
  }
  return { status: 'seeded', value, source };
}

function buildFmvField(fact: FundCompanyActualsFact): ScenarioCaseSeedV1['fields']['fmv'] {
  if (fact.currencyStatus !== 'base_currency') {
    return { status: 'unavailable', value: null, reason: 'currency_blocked' };
  }
  if (fact.provenance.trustState === 'FAILED') {
    return { status: 'unavailable', value: null, reason: 'facts_unavailable' };
  }
  if (fact.provenance.trustState === 'UNAVAILABLE') {
    return { status: 'unavailable', value: null, reason: 'facts_unavailable' };
  }
  if (fact.planningFmvStatus === 'stale') {
    return { status: 'unavailable', value: null, reason: 'fmv_stale' };
  }
  if (fact.planningFmvStatus !== 'active' || fact.latestPlanningFmvValue === null) {
    return { status: 'unavailable', value: null, reason: 'no_active_fmv' };
  }
  return {
    status: 'seeded',
    value: fact.latestPlanningFmvValue,
    source: 'facts.latestPlanningFmvValue',
  };
}

export function buildScenarioCaseSeed(input: {
  fundId: number;
  fact: FundCompanyActualsFact;
  asOfDate: string;
}): ScenarioCaseSeedV1 {
  if (input.fundId !== input.fact.fundId) {
    throw new Error(`Fact fund ${input.fact.fundId} does not match requested fund ${input.fundId}`);
  }

  return ScenarioCaseSeedV1Schema.parse({
    contractVersion: 'scenario-case-seed-v1',
    fundId: input.fundId,
    companyId: input.fact.companyId,
    asOfDate: input.asOfDate,
    factsInputHash: input.fact.inputHash,
    trustState: input.fact.provenance.trustState,
    currencyStatus: input.fact.currencyStatus,
    fields: {
      investment: buildObservedMoneyField(
        input.fact,
        input.fact.initialInvestmentAmount,
        'facts.initialInvestmentAmount'
      ),
      followOns: buildObservedMoneyField(
        input.fact,
        input.fact.followOnInvestmentAmount,
        'facts.followOnInvestmentAmount'
      ),
      fmv: buildFmvField(input.fact),
      exitValuation: {
        value: null,
        status: 'user_required',
        marketReference:
          input.fact.provenance.trustState === 'FAILED' ? null : input.fact.latestRoundValuation,
      },
      probability: { value: null, status: 'user_required' },
      ownershipAtExit: { value: null, status: 'user_required' },
    },
    warnings: input.fact.warnings,
  });
}
