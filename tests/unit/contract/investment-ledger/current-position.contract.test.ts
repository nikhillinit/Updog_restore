import { describe, expect, it } from 'vitest';

import {
  CurrentPositionQuerySchema,
  OwnershipSnapshotRequestSchema,
  PositionValuationRequestSchema,
} from '../../../../shared/contracts/investment-ledger/current-position.contract';

describe('current position and valuation contracts', () => {
  it('public current-position query rejects caller-supplied knowledge cutoffs', () => {
    expect(() =>
      CurrentPositionQuerySchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        asOfDate: '2026-07-01',
        knowledgeCutoff: '2026-07-01T00:00:00.000Z',
      })
    ).toThrow();
  });

  it('requires exact ownership and fully diluted equality', () => {
    expect(
      OwnershipSnapshotRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        effectiveDate: '2026-07-01',
        ownershipPct: '12.50000000',
        fdNumerator: '125.000000',
        fdDenominator: '1000.000000',
        sourceObservationId: 3,
      })
    ).toMatchObject({ currency: 'USD' });

    expect(() =>
      OwnershipSnapshotRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        effectiveDate: '2026-07-01',
        ownershipPct: '12.40000000',
        fdNumerator: '125.000000',
        fdDenominator: '1000.000000',
        sourceObservationId: 3,
      })
    ).toThrow(/ownershipPct/);

    expect(() =>
      OwnershipSnapshotRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        effectiveDate: '2026-07-01',
        ownershipPct: '100.00000001',
        sourceObservationId: 3,
      })
    ).toThrow();

    expect(() =>
      OwnershipSnapshotRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        effectiveDate: '2026-07-01',
        ownershipPct: '12.50000000',
        currency: 'EUR',
        sourceObservationId: 3,
      })
    ).toThrow();
  });

  it('accepts only scoped USD direct-position valuation requests', () => {
    expect(
      PositionValuationRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        companyId: 3,
        asOfDate: '2026-07-01',
        fairValue: '1000000.000000',
        sourceObservationId: 4,
        markSource: 'board_update',
        confidenceLevel: 'high',
        valuationMethod: 'direct_position_mark',
      })
    ).toMatchObject({ currency: 'USD' });

    expect(() =>
      PositionValuationRequestSchema.parse({
        vehicleId: 1,
        companyIdentityId: 2,
        companyId: 3,
        asOfDate: '2026-07-01',
        fairValue: '1000000.000000',
        currency: 'EUR',
        sourceObservationId: 4,
        markSource: 'board_update',
        confidenceLevel: 'high',
        valuationMethod: 'direct_position_mark',
      })
    ).toThrow();
  });
});
