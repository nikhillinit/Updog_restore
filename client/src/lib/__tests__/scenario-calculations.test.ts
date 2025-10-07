/**
 * Tests for Scenario Calculations
 *
 * Test coverage:
 * - Default scenario generation
 * - Scenario adjustment application
 * - IRR calculation
 * - Scenario comparison
 * - Validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateDefaultScenarios,
  generateCustomScenario,
  applyScenarioAdjustments,
  calculateIRR,
  compareScenarios,
  generateScenarioResults,
  isBaseCase,
  validateScenarioAdjustments,
  type ModelOutput,
  type ScenarioAdjustment
} from '../scenario-calculations';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const baseModel: ModelOutput = {
  grossMOIC: 2.5,
  netMOIC: 2.1,
  grossIRR: 25,
  netIRR: 20,
  lossRate: 30,
  avgExitYears: 7.0,
  participationRate: 75
};

const baseAdjustment: ScenarioAdjustment = {
  id: 'base',
  name: 'Base Case',
  moicMultiplier: 1.0,
  exitTimingDelta: 0,
  lossRateDelta: 0,
  participationRateDelta: 0
};

// ============================================================================
// DEFAULT SCENARIOS
// ============================================================================

describe('generateDefaultScenarios', () => {
  it('should generate 3 default scenarios', () => {
    const scenarios = generateDefaultScenarios();
    expect(scenarios).toHaveLength(3);
  });

  it('should include Base Case scenario', () => {
    const scenarios = generateDefaultScenarios();
    const baseCase = scenarios.find(s => s.name === 'Base Case');

    expect(baseCase).toBeDefined();
    expect(baseCase?.moicMultiplier).toBe(1.0);
    expect(baseCase?.exitTimingDelta).toBe(0);
    expect(baseCase?.lossRateDelta).toBe(0);
    expect(baseCase?.participationRateDelta).toBe(0);
  });

  it('should include Optimistic scenario with positive adjustments', () => {
    const scenarios = generateDefaultScenarios();
    const optimistic = scenarios.find(s => s.name === 'Optimistic');

    expect(optimistic).toBeDefined();
    expect(optimistic?.moicMultiplier).toBeGreaterThan(1.0);
    expect(optimistic?.exitTimingDelta).toBeLessThan(0); // Earlier exit
    expect(optimistic?.lossRateDelta).toBeLessThan(0); // Lower losses
    expect(optimistic?.participationRateDelta).toBeGreaterThan(0); // More follow-ons
  });

  it('should include Pessimistic scenario with negative adjustments', () => {
    const scenarios = generateDefaultScenarios();
    const pessimistic = scenarios.find(s => s.name === 'Pessimistic');

    expect(pessimistic).toBeDefined();
    expect(pessimistic?.moicMultiplier).toBeLessThan(1.0);
    expect(pessimistic?.exitTimingDelta).toBeGreaterThan(0); // Later exit
    expect(pessimistic?.lossRateDelta).toBeGreaterThan(0); // Higher losses
    expect(pessimistic?.participationRateDelta).toBeLessThan(0); // Fewer follow-ons
  });

  it('should generate scenarios with unique IDs', () => {
    const scenarios = generateDefaultScenarios();
    const ids = scenarios.map(s => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('generateCustomScenario', () => {
  it('should generate custom scenario with default adjustments', () => {
    const scenario = generateCustomScenario('My Custom Scenario');

    expect(scenario.name).toBe('My Custom Scenario');
    expect(scenario.moicMultiplier).toBe(1.0);
    expect(scenario.exitTimingDelta).toBe(0);
    expect(scenario.lossRateDelta).toBe(0);
    expect(scenario.participationRateDelta).toBe(0);
  });

  it('should generate unique IDs for custom scenarios', () => {
    const scenario1 = generateCustomScenario('Custom 1');
    const scenario2 = generateCustomScenario('Custom 2');

    expect(scenario1.id).not.toBe(scenario2.id);
  });
});

// ============================================================================
// ADJUSTMENT APPLICATION
// ============================================================================

describe('applyScenarioAdjustments', () => {
  it('should return unchanged metrics for base case adjustment', () => {
    const result = applyScenarioAdjustments(baseModel, baseAdjustment);

    expect(result.grossMOIC).toBe(baseModel.grossMOIC);
    expect(result.netMOIC).toBe(baseModel.netMOIC);
    expect(result.lossRate).toBe(baseModel.lossRate);
    expect(result.avgExitYears).toBe(baseModel.avgExitYears);
    expect(result.participationRate).toBe(baseModel.participationRate);
  });

  it('should apply MOIC multiplier correctly', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      moicMultiplier: 1.5 // 50% increase
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    expect(result.grossMOIC).toBeCloseTo(2.5 * 1.5, 2); // 3.75
    expect(result.netMOIC).toBeCloseTo(2.1 * 1.5, 2); // 3.15
  });

  it('should apply loss rate delta correctly', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      lossRateDelta: -10 // Reduce by 10pp
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    expect(result.lossRate).toBe(20); // 30 - 10
  });

  it('should clamp loss rate to [0, 100] range', () => {
    const adjustment1: ScenarioAdjustment = {
      ...baseAdjustment,
      lossRateDelta: -50 // Would be negative
    };

    const result1 = applyScenarioAdjustments(baseModel, adjustment1);
    expect(result1.lossRate).toBe(0);

    const adjustment2: ScenarioAdjustment = {
      ...baseAdjustment,
      lossRateDelta: 80 // Would exceed 100
    };

    const result2 = applyScenarioAdjustments(baseModel, adjustment2);
    expect(result2.lossRate).toBe(100);
  });

  it('should apply exit timing delta correctly', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      exitTimingDelta: -12 // Exit 12 months (1 year) earlier
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    expect(result.avgExitYears).toBeCloseTo(6.0, 2); // 7.0 - 1.0
  });

  it('should apply participation rate delta correctly', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      participationRateDelta: 10 // Increase by 10pp
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    expect(result.participationRate).toBe(85); // 75 + 10
  });

  it('should clamp participation rate to [0, 100] range', () => {
    const adjustment1: ScenarioAdjustment = {
      ...baseAdjustment,
      participationRateDelta: -100 // Would be negative
    };

    const result1 = applyScenarioAdjustments(baseModel, adjustment1);
    expect(result1.participationRate).toBe(0);

    const adjustment2: ScenarioAdjustment = {
      ...baseAdjustment,
      participationRateDelta: 50 // Would exceed 100
    };

    const result2 = applyScenarioAdjustments(baseModel, adjustment2);
    expect(result2.participationRate).toBe(100);
  });

  it('should recalculate IRR based on adjusted MOIC and timing', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      moicMultiplier: 1.5, // Higher returns
      exitTimingDelta: -12 // Earlier exit
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    // Higher MOIC + earlier exit = higher IRR
    expect(result.grossIRR).toBeGreaterThan(baseModel.grossIRR);
    expect(result.netIRR).toBeGreaterThan(baseModel.netIRR);
  });

  it('should handle combined adjustments correctly', () => {
    const adjustment: ScenarioAdjustment = {
      id: 'optimistic',
      name: 'Optimistic',
      moicMultiplier: 1.5,
      exitTimingDelta: -6,
      lossRateDelta: -10,
      participationRateDelta: 10
    };

    const result = applyScenarioAdjustments(baseModel, adjustment);

    expect(result.grossMOIC).toBeCloseTo(3.75, 2);
    expect(result.lossRate).toBe(20);
    expect(result.avgExitYears).toBeCloseTo(6.5, 2);
    expect(result.participationRate).toBe(85);
  });
});

// ============================================================================
// IRR CALCULATION
// ============================================================================

describe('calculateIRR', () => {
  it('should calculate IRR correctly for typical MOIC and timeframe', () => {
    const irr = calculateIRR(2.5, 7);
    expect(irr).toBeCloseTo(14.0, 0); // Approximately 14%
  });

  it('should calculate higher IRR for higher MOIC', () => {
    const irr1 = calculateIRR(2.0, 5);
    const irr2 = calculateIRR(3.0, 5);

    expect(irr2).toBeGreaterThan(irr1);
  });

  it('should calculate higher IRR for shorter timeframe', () => {
    const irr1 = calculateIRR(2.5, 10);
    const irr2 = calculateIRR(2.5, 5);

    expect(irr2).toBeGreaterThan(irr1);
  });

  it('should return 0 for MOIC = 1.0 (breakeven)', () => {
    const irr = calculateIRR(1.0, 5);
    expect(irr).toBeCloseTo(0, 1);
  });

  it('should return negative IRR for MOIC < 1.0 (loss)', () => {
    const irr = calculateIRR(0.5, 5);
    expect(irr).toBeLessThan(0);
  });

  it('should handle edge case of zero years', () => {
    const irr = calculateIRR(2.5, 0);
    expect(irr).toBe(0);
  });

  it('should clamp IRR to reasonable range', () => {
    const irr1 = calculateIRR(0, 5); // Total loss
    expect(irr1).toBe(-100);

    const irr2 = calculateIRR(100, 1); // Extreme gain
    expect(irr2).toBeLessThanOrEqual(300);
  });
});

// ============================================================================
// SCENARIO COMPARISON
// ============================================================================

describe('compareScenarios', () => {
  it('should compare multiple scenarios', () => {
    const scenarios = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, scenarios);
    const comparison = compareScenarios(results);

    expect(comparison.results).toHaveProperty('Base Case');
    expect(comparison.results).toHaveProperty('Optimistic');
    expect(comparison.results).toHaveProperty('Pessimistic');
  });

  it('should calculate summary statistics', () => {
    const scenarios = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, scenarios);
    const comparison = compareScenarios(results);

    expect(comparison.summary.grossMOIC.min).toBeDefined();
    expect(comparison.summary.grossMOIC.max).toBeDefined();
    expect(comparison.summary.grossMOIC.avg).toBeDefined();

    // Min should be less than max
    expect(comparison.summary.grossMOIC.min).toBeLessThan(
      comparison.summary.grossMOIC.max
    );
  });

  it('should identify pessimistic scenario as min', () => {
    const scenarios = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, scenarios);
    const comparison = compareScenarios(results);

    const pessimisticMOIC = comparison.results['Pessimistic'].grossMOIC;
    expect(pessimisticMOIC).toBeCloseTo(comparison.summary.grossMOIC.min, 2);
  });

  it('should identify optimistic scenario as max', () => {
    const scenarios = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, scenarios);
    const comparison = compareScenarios(results);

    const optimisticMOIC = comparison.results['Optimistic'].grossMOIC;
    expect(optimisticMOIC).toBeCloseTo(comparison.summary.grossMOIC.max, 2);
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

describe('isBaseCase', () => {
  it('should identify base case scenario', () => {
    expect(isBaseCase(baseAdjustment)).toBe(true);
  });

  it('should identify non-base case scenario', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      moicMultiplier: 1.5
    };

    expect(isBaseCase(adjustment)).toBe(false);
  });
});

describe('validateScenarioAdjustments', () => {
  it('should return no warnings for reasonable adjustments', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      moicMultiplier: 1.5,
      exitTimingDelta: -6,
      lossRateDelta: -10
    };

    const warnings = validateScenarioAdjustments(adjustment);
    expect(warnings).toHaveLength(0);
  });

  it('should warn about extreme MOIC multiplier', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      moicMultiplier: 0.2 // Very pessimistic
    };

    const warnings = validateScenarioAdjustments(adjustment);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('extremely pessimistic');
  });

  it('should warn about extreme timing shift', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      exitTimingDelta: 48 // 4 years later
    };

    const warnings = validateScenarioAdjustments(adjustment);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('very large');
  });

  it('should warn about extreme loss rate delta', () => {
    const adjustment: ScenarioAdjustment = {
      ...baseAdjustment,
      lossRateDelta: 40 // +40pp
    };

    const warnings = validateScenarioAdjustments(adjustment);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('very large');
  });
});

describe('generateScenarioResults', () => {
  it('should generate results for all adjustments', () => {
    const adjustments = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, adjustments);

    expect(results).toHaveLength(adjustments.length);
  });

  it('should include scenario name and description', () => {
    const adjustments = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, adjustments);

    results.forEach(result => {
      expect(result.name).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.adjustment).toBeDefined();
    });
  });

  it('should preserve adjustment configuration', () => {
    const adjustments = generateDefaultScenarios();
    const results = generateScenarioResults(baseModel, adjustments);

    expect(results[0].adjustment).toEqual(adjustments[0]);
  });
});
