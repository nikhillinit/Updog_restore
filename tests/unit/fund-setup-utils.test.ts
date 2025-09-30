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
    it('maps step 1 to fund-basics', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=1')).toBe('fund-basics');
      expect(resolveStepKeyFromLocation('?step=1')).toBe('fund-basics');
    });

    it('maps step 2 to capital-structure', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=2')).toBe('capital-structure');
      expect(resolveStepKeyFromLocation('?step=2')).toBe('capital-structure');
    });

    it('maps step 3 to investment-strategy', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=3')).toBe('investment-strategy');
      expect(resolveStepKeyFromLocation('?step=3')).toBe('investment-strategy');
    });

    it('maps step 4 to distributions', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=4')).toBe('distributions');
      expect(resolveStepKeyFromLocation('?step=4')).toBe('distributions');
    });

    it('defaults to step 1 when no step param', () => {
      expect(resolveStepKeyFromLocation('/fund-setup')).toBe('fund-basics');
      expect(resolveStepKeyFromLocation('/')).toBe('fund-basics');
      expect(resolveStepKeyFromLocation('')).toBe('fund-basics');
    });

    it('maps step 5 to cashflow-management', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=5')).toBe('cashflow-management');
      expect(resolveStepKeyFromLocation('?step=5')).toBe('cashflow-management');
    });

    it('returns not-found for invalid steps', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=0')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=6')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=99')).toBe('not-found');
      expect(resolveStepKeyFromLocation('/fund-setup?step=abc')).toBe('not-found');
    });

    it('handles complex URLs correctly', () => {
      expect(resolveStepKeyFromLocation('/fund-setup?step=3&other=param')).toBe('investment-strategy');
      expect(resolveStepKeyFromLocation('/fund-setup?other=param&step=4')).toBe('distributions');
    });

    it('handles malformed URLs gracefully', () => {
      expect(resolveStepKeyFromLocation('?step=')).toBe('not-found'); // empty string is invalid
      expect(resolveStepKeyFromLocation('?step')).toBe('not-found'); // empty string is invalid
    });

    it('handles whitespace correctly', () => {
      expect(resolveStepKeyFromLocation('?step=%202%20')).toBe('capital-structure'); // URL-encoded ' 2 '
      expect(resolveStepKeyFromLocation('?step=  3  ')).toBe('investment-strategy'); // spaces around 3
      expect(resolveStepKeyFromLocation('?step=%20')).toBe('not-found'); // just spaces
    });
  });

  describe('normalizeStepParam', () => {
    it('returns 1 for null (missing param)', () => {
      expect(normalizeStepParam(null)).toBe('1');
    });

    it('returns null for empty strings', () => {
      expect(normalizeStepParam('')).toBe(null);
      expect(normalizeStepParam('  ')).toBe(null); // whitespace only
    });

    it('returns the step for valid values', () => {
      expect(normalizeStepParam('1')).toBe('1');
      expect(normalizeStepParam('2')).toBe('2');
      expect(normalizeStepParam('3')).toBe('3');
      expect(normalizeStepParam('4')).toBe('4');
      expect(normalizeStepParam('5')).toBe('5');
    });

    it('trims whitespace', () => {
      expect(normalizeStepParam(' 2 ')).toBe('2');
      expect(normalizeStepParam('\t3\n')).toBe('3');
    });

    it('returns null for invalid values', () => {
      expect(normalizeStepParam('0')).toBe(null);
      expect(normalizeStepParam('6')).toBe(null);
      expect(normalizeStepParam('abc')).toBe(null);
    });
  });

  describe('isValidStep', () => {
    it('returns true for valid steps', () => {
      expect(isValidStep('1')).toBe(true);
      expect(isValidStep('2')).toBe(true);
      expect(isValidStep('3')).toBe(true);
      expect(isValidStep('4')).toBe(true);
      expect(isValidStep('5')).toBe(true);
    });

    it('returns false for invalid steps', () => {
      expect(isValidStep('0')).toBe(false);
      expect(isValidStep('6')).toBe(false);
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
      expect(getStepNumber('fund-basics')).toBe('1');
      expect(getStepNumber('capital-structure')).toBe('2');
      expect(getStepNumber('investment-strategy')).toBe('3');
      expect(getStepNumber('distributions')).toBe('4');
      expect(getStepNumber('cashflow-management')).toBe('5');
    });
  });

  describe('type safety', () => {
    it('VALID_STEPS contains exactly 1, 2, 3, 4, 5', () => {
      expect(VALID_STEPS).toEqual(['1', '2', '3', '4', '5']);
    });

    it('NUM_TO_KEY maps all valid steps', () => {
      expect(Object.keys(NUM_TO_KEY).sort()).toEqual(['1', '2', '3', '4', '5']);
      expect(NUM_TO_KEY['1']).toBe('fund-basics');
      expect(NUM_TO_KEY['2']).toBe('capital-structure');
      expect(NUM_TO_KEY['3']).toBe('investment-strategy');
      expect(NUM_TO_KEY['4']).toBe('distributions');
      expect(NUM_TO_KEY['5']).toBe('cashflow-management');
    });
  });
});