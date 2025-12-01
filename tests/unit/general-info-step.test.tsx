/**
 * GeneralInfoStep Tests - TDD Approach
 *
 * Tests preservation pattern for evergreen toggle with:
 * - Basic toggle preservation (fundLife, investmentPeriod)
 * - Rapid toggle race conditions (CRITICAL gap from pr-test-analyzer)
 * - Validation during restoration (CRITICAL gap from pr-test-analyzer)
 * - Error handling (CRITICAL issues from silent-failure-hunter)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import { GeneralInfoStep } from '@/components/modeling-wizard/steps/GeneralInfoStep';

describe('GeneralInfoStep - Preservation Pattern', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /**
   * RED TEST 1: Basic preservation (should PASS with current implementation)
   * This verifies the preservation pattern works for simple toggle cycles.
   */
  it('should preserve fundLife and investmentPeriod when toggling evergreen', async () => {
    const mockSave = vi.fn();
    render(<GeneralInfoStep onSave={mockSave} />);

    // Start with evergreen OFF (default), enter values
    const fundLifeInput = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodInput = screen.getByLabelText(/investment period/i) as HTMLInputElement;

    await userEvent.clear(fundLifeInput);
    await userEvent.type(fundLifeInput, '10');

    await userEvent.clear(investmentPeriodInput);
    await userEvent.type(investmentPeriodInput, '3');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Toggle evergreen ON (should preserve values)
    const evergreenSwitch = screen.getByRole('switch', { name: /evergreen/i });
    await userEvent.click(evergreenSwitch);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Verify fields are hidden (conditional rendering)
    expect(screen.queryByLabelText(/fund life/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/investment period/i)).not.toBeInTheDocument();

    // Toggle evergreen OFF (should restore preserved values)
    await userEvent.click(evergreenSwitch);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Assert: Values preserved with NUMERIC assertions (NOT strings)
    const fundLifeRestored = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodRestored = screen.getByLabelText(
      /investment period/i
    ) as HTMLInputElement;

    expect(fundLifeRestored).toHaveValue(10); // NOT '10'
    expect(investmentPeriodRestored).toHaveValue(3); // NOT '3'
  });

  /**
   * RED TEST 2: Rapid toggle race conditions (CRITICAL - pr-test-analyzer rating 9/10)
   * This WILL FAIL because current implementation doesn't handle rapid toggles safely.
   *
   * Bug scenario:
   * - User toggles OFF (preservation starts)
   * - User toggles ON immediately (before preservation completes)
   * - User toggles OFF again (race condition)
   * - Result: Ref could have stale/corrupted values
   */
  it('should handle rapid toggle cycles without data corruption', async () => {
    const mockSave = vi.fn();
    render(<GeneralInfoStep onSave={mockSave} />);

    // Enter initial values
    const fundLifeInput = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodInput = screen.getByLabelText(/investment period/i) as HTMLInputElement;

    await userEvent.clear(fundLifeInput);
    await userEvent.type(fundLifeInput, '12');

    await userEvent.clear(investmentPeriodInput);
    await userEvent.type(investmentPeriodInput, '4');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const evergreenSwitch = screen.getByRole('switch', { name: /evergreen/i });

    // RAPID TOGGLE SEQUENCE (within 100ms each)
    // Toggle 1: OFF → ON
    await userEvent.click(evergreenSwitch);
    await act(async () => {
      vi.advanceTimersByTime(50); // Only 50ms, not enough for full processing
    });

    // Toggle 2: ON → OFF (immediate, creates race condition)
    await userEvent.click(evergreenSwitch);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    // Toggle 3: OFF → ON (rapid re-enable)
    await userEvent.click(evergreenSwitch);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    // Final toggle: ON → OFF (should restore correct values despite rapid cycling)
    await userEvent.click(evergreenSwitch);
    await act(async () => {
      vi.advanceTimersByTime(300); // Allow full processing
    });

    // Assert: Values should STILL be preserved correctly (12 and 4, not corrupted)
    const fundLifeRestored = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodRestored = screen.getByLabelText(
      /investment period/i
    ) as HTMLInputElement;

    // CRITICAL: This will FAIL if rapid toggles corrupt the preservation ref
    expect(fundLifeRestored).toHaveValue(12);
    expect(investmentPeriodRestored).toHaveValue(4);
  });

  /**
   * RED TEST 3: Validation during restoration (CRITICAL - pr-test-analyzer rating 8/10)
   * This WILL FAIL because current implementation doesn't validate restored values.
   *
   * Bug scenario from silent-failure-hunter Issue #2:
   * - Preserve values (fundLife: 10, investmentPeriod: 3)
   * - Manually corrupt ref (simulate type mismatch or invalid value)
   * - Toggle OFF → ON
   * - Result: Invalid value restored without validation
   */
  it('should validate restored values and fallback to defaults on corruption', async () => {
    const mockSave = vi.fn();
    const { rerender } = render(<GeneralInfoStep onSave={mockSave} />);

    // Enter valid values
    const fundLifeInput = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodInput = screen.getByLabelText(/investment period/i) as HTMLInputElement;

    await userEvent.clear(fundLifeInput);
    await userEvent.type(fundLifeInput, '15');

    await userEvent.clear(investmentPeriodInput);
    await userEvent.type(investmentPeriodInput, '5');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Toggle evergreen ON (preserve values)
    const evergreenSwitch = screen.getByRole('switch', { name: /evergreen/i });
    await userEvent.click(evergreenSwitch);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Simulate ref corruption by passing invalid initial data
    // (In real scenario, this could be from type mismatch or browser storage corruption)
    rerender(
      <GeneralInfoStep
        onSave={mockSave}
        initialData={{
          isEvergreen: true,
          fundLife: 'invalid' as unknown as number, // Type mismatch corruption
          investmentPeriod: undefined as unknown as number,
        }}
      />
    );

    // Toggle evergreen OFF (should restore, but values are corrupted)
    const evergreenSwitchAfterRerender = screen.getByRole('switch', { name: /evergreen/i });
    await userEvent.click(evergreenSwitchAfterRerender);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Assert: Should NOT crash, should fallback to reasonable defaults
    // This WILL FAIL if no validation exists (setValue will fail silently or crash)
    const fundLifeRestored = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodRestored = screen.getByLabelText(
      /investment period/i
    ) as HTMLInputElement;

    // Expect defaults (10 years fund life, 3 years investment period) OR preserved values
    // The key is it should NOT be undefined or crash
    expect(fundLifeRestored.value).not.toBe('');
    expect(investmentPeriodRestored.value).not.toBe('');

    // Should be valid numbers
    expect(Number(fundLifeRestored.value)).not.toBeNaN();
    expect(Number(investmentPeriodRestored.value)).not.toBeNaN();
  });

  /**
   * RED TEST 4: onSave callback error handling (CRITICAL - silent-failure-hunter Issue #1)
   * This WILL FAIL because current implementation doesn't handle onSave errors.
   *
   * Bug scenario:
   * - Enter data
   * - Parent's onSave callback throws error
   * - Result: Error swallowed, user unaware save failed
   */
  it('should not crash when onSave callback throws error', async () => {
    // Mock onSave that throws on first call, succeeds on second
    let callCount = 0;
    const mockSave = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error: Failed to save');
      }
    });

    // Spy on console.error to verify error is logged
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<GeneralInfoStep onSave={mockSave} />);

    // Enter data (will trigger auto-save via watch callback)
    const fundNameInput = screen.getByLabelText(/fund name/i);
    await userEvent.type(fundNameInput, 'Test Fund');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Assert: Component should NOT crash despite onSave throwing
    // This WILL FAIL if no try-catch exists around onSave call
    expect(screen.getByLabelText(/fund name/i)).toBeInTheDocument();

    // Verify error was logged (silent-failure-hunter requirement)
    // This WILL FAIL if no error logging exists
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GeneralInfoStep]'),
      expect.anything()
    );

    consoleErrorSpy.mockRestore();
  });

  /**
   * RED TEST 5: Numeric assertion coverage
   * Verifies all numeric fields use correct assertions (not string comparisons)
   */
  it('should use numeric values for all number inputs', async () => {
    const mockSave = vi.fn();
    render(<GeneralInfoStep onSave={mockSave} />);

    const fundLifeInput = screen.getByLabelText(/fund life/i) as HTMLInputElement;
    const investmentPeriodInput = screen.getByLabelText(/investment period/i) as HTMLInputElement;
    const fundSizeInput = screen.getByLabelText(/target fund size/i) as HTMLInputElement;
    const vintageYearInput = screen.getByLabelText(/vintage year/i) as HTMLInputElement;

    await userEvent.clear(fundLifeInput);
    await userEvent.type(fundLifeInput, '8');

    await userEvent.clear(investmentPeriodInput);
    await userEvent.type(investmentPeriodInput, '2');

    await userEvent.clear(fundSizeInput);
    await userEvent.type(fundSizeInput, '250.5');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // All numeric assertions (NOT string)
    expect(fundLifeInput).toHaveValue(8);
    expect(investmentPeriodInput).toHaveValue(2);
    expect(fundSizeInput).toHaveValue(250.5);

    // Vintage year is auto-derived, should also be numeric
    if (vintageYearInput.value) {
      expect(Number(vintageYearInput.value)).not.toBeNaN();
    }
  });
});
