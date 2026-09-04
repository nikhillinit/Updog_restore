import type {
  ConsumerEvaluationReasonV3,
  ConsumerEvaluationV3,
} from '../../contracts/financial-facts-consumer-policies';
import type { FinancialFactsPayloadV5 } from '../../contracts/financial-facts-snapshot-v1.contract';

function unresolvedRosterCompanyIds(payload: FinancialFactsPayloadV5): number[] {
  const rosterCompanyIds = new Set(
    payload.valuationActuals.roster.map(({ companyId }) => companyId)
  );

  return [...rosterCompanyIds]
    .filter(
      (companyId) =>
        !payload.companyActuals.facts.some(
          (fact) => fact.companyId === companyId && fact.investmentIds.length > 0
        )
    )
    .sort((left, right) => left - right);
}

export function evaluatePayload5Consumers(
  payload: FinancialFactsPayloadV5
): ConsumerEvaluationV3[] {
  const forecastReasons: ConsumerEvaluationReasonV3[] = [];
  if (payload.capitalActuals.ledgerCoverage !== 'complete') {
    forecastReasons.push('ledger_coverage_partial');
  }
  if (payload.valuationActuals.coverage !== 'complete') {
    forecastReasons.push('position_valuation_incomplete');
  }
  if (payload.marksSeries.periodNav.length === 0) {
    forecastReasons.push('period_nav_unavailable');
  }

  const reserveReasons: ConsumerEvaluationReasonV3[] = [];
  if (payload.valuationActuals.coverage !== 'complete') {
    reserveReasons.push('position_valuation_incomplete');
  }

  const unresolvedCompanyIds = unresolvedRosterCompanyIds(payload);
  if (unresolvedCompanyIds.length > 0) {
    reserveReasons.push('investment_lineage_unresolved');
  }

  const reserveEvaluation: ConsumerEvaluationV3 = {
    consumer: 'reserve',
    status: reserveReasons.length > 0 ? 'blocked' : 'accepted',
    reasons: reserveReasons,
    ...(unresolvedCompanyIds.length > 0
      ? {
          details: [
            {
              code: 'investment_lineage_unresolved' as const,
              companyIds: unresolvedCompanyIds,
            },
          ],
        }
      : {}),
  };

  return [
    {
      consumer: 'forecast',
      status: forecastReasons.length > 0 ? 'blocked' : 'accepted',
      reasons: forecastReasons,
    },
    reserveEvaluation,
    {
      consumer: 'economics',
      status: 'blocked',
      reasons: ['unsupported_payload_policy'],
    },
    {
      consumer: 'periodic_analysis',
      status: 'blocked',
      reasons: ['unsupported_payload_policy'],
    },
  ];
}
