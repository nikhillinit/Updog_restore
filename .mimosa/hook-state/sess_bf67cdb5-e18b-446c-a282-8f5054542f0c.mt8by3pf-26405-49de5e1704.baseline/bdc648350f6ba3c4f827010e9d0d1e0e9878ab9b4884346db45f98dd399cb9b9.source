import Decimal from '../../../shared/lib/decimal-config';
import {
  FundMoicFactsBasisV1Schema,
  type FundMoicFactsBasisV1,
} from '../../../shared/contracts/fund-moic-v1.contract';
import type { FundCompanyActualsFact } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import type { PortfolioCompanyMoicSourceRow } from '../fund-moic-ranking-service';

function legacyValuation(company: PortfolioCompanyMoicSourceRow): string | null {
  return company.currentValuation === null || company.currentValuation === undefined
    ? null
    : new Decimal(company.currentValuation).toDecimalPlaces(6).toString();
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasExplicitExitProbability(company: PortfolioCompanyMoicSourceRow): boolean {
  const value = finiteNumber(company.exitProbability);
  return value !== null && value >= 0 && value <= 1;
}

function hasExplicitReserveExitMultiple(company: PortfolioCompanyMoicSourceRow): boolean {
  const value = finiteNumber(company.exitMoicBps);
  return value !== null && value > 0;
}

function plannedReservesAreZero(company: PortfolioCompanyMoicSourceRow): boolean {
  const value = finiteNumber(company.plannedReservesCents);
  return value === null || value <= 0;
}

function appendEconomicInputReasons(
  reasons: FundMoicFactsBasisV1['reasons'],
  company: PortfolioCompanyMoicSourceRow
): boolean {
  let missing = false;
  if (!hasExplicitExitProbability(company)) {
    reasons.push('exit_probability_missing');
    missing = true;
  }
  if (!hasExplicitReserveExitMultiple(company)) {
    reasons.push('reserve_exit_multiple_missing');
    missing = true;
  }
  return missing;
}

export function buildFundMoicFactsBasis(input: {
  company: PortfolioCompanyMoicSourceRow;
  fact: FundCompanyActualsFact | null;
}): FundMoicFactsBasisV1 {
  if (input.fact === null) {
    const currentValuation = legacyValuation(input.company);
    const reasons: FundMoicFactsBasisV1['reasons'] = [
      currentValuation === null ? 'valuation_unavailable' : 'legacy_current_valuation_fallback',
    ];
    let rankability: FundMoicFactsBasisV1['rankability'] =
      currentValuation === null ? 'not_actionable' : 'indicative';
    if (plannedReservesAreZero(input.company)) {
      reasons.push('planned_reserves_zero');
      rankability = 'not_actionable';
    }
    appendEconomicInputReasons(reasons, input.company);

    return FundMoicFactsBasisV1Schema.parse({
      rankability,
      reasons,
      observedInitialInvestment: '0',
      observedFollowOnInvestment: '0',
      observedTotalInvestment: '0',
      valuationAnchor:
        currentValuation === null
          ? { kind: 'none', value: null, asOfDate: null }
          : {
              kind: 'legacy_current_valuation',
              value: currentValuation,
              asOfDate: null,
            },
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      factsInputHash: null,
      warnings: [
        {
          code: 'FACTS_MISSING',
          severity: 'warning',
          message: 'Company actuals facts are unavailable; observed investment amounts are zero',
          source: 'fund-company-actuals-facts',
        },
      ],
    });
  }

  const hasPlanningFmv =
    (input.fact.planningFmvStatus === 'active' || input.fact.planningFmvStatus === 'stale') &&
    input.fact.currencyStatus === 'base_currency' &&
    input.fact.latestPlanningFmvValue !== null;
  const currencyBlocked = input.fact.currencyStatus === 'mismatch_blocked';
  const legacyCurrentValuation = legacyValuation(input.company);
  const plannedReservesZero = plannedReservesAreZero(input.company);

  let rankability: FundMoicFactsBasisV1['rankability'] = currencyBlocked
    ? 'not_actionable'
    : hasPlanningFmv
      ? input.fact.planningFmvStatus === 'active'
        ? 'actionable'
        : 'indicative'
      : legacyCurrentValuation !== null
        ? 'indicative'
        : 'not_actionable';
  const reasons: FundMoicFactsBasisV1['reasons'] = [];
  if (currencyBlocked) {
    reasons.push('currency_blocked');
  } else if (hasPlanningFmv) {
    reasons.push(
      input.fact.planningFmvStatus === 'active' ? 'planning_fmv_active' : 'planning_fmv_stale'
    );
  } else if (legacyCurrentValuation !== null) {
    reasons.push('legacy_current_valuation_fallback');
  } else {
    reasons.push('valuation_unavailable');
  }
  if (plannedReservesZero) {
    reasons.push('planned_reserves_zero');
    rankability = 'not_actionable';
  }
  if (appendEconomicInputReasons(reasons, input.company) && rankability === 'actionable') {
    rankability = 'indicative';
  }
  const valuationAnchor = currencyBlocked
    ? {
        kind: 'none' as const,
        value: null,
        asOfDate: null,
      }
    : hasPlanningFmv
      ? {
          kind: 'planning_fmv' as const,
          value: input.fact.latestPlanningFmvValue,
          asOfDate: input.fact.latestPlanningFmvDate,
        }
      : legacyCurrentValuation !== null
        ? {
            kind: 'legacy_current_valuation' as const,
            value: legacyCurrentValuation,
            asOfDate: null,
          }
        : {
            kind: 'none' as const,
            value: null,
            asOfDate: null,
          };

  return FundMoicFactsBasisV1Schema.parse({
    rankability,
    reasons,
    observedInitialInvestment: input.fact.initialInvestmentAmount,
    observedFollowOnInvestment: input.fact.followOnInvestmentAmount,
    observedTotalInvestment: new Decimal(input.fact.initialInvestmentAmount)
      .plus(input.fact.followOnInvestmentAmount)
      .toString(),
    valuationAnchor,
    planningFmvStatus: input.fact.planningFmvStatus,
    currencyStatus: input.fact.currencyStatus,
    factsInputHash: input.fact.inputHash,
    warnings: input.fact.warnings,
  });
}
