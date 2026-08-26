import {
  FactsReserveCandidateSchema,
  ReserveInputTrustSummarySchema,
  type FactsReserveCandidate,
  type FactsReserveCandidateExclusionReason,
  type ReserveCompanyInputWithProvenance,
  type ReserveInputSourceStatus,
  type ReserveInputTrustSummary,
} from '../../../shared/contracts/reserve-input-provenance.contract';
import Decimal from '../../../shared/lib/decimal-config';
import { buildFundCompanyActualsFacts } from '../fund-actuals/fund-company-actuals-facts-service';
import type { FundMoicFactsSource } from '../fund-moic-ranking-service';
import { buildReservePortfolioInputWithProvenance } from '../reserve-input-builder';

export type { FactsReserveCandidate } from '../../../shared/contracts/reserve-input-provenance.contract';

type ReserveInputField = 'invested' | 'ownership' | 'stage' | 'sector';

const REASON_ORDER: readonly FactsReserveCandidateExclusionReason[] = [
  'missing_ownership',
  'missing_stage',
  'missing_sector',
  'currency_blocked',
  'facts_unavailable',
];

function isTrustedStatus(status: ReserveInputSourceStatus): boolean {
  return status === 'observed' || status === 'approved_assumption';
}

function orderedReasons(
  reasons: ReadonlySet<FactsReserveCandidateExclusionReason>
): FactsReserveCandidateExclusionReason[] {
  return REASON_ORDER.filter((reason) => reasons.has(reason));
}

function eligibleInputIsTrusted(input: ReserveCompanyInputWithProvenance): boolean {
  return Object.values(input.provenance).every((field) => isTrustedStatus(field.status));
}

export async function buildFactsReserveCandidates(input: {
  fundId: number;
  asOfDate: string;
  factsSource?: FundMoicFactsSource;
}): Promise<{
  candidates: FactsReserveCandidate[];
  factsInputHash: string | null;
  trustSummary: ReserveInputTrustSummary;
}> {
  const legacy = await buildReservePortfolioInputWithProvenance(input.fundId);
  const factsSource =
    input.factsSource ??
    (await buildFundCompanyActualsFacts({ fundId: input.fundId, asOfDate: input.asOfDate })
      .then((response) => ({ status: 'available' as const, response }))
      .catch(() => ({ status: 'absent' as const })));
  const facts = factsSource.status === 'available' ? factsSource.response : null;
  const factsByCompany = new Map(
    (facts?.facts ?? []).map((fact) => [fact.companyId, fact] as const)
  );
  const defaultedOccurrences = new Set<string>();
  const unavailableOccurrences = new Set<string>();
  const defaultedFields = new Set<ReserveInputField>();
  const unavailableFields = new Set<ReserveInputField>();

  function countExcludedField(params: {
    companyId: number;
    field: ReserveInputField;
    sourceStatus?: ReserveInputSourceStatus;
  }): void {
    const isDefaulted = params.sourceStatus === 'defaulted';
    const occurrences = isDefaulted ? defaultedOccurrences : unavailableOccurrences;
    const fields = isDefaulted ? defaultedFields : unavailableFields;
    occurrences.add(`${params.companyId}:${params.field}`);
    fields.add(params.field);
  }

  const candidates: FactsReserveCandidate[] = [...legacy.provenancePortfolio]
    .sort((left, right) => left.id - right.id)
    .map((company) => {
      const fact = factsByCompany.get(company.id);
      const reasons = new Set<FactsReserveCandidateExclusionReason>();
      const factsUnavailable =
        fact === undefined ||
        fact.provenance.trustState === 'FAILED' ||
        fact.provenance.trustState === 'UNAVAILABLE';
      if (factsUnavailable) {
        reasons.add('facts_unavailable');
        countExcludedField({ companyId: company.id, field: 'invested' });
      }
      if (fact?.currencyStatus === 'mismatch_blocked') {
        reasons.add('currency_blocked');
        countExcludedField({ companyId: company.id, field: 'invested' });
      }
      if (
        !isTrustedStatus(company.provenance.ownership.status) ||
        !Number.isFinite(company.ownership) ||
        company.ownership < 0 ||
        company.ownership > 1
      ) {
        reasons.add('missing_ownership');
        countExcludedField({
          companyId: company.id,
          field: 'ownership',
          sourceStatus: company.provenance.ownership.status,
        });
      }
      if (!isTrustedStatus(company.provenance.stage.status) || company.stage.trim().length === 0) {
        reasons.add('missing_stage');
        countExcludedField({
          companyId: company.id,
          field: 'stage',
          sourceStatus: company.provenance.stage.status,
        });
      }
      if (
        !isTrustedStatus(company.provenance.sector.status) ||
        company.sector.trim().length === 0
      ) {
        reasons.add('missing_sector');
        countExcludedField({
          companyId: company.id,
          field: 'sector',
          sourceStatus: company.provenance.sector.status,
        });
      }

      if (reasons.size > 0 || !fact) {
        return FactsReserveCandidateSchema.parse({
          status: 'excluded',
          companyId: company.id,
          reasons: orderedReasons(reasons),
          factsInputHash: fact?.inputHash ?? null,
        });
      }

      return FactsReserveCandidateSchema.parse({
        status: 'eligible',
        companyId: company.id,
        factsInputHash: fact.inputHash,
        input: {
          ...company,
          invested: new Decimal(fact.initialInvestmentAmount)
            .plus(fact.followOnInvestmentAmount)
            .toNumber(),
          provenance: {
            ...company.provenance,
            invested: {
              status: 'observed',
              source: 'fund_company_actuals_facts.initialInvestmentAmount+followOnInvestmentAmount',
              reason: null,
            },
          },
        },
      });
    });

  const eligibleInputs = candidates
    .filter((candidate) => candidate.status === 'eligible')
    .map((candidate) => candidate.input);

  return {
    candidates,
    factsInputHash: facts?.inputHash ?? null,
    trustSummary: ReserveInputTrustSummarySchema.parse({
      trustedForActivation: eligibleInputs.every(eligibleInputIsTrusted),
      defaultedInputCount: defaultedOccurrences.size,
      unavailableInputCount: unavailableOccurrences.size,
      defaultedFields: [...defaultedFields].sort(),
      unavailableFields: [...unavailableFields].sort(),
    }),
  };
}
