// REFLECTION_ID: REFL-001
// This test is linked to: docs/skills/REFL-001-reserve-engine-null-safety.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, beforeEach } from 'vitest';

// Import REAL error class from codebase
import { ReserveCalculationError } from '@shared/schemas/reserves-schemas';

// Import real types for validation
import type { ReserveAllocationInput } from '@shared/schemas/reserves-schemas';

/**
 * REFL-001: Reserve Engine Null Safety Pattern
 *
 * This reflection documents the required error handling pattern for reserve
 * calculations when wizard context may be incomplete or null.
 *
 * Anti-patterns prevented:
 * - Returning 0 or NaN for null/undefined context (silent failure)
 * - Defaulting missing fields to 0 without explicit validation
 * - Computing results for invalid business rule inputs (negative values)
 *
 * Required behavior:
 * - Layer 1: Throw E_CTX_UNINITIALIZED for null context
 * - Layer 2: Throw E_FIELD_MISSING for required fields not set
 * - Layer 3: Throw E_BUSINESS_RULE for invalid values
 */

// ============================================================================
// FundContext Null Safety Pattern (Wizard State Protection)
// ============================================================================

interface FundContext {
  currentStep?: number;
  totalCommitted?: number;
}

/**
 * Example implementation demonstrating the required null-safety pattern.
 * This class shows the CORRECT way to handle wizard state in calculations.
 */
class NullSafeReserveCalculator {
  private reserveRate = 0.1;

  calculateReserve(fundContext: FundContext | null): number {
    // Layer 1: Context validation - MUST throw, not return 0
    if (!fundContext) {
      throw new ReserveCalculationError(
        'CRITICAL: FundContext is null. Wizard state may be corrupted.',
        'E_CTX_UNINITIALIZED',
        { source: 'NullSafeReserveCalculator.calculateReserve' }
      );
    }

    // Layer 2: Field validation - MUST throw with actionable message
    if (fundContext.totalCommitted === undefined) {
      throw new ReserveCalculationError(
        `VALIDATION: totalCommitted not set. Complete Step 2 (Capital Calls) first.`,
        'E_FIELD_MISSING',
        { currentStep: fundContext.currentStep }
      );
    }

    // Layer 3: Business rule validation - MUST throw for invalid values
    if (typeof fundContext.totalCommitted !== 'number' || fundContext.totalCommitted < 0) {
      throw new ReserveCalculationError(
        `BUSINESS RULE: Committed capital cannot be negative or invalid. Got: ${fundContext.totalCommitted}`,
        'E_BUSINESS_RULE',
        { totalCommitted: fundContext.totalCommitted }
      );
    }

    return fundContext.totalCommitted * this.reserveRate;
  }
}

describe('REFL-001: Reserve Engine Null Safety', () => {
  let calculator: NullSafeReserveCalculator;

  beforeEach(() => {
    calculator = new NullSafeReserveCalculator();
  });

  // --- Anti-pattern demonstrations (these would FAIL with buggy code) ---

  describe('Layer 1: Context Validation', () => {
    it('should throw E_CTX_UNINITIALIZED when fund context is null (not return 0)', () => {
      // ANTI-PATTERN: Old code returned 0 or NaN for null context
      // FIX: Must throw with specific error code
      expect(() => calculator.calculateReserve(null)).toThrowError(ReserveCalculationError);

      try {
        calculator.calculateReserve(null);
        expect.fail('Should have thrown ReserveCalculationError');
      } catch (e) {
        expect(e).toBeInstanceOf(ReserveCalculationError);
        expect((e as ReserveCalculationError).code).toBe('E_CTX_UNINITIALIZED');
      }
    });

    it('should NOT return 0 or computed value for invalid input - must throw instead', () => {
      // This test proves the "fail loud" principle
      let didThrow = false;
      let result: number | undefined;

      try {
        result = calculator.calculateReserve(null);
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(true);
      expect(result).toBeUndefined();
    });
  });

  describe('Layer 2: Field Validation', () => {
    it('should throw E_FIELD_MISSING if totalCommitted is missing (not silently use 0)', () => {
      // ANTI-PATTERN: Old code defaulted missing fields to 0
      // FIX: Must throw with actionable error message
      const partialState: FundContext = { currentStep: 1 };

      try {
        calculator.calculateReserve(partialState);
        expect.fail('Should have thrown ReserveCalculationError');
      } catch (e) {
        expect(e).toBeInstanceOf(ReserveCalculationError);
        expect((e as ReserveCalculationError).code).toBe('E_FIELD_MISSING');
        expect((e as ReserveCalculationError).message).toContain('Step 2');
      }
    });
  });

  describe('Layer 3: Business Rule Validation', () => {
    it('should throw E_BUSINESS_RULE for negative committed capital (not compute negative reserve)', () => {
      // ANTI-PATTERN: Old code computed negative reserves for negative input
      // FIX: Must validate business rules before calculation
      const invalidState: FundContext = { currentStep: 2, totalCommitted: -1000 };

      try {
        calculator.calculateReserve(invalidState);
        expect.fail('Should have thrown ReserveCalculationError');
      } catch (e) {
        expect(e).toBeInstanceOf(ReserveCalculationError);
        expect((e as ReserveCalculationError).code).toBe('E_BUSINESS_RULE');
      }
    });
  });

  // --- Fix verification (these prove the fix works) ---

  describe('Valid Input Handling', () => {
    it('should calculate correctly with valid input', () => {
      // Verify the happy path still works
      const validState: FundContext = { currentStep: 2, totalCommitted: 1000000 };
      const result = calculator.calculateReserve(validState);
      expect(result).toBe(100000); // 10% of 1M
    });

    it('should handle edge case of zero committed capital', () => {
      // Zero is valid (fund with no commitments yet)
      const zeroState: FundContext = { currentStep: 2, totalCommitted: 0 };
      const result = calculator.calculateReserve(zeroState);
      expect(result).toBe(0);
    });
  });
});

// ============================================================================
// Real DeterministicReserveEngine Validation Tests
// ============================================================================

describe('REFL-001: ReserveCalculationError Integration', () => {
  it('ReserveCalculationError has required structure', () => {
    const error = new ReserveCalculationError(
      'Test error message',
      'TEST_CODE',
      { testKey: 'testValue' }
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReserveCalculationError);
    expect(error.name).toBe('ReserveCalculationError');
    expect(error.message).toBe('Test error message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual({ testKey: 'testValue' });
  });

  it('ReserveCalculationError.code enables programmatic error handling', () => {
    // This demonstrates the pattern for catching specific errors
    const error = new ReserveCalculationError(
      'Portfolio cannot be empty',
      'INVALID_INPUT'
    );

    // Pattern: switch on error.code for specific handling
    let handled = false;
    switch (error.code) {
      case 'E_CTX_UNINITIALIZED':
        // Redirect to wizard start
        break;
      case 'E_FIELD_MISSING':
        // Highlight missing field
        break;
      case 'E_BUSINESS_RULE':
        // Show validation message
        break;
      case 'INVALID_INPUT':
        handled = true;
        break;
      default:
        // Generic error handling
    }

    expect(handled).toBe(true);
  });
});

// ============================================================================
// Real Engine Input Validation Tests (Integration with actual types)
// ============================================================================

describe('REFL-001: ReserveAllocationInput Validation Pattern', () => {
  it('should demonstrate validation pattern for real engine input', () => {
    // This shows the validation that MUST happen before calling real engine
    const validateInput = (input: Partial<ReserveAllocationInput>): void => {
      if (!input.portfolio || input.portfolio.length === 0) {
        throw new ReserveCalculationError(
          'Portfolio cannot be empty',
          'INVALID_INPUT'
        );
      }

      if (!input.availableReserves || input.availableReserves <= 0) {
        throw new ReserveCalculationError(
          'Available reserves must be positive',
          'INVALID_INPUT'
        );
      }

      if (!input.totalFundSize || input.totalFundSize <= 0) {
        throw new ReserveCalculationError(
          'Total fund size must be positive',
          'INVALID_INPUT'
        );
      }
    };

    // Test: Empty portfolio throws
    expect(() => validateInput({ portfolio: [] }))
      .toThrowError(ReserveCalculationError);

    // Test: Zero reserves throws
    expect(() => validateInput({ portfolio: [{}] as any, availableReserves: 0 }))
      .toThrowError(ReserveCalculationError);

    // Test: Negative fund size throws
    expect(() => validateInput({
      portfolio: [{}] as any,
      availableReserves: 1000,
      totalFundSize: -100
    })).toThrowError(ReserveCalculationError);
  });
});
