import {
  SECURITY_TYPE_TERM_MATRIX,
  type FinancingTrancheV1,
  type LedgerSecurityType,
} from '../../contracts/investment-ledger/financing-event.contract';
import type { VehicleFinancingParticipationV1 } from '../../contracts/investment-ledger/participation.contract';
import type { VehicleParticipationErrorCode } from '../../contracts/investment-ledger/participation.contract';

export interface EffectiveParticipationTermsV1 {
  closingDate: string;
  securityType: LedgerSecurityType;
  participationAmount: string;
  originalAmount: string | null;
  currency: string | null;
  fxRateToUsd: string | null;
  fxRateDate: string | null;
  sharesAcquired: string | null;
  pricePerShare: string | null;
  postMoneyValuation: string | null;
  valuationCap: string | null;
  conversionDiscountRate: string | null;
  interestRate: string | null;
  liquidationPreferenceMultiple: string | null;
  participatingPreferred: boolean | null;
  participationCapMultiple: string | null;
  proRataRightsPct: string | null;
  maturityDate: string | null;
  descriptiveTerms: Record<string, unknown>;
  calculationEligible: boolean;
  warnings: VehicleParticipationErrorCode[];
  provenance: {
    financingTrancheId: number;
    trancheVersion: number;
    participationId: number;
    participationVersion: number;
  };
}

export class EffectiveTermsMatrixViolationError extends Error {
  readonly code = 'EFFECTIVE_TERMS_MATRIX_VIOLATION' as const;
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = 'EffectiveTermsMatrixViolationError';
  }
}

const inheritedTermFields = [
  'closingDate',
  'pricePerShare',
  'postMoneyValuation',
  'valuationCap',
  'conversionDiscountRate',
  'interestRate',
  'liquidationPreferenceMultiple',
  'participatingPreferred',
  'participationCapMultiple',
  'proRataRightsPct',
  'maturityDate',
  'descriptiveTerms',
] as const;

type MatrixTermField =
  | 'pricePerShare'
  | 'postMoneyValuation'
  | 'valuationCap'
  | 'conversionDiscountRate'
  | 'interestRate'
  | 'liquidationPreferenceMultiple'
  | 'participatingPreferred'
  | 'maturityDate';

function assertPinnedVersion(
  tranche: FinancingTrancheV1,
  participation: VehicleFinancingParticipationV1
): void {
  if (
    participation.fundId !== tranche.fundId ||
    participation.financingEventId !== tranche.financingEventId ||
    participation.financingTrancheId !== tranche.id ||
    participation.trancheKey !== tranche.trancheKey
  ) {
    throw new Error('Participation does not reference the supplied financing tranche version.');
  }
}

function assertSecurityTypeMatrix(
  securityType: LedgerSecurityType,
  terms: Record<MatrixTermField, string | boolean | null>
): void {
  // `other` intentionally passes vacuously: its matrix has no required or forbidden terms.
  const matrix = SECURITY_TYPE_TERM_MATRIX[securityType];
  if (
    'requiredAny' in matrix &&
    matrix.requiredAny.length > 0 &&
    !matrix.requiredAny.some((field) => terms[field] != null)
  ) {
    throw new EffectiveTermsMatrixViolationError(
      `${securityType} requires at least one supported valuation term.`
    );
  }
  if ('requiredAll' in matrix && matrix.requiredAll.some((field) => terms[field] == null)) {
    throw new EffectiveTermsMatrixViolationError(
      `${securityType} requires all mandatory security terms.`
    );
  }
  for (const field of matrix.forbidden) {
    if (terms[field] != null) {
      throw new EffectiveTermsMatrixViolationError(
        `${field} is not supported for ${securityType}.`
      );
    }
  }
}

export function resolveEffectiveTerms(
  trancheRowAtVersion: FinancingTrancheV1,
  participationRowAtVersion: VehicleFinancingParticipationV1
): EffectiveParticipationTermsV1 {
  assertPinnedVersion(trancheRowAtVersion, participationRowAtVersion);

  const inherited = Object.fromEntries(
    inheritedTermFields.map((field) => [
      field,
      participationRowAtVersion[field] ?? trancheRowAtVersion[field],
    ])
  ) as Pick<EffectiveParticipationTermsV1, (typeof inheritedTermFields)[number]>;

  assertSecurityTypeMatrix(trancheRowAtVersion.securityType, {
    pricePerShare: inherited.pricePerShare,
    postMoneyValuation: inherited.postMoneyValuation,
    valuationCap: inherited.valuationCap,
    conversionDiscountRate: inherited.conversionDiscountRate,
    interestRate: inherited.interestRate,
    liquidationPreferenceMultiple: inherited.liquidationPreferenceMultiple,
    participatingPreferred: inherited.participatingPreferred,
    maturityDate: inherited.maturityDate,
  });

  return {
    ...inherited,
    securityType: trancheRowAtVersion.securityType,
    participationAmount: participationRowAtVersion.participationAmount,
    originalAmount: participationRowAtVersion.originalAmount,
    currency: participationRowAtVersion.currency,
    fxRateToUsd: participationRowAtVersion.fxRateToUsd,
    fxRateDate: participationRowAtVersion.fxRateDate,
    sharesAcquired: participationRowAtVersion.sharesAcquired,
    calculationEligible: trancheRowAtVersion.calculationEligible,
    warnings: trancheRowAtVersion.calculationEligible
      ? []
      : ['CALCULATION_INELIGIBLE_PARTICIPATION'],
    provenance: {
      financingTrancheId: trancheRowAtVersion.id,
      trancheVersion: trancheRowAtVersion.version,
      participationId: participationRowAtVersion.id,
      participationVersion: participationRowAtVersion.version,
    },
  };
}
