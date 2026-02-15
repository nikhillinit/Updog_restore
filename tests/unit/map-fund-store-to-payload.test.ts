import { describe, it, expect } from 'vitest';
import {
  mapFundStoreToCreatePayload,
  type FundStoreSnapshot,
} from '@/lib/map-fund-store-to-payload';

describe('mapFundStoreToCreatePayload', () => {
  it('maps a fully populated state correctly', () => {
    const state: FundStoreSnapshot = {
      fundName: '  Test Fund  ',
      fundSize: 125_000_000,
      managementFeeRate: 2,
      carriedInterest: 20,
      vintageYear: 2024,
      establishmentDate: '2024-01-01',
    };

    const result = mapFundStoreToCreatePayload(state);

    expect(result.name).toBe('Test Fund');
    expect(result.size).toBe(125_000_000);
    expect(result.managementFee).toBe(0.02);
    expect(result.carryPercentage).toBe(0.2);
    expect(result.vintageYear).toBe(2024);
  });

  it('uses defaults for an empty state object', () => {
    const currentYear = new Date().getFullYear();
    const result = mapFundStoreToCreatePayload({} as FundStoreSnapshot);

    expect(result).toEqual({
      name: 'Untitled Fund',
      size: 0,
      managementFee: 0,
      carryPercentage: 0,
      vintageYear: currentYear,
    });
  });

  it('uses defaults for missing fields in a partial state', () => {
    const currentYear = new Date().getFullYear();
    const result = mapFundStoreToCreatePayload({
      fundName: 'Partial Fund',
      fundSize: 50_000_000,
    } as FundStoreSnapshot);

    expect(result).toEqual({
      name: 'Partial Fund',
      size: 50_000_000,
      managementFee: 0,
      carryPercentage: 0,
      vintageYear: currentYear,
    });
  });

  it('maps managementFeeRate=0 to managementFee=0 (not NaN)', () => {
    const result = mapFundStoreToCreatePayload({
      fundName: 'Zero Fee Fund',
      managementFeeRate: 0,
    } as FundStoreSnapshot);

    expect(result.managementFee).toBe(0);
    expect(Number.isNaN(result.managementFee)).toBe(false);
  });

  it("trims fundName whitespace like ' My Fund ' to 'My Fund'", () => {
    const result = mapFundStoreToCreatePayload({
      fundName: ' My Fund ',
    } as FundStoreSnapshot);

    expect(result.name).toBe('My Fund');
  });
});
