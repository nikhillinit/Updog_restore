/**
 * Conservation of Capital Tests - Standalone validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateConservation,
  assertConservation,
  validateReserveAllocationConservation,
  ConservationError,
} from '../../../shared/validation/conservation';

describe('Conservation of Capital Validation', () => {
  it('should pass validation when input equals output', () => {
    const result = validateConservation([1000000], [900000, 100000]);

    expect(result.isValid).toBe(true);
    expect(result.totalInput).toBe(1000000);
    expect(result.totalOutput).toBe(1000000);
    expect(result.difference).toBe(0);
  });

  it('should fail validation when difference exceeds tolerance', () => {
    const result = validateConservation(
      [1000000],
      [900000, 90000], // Only 990000 total
      0.001 // 0.1% tolerance
    );

    expect(result.isValid).toBe(false);
    expect(result.percentageError).toBeGreaterThan(0.001);
  });

  it('should pass with minor rounding errors within tolerance', () => {
    const result = validateConservation(
      [1000000],
      [500000, 499999.99], // 0.0001% difference
      0.01 // 1% tolerance
    );

    expect(result.isValid).toBe(true);
  });

  it('should throw ConservationError with assertConservation', () => {
    expect(() => {
      assertConservation(
        [1000000],
        [900000, 80000], // Missing 20000
        0.001,
        'Test context'
      );
    }).toThrow(ConservationError);
  });

  it('should validate reserve allocations conserve total', () => {
    const result = validateReserveAllocationConservation(
      10000000, // Total available
      [3000000, 2000000, 4000000], // Individual allocations
      1000000 // Unallocated
    );

    expect(result.isValid).toBe(true);
    expect(result.totalInput).toBe(10000000);
    expect(result.totalOutput).toBe(10000000);
  });
});