import { describe, expect, it } from 'vitest';

import {
  CreateVehicleFinancingParticipationRequestSchema,
  VEHICLE_PARTICIPATION_ERROR_CODES,
  VehicleParticipationErrorCodeSchema,
} from '../../../../shared/contracts/investment-ledger/participation.contract';

describe('vehicle participation contract', () => {
  it('pins the complete net-new typed error-code set', () => {
    expect(VEHICLE_PARTICIPATION_ERROR_CODES).toEqual([
      'USE_LEDGER_ROUTE',
      'SUB_CENT_FX_RESIDUE',
      'MIXED_INVESTMENT_ORIGIN',
      'SUSPECTED_DUPLICATE_POSITION',
      'DUPLICATE_CONFIRMATION_STALE',
      'IDENTITY_LINK_REQUIRED',
      'IDENTITY_LINK_AMBIGUOUS',
      'LOT_OMITTED_UNPRICED',
      'LOT_OMITTED_UNREPRESENTABLE',
      'EFFECTIVE_TERMS_MATRIX_VIOLATION',
      'CALCULATION_INELIGIBLE_PARTICIPATION',
      'PARTICIPATION_CASCADE_REQUIRED',
    ]);
    expect(VehicleParticipationErrorCodeSchema.options).toHaveLength(12);
  });

  it('requires complete retained FX evidence for non-USD participation amounts', () => {
    const incomplete = {
      vehicleId: 9,
      participationAmount: '123.456789',
      currency: 'EUR',
    };

    expect(() => CreateVehicleFinancingParticipationRequestSchema.parse(incomplete)).toThrow();
    expect(
      CreateVehicleFinancingParticipationRequestSchema.parse({
        ...incomplete,
        originalAmount: '110.000000',
        fxRateToUsd: '1.1223344454',
        fxRateDate: '2026-07-01',
      })
    ).toMatchObject({ currency: 'EUR' });
  });

  it('rejects a non-unity FX rate on USD evidence', () => {
    expect(() =>
      CreateVehicleFinancingParticipationRequestSchema.parse({
        vehicleId: 9,
        participationAmount: '123.456789',
        currency: 'USD',
        fxRateToUsd: '1.0000000001',
      })
    ).toThrow();
  });
});
