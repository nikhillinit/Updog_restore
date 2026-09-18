import type {
  ConsumerEvaluationReasonV3,
  ConsumerEvaluationDetailV3,
  ConsumerEvaluationV3,
} from '../../contracts/financial-facts-consumer-policies';
import type {
  FinancialFactsPayloadV5,
  FinancialFactsPayloadV6,
} from '../../contracts/financial-facts-snapshot-v1.contract';

type ActualsConsumerPayload = FinancialFactsPayloadV5 | FinancialFactsPayloadV6;
type ActualsConsumerCompanyFact = ActualsConsumerPayload['companyActuals']['facts'][number];

export function hasAvailableCompanyMonetaryFacts(
  fact: ActualsConsumerCompanyFact
): fact is ActualsConsumerCompanyFact & {
  initialInvestmentAmount: string;
  followOnInvestmentAmount: string;
  amountOnlyNonEquityAmount: string;
} {
  return (
    (!('monetaryFacts' in fact) || fact.monetaryFacts.availability === 'available') &&
    typeof fact.initialInvestmentAmount === 'string' &&
    typeof fact.followOnInvestmentAmount === 'string' &&
    typeof fact.amountOnlyNonEquityAmount === 'string'
  );
}

function unresolvedRosterCompanyIds(payload: ActualsConsumerPayload): number[] {
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

export function evaluatePayload5Consumers(payload: ActualsConsumerPayload): ConsumerEvaluationV3[] {
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

  const unavailableCompanyIds = payload.companyActuals.facts
    .filter((fact) => !hasAvailableCompanyMonetaryFacts(fact))
    .map((fact) => fact.companyId)
    .sort((left, right) => left - right);
  const monetaryDetails: ConsumerEvaluationDetailV3[] =
    unavailableCompanyIds.length === 0
      ? []
      : [
          {
            code: 'company_monetary_facts_unavailable',
            companyIds: unavailableCompanyIds,
          },
        ];
  if (unavailableCompanyIds.length > 0) {
    forecastReasons.push('company_monetary_facts_unavailable');
    reserveReasons.push('company_monetary_facts_unavailable');
  }

  const reserveDetails: ConsumerEvaluationDetailV3[] = [
    ...(unresolvedCompanyIds.length > 0
      ? [
          {
            code: 'investment_lineage_unresolved' as const,
            companyIds: unresolvedCompanyIds,
          },
        ]
      : []),
    ...monetaryDetails,
  ];
  const reserveEvaluation: ConsumerEvaluationV3 = {
    consumer: 'reserve',
    status: reserveReasons.length > 0 ? 'blocked' : 'accepted',
    reasons: reserveReasons,
    ...(reserveDetails.length > 0 ? { details: reserveDetails } : {}),
  };

  return [
    {
      consumer: 'forecast',
      status: forecastReasons.length > 0 ? 'blocked' : 'accepted',
      reasons: forecastReasons,
      ...(monetaryDetails.length > 0 ? { details: monetaryDetails } : {}),
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
