/**
 * Stage Normalization Utility Tests
 *
 * Comprehensive test coverage for fail-closed stage normalization.
 * Tests both positive cases (valid aliases) and negative cases (unknown stages).
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeInvestmentStage,
  compareStages,
  isLaterStage,
  listAllStages,
  isValidInvestmentStage,
  STAGE_ORDERING,
} from '../../../server/utils/stage-utils';

describe('Stage Normalization (server/utils/stage-utils.ts)', () => {
  describe('normalizeInvestmentStage - Positive Cases', () => {
    // Canonical forms
    it('should accept canonical pre-seed', () => {
      const result = normalizeInvestmentStage('pre-seed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('pre-seed');
    });

    it('should accept canonical seed', () => {
      const result = normalizeInvestmentStage('seed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('seed');
    });

    it('should accept canonical series-a', () => {
      const result = normalizeInvestmentStage('series-a');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });

    it('should accept canonical series-b', () => {
      const result = normalizeInvestmentStage('series-b');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-b');
    });

    it('should accept canonical series-c', () => {
      const result = normalizeInvestmentStage('series-c');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-c');
    });

    it('should accept canonical series-c+ (CRITICAL BUG FIX)', () => {
      const result = normalizeInvestmentStage('series-c+');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('series-c+');
      }
    });

    // Uppercase variants
    it('should normalize UPPERCASE pre-seed', () => {
      const result = normalizeInvestmentStage('PRE-SEED');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('pre-seed');
    });

    it('should normalize UPPERCASE series-c+', () => {
      const result = normalizeInvestmentStage('SERIES-C+');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-c+');
    });

    // Space variants (pre-seed)
    it('should normalize pre seed (with space)', () => {
      const result = normalizeInvestmentStage('pre seed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('pre-seed');
    });

    it('should normalize preseed (no separator)', () => {
      const result = normalizeInvestmentStage('preseed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('pre-seed');
    });

    // Space variants (series stages)
    it('should normalize series a (with space)', () => {
      const result = normalizeInvestmentStage('series a');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });

    it('should normalize seriesa (no separator)', () => {
      const result = normalizeInvestmentStage('seriesa');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });

    it('should normalize series b (with space)', () => {
      const result = normalizeInvestmentStage('series b');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-b');
    });

    it('should normalize seriesb (no separator)', () => {
      const result = normalizeInvestmentStage('seriesb');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-b');
    });

    // Series C+ variants (critical for regression testing)
    it('should normalize series c+ (with space)', () => {
      const result = normalizeInvestmentStage('series c+');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-c+');
    });

    it('should normalize seriesc+ (no space)', () => {
      const result = normalizeInvestmentStage('seriesc+');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-c+');
    });

    it('should normalize SERIES-C+ (uppercase with +)', () => {
      const result = normalizeInvestmentStage('SERIES-C+');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-c+');
    });

    // Underscore variants
    it('should normalize series_a (underscore)', () => {
      const result = normalizeInvestmentStage('series_a');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });

    it('should normalize pre_seed (underscore)', () => {
      const result = normalizeInvestmentStage('pre_seed');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('pre-seed');
    });

    // Mixed whitespace (multiple spaces, tabs)
    it('should normalize multiple spaces', () => {
      const result = normalizeInvestmentStage('series  a');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });

    it('should normalize leading/trailing whitespace', () => {
      const result = normalizeInvestmentStage('  series-a  ');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('series-a');
    });
  });

  describe('normalizeInvestmentStage - Negative Cases (Fail-Closed)', () => {
    it('should reject unknown stages (fail-closed)', () => {
      const result = normalizeInvestmentStage('late stage');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('UnknownStage');
        expect(result.error.original).toBe('late stage');
      }
    });

    it('should reject empty string', () => {
      const result = normalizeInvestmentStage('');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('UnknownStage');
    });

    it('should reject completely unknown variant', () => {
      const result = normalizeInvestmentStage('round a');
      expect(result.ok).toBe(false);
    });

    it('should reject near-miss series-c (without +)', () => {
      // Note: 'series-c' alone should succeed; 'seriesc' without + should fail
      // to prevent confusion with series-c+
      const result = normalizeInvestmentStage('seriesc');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.original).toBe('seriesc');
      }
    });

    it('should provide canonical list in error message', () => {
      const result = normalizeInvestmentStage('invalid');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.canonical).toContain('pre-seed');
        expect(result.error.canonical).toContain('series-c+');
      }
    });

    it('should reject null/undefined gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const resultNull = normalizeInvestmentStage(null as any);
      expect(resultNull.ok).toBe(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const resultUndefined = normalizeInvestmentStage(undefined as any);
      expect(resultUndefined.ok).toBe(false);
    });
  });

  describe('compareStages', () => {
    it('should order pre-seed < seed', () => {
      expect(compareStages('pre-seed', 'seed')).toBeLessThan(0);
    });

    it('should order seed < series-a', () => {
      expect(compareStages('seed', 'series-a')).toBeLessThan(0);
    });

    it('should order series-a < series-b', () => {
      expect(compareStages('series-a', 'series-b')).toBeLessThan(0);
    });

    it('should order series-b < series-c', () => {
      expect(compareStages('series-b', 'series-c')).toBeLessThan(0);
    });

    it('should order series-c < series-c+', () => {
      expect(compareStages('series-c', 'series-c+')).toBeLessThan(0);
    });

    it('should return 0 for equal stages', () => {
      expect(compareStages('seed', 'seed')).toBe(0);
    });

    it('should be transitive: if a < b and b < c, then a < c', () => {
      expect(compareStages('pre-seed', 'series-b')).toBeLessThan(0);
      expect(compareStages('seed', 'series-c+')).toBeLessThan(0);
    });
  });

  describe('isLaterStage', () => {
    it('should identify series-a as later than seed', () => {
      expect(isLaterStage('series-a', 'seed')).toBe(true);
    });

    it('should identify series-c+ as later than all others', () => {
      expect(isLaterStage('series-c+', 'pre-seed')).toBe(true);
      expect(isLaterStage('series-c+', 'seed')).toBe(true);
      expect(isLaterStage('series-c+', 'series-a')).toBe(true);
      expect(isLaterStage('series-c+', 'series-b')).toBe(true);
      expect(isLaterStage('series-c+', 'series-c')).toBe(true);
    });

    it('should identify earlier stage as not later', () => {
      expect(isLaterStage('seed', 'series-a')).toBe(false);
    });

    it('should identify equal stage as not later', () => {
      expect(isLaterStage('series-a', 'series-a')).toBe(false);
    });
  });

  describe('listAllStages', () => {
    it('should return all stages in progression order', () => {
      const stages = listAllStages();
      expect(stages).toEqual(['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+']);
    });

    it('should have length 6', () => {
      expect(listAllStages().length).toBe(6);
    });
  });

  describe('isValidInvestmentStage', () => {
    it('should accept valid stages', () => {
      expect(isValidInvestmentStage('pre-seed')).toBe(true);
      expect(isValidInvestmentStage('seed')).toBe(true);
      expect(isValidInvestmentStage('series-a')).toBe(true);
      expect(isValidInvestmentStage('series-b')).toBe(true);
      expect(isValidInvestmentStage('series-c')).toBe(true);
      expect(isValidInvestmentStage('series-c+')).toBe(true);
    });

    it('should reject invalid stages', () => {
      expect(isValidInvestmentStage('late stage')).toBe(false);
      expect(isValidInvestmentStage('Series-A')).toBe(false); // Must be lowercase
      expect(isValidInvestmentStage('seriesa')).toBe(false); // Not normalized yet
    });

    it('should reject non-string values', () => {
      expect(isValidInvestmentStage(null)).toBe(false);
      expect(isValidInvestmentStage(undefined)).toBe(false);
      expect(isValidInvestmentStage(123)).toBe(false);
    });
  });

  describe('STAGE_ORDERING constant', () => {
    it('should have all 6 stages', () => {
      expect(Object.keys(STAGE_ORDERING).length).toBe(6);
    });

    it('should have sequential ordering', () => {
      const values = Object.values(STAGE_ORDERING);
      expect(values).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('should match progression expectations', () => {
      expect(STAGE_ORDERING['pre-seed']).toBeLessThan(STAGE_ORDERING['seed']);
      expect(STAGE_ORDERING['seed']).toBeLessThan(STAGE_ORDERING['series-a']);
      expect(STAGE_ORDERING['series-a']).toBeLessThan(STAGE_ORDERING['series-b']);
      expect(STAGE_ORDERING['series-b']).toBeLessThan(STAGE_ORDERING['series-c']);
      expect(STAGE_ORDERING['series-c']).toBeLessThan(STAGE_ORDERING['series-c+']);
    });
  });

  describe('Integration: Bug Regression Tests', () => {
    it('REGRESSION: series-c+ should NOT become series-c- (original regex bug)', () => {
      // This test specifically validates the fix for the bug where:
      // stage.toLowerCase().replace(/[^a-z]/g, '-') converted 'series-c+' → 'series-c-'
      const result = normalizeInvestmentStage('series-c+');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('series-c+');
        expect(result.value).not.toBe('series-c-');
      }
    });

    it('REGRESSION: normalizeInvestmentStage should never silently default to seed', () => {
      // The old code had: if (stageMap.length === 0) { stageMap.seed = 1.0 }
      // This test ensures we fail instead of silently defaulting
      const result = normalizeInvestmentStage('unknown stage');
      expect(result.ok).toBe(false);
      // Verify it doesn't magically become 'seed'
      expect(result).not.toEqual({ ok: true, value: 'seed' });
    });
  });
});
