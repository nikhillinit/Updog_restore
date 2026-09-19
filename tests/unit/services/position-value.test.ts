import { describe, it, expect } from 'vitest';
import { computePositionValue } from '../../../server/services/position-value';
import Decimal from '@shared/lib/decimal-config';

describe('computePositionValue', () => {
  it('applies ownership when positive', () => {
    const result = computePositionValue({
      currentValuation: '10000000',
      ownershipCurrentPct: '0.15',
    });
    expect(result.equals(new Decimal('1500000'))).toBe(true);
  });

  it('falls back to gross valuation when ownership is null', () => {
    const result = computePositionValue({
      currentValuation: '5000000',
      ownershipCurrentPct: null,
    });
    expect(result.equals(new Decimal('5000000'))).toBe(true);
  });

  it('falls back to gross valuation when ownership is zero', () => {
    const result = computePositionValue({
      currentValuation: '5000000',
      ownershipCurrentPct: '0',
    });
    expect(result.equals(new Decimal('5000000'))).toBe(true);
  });

  it('falls back to gross valuation when ownership is undefined', () => {
    const result = computePositionValue({
      currentValuation: '8000000',
      ownershipCurrentPct: undefined,
    });
    expect(result.equals(new Decimal('8000000'))).toBe(true);
  });

  it('returns null when valuation is null', () => {
    const result = computePositionValue({
      currentValuation: null,
      ownershipCurrentPct: '0.25',
    });
    expect(result).toBeNull();
  });

  it('returns null when both are null', () => {
    const result = computePositionValue({
      currentValuation: null,
      ownershipCurrentPct: null,
    });
    expect(result).toBeNull();
  });

  it('returns Decimal(0) when valuation is explicitly zero', () => {
    const result = computePositionValue({
      currentValuation: 0,
      ownershipCurrentPct: '0.10',
    });
    expect(result).not.toBeNull();
    expect(result!.equals(new Decimal('0'))).toBe(true);
  });

  it('handles small fractional ownership precisely', () => {
    const result = computePositionValue({
      currentValuation: '100000000',
      ownershipCurrentPct: '0.0001',
    });
    expect(result.equals(new Decimal('10000'))).toBe(true);
  });

  it('handles numeric inputs', () => {
    const result = computePositionValue({
      currentValuation: 7500000,
      ownershipCurrentPct: 0.2,
    });
    expect(result.equals(new Decimal('1500000'))).toBe(true);
  });

  it('handles negative ownership as non-positive (falls back to gross)', () => {
    const result = computePositionValue({
      currentValuation: '5000000',
      ownershipCurrentPct: '-0.1',
    });
    expect(result.equals(new Decimal('5000000'))).toBe(true);
  });

  it('is order-independent for group sums (null valuations excluded)', () => {
    const companies = [
      { currentValuation: '10000000', ownershipCurrentPct: '0.15' },
      { currentValuation: null, ownershipCurrentPct: null },
      { currentValuation: '8000000', ownershipCurrentPct: '0' },
    ];

    const sum = (list: typeof companies) =>
      list.reduce((acc, c) => {
        const value = computePositionValue(c);
        return value != null ? acc + value.toNumber() : acc;
      }, 0);

    const forward = sum(companies);
    const reversed = sum([...companies].reverse());

    expect(forward).toBe(reversed);
    expect(forward).toBe(1500000 + 8000000);
  });
});
