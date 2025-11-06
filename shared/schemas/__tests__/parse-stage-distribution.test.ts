/**
 * Tests for parseStageDistribution - Stage Distribution Parser and Validator
 *
 * Comprehensive test suite covering:
 * - NaN validation (critical security fix)
 * - Invalid weight ranges
 * - Unknown stage detection
 * - Sum validation with epsilon tolerance
 * - Normalization behavior
 */

import { describe, it, expect } from 'vitest';
import {
  parseStageDistribution,
  validateStageDistribution,
  createUniformDistribution,
  isValidDistribution,
  getEpsilon,
  type StageDistributionEntry,
} from '../parse-stage-distribution';

describe('parseStageDistribution', () => {
  describe('NaN Validation (Security Fix)', () => {
    it('should reject NaN weights', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: NaN },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].kind).toBe('InvalidWeight');
        expect(result.errors[0].message).toContain('Weight must be in [0, 1]');
        expect(result.errors[0].weight).toBeNaN();
      }
    });

    it('should reject Infinity weights', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: Infinity },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].kind).toBe('InvalidWeight');
      }
    });

    it('should reject -Infinity weights', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: -Infinity },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].kind).toBe('InvalidWeight');
      }
    });

    it('should reject multiple entries with some NaN weights', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.4 },
        { stage: 'series-a', weight: NaN },
        { stage: 'series-b', weight: 0.6 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some(e => e.kind === 'InvalidWeight' && Number.isNaN(e.weight))).toBe(true);
      }
    });
  });

  describe('Valid Distributions', () => {
    it('should accept valid single-stage distribution', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 1.0 },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.distribution).toHaveLength(1);
        expect(result.distribution[0].stage).toBe('seed');
        expect(result.distribution[0].weight).toBe(1.0);
      }
    });

    it('should accept valid multi-stage distribution', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.4 },
        { stage: 'series-a', weight: 0.6 },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.distribution).toHaveLength(2);
        expect(result.distribution.find(d => d.stage === 'seed')?.weight).toBe(0.4);
        expect(result.distribution.find(d => d.stage === 'series-a')?.weight).toBe(0.6);
      }
    });

    it('should normalize stage names', () => {
      const result = parseStageDistribution([
        { stage: 'Seed', weight: 0.5 },
        { stage: 'SERIES-A', weight: 0.5 },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.distribution.find(d => d.stage === 'seed')).toBeDefined();
        expect(result.distribution.find(d => d.stage === 'series-a')).toBeDefined();
      }
    });
  });

  describe('Invalid Weight Ranges', () => {
    it('should reject negative weights', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: -0.1 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('InvalidWeight');
      }
    });

    it('should reject weights greater than 1', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 1.1 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('InvalidWeight');
      }
    });

    it('should accept edge case: weight = 0', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0 },
        { stage: 'series-a', weight: 1.0 },
      ]);

      expect(result.ok).toBe(true);
    });

    it('should accept edge case: weight = 1', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 1.0 },
      ]);

      expect(result.ok).toBe(true);
    });
  });

  describe('Sum Validation', () => {
    it('should reject distribution with sum < 1 (outside epsilon)', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.3 },
        { stage: 'series-a', weight: 0.3 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('InvalidSum');
        expect(result.errors[0].sum).toBe(0.6);
      }
    });

    it('should reject distribution with sum > 1 (outside epsilon)', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.6 },
        { stage: 'series-a', weight: 0.6 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('InvalidSum');
        expect(result.errors[0].sum).toBe(1.2);
      }
    });

    it('should accept distribution within epsilon tolerance', () => {
      const epsilon = getEpsilon();
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.5 + epsilon / 2 },
        { stage: 'series-a', weight: 0.5 - epsilon / 2 },
      ]);

      expect(result.ok).toBe(true);
    });

    it('should normalize sum to exactly 1.0 when within epsilon', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.3333 },
        { stage: 'series-a', weight: 0.3333 },
        { stage: 'series-b', weight: 0.3334 },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const sum = result.distribution.reduce((acc, d) => acc + d.weight, 0);
        expect(sum).toBeCloseTo(1.0, 10);
        expect(result.warnings).toBeDefined();
        expect(result.warnings?.some(w => w.includes('adjusted'))).toBe(true);
      }
    });
  });

  describe('Unknown Stage Detection', () => {
    it('should reject unknown stage names', () => {
      const result = parseStageDistribution([
        { stage: 'late-stage', weight: 1.0 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('UnknownStage');
        expect(result.errors[0].stage).toBe('late-stage');
      }
    });

    it('should provide canonical stage names in error', () => {
      const result = parseStageDistribution([
        { stage: 'invalid', weight: 1.0 },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].message).toContain('Expected one of');
      }
    });
  });

  describe('Empty Distribution', () => {
    it('should reject empty array', () => {
      const result = parseStageDistribution([]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('EmptyDistribution');
      }
    });

    it('should reject null/undefined', () => {
      const result = parseStageDistribution(null as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].kind).toBe('EmptyDistribution');
      }
    });
  });

  describe('Duplicate Stages', () => {
    it('should combine weights for duplicate stages', () => {
      const result = parseStageDistribution([
        { stage: 'seed', weight: 0.3 },
        { stage: 'seed', weight: 0.2 },
        { stage: 'series-a', weight: 0.5 },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.distribution).toHaveLength(2);
        expect(result.distribution.find(d => d.stage === 'seed')?.weight).toBe(0.5);
        expect(result.warnings).toBeDefined();
        expect(result.warnings?.some(w => w.includes('Duplicate'))).toBe(true);
      }
    });
  });
});

describe('validateStageDistribution', () => {
  it('should return normalized distribution on success', () => {
    const dist = validateStageDistribution([
      { stage: 'seed', weight: 0.5 },
      { stage: 'series-a', weight: 0.5 },
    ]);

    expect(dist).toHaveLength(2);
    expect(dist[0].stage).toBeDefined();
    expect(dist[0].weight).toBeDefined();
  });

  it('should throw on validation failure', () => {
    expect(() => {
      validateStageDistribution([
        { stage: 'seed', weight: NaN },
      ]);
    }).toThrow('Invalid stage distribution');
  });

  it('should include error details in thrown message', () => {
    expect(() => {
      validateStageDistribution([
        { stage: 'unknown-stage', weight: 1.0 },
      ]);
    }).toThrow('Unknown stage');
  });
});

describe('createUniformDistribution', () => {
  it('should create equal weights for all stages', () => {
    const dist = createUniformDistribution(['seed', 'series-a', 'series-b']);

    expect(dist).toHaveLength(3);
    expect(dist.every(d => Math.abs(d.weight - 1/3) < 0.001)).toBe(true);
  });

  it('should normalize stage names', () => {
    const dist = createUniformDistribution(['Seed', 'SERIES-A']);

    expect(dist.find(d => d.stage === 'seed')).toBeDefined();
    expect(dist.find(d => d.stage === 'series-a')).toBeDefined();
  });

  it('should throw on empty array', () => {
    expect(() => {
      createUniformDistribution([]);
    }).toThrow('cannot be empty');
  });

  it('should handle single stage', () => {
    const dist = createUniformDistribution(['seed']);

    expect(dist).toHaveLength(1);
    expect(dist[0].weight).toBe(1.0);
  });
});

describe('isValidDistribution', () => {
  it('should return true for valid distribution', () => {
    expect(isValidDistribution([
      { stage: 'seed', weight: 0.5 },
      { stage: 'series-a', weight: 0.5 },
    ])).toBe(true);
  });

  it('should return false for NaN weights', () => {
    expect(isValidDistribution([
      { stage: 'seed', weight: NaN },
    ])).toBe(false);
  });

  it('should return false for invalid sum', () => {
    expect(isValidDistribution([
      { stage: 'seed', weight: 0.3 },
      { stage: 'series-a', weight: 0.3 },
    ])).toBe(false);
  });

  it('should return false for unknown stages', () => {
    expect(isValidDistribution([
      { stage: 'unknown', weight: 1.0 },
    ])).toBe(false);
  });
});

describe('getEpsilon', () => {
  it('should return epsilon tolerance value', () => {
    expect(getEpsilon()).toBe(1e-4);
  });
});
