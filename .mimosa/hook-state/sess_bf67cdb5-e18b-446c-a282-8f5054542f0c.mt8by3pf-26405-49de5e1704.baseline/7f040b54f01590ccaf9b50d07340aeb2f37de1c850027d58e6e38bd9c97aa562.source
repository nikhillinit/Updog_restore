import { describe, expect, it } from 'vitest';

import {
  ConvertPositionRequestSchema,
  POSITION_EVENT_ERROR_CODES,
  PositionConversionV1Schema,
  PositionEventErrorCodeSchema,
} from '../../../../shared/contracts/investment-ledger/position.contract';

describe('position event contract', () => {
  it('pins conversion typed errors', () => {
    expect(POSITION_EVENT_ERROR_CODES).toEqual(
      expect.arrayContaining([
        'POSITION_CONVERSION_NOT_FOUND',
        'POSITION_CONVERSION_INELIGIBLE',
        'POSITION_CONVERSION_CONFLICT',
        'POSITION_CONVERSION_PRECISION_LOSS',
        'POSITION_CONVERSION_FORBIDDEN_WRITE',
      ])
    );
    expect(PositionEventErrorCodeSchema.options).toContain('POSITION_CONVERSION_CONFLICT');
  });

  it('accepts only the strict conversion command surface', () => {
    const parsed = ConvertPositionRequestSchema.parse({
      sourceParticipationId: 10,
      resultingTrancheId: 20,
      effectiveDate: '2026-07-01',
      resultingSharesAcquired: '100.000000',
      accruedInterest: { mode: 'excluded' },
      currency: 'USD',
    });

    expect(parsed).toMatchObject({
      sourceParticipationId: 10,
      resultingTrancheId: 20,
      resultingSharesAcquired: '100.000000',
      currency: 'USD',
    });
    expect(() =>
      ConvertPositionRequestSchema.parse({
        ...parsed,
        fundId: 7,
      })
    ).toThrow();
    expect(() =>
      ConvertPositionRequestSchema.parse({
        ...parsed,
        resultingSharesAcquired: '100.00000001',
      })
    ).toThrow();
  });

  it('requires conversion receipts to disclose conversion result origin', () => {
    const baseEvent = {
      id: 1,
      fundId: 7,
      vehicleId: 8,
      companyIdentityId: 9,
      eventType: 'conversion',
      effectiveDate: '2026-07-01',
      recordedAt: '2026-07-01T00:00:00.000Z',
      sharesDelta: '100.000000',
      costBasisDelta: '0.000000',
      proceeds: '0.000000',
      replacesEventId: null,
      reversesPositionEventId: null,
      vehicleParticipationId: 10,
      resultingParticipationId: 11,
      sourceParticipationVersion: 1,
      resultingParticipationVersion: 1,
      sourceTrancheVersion: 1,
      resultingTrancheVersion: 1,
      sourceObservationId: 12,
      backfilledFromInvestmentId: null,
      createdBy: 3,
      idempotencyKey: 'conversion-1',
      requestHash: 'a'.repeat(64),
    };
    const participation = {
      id: 11,
      fundId: 7,
      vehicleId: 8,
      financingEventId: 30,
      trancheKey: 'series-a',
      financingTrancheId: 20,
      version: 1,
      supersededByParticipationId: null,
      economicOrigin: 'conversion_result',
      participationAmount: '1000.000000',
      originalAmount: '1000.000000',
      currency: 'USD',
      fxRateToUsd: '1.0000000000',
      fxRateDate: '2026-07-01',
      sharesAcquired: '100.00000000',
      closingDate: '2026-07-01',
      pricePerShare: '10.000000',
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
      sourceObservationId: 12,
      createdBy: 3,
      idempotencyKey: 'pos:conv:p',
      requestHash: 'a'.repeat(64),
      createdAt: '2026-07-01T00:00:00.000Z',
    };

    expect(
      PositionConversionV1Schema.parse({
        sourceParticipationId: 10,
        sourceParticipationVersion: 1,
        resultingParticipation: participation,
        conversionEvent: baseEvent,
        capitalizedAdjustmentEvent: null,
        reliefMode: 'source_basis',
        lotReliefs: [],
        sourceBasisRelief: {
          conversionPositionEventId: 1,
          sourceAcquisitionPositionEventId: 2,
          capitalizedAdjustmentPositionEventId: null,
          fundId: 7,
          vehicleId: 8,
          companyIdentityId: 9,
          sourceParticipationId: 10,
          sourceParticipationVersion: 1,
          sourceFinancingEventId: 29,
          sourceFinancingTrancheId: 19,
          resultingParticipationId: 11,
          resultingParticipationVersion: 1,
          resultingFinancingEventId: 30,
          resultingFinancingTrancheId: 20,
          sourceTrancheVersion: 1,
          resultingTrancheVersion: 1,
          sourceAcquisitionCostBasis: '1000.000000',
          capitalizedAdjustmentCostBasis: '0.000000',
          relievedCostBasis: '1000.000000',
          sourceEconomicOrigin: 'cash_investment',
          resultingEconomicOrigin: 'conversion_result',
        },
        resultConversionLotId: '11111111-1111-4111-8111-111111111111',
        conversionObservationId: 12,
      }).resultingParticipation.economicOrigin
    ).toBe('conversion_result');
  });
});
