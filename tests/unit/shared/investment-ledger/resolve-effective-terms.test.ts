import { describe, expect, it } from 'vitest';

import {
  CreateVehicleFinancingParticipationRequestSchema,
  VehicleFinancingParticipationV1Schema,
} from '../../../../shared/contracts/investment-ledger/participation.contract';
import { FinancingTrancheV1Schema } from '../../../../shared/contracts/investment-ledger/financing-event.contract';
import {
  EffectiveTermsMatrixViolationError,
  resolveEffectiveTerms,
} from '../../../../shared/lib/investment-ledger/effective-terms';

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
  pricePerShare: '10.000000',
  postMoneyValuation: '25000000.000000',
  valuationCap: null,
  conversionDiscountRate: null,
  interestRate: null,
  maturityDate: null,
  liquidationPreferenceMultiple: '1.00000000',
  participatingPreferred: false,
  participationCapMultiple: null,
  proRataRightsPct: '0.05000000',
  descriptiveTerms: { seniority: 'pari_passu' },
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
  participationAmount: '123.456789',
  originalAmount: '123.456789',
  currency: 'USD',
  fxRateToUsd: '1.0000000000',
  fxRateDate: '2026-07-01',
  sharesAcquired: null,
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

describe('resolveEffectiveTerms', () => {
  it('inherits sparse participation terms from its pinned tranche version', () => {
    expect(resolveEffectiveTerms(tranche, participation)).toMatchObject({
      closingDate: '2026-07-01',
      securityType: 'equity',
      participationAmount: '123.456789',
      pricePerShare: '10.000000',
      postMoneyValuation: '25000000.000000',
      liquidationPreferenceMultiple: '1.00000000',
      participatingPreferred: false,
      proRataRightsPct: '0.05000000',
      descriptiveTerms: { seniority: 'pari_passu' },
      calculationEligible: true,
      provenance: {
        financingTrancheId: 41,
        trancheVersion: 2,
        participationId: 51,
        participationVersion: 1,
      },
    });
  });

  it('replaces inherited values only for supplied sparse overrides', () => {
    const overridden = VehicleFinancingParticipationV1Schema.parse({
      ...participation,
      closingDate: '2026-07-15',
      pricePerShare: '12.500000',
      participatingPreferred: true,
      descriptiveTerms: { seniority: 'senior' },
    });

    expect(resolveEffectiveTerms(tranche, overridden)).toMatchObject({
      closingDate: '2026-07-15',
      pricePerShare: '12.500000',
      postMoneyValuation: '25000000.000000',
      participatingPreferred: true,
      descriptiveTerms: { seniority: 'senior' },
    });
  });

  it('rejects explicit null instead of treating it as an override-to-null', () => {
    expect(() =>
      CreateVehicleFinancingParticipationRequestSchema.parse({
        vehicleId: 9,
        participationAmount: '123.456789',
        pricePerShare: null,
      })
    ).toThrow();
  });

  it('revalidates resolved SAFE terms and blocks forbidden participation overrides', () => {
    const safeTranche = FinancingTrancheV1Schema.parse({
      ...tranche,
      securityType: 'safe',
      pricePerShare: null,
      postMoneyValuation: null,
      valuationCap: '12000000.000000',
      liquidationPreferenceMultiple: null,
      participatingPreferred: null,
    });
    const invalidSafeParticipation = VehicleFinancingParticipationV1Schema.parse({
      ...participation,
      liquidationPreferenceMultiple: '1.00000000',
    });

    expect(() => resolveEffectiveTerms(safeTranche, invalidSafeParticipation)).toThrow(
      EffectiveTermsMatrixViolationError
    );
  });

  it('allows other security terms to resolve vacuously without valuation terms', () => {
    const otherTranche = FinancingTrancheV1Schema.parse({
      ...tranche,
      securityType: 'other',
      pricePerShare: null,
      postMoneyValuation: null,
      liquidationPreferenceMultiple: null,
      participatingPreferred: null,
    });

    expect(resolveEffectiveTerms(otherTranche, participation).securityType).toBe('other');
  });

  it('is deterministic for the same pinned rows', () => {
    expect(resolveEffectiveTerms(tranche, participation)).toEqual(
      resolveEffectiveTerms(tranche, participation)
    );
  });

  it('rejects a participation that does not pin the supplied tranche row', () => {
    const mismatched = VehicleFinancingParticipationV1Schema.parse({
      ...participation,
      financingTrancheId: 999,
    });

    expect(() => resolveEffectiveTerms(tranche, mismatched)).toThrow(
      'Participation does not reference the supplied financing tranche version.'
    );
  });

  it('propagates calculation ineligibility as a typed warning', () => {
    const ineligibleTranche = FinancingTrancheV1Schema.parse({
      ...tranche,
      securityType: 'other',
      pricePerShare: null,
      postMoneyValuation: null,
      calculationEligible: false,
    });

    expect(resolveEffectiveTerms(ineligibleTranche, participation)).toMatchObject({
      calculationEligible: false,
      warnings: ['CALCULATION_INELIGIBLE_PARTICIPATION'],
    });
  });
});
