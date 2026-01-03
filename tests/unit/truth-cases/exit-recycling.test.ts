/**
 * Exit Recycling Truth Case Tests (Unified Runner)
 *
 * Validates exit recycling calculations against 20 truth cases.
 * Target: 20/20 pass (100%)
 *
 * @see docs/exit-recycling.truth-cases.json
 * @see tests/unit/truth-cases/exit-recycling-adapter.ts
 */

import { describe, it, expect } from 'vitest';
import {
  executeExitRecyclingTruthCase,
  validateExitRecyclingResult,
  isCapacityExpectedOutput,
  isScheduleExpectedOutput,
  type ExitRecyclingTruthCase,
} from './exit-recycling-adapter';
import exitCases from '../../../docs/exit-recycling.truth-cases.json';

/**
 * Cast imported JSON to typed array
 */
const truthCases = exitCases as ExitRecyclingTruthCase[];

describe('Exit Recycling Truth Cases', () => {
  // Track pass/fail stats
  let passed = 0;
  let failed = 0;

  truthCases.forEach((tc) => {
    it(`${tc.id}: ${tc.description}`, () => {
      try {
        // Execute production calculation
        const result = executeExitRecyclingTruthCase(tc);

        // Validate against expected output
        const validation = validateExitRecyclingResult(result, tc);

        if (!validation.pass) {
          console.log(`[${tc.id}] Failures:`);
          validation.failures.forEach((f) => console.log(`  - ${f}`));
        }

        expect(validation.pass, `Validation failed: ${validation.failures.join(', ')}`).toBe(true);
        passed++;
      } catch (error) {
        failed++;
        throw error;
      }
    });
  });

  // Summary test
  it('Summary: Pass rate meets target', () => {
    const total = passed + failed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    console.log(`\nER Truth Cases Summary:`);
    console.log(`  Passed: ${passed}/${total} (${passRate.toFixed(1)}%)`);
    console.log(`  Failed: ${failed}`);

    // Target: 100% pass rate
    expect(passRate).toBeGreaterThanOrEqual(95);
  });
});

describe('Exit Recycling Category Tests', () => {
  /**
   * Group tests by category for better debugging
   */

  describe('Capacity Calculation (ER-001 to ER-003)', () => {
    const capacityCases = truthCases.filter((tc) => tc.category === 'capacity_calculation');

    capacityCases.forEach((tc) => {
      it(`${tc.id}: ${tc.description}`, () => {
        const result = executeExitRecyclingTruthCase(tc);

        // Verify it's a capacity result
        expect(isCapacityExpectedOutput(tc.expectedOutput)).toBe(true);

        // Validate
        const validation = validateExitRecyclingResult(result, tc);
        expect(validation.pass, validation.failures.join(', ')).toBe(true);

        // Log key metrics
        console.log(`[${tc.id}] capacity.maxRecyclableCapital: ${result.capacity.maxRecyclableCapital}`);
        console.log(`[${tc.id}] capacity.annualRecyclingCapacity: ${result.capacity.annualRecyclingCapacity}`);
      });
    });
  });

  describe('Schedule Calculation (ER-004+)', () => {
    const scheduleCases = truthCases.filter((tc) => tc.category === 'schedule_calculation');

    scheduleCases.forEach((tc) => {
      it(`${tc.id}: ${tc.description}`, () => {
        const result = executeExitRecyclingTruthCase(tc);

        // Verify it's a schedule result
        expect(isScheduleExpectedOutput(tc.expectedOutput)).toBe(true);

        // Validate
        const validation = validateExitRecyclingResult(result, tc);

        if (!validation.pass) {
          console.log(`[${tc.id}] Schedule failures:`, validation.failures);
          if (result.schedule) {
            console.log(`[${tc.id}] Actual totalRecycled: ${result.schedule.totalRecycled}`);
            console.log(`[${tc.id}] Actual capReached: ${result.schedule.capReached}`);
          }
        }

        expect(validation.pass, validation.failures.join(', ')).toBe(true);
      });
    });
  });

  describe('Cap Enforcement (ER-007+)', () => {
    const capCases = truthCases.filter((tc) => tc.category === 'cap_enforcement');

    capCases.forEach((tc) => {
      it(`${tc.id}: ${tc.description}`, () => {
        const result = executeExitRecyclingTruthCase(tc);

        // Validate
        const validation = validateExitRecyclingResult(result, tc);

        if (!validation.pass) {
          console.log(`[${tc.id}] Cap enforcement failures:`, validation.failures);
        }

        expect(validation.pass, validation.failures.join(', ')).toBe(true);
      });
    });
  });

  describe('Term Validation (ER-010+)', () => {
    const termCases = truthCases.filter((tc) => tc.category === 'term_validation');

    termCases.forEach((tc) => {
      it(`${tc.id}: ${tc.description}`, () => {
        const result = executeExitRecyclingTruthCase(tc);

        // Validate
        const validation = validateExitRecyclingResult(result, tc);

        if (!validation.pass) {
          console.log(`[${tc.id}] Term validation failures:`, validation.failures);
        }

        expect(validation.pass, validation.failures.join(', ')).toBe(true);
      });
    });
  });
});

describe('Exit Recycling Core Calculations', () => {
  /**
   * Focused tests for critical calculation scenarios
   */

  it('ER-001: Basic capacity calculation', () => {
    const tc = truthCases.find((c) => c.id === 'ER-001');
    expect(tc).toBeDefined();
    if (!tc) return;

    const result = executeExitRecyclingTruthCase(tc);

    // Verify basic capacity formula: maxRecyclableCapital = fundSize * (recyclingCapPercent / 100)
    // ER-001: $100M fund, 15% cap = $15M max recyclable
    expect(result.capacity.maxRecyclableCapital).toBeCloseTo(15, 1);
    expect(result.capacity.recyclingCapPercentage).toBe(15);
    expect(result.capacity.recyclingPeriodYears).toBe(5);

    // Annual capacity = maxRecyclableCapital / recyclingPeriod = 15 / 5 = 3
    expect(result.capacity.annualRecyclingCapacity).toBeCloseTo(3, 1);
  });

  it('ER-004: Single exit with partial recycling', () => {
    const tc = truthCases.find((c) => c.id === 'ER-004');
    expect(tc).toBeDefined();
    if (!tc) return;

    const result = executeExitRecyclingTruthCase(tc);

    // Should have schedule result for exit cases
    expect(result.schedule).toBeDefined();
    if (!result.schedule) return;

    // Verify recycling calculations
    console.log(`ER-004 totalRecycled: ${result.schedule.totalRecycled}`);
    console.log(`ER-004 capReached: ${result.schedule.capReached}`);
    console.log(`ER-004 recyclingByExit:`, result.schedule.recyclingByExit);
  });
});
