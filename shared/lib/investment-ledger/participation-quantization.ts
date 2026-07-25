import type { VehicleParticipationErrorCode } from '../../contracts/investment-ledger/participation.contract';
import { Decimal } from '../decimal-config';
import type { EffectiveParticipationTermsV1 } from './effective-terms';

export type RoundHalfUpFormatter = (value: string, decimalPlaces: number) => string;

export interface ParticipationCompatibilityLot {
  sharePriceCents: bigint;
  sharesAcquired: string;
  costBasisCents: bigint;
}

export interface ParticipationCompatibilityProjection {
  investmentAmount: string;
  roundInvestmentAmount: string;
  cashFlowAmount: string;
  costBasisCents: bigint | null;
  lot: ParticipationCompatibilityLot | null;
  warnings: VehicleParticipationErrorCode[];
}

export function formatRoundHalfUp(value: string, decimalPlaces: number): string {
  return new Decimal(value)
    .toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP)
    .toFixed(decimalPlaces);
}

function appendWarning(
  warnings: VehicleParticipationErrorCode[],
  warning: VehicleParticipationErrorCode
): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function resolveExactShares(
  participationAmount: Decimal,
  pricePerShare: Decimal,
  suppliedShares: string | null
): string | null {
  if (suppliedShares !== null) {
    return pricePerShare.times(suppliedShares).eq(participationAmount)
      ? new Decimal(suppliedShares).toFixed(8)
      : null;
  }

  const candidate = participationAmount.div(pricePerShare).toFixed(8);
  return pricePerShare.times(candidate).eq(participationAmount) ? candidate : null;
}

export function projectParticipationCompatibility(
  effectiveTerms: EffectiveParticipationTermsV1,
  formatter: RoundHalfUpFormatter = formatRoundHalfUp
): ParticipationCompatibilityProjection {
  const participationAmount = new Decimal(effectiveTerms.participationAmount);
  const investmentAmount = formatter(effectiveTerms.participationAmount, 2);
  const warnings = [...effectiveTerms.warnings];

  if (!new Decimal(investmentAmount).eq(participationAmount)) {
    appendWarning(warnings, 'SUB_CENT_FX_RESIDUE');
  }

  if (effectiveTerms.pricePerShare === null) {
    appendWarning(warnings, 'LOT_OMITTED_UNPRICED');
    return {
      investmentAmount,
      roundInvestmentAmount: effectiveTerms.participationAmount,
      cashFlowAmount: effectiveTerms.participationAmount,
      costBasisCents: null,
      lot: null,
      warnings,
    };
  }

  const pricePerShare = new Decimal(effectiveTerms.pricePerShare);
  const exactSharePriceCents = pricePerShare.times(100);
  const sharesAcquired = resolveExactShares(
    participationAmount,
    pricePerShare,
    effectiveTerms.sharesAcquired
  );

  if (!exactSharePriceCents.isInteger() || sharesAcquired === null) {
    appendWarning(warnings, 'LOT_OMITTED_UNREPRESENTABLE');
    return {
      investmentAmount,
      roundInvestmentAmount: effectiveTerms.participationAmount,
      cashFlowAmount: effectiveTerms.participationAmount,
      costBasisCents: null,
      lot: null,
      warnings,
    };
  }

  const costBasisCents = BigInt(formatter(participationAmount.times(100).toString(), 0));
  const lot = {
    sharePriceCents: BigInt(exactSharePriceCents.toFixed(0)),
    sharesAcquired,
    costBasisCents,
  };

  return {
    investmentAmount,
    roundInvestmentAmount: effectiveTerms.participationAmount,
    cashFlowAmount: effectiveTerms.participationAmount,
    costBasisCents,
    lot,
    warnings,
  };
}
