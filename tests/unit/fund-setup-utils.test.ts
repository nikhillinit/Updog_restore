import { describe, it, expect } from 'vitest';
import { 
  resolveStepKeyFromLocation, 
  isValidStep,
  getStepNumber,
  normalizeStepParam,
  VALID_STEPS,
  NUM_TO_KEY
} from '@/pages/fund-setup-utils';

describe('fund-setup-utils', () => {
  describe('resolveStepKeyFromLocation', () => {
    it('maps step 2 to investment-strategy', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=2')).toBe('investment-strategy');
      expect(resolveStepKeyFromLocation('?step=2')).toBe('investment-strategy');
    });

    it('maps step 3 to exit-recycling', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=3')).toBe('exit-recycling');
      expect(resolveStepKeyFromLocation('?step=3')).toBe('exit-recycling');
    });

    it('maps step 4 to waterfall', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=4')).toBe('waterfall');
      expect(resolveStepKeyFromLocation('?step=4')).toBe('waterfall');
    });

    it('defaults to step 2 when no step param', () => {
      expect(resolveStepKeyFromLocation('/fund-setup')).toBe('investment-strategy');
      expect(resolveStepKeyFromLocation('/')).toBe('investment-strategy');
      expect(resolveStepKeyFromLocation('')).toBe('investment-strategy');
    });

    it('returns not-found for invalid steps', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=1')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=5')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=99')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=abc')).toBe('not-found');
    });

    it('handles complex URLs correctly', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=3&other=param')).toBe('exit-recycling');
      expect(resolveStepKeyFromLocation('/fund-setup?other=param&step=4')).toBe('waterfall');
    });

    it('handles malformed URLs gracefully', () => {
      expect(resolveStepKeyFromLocation('?step=')).toBe('not-found'); // empty string is invalid
      expect(resolveStepKeyFromLocation('?step')).toBe('not-found'); // empty string is invalid
    });

    it('handles whitespace correctly', () => {
      expect(resolveStepKeyFromLocation('?step=%202%20')).toBe('investment-strategy'); // URL-encoded ' 2 '
      expect(resolveStepKeyFromLocation('?step=  3  ')).toBe('exit-recycling'); // spaces around 3
      expect(resolveStepKeyFromLocation('?step=%20')).toBe('not-found'); // just spaces
    });
  });

  describe('normalizeStepParam', () => {
    it('returns 2 for null (missing param)', () => {
      expect(normalizeStepParam(null)).toBe('2');
    });

    it('returns null for empty strings', () => {
      expect(normalizeStepParam('')).toBe(null);
      expect(normalizeStepParam('  ')).toBe(null); // whitespace only
    });

    it('returns the step for valid values', () => {
      expect(normalizeStepParam('2')).toBe('2');
      expect(normalizeStepParam('3')).toBe('3');
      expect(normalizeStepParam('4')).toBe('4');
    });

    it('trims whitespace', () => {
      expect(normalizeStepParam(' 2 ')).toBe('2');
      expect(normalizeStepParam('\t3\n')).toBe('3');
    });

    it('returns null for invalid values', () => {
      expect(normalizeStepParam('1')).toBe(null);
      expect(normalizeStepParam('5')).toBe(null);
      expect(normalizeStepParam('abc')).toBe(null);
    });
  });

  describe('isValidStep', () => {
    it('returns true for valid steps', () => {
      expect(isValidStep('2')).toBe(true);
      expect(isValidStep('3')).toBe(true);
      expect(isValidStep('4')).toBe(true);
    });

    it('returns false for invalid steps', () => {
      expect(isValidStep('1')).toBe(false);
      expect(isValidStep('5')).toBe(false);
      expect(isValidStep('99')).toBe(false);
      expect(isValidStep('abc')).toBe(false);
      expect(isValidStep('')).toBe(false);
      expect(isValidStep(null)).toBe(false);
      expect(isValidStep(undefined)).toBe(false);
      expect(isValidStep(2)).toBe(false); // number, not string
    });
  });

  describe('getStepNumber', () => {
    it('returns correct step number for valid keys', () => {
      expect(getStepNumber('investment-strategy')).toBe('2');
      expect(getStepNumber('exit-recycling')).toBe('3');
      expect(getStepNumber('waterfall')).toBe('4');
    });
  });

  describe('type safety', () => {
    it('VALID_STEPS contains exactly 2, 3, 4', () => {
      expect(VALID_STEPS).toEqual(['2', '3', '4']);
    });

    it('NUM_TO_KEY maps all valid steps', () => {
      expect(Object.keys(NUM_TO_KEY).sort()).toEqual(['2', '3', '4']);
      expect(NUM_TO_KEY['2']).toBe('investment-strategy');
      expect(NUM_TO_KEY['3']).toBe('exit-recycling');
      expect(NUM_TO_KEY['4']).toBe('waterfall');
    });
  });
});