/**
 * PacingEngine Test Suite
 * Comprehensive tests for fund deployment pacing with market condition adjustments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PacingEngine, generatePacingSummary } from '@/core/pacing/PacingEngine';
import type { PacingInput, PacingOutput } from '@shared/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createPacingInput = (overrides: Partial<PacingInput> = {}): PacingInput => ({
  fundSize: 50000000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
  ...overrides,
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('PacingEngine - Input Validation', () => {
  it('should validate and process correct input', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(8); // 8 quarters deployment
  });

  it('should reject invalid fund size', () => {
    const input = { fundSize: -1000000, deploymentQuarter: 1, marketCondition: 'neutral' as const };
    expect(() => PacingEngine(input)).toThrow('Invalid pacing input');
  });

  it('should reject missing required fields', () => {
    const input = { fundSize: 50000000 } as any;
    expect(() => PacingEngine(input)).toThrow('Invalid pacing input');
  });

  it('should validate market condition values', () => {
    const validConditions = ['bull', 'bear', 'neutral'] as const;

    validConditions.forEach(condition => {
      const input = createPacingInput({ marketCondition: condition });
      const result = PacingEngine(input);
      expect(result).toHaveLength(8);
    });
  });
});

// =============================================================================
// MARKET CONDITION ADJUSTMENT TESTS
// =============================================================================

describe('PacingEngine - Market Condition Adjustments', () => {
  it('should front-load deployment in bull markets', () => {
    const input = createPacingInput({ marketCondition: 'bull' });
    const result = PacingEngine(input);

    // Early quarters (0-2) should have higher deployment
    const earlyTotal = result.slice(0, 3).reduce((sum, q) => sum + q.deployment, 0);
    const lateTotal = result.slice(5, 8).reduce((sum, q) => sum + q.deployment, 0);

    expect(earlyTotal).toBeGreaterThan(lateTotal);
  });

  it('should back-load deployment in bear markets', () => {
    const input = createPacingInput({ marketCondition: 'bear' });
    const result = PacingEngine(input);

    // Late quarters (5-7) should have higher deployment
    const earlyTotal = result.slice(0, 3).reduce((sum, q) => sum + q.deployment, 0);
    const lateTotal = result.slice(5, 8).reduce((sum, q) => sum + q.deployment, 0);

    expect(lateTotal).toBeGreaterThan(earlyTotal);
  });

  it('should distribute evenly in neutral markets', () => {
    const input = createPacingInput({ marketCondition: 'neutral' });
    const result = PacingEngine(input);

    // Calculate average deployment per quarter
    const avgDeployment = result.reduce((sum, q) => sum + q.deployment, 0) / result.length;

    // All quarters should be close to average (within reasonable variance)
    result.forEach(quarter => {
      const variance = Math.abs(quarter.deployment - avgDeployment) / avgDeployment;
      expect(variance).toBeLessThan(0.3); // Within 30% of average
    });
  });

  it('should include market condition in notes', () => {
    const conditions = ['bull', 'bear', 'neutral'] as const;

    conditions.forEach(condition => {
      const input = createPacingInput({ marketCondition: condition });
      const result = PacingEngine(input);

      result.forEach(quarter => {
        expect(quarter.note).toContain(condition);
      });
    });
  });
});

// =============================================================================
// PHASE-BASED DEPLOYMENT TESTS
// =============================================================================

describe('PacingEngine - Phase-Based Deployment', () => {
  it('should identify early-stage focus phase', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    // First 3 quarters should have early-stage note
    result.slice(0, 3).forEach(quarter => {
      expect(quarter.note).toContain('early-stage');
    });
  });

  it('should identify mid-stage deployment phase', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    // Quarters 3-5 should have mid-stage note
    result.slice(3, 6).forEach(quarter => {
      expect(quarter.note).toContain('mid-stage');
    });
  });

  it('should identify late-stage optimization phase', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    // Last 2 quarters should have late-stage note
    result.slice(6, 8).forEach(quarter => {
      expect(quarter.note).toContain('late-stage');
    });
  });
});

// =============================================================================
// 8-QUARTER DEPLOYMENT SCHEDULE TESTS
// =============================================================================

describe('PacingEngine - 8-Quarter Deployment Schedule', () => {
  it('should generate exactly 8 quarters', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    expect(result).toHaveLength(8);
  });

  it('should deploy approximately full fund size', () => {
    const input = createPacingInput({ fundSize: 50000000 });
    const result = PacingEngine(input);

    const totalDeployment = result.reduce((sum, q) => sum + q.deployment, 0);

    // Should be close to fund size (within 10% due to variability)
    expect(totalDeployment).toBeGreaterThan(45000000);
    expect(totalDeployment).toBeLessThan(55000000);
  });

  it('should assign sequential quarters', () => {
    const input = createPacingInput({ deploymentQuarter: 5 });
    const result = PacingEngine(input);

    result.forEach((quarter, index) => {
      expect(quarter.quarter).toBe(5 + index);
    });
  });

  it('should have positive deployment in all quarters', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    result.forEach(quarter => {
      expect(quarter.deployment).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// ALGORITHM MODE TESTS
// =============================================================================

describe('PacingEngine - Algorithm Mode', () => {
  it('should apply ML enhancements when ALG_PACING is true', () => {
    const originalEnv = process.env['ALG_PACING'];
    process.env['ALG_PACING'] = 'true';

    const input = createPacingInput();
    const result = PacingEngine(input);

    result.forEach(quarter => {
      expect(quarter.note).toContain('ML-optimized');
    });

    process.env['ALG_PACING'] = originalEnv;
  });

  it('should use rule-based allocation by default', () => {
    const originalEnv = process.env['ALG_PACING'];
    delete process.env['ALG_PACING'];

    const input = createPacingInput({ marketCondition: 'bull' });
    const result = PacingEngine(input);

    result.forEach(quarter => {
      expect(quarter.note).toContain('bull market pacing');
    });

    if (originalEnv) {
      process.env['ALG_PACING'] = originalEnv;
    }
  });
});

// =============================================================================
// OUTPUT VALIDATION TESTS
// =============================================================================

describe('PacingEngine - Output Validation', () => {
  it('should return valid output structure', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    result.forEach(quarter => {
      expect(quarter).toMatchObject({
        quarter: expect.any(Number),
        deployment: expect.any(Number),
        note: expect.any(String),
      });
    });
  });

  it('should round deployment amounts', () => {
    const input = createPacingInput();
    const result = PacingEngine(input);

    result.forEach(quarter => {
      expect(quarter.deployment).toBe(Math.round(quarter.deployment));
    });
  });
});

// =============================================================================
// PACING SUMMARY TESTS
// =============================================================================

describe('generatePacingSummary', () => {
  it('should generate complete summary', () => {
    const input = createPacingInput();
    const summary = generatePacingSummary(input);

    expect(summary).toMatchObject({
      fundSize: expect.any(Number),
      totalQuarters: expect.any(Number),
      avgQuarterlyDeployment: expect.any(Number),
      marketCondition: expect.any(String),
      deployments: expect.any(Array),
      generatedAt: expect.any(Date),
    });
  });

  it('should calculate total quarters correctly', () => {
    const input = createPacingInput();
    const summary = generatePacingSummary(input);

    expect(summary.totalQuarters).toBe(8);
    expect(summary.deployments).toHaveLength(8);
  });

  it('should calculate average quarterly deployment', () => {
    const input = createPacingInput({ fundSize: 50000000 });
    const summary = generatePacingSummary(input);

    const manualAvg = summary.deployments.reduce((sum, d) => sum + d.deployment, 0) / summary.totalQuarters;
    expect(summary.avgQuarterlyDeployment).toBeCloseTo(manualAvg, 0);
  });

  it('should include market condition', () => {
    const input = createPacingInput({ marketCondition: 'bull' });
    const summary = generatePacingSummary(input);

    expect(summary.marketCondition).toBe('bull');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('PacingEngine - Edge Cases', () => {
  it('should handle very small fund size', () => {
    const input = createPacingInput({ fundSize: 1000000 });
    const result = PacingEngine(input);

    expect(result).toHaveLength(8);
    const total = result.reduce((sum, q) => sum + q.deployment, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('should handle very large fund size', () => {
    const input = createPacingInput({ fundSize: 1000000000 });
    const result = PacingEngine(input);

    expect(result).toHaveLength(8);
    const total = result.reduce((sum, q) => sum + q.deployment, 0);
    expect(total).toBeGreaterThan(900000000);
  });

  it('should handle high starting quarter', () => {
    const input = createPacingInput({ deploymentQuarter: 100 });
    const result = PacingEngine(input);

    expect(result[0].quarter).toBe(100);
    expect(result[7].quarter).toBe(107);
  });

  it('should maintain consistency across multiple runs', () => {
    const input = createPacingInput({ fundSize: 50000000, marketCondition: 'neutral' });

    const result1 = PacingEngine(input);
    const result2 = PacingEngine(input);

    // Structure should be consistent (note: actual values may vary due to randomness)
    expect(result1).toHaveLength(result2.length);
    expect(result1[0].quarter).toBe(result2[0].quarter);
  });
});