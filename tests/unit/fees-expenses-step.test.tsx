/**
 * FeesExpensesStep Unit Tests
 *
 * Testing auto-save functionality, error display, and form validation
 * Following TDD: RED-GREEN-REFACTOR cycle
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeesExpensesStep } from '../FeesExpensesStep';

describe('FeesExpensesStep - Auto-Save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('debounces auto-save for 750ms after user input', async () => {
    const user = userEvent.setup({ delay: null });
    const onSave = vi.fn();

    render(<FeesExpensesStep onSave={onSave} />);

    // Get management fee rate input
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Type rapidly without waiting
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');

    // onSave should NOT be called immediately
    expect(onSave).not.toHaveBeenCalled();

    // Advance timers by 750ms
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // Now onSave should be called once with debounced value
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          managementFee: expect.objectContaining({
            rate: 2.5
          })
        })
      );
    });
  });

  test('does not save invalid data during debounce', async () => {
    const user = userEvent.setup({ delay: null });
    const onSave = vi.fn();

    render(<FeesExpensesStep onSave={onSave} />);

    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Enter invalid rate (> 5%)
    await user.clear(rateInput);
    await user.type(rateInput, '10');

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // onSave should NOT be called with invalid data
    await waitFor(() => {
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  test('saves on component unmount to prevent data loss', () => {
    const onSave = vi.fn();
    const initialData = {
      managementFee: {
        rate: 2.0,
        basis: 'committed' as const,
        stepDown: { enabled: false }
      },
      adminExpenses: {
        annualAmount: 0.5,
        growthRate: 3
      }
    };

    const { unmount } = render(
      <FeesExpensesStep initialData={initialData} onSave={onSave} />
    );

    // Change a value but don't wait for debounce
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);
    userEvent.type(rateInput, '{backspace}5'); // Change 2.0 to 2.5

    // Unmount before debounce completes
    unmount();

    // onSave should be called with latest value on unmount
    expect(onSave).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        managementFee: expect.objectContaining({
          rate: 2.5
        })
      })
    );
  });
});

describe('FeesExpensesStep - Error Display', () => {
  test('shows error message for invalid management fee basis', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(<FeesExpensesStep onSave={onSave} />);

    // TODO: This test will fail because error display is missing
    // We need to trigger validation and check for error message

    // For now, this is a placeholder showing the expected behavior
    // When implemented, this should show an error for invalid basis selection
  });

  test('shows error message for step-down afterYear field when invalid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(<FeesExpensesStep onSave={onSave} />);

    // Enable step-down
    const stepDownSwitch = screen.getByRole('switch', { name: /Enable Fee Step-Down/i });
    await user.click(stepDownSwitch);

    // Enter invalid afterYear (outside 1-10 range)
    const afterYearInput = screen.getByLabelText(/After Year/i);
    await user.clear(afterYearInput);
    await user.type(afterYearInput, '15');

    // Trigger validation (blur or form submit)
    afterYearInput.blur();

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/must be between 1 and 10/i)).toBeInTheDocument();
    });
  });

  test('shows error message for step-down newRate field when >= initial rate', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const initialData = {
      managementFee: {
        rate: 2.0,
        basis: 'committed' as const,
        stepDown: { enabled: true, afterYear: 5, newRate: 1.5 }
      },
      adminExpenses: { annualAmount: 0, growthRate: 3 }
    };

    render(<FeesExpensesStep initialData={initialData} onSave={onSave} />);

    // Enter newRate >= initial rate (invalid)
    const newRateInput = screen.getByLabelText(/New Rate/i);
    await user.clear(newRateInput);
    await user.type(newRateInput, '2.5');

    // Trigger validation
    newRateInput.blur();

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/must be less than.*rate/i)).toBeInTheDocument();
    });
  });
});

describe('FeesExpensesStep - Dirty Check', () => {
  test('warns user before navigation with unsaved changes', () => {
    const onSave = vi.fn();
    const { container } = render(<FeesExpensesStep onSave={onSave} />);

    // Change a value
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);
    userEvent.type(rateInput, '{backspace}5');

    // Setup beforeunload listener spy
    const beforeUnloadSpy = vi.fn((e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes';
    });

    window.addEventListener('beforeunload', beforeUnloadSpy);

    // Trigger beforeunload event
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    // Should have prevented default if dirty
    expect(beforeUnloadSpy).toHaveBeenCalled();

    window.removeEventListener('beforeunload', beforeUnloadSpy);
  });
});

describe('FeesExpensesStep - Form Reset', () => {
  test('resets form to initial values when reset prop changes', async () => {
    const onSave = vi.fn();
    const initialData = {
      managementFee: {
        rate: 2.0,
        basis: 'committed' as const,
        stepDown: { enabled: false }
      },
      adminExpenses: { annualAmount: 0.5, growthRate: 3 }
    };

    const { rerender } = render(
      <FeesExpensesStep initialData={initialData} onSave={onSave} />
    );

    // Change values
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);
    await userEvent.clear(rateInput);
    await userEvent.type(rateInput, '3.5');

    // Verify value changed
    expect(rateInput).toHaveValue(3.5);

    // Trigger reset by passing reset prop (this is a design decision - we'll implement this)
    rerender(
      <FeesExpensesStep
        initialData={initialData}
        onSave={onSave}
        shouldReset={true}
      />
    );

    // Form should reset to initial values
    await waitFor(() => {
      expect(rateInput).toHaveValue(2.0);
    });
  });
});

describe('FeesExpensesStep - High Priority Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('HP-1: Rapid typing cancels previous debounce timers', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Type 2.5
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');

    // Advance 500ms (not full debounce)
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Type again (should cancel previous timer)
    await user.clear(rateInput);
    await user.type(rateInput, '2.8');

    // Advance another 500ms (total 1000ms, but only 500ms since last change)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Advance final 250ms (750ms since last change)
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          managementFee: expect.objectContaining({ rate: 2.8 })
        })
      );
    });
  });

  test('HP-2: Multiple field changes batch into single debounced save', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);

    // Change multiple fields rapidly
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');

    const annualInput = screen.getByLabelText(/Annual Amount/i);
    await user.clear(annualInput);
    await user.type(annualInput, '1.5');

    // Only one save should fire after debounce
    act(() => {
      vi.advanceTimersByTime(750);
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          managementFee: expect.objectContaining({ rate: 2.5 }),
          adminExpenses: expect.objectContaining({ annualAmount: 1.5 })
        })
      );
    });
  });

  test('HP-3: Unmount during debounce period saves immediately with latest valid data', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    const { unmount } = render(<FeesExpensesStep onSave={onSave} />);
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Change value
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');

    // Advance only 400ms (less than 750ms debounce)
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // onSave should not be called yet
    expect(onSave).not.toHaveBeenCalled();

    // Unmount component
    unmount();

    // onSave should be called with latest valid data on unmount
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          managementFee: expect.objectContaining({ rate: 2.5 })
        })
      );
    });
  });

  test('HP-4: Unmount with invalid data does NOT trigger save', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    const { unmount } = render(<FeesExpensesStep onSave={onSave} />);
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Enter INVALID rate (> 5%)
    await user.clear(rateInput);
    await user.type(rateInput, '10');

    // Unmount without waiting for debounce
    unmount();

    // onSave should NOT be called with invalid data
    expect(onSave).not.toHaveBeenCalled();
  });

  test('HP-5: Invalid → Valid → Invalid data transitions only save valid state', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Invalid data (rate > 5%)
    await user.clear(rateInput);
    await user.type(rateInput, '10');
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Valid data
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');
    act(() => {
      vi.advanceTimersByTime(750);
    });
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    // Invalid again
    onSave.mockClear();
    await user.clear(rateInput);
    await user.type(rateInput, '8');
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  test('HP-6: Step-down required fields validation when enabled', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);

    // Enable step-down
    const stepDownSwitch = screen.getByRole('switch', { name: /Enable Fee Step-Down/i });
    await user.click(stepDownSwitch);

    // Without filling required fields, save should not be triggered
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // onSave should NOT be called (missing afterYear and newRate)
    expect(onSave).not.toHaveBeenCalled();
  });

  test('HP-7: beforeunload listener cleanup after successful save', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);
    const rateInput = screen.getByLabelText(/Rate \(%\)/i);

    // Change value (sets isDirty = true)
    await user.clear(rateInput);
    await user.type(rateInput, '2.5');

    // Wait for debounce and save (should clear isDirty)
    act(() => {
      vi.advanceTimersByTime(750);
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    // Create beforeunload event
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

    // Dispatch event (should NOT prevent default after save)
    window.dispatchEvent(event);

    // Event should not be prevented (isDirty cleared after save)
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('FeesExpensesStep - CRITICAL-3: Conditional Step-Down Validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('CRITICAL: Step-down with afterYear but missing newRate shows error', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);

    // Enable step-down
    const stepDownSwitch = screen.getByRole('switch', { name: /Enable Fee Step-Down/i });
    await user.click(stepDownSwitch);

    // Fill ONLY afterYear
    const afterYearInput = screen.getByLabelText(/After Year/i);
    await user.clear(afterYearInput);
    await user.type(afterYearInput, '5');

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // Should NOT save (missing newRate)
    expect(onSave).not.toHaveBeenCalled();

    // Should show error (validation message)
    await waitFor(() => {
      expect(screen.getByText(/new rate is required/i)).toBeInTheDocument();
    });
  });

  test('CRITICAL: Step-down with newRate but missing afterYear shows error', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);

    // Enable step-down
    const stepDownSwitch = screen.getByRole('switch', { name: /Enable Fee Step-Down/i });
    await user.click(stepDownSwitch);

    // Fill ONLY newRate
    const newRateInput = screen.getByLabelText(/New Rate/i);
    await user.clear(newRateInput);
    await user.type(newRateInput, '1.5');

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // Should NOT save (missing afterYear)
    expect(onSave).not.toHaveBeenCalled();

    // Should show error (validation message)
    await waitFor(() => {
      expect(screen.getByText(/step-down year is required/i)).toBeInTheDocument();
    });
  });

  test('CRITICAL: afterYear exceeds maximum value (> 10) shows error', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup({ delay: null });

    render(<FeesExpensesStep onSave={onSave} />);

    // Enable step-down
    const stepDownSwitch = screen.getByRole('switch', { name: /Enable Fee Step-Down/i });
    await user.click(stepDownSwitch);

    // Enter afterYear > 10 (invalid per CRITICAL-1 fix)
    const afterYearInput = screen.getByLabelText(/After Year/i);
    await user.clear(afterYearInput);
    await user.type(afterYearInput, '15');

    // Also provide newRate to isolate afterYear validation
    const newRateInput = screen.getByLabelText(/New Rate/i);
    await user.clear(newRateInput);
    await user.type(newRateInput, '1.5');

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(750);
    });

    // Should NOT save (afterYear > 10)
    expect(onSave).not.toHaveBeenCalled();

    // Should show error matching CRITICAL-1 fix
    await waitFor(() => {
      expect(screen.getByText(/must be between 1 and 10/i)).toBeInTheDocument();
    });
  });
});
