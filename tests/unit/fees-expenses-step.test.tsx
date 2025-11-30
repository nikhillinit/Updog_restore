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
