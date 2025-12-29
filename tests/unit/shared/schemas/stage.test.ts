import { describe, it, expect } from 'vitest';
import {
  normalizeStage,
  normalizeStageOrUndefined,
  toHyphenatedStage,
  toCamelCaseStage,
  toNoSeparatorStage,
} from '@shared/schemas/stage';

describe('Stage Normalization Functions', () => {
  describe('normalizeStage', () => {
    it('converts various input formats to canonical stage', () => {
      // Test canonical format (already normalized)
      expect(normalizeStage('pre_seed')).toBe('pre_seed');
      expect(normalizeStage('seed')).toBe('seed');
      expect(normalizeStage('series_a')).toBe('series_a');
      expect(normalizeStage('series_b')).toBe('series_b');
      expect(normalizeStage('series_c')).toBe('series_c');
      expect(normalizeStage('series_d')).toBe('series_d');
      expect(normalizeStage('growth')).toBe('growth');
      expect(normalizeStage('late_stage')).toBe('late_stage');

      // Test no-separator format (preseed)
      expect(normalizeStage('preseed')).toBe('pre_seed');
      expect(normalizeStage('series_dplus')).toBe('series_d');

      // Test hyphenated format (pre-seed)
      expect(normalizeStage('pre-seed')).toBe('pre_seed');
      expect(normalizeStage('series-a')).toBe('series_a');
      expect(normalizeStage('series-b')).toBe('series_b');
      expect(normalizeStage('series-c')).toBe('series_c');
      expect(normalizeStage('series-d-plus')).toBe('series_d');
      expect(normalizeStage('late-stage')).toBe('late_stage');

      // Test camelCase format (preSeed)
      expect(normalizeStage('preSeed')).toBe('pre_seed');
      expect(normalizeStage('seriesA')).toBe('series_a');
      expect(normalizeStage('seriesB')).toBe('series_b');
      expect(normalizeStage('seriesC')).toBe('series_c');
      expect(normalizeStage('seriesD')).toBe('series_d');
    });

    it('throws error on unknown stage input', () => {
      expect(() => normalizeStage('invalid_stage')).toThrow(
        'Unknown stage format: "invalid_stage"'
      );
      expect(() => normalizeStage('series_e')).toThrow('Unknown stage format: "series_e"');
      expect(() => normalizeStage('')).toThrow('Unknown stage format: ""');
      expect(() => normalizeStage('SEED')).toThrow('Unknown stage format: "SEED"');
      expect(() => normalizeStage('pre seed')).toThrow('Unknown stage format: "pre seed"');
    });
  });

  describe('normalizeStageOrUndefined', () => {
    it('returns undefined instead of throwing on unknown stage', () => {
      // Test valid stages return canonical format
      expect(normalizeStageOrUndefined('pre_seed')).toBe('pre_seed');
      expect(normalizeStageOrUndefined('preseed')).toBe('pre_seed');
      expect(normalizeStageOrUndefined('pre-seed')).toBe('pre_seed');
      expect(normalizeStageOrUndefined('preSeed')).toBe('pre_seed');

      // Test invalid stages return undefined (no throw)
      expect(normalizeStageOrUndefined('invalid_stage')).toBeUndefined();
      expect(normalizeStageOrUndefined('series_e')).toBeUndefined();
      expect(normalizeStageOrUndefined('')).toBeUndefined();
      expect(normalizeStageOrUndefined('SEED')).toBeUndefined();
      expect(normalizeStageOrUndefined('pre seed')).toBeUndefined();
    });
  });

  describe('toHyphenatedStage', () => {
    it('converts all canonical stages to hyphenated format correctly', () => {
      expect(toHyphenatedStage('pre_seed')).toBe('pre-seed');
      expect(toHyphenatedStage('seed')).toBe('seed');
      expect(toHyphenatedStage('series_a')).toBe('series-a');
      expect(toHyphenatedStage('series_b')).toBe('series-b');
      expect(toHyphenatedStage('series_c')).toBe('series-c');
      expect(toHyphenatedStage('series_d')).toBe('series-d-plus');
      expect(toHyphenatedStage('growth')).toBe('late-stage'); // growth maps to late-stage
      expect(toHyphenatedStage('late_stage')).toBe('late-stage');
    });
  });

  describe('toCamelCaseStage', () => {
    it('converts all canonical stages to camelCase format correctly', () => {
      expect(toCamelCaseStage('pre_seed')).toBe('preSeed');
      expect(toCamelCaseStage('seed')).toBe('seed');
      expect(toCamelCaseStage('series_a')).toBe('seriesA');
      expect(toCamelCaseStage('series_b')).toBe('seriesB');
      expect(toCamelCaseStage('series_c')).toBe('seriesC');
      expect(toCamelCaseStage('series_d')).toBe('seriesD');
      expect(toCamelCaseStage('growth')).toBe('seriesD'); // growth maps to seriesD
      expect(toCamelCaseStage('late_stage')).toBe('seriesD'); // late_stage maps to seriesD
    });
  });

  describe('toNoSeparatorStage', () => {
    it('converts all canonical stages to no-separator format correctly', () => {
      expect(toNoSeparatorStage('pre_seed')).toBe('preseed');
      expect(toNoSeparatorStage('seed')).toBe('seed');
      expect(toNoSeparatorStage('series_a')).toBe('series_a');
      expect(toNoSeparatorStage('series_b')).toBe('series_b');
      expect(toNoSeparatorStage('series_c')).toBe('series_c');
      expect(toNoSeparatorStage('series_d')).toBe('series_dplus');
      expect(toNoSeparatorStage('growth')).toBe('series_dplus'); // growth maps to series_dplus
      expect(toNoSeparatorStage('late_stage')).toBe('series_dplus'); // late_stage maps to series_dplus
    });
  });
});
