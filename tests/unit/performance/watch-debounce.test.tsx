/**
 * Performance Tests: watch() Debouncing and Memoization
 *
 * **Purpose**: Verify that form value changes trigger minimal recalculations
 * **Pattern**: TDD - These tests should FAIL before fix, PASS after fix
 * **Target**: CapitalAllocationStep, ExitRecyclingStep
 *
 * Test Strategy:
 * 1. Simulate rapid user input (10 keystrokes/second)
 * 2. Count calculation hook invocations
 * 3. Measure auto-save frequency
 * 4. Verify debounce behavior
 *
 * Expected Behavior:
 * - BEFORE FIX: 50+ calculations per second → FAIL
 * - AFTER FIX: <5 calculations per value change → PASS
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CapitalAllocationStep } from '@/components/modeling-wizard/steps/CapitalAllocationStep';
import * as useCapitalAllocationCalculationsModule from '@/hooks/useCapitalAllocationCalculations';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockFundFinancials = {
  fundSize: 100,
  investmentPeriod: 5,
  fundLifespan: 10,
  totalCapitalCalled: 100,
  managementFeeRate: 0.02,
  totalManagementFees: 20,
  orgExpenses: 5,
  netInvestableCapital: 75
};

const mockSectorProfiles = [
  {
    id: '1',
    name: 'Enterprise SaaS',
    targetAllocation: 0.4,
    avgRoundSize: 2.0,
    avgOwnership: 0.15,
    estimatedDeals: 20
  },
  {
    id: '2',
    name: 'FinTech',
    targetAllocation: 0.35,
    avgRoundSize: 1.5,
    avgOwnership: 0.12,
    estimatedDeals: 18
  },
  {
    id: '3',
    name: 'HealthTech',
    targetAllocation: 0.25,
    avgRoundSize: 1.8,
    avgOwnership: 0.13,
    estimatedDeals: 14
  }
];

// ============================================================================
// CALCULATION COUNTER (SPY)
// ============================================================================

let calculationCount = 0;
let lastCalculationTime = 0;
const calculationTimestamps: number[] = [];

function resetCalculationCounter() {
  calculationCount = 0;
  lastCalculationTime = 0;
  calculationTimestamps.length = 0;
}

function trackCalculation() {
  calculationCount++;
  const now = performance.now();
  calculationTimestamps.push(now);
  lastCalculationTime = now;
}

// ============================================================================
// TESTS: Calculation Frequency
// ============================================================================

describe('CapitalAllocationStep - Calculation Performance', () => {
  let mockOnSave: ReturnType<typeof vi.fn>;
  let originalUseCalculations: typeof useCapitalAllocationCalculationsModule.useCapitalAllocationCalculations;

  beforeEach(() => {
    mockOnSave = vi.fn();
    resetCalculationCounter();

    // Spy on the calculation hook to count invocations
    originalUseCalculations = useCapitalAllocationCalculationsModule.useCapitalAllocationCalculations;

    vi.spyOn(useCapitalAllocationCalculationsModule, 'useCapitalAllocationCalculations')
      .mockImplementation((options) => {
        trackCalculation();
        return originalUseCalculations(options);
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TEST 1: Rapid Typing Should Trigger Minimal Calculations
  // ==========================================================================

  it('should trigger <5 calculations per value change during rapid typing', async () => {
    const user = userEvent.setup({ delay: null }); // Instant typing

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    // Find initial check size input
    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Reset counter after initial render
    resetCalculationCounter();

    // Simulate rapid typing: Type "2.5" (3 characters)
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '2.5');

    // Wait for any debounce to complete
    await waitFor(() => expect(calculationCount).toBeGreaterThan(0), { timeout: 1000 });

    // ASSERTION: Should trigger <5 calculations for 3 character changes
    // BEFORE FIX: Will trigger 30-50+ calculations (10+ per character)
    // AFTER FIX: Should trigger 1-3 calculations (debounced)
    expect(calculationCount).toBeLessThan(5);

    // Log for debugging
    console.log(`[PERF-TEST] Rapid typing "2.5" triggered ${calculationCount} calculations`);
    console.log(`[PERF-TEST] Timestamps: ${calculationTimestamps.map(t => t.toFixed(0)).join(', ')}`);
  });

  // ==========================================================================
  // TEST 2: Single Value Change Should Trigger Exactly 1 Calculation
  // ==========================================================================

  it('should trigger exactly 1 calculation for single field change after debounce', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Reset counter after initial render
    resetCalculationCounter();

    // Change value once
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '3');

    // Wait for debounce (250ms for calculations)
    await new Promise(resolve => setTimeout(resolve, 300));

    // ASSERTION: Single value change should trigger 1 calculation after debounce
    // BEFORE FIX: Will trigger 10+ calculations
    // AFTER FIX: Should trigger exactly 1 calculation
    expect(calculationCount).toBe(1);
  });

  // ==========================================================================
  // TEST 3: Calculations Should Be Debounced (Not Immediate)
  // ==========================================================================

  it('should debounce calculations by at least 200ms', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);
    resetCalculationCounter();

    // Type first character
    await user.type(initialCheckInput, '5');

    // Immediately check - should NOT have calculated yet (debounced)
    expect(calculationCount).toBe(0);

    // Wait 100ms - still debouncing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(calculationCount).toBe(0);

    // Wait another 200ms - debounce should complete
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(calculationCount).toBeGreaterThan(0);

    // ASSERTION: Calculation delayed by debounce
    // BEFORE FIX: Immediate calculation (count > 0 at 0ms)
    // AFTER FIX: Delayed calculation (count = 0 until 200-300ms)
  });

  // ==========================================================================
  // TEST 4: Multiple Rapid Changes Should Batch Into Single Calculation
  // ==========================================================================

  it('should batch multiple rapid changes into single calculation', async () => {
    const user = userEvent.setup({ delay: 50 }); // 50ms between keystrokes

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);
    resetCalculationCounter();

    // Type "1.25" with 50ms delays (total 200ms typing duration)
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '1.25');

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // ASSERTION: 4 keystrokes should batch into 1-2 calculations
    // BEFORE FIX: 40+ calculations (10 per keystroke)
    // AFTER FIX: 1-2 calculations (batched during debounce window)
    expect(calculationCount).toBeLessThanOrEqual(2);

    console.log(`[PERF-TEST] Typing "1.25" over 200ms triggered ${calculationCount} calculations`);
  });
});

// ============================================================================
// TESTS: Auto-Save Debouncing
// ============================================================================

describe('CapitalAllocationStep - Auto-Save Performance', () => {
  let mockOnSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSave = vi.fn();
  });

  // ==========================================================================
  // TEST 5: Auto-Save Should Be Debounced
  // ==========================================================================

  it('should debounce auto-save to max 1 call per 500ms', async () => {
    const user = userEvent.setup({ delay: 50 }); // 50ms between keystrokes

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Type rapidly over 200ms
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '2.5');

    // Wait 100ms - auto-save should NOT have fired yet
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockOnSave).not.toHaveBeenCalled();

    // Wait for debounce (500ms total)
    await new Promise(resolve => setTimeout(resolve, 450));

    // ASSERTION: Auto-save called exactly once after debounce
    // BEFORE FIX: Called 3+ times (once per keystroke)
    // AFTER FIX: Called exactly 1 time (debounced)
    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // TEST 6: Continuous Typing Should Not Spam Auto-Save
  // ==========================================================================

  it('should not spam auto-save during continuous typing', async () => {
    const user = userEvent.setup({ delay: 100 }); // 100ms between keystrokes

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Type "12.75" over 500ms (5 characters × 100ms = 500ms)
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '12.75');

    // Immediately after typing - should have 0-1 saves (depends on timing)
    await new Promise(resolve => setTimeout(resolve, 100));

    const savesImmediately = mockOnSave.mock.calls.length;

    // Wait for final debounce
    await new Promise(resolve => setTimeout(resolve, 500));

    const savesAfterDebounce = mockOnSave.mock.calls.length;

    // ASSERTION: Should not exceed 2 saves total
    // BEFORE FIX: 5+ saves (one per keystroke)
    // AFTER FIX: 1-2 saves (debounced)
    expect(savesAfterDebounce).toBeLessThanOrEqual(2);

    console.log(`[PERF-TEST] Typing "12.75" over 500ms triggered ${savesAfterDebounce} auto-saves`);
  });
});

// ============================================================================
// TESTS: Memoization Effectiveness
// ============================================================================

describe('CapitalAllocationStep - Memoization', () => {
  let mockOnSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSave = vi.fn();
    resetCalculationCounter();
  });

  // ==========================================================================
  // TEST 7: Same Value Should Not Trigger Recalculation
  // ==========================================================================

  it('should not recalculate when value has not changed', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <CapitalAllocationStep
        initialData={{ initialCheckSize: 1.0 }}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Reset counter after initial render
    await new Promise(resolve => setTimeout(resolve, 100));
    resetCalculationCounter();

    // Type same value: "1.0"
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '1.0');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 300));

    // ASSERTION: Same value should not trigger recalculation
    // BEFORE FIX: Will recalculate anyway (object identity changed)
    // AFTER FIX: Should skip recalculation (deep equality check)
    expect(calculationCount).toBe(0);
  });

  // ==========================================================================
  // TEST 8: Changing Different Field Should Not Affect Memoization
  // ==========================================================================

  it('should maintain memoization when changing unrelated fields', async () => {
    const user = userEvent.setup({ delay: null });

    const { rerender } = render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    // Wait for initial render calculations
    await new Promise(resolve => setTimeout(resolve, 100));
    resetCalculationCounter();

    // Change fundFinancials prop (unrelated to form values)
    rerender(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={{ ...mockFundFinancials, fundSize: 150 }}
        sectorProfiles={mockSectorProfiles}
      />
    );

    // Wait for potential recalculation
    await new Promise(resolve => setTimeout(resolve, 100));

    // ASSERTION: Should recalculate (fundSize changed)
    // This is expected behavior - just verifying memoization dependencies
    expect(calculationCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// BENCHMARK: Performance Comparison
// ============================================================================

describe('CapitalAllocationStep - Performance Benchmarks', () => {
  let mockOnSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSave = vi.fn();
    resetCalculationCounter();
  });

  it('should complete 10 rapid keystrokes in <2 seconds total calculation time', async () => {
    const user = userEvent.setup({ delay: 50 }); // 50ms between keystrokes

    const startTime = performance.now();

    render(
      <CapitalAllocationStep
        initialData={{}}
        onSave={mockOnSave}
        fundFinancials={mockFundFinancials}
        sectorProfiles={mockSectorProfiles}
      />
    );

    const initialCheckInput = screen.getByLabelText(/Initial Check Size/i);

    // Type 10-digit number
    await user.clear(initialCheckInput);
    await user.type(initialCheckInput, '1234567890');

    // Wait for all debounces
    await new Promise(resolve => setTimeout(resolve, 600));

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    // ASSERTION: Total time should be reasonable
    // BEFORE FIX: 500ms+ in calculations alone
    // AFTER FIX: <100ms in calculations (1-2 calcs × 5-10ms each)
    expect(totalDuration).toBeLessThan(2000);

    // ASSERTION: Calculation count should be minimal
    // BEFORE FIX: 100+ calculations
    // AFTER FIX: 1-3 calculations
    expect(calculationCount).toBeLessThan(5);

    console.log(`[BENCHMARK] 10 keystrokes completed in ${totalDuration.toFixed(0)}ms with ${calculationCount} calculations`);
  });
});
