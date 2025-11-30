/**
 * Waterfall Field Validation Tests
 *
 * Tests that applyWaterfallChange properly validates field updates for AMERICAN waterfall.
 * AMERICAN waterfall only supports 'carryVesting' field updates - all other fields should be rejected.
 *
 * Background: When EUROPEAN waterfall was removed (commit ebd963a3), the guard that prevented
 * invalid field updates was also removed, leaving a pass-through that allowed ANY field to be added.
 * This violated WaterfallSchema.strict() and could cause runtime validation failures.
 */

import { describe, it, expect } from 'vitest';
import { applyWaterfallChange } from '../../client/src/lib/waterfall';
import type { Waterfall } from '@shared/types';

describe('Waterfall Field Validation', () => {
  describe('Invalid field rejection', () => {
    it('should reject invalid hurdle field update on AMERICAN waterfall', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'hurdle', 0.1);

      // Should return original object unchanged
      expect(result).toBe(american); // Same reference
      expect(result).toEqual(american); // Deep equality
      expect('hurdle' in result).toBe(false);
    });

    it('should reject invalid catchUp field update on AMERICAN waterfall', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'catchUp', 0.2);

      // Should return original object unchanged
      expect(result).toBe(american); // Same reference
      expect(result).toEqual(american); // Deep equality
      expect('catchUp' in result).toBe(false);
    });

    it('should reject arbitrary field updates on AMERICAN waterfall', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'randomField', 'someValue');

      // Should return original object unchanged
      expect(result).toBe(american); // Same reference
      expect('randomField' in result).toBe(false);
    });
  });

  describe('Valid field updates', () => {
    it('should allow carryVesting field updates', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'carryVesting', {
        cliffYears: 2,
        vestingYears: 5,
      });

      // Should return new object with updated carryVesting
      expect(result).not.toBe(american); // Different reference
      expect(result.carryVesting).toEqual({ cliffYears: 2, vestingYears: 5 });
      expect(result.type).toBe('AMERICAN');
    });
  });

  describe('Runtime validation for carryVesting', () => {
    it('should reject null value for carryVesting', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'carryVesting', null);

      // Should return original object unchanged
      expect(result).toBe(american);
    });

    it('should reject undefined value for carryVesting', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'carryVesting', undefined);

      // Should return original object unchanged
      expect(result).toBe(american);
    });

    it('should reject malformed carryVesting object (missing cliffYears)', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'carryVesting', {
        vestingYears: 5,
      });

      // Should return original object unchanged
      expect(result).toBe(american);
    });

    it('should reject malformed carryVesting object (wrong type for cliffYears)', () => {
      const american: Waterfall = {
        type: 'AMERICAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 },
      };

      const result = applyWaterfallChange(american, 'carryVesting', {
        cliffYears: 'invalid',
        vestingYears: 5,
      });

      // Should return original object unchanged
      expect(result).toBe(american);
    });
  });
});
