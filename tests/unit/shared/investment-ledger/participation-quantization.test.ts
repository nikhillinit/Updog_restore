import { describe, expect, it, vi } from 'vitest';

import { FinancingTrancheV1Schema } from '../../../../shared/contracts/investment-ledger/financing-event.contract';
import { VehicleFinancingParticipationV1Schema } from '../../../../shared/contracts/investment-ledger/participation.contract';
import { resolveEffectiveTerms } from '../../../../shared/lib/investment-ledger/effective-terms';
import {
  formatRoundHalfUp,
  projectParticipationCompatibility,
} from '../../../../shared/lib/investment-ledger/participation-quantization';

function effectiveTerms(
  overrides: {
    participationAmount?: string;
    pricePerShare?: string | null;
    sharesAcquired?: string | null;
  } = {}
) {
  const tranche = FinancingTrancheV1Schema.parse({
    id: 41,
    fundId: 7,
    financingEventId: 31,
    trancheKey: 'initial-close',
    version: 2,
    supersededByTrancheId: null,
    closingDate: '2026-07-01',
    securityType: 'equity',
    investmentAmount: '1000000.000000',
    originalAmount: '1000000.000000',
    currency: 'USD',
    fxRateToUsd: '1.0000000000',
    fxRateDate: '2026-07-01',
    pricePerShare: 'pricePerShare' in overrides ? overrides.pricePerShare : '10.000000',
    postMoneyValuation: '25000000.000000',
    valuationCap: null,
    conversionDiscountRate: null,
    interestRate: null,
    maturityDate: null,
    liquidationPreferenceMultiple: null,
    participatingPreferred: false,
    participationCapMultiple: null,
    proRataRightsPct: null,
    descriptiveTerms: {},
    calculationEligible: true,
    sourceObservationId: 17,
    createdBy: 5,
    idempotencyKey: 'tranche-v2',
    requestHash: 'a'.repeat(64),
    createdAt: '2026-07-01T00:00:00.000Z',
  });
  const participation = VehicleFinancingParticipationV1Schema.parse({
    id: 51,
    fundId: 7,
    vehicleId: 9,
    financingEventId: 31,
    trancheKey: 'initial-close',
    financingTrancheId: 41,
    version: 1,
    supersededByParticipationId: null,
    economicOrigin: 'cash_investment',
    participationAmount: overrides.participationAmount ?? '123.456789',
    originalAmount: overrides.participationAmount ?? '123.456789',
    currency: 'USD',
    fxRateToUsd: '1.0000000000',
    fxRateDate: '2026-07-01',
    sharesAcquired: overrides.sharesAcquired ?? null,
    closingDate: null,
    pricePerShare: null,
    postMoneyValuation: null,
    valuationCap: null,
    conversionDiscountRate: null,
    interestRate: null,
    liquidationPreferenceMultiple: null,
    participatingPreferred: null,
    participationCapMultiple: null,
    proRataRightsPct: null,
    maturityDate: null,
    descriptiveTerms: null,
    confirmedDuplicates: [],
    sourceObservationId: 18,
    createdBy: 5,
    idempotencyKey: 'participation-v1',
    requestHash: 'b'.repeat(64),
    createdAt: '2026-07-01T00:00:00.000Z',
  });

  return resolveEffectiveTerms(tranche, participation);
}

describe('projectParticipationCompatibility', () => {
  it('rounds only 2dp investment amount and whole-cent lot cost basis', () => {
    expect(projectParticipationCompatibility(effectiveTerms())).toMatchObject({
      investmentAmount: '123.46',
      roundInvestmentAmount: '123.456789',
      cashFlowAmount: '123.456789',
      costBasisCents: 12346n,
    });
  });

  it('reports sub-cent residue while preserving both 6dp compatibility values', () => {
    expect(projectParticipationCompatibility(effectiveTerms())).toMatchObject({
      roundInvestmentAmount: '123.456789',
      cashFlowAmount: '123.456789',
      warnings: ['SUB_CENT_FX_RESIDUE'],
    });
  });

  it('calls the shared formatter exactly once for each lossy target column', () => {
    const formatter = vi.fn(formatRoundHalfUp);

    projectParticipationCompatibility(effectiveTerms(), formatter);

    expect(formatter).toHaveBeenCalledTimes(2);
    expect(formatter).toHaveBeenNthCalledWith(1, '123.456789', 2);
    expect(formatter).toHaveBeenNthCalledWith(2, '12345.6789', 0);
  });

  it('omits a lot instead of rounding a sub-cent share price', () => {
    expect(
      projectParticipationCompatibility(effectiveTerms({ pricePerShare: '10.001000' }))
    ).toMatchObject({
      lot: null,
      costBasisCents: null,
      warnings: ['SUB_CENT_FX_RESIDUE', 'LOT_OMITTED_UNREPRESENTABLE'],
    });
  });

  it('marks genuinely unresolved pricing as unpriced', () => {
    expect(
      projectParticipationCompatibility(effectiveTerms({ pricePerShare: null }))
    ).toMatchObject({
      lot: null,
      costBasisCents: null,
      warnings: ['SUB_CENT_FX_RESIDUE', 'LOT_OMITTED_UNPRICED'],
    });
  });

  it('emits a lot only when exact cents, shares, and 6dp cost reconcile', () => {
    expect(
      projectParticipationCompatibility(effectiveTerms({ sharesAcquired: '12.34567890' })).lot
    ).toEqual({
      sharePriceCents: 1000n,
      sharesAcquired: '12.34567890',
      costBasisCents: 12346n,
    });
  });

  it('omits a lot when derived shares require more than 8 decimal places', () => {
    expect(
      projectParticipationCompatibility(
        effectiveTerms({
          participationAmount: '100.000000',
          pricePerShare: '3.000000',
        })
      )
    ).toMatchObject({
      lot: null,
      costBasisCents: null,
      warnings: ['LOT_OMITTED_UNREPRESENTABLE'],
    });
  });
});
