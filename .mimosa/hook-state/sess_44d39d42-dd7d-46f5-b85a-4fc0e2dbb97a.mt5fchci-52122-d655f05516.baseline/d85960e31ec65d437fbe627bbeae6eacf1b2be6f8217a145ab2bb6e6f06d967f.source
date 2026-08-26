/**
 * Retroactive Fee Catch-Up Panel Tests
 *
 * The panel must keep the fee setting distinct from the GP carry catch-up and
 * must show the drivers of the amount that it charges.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RetroactiveFeeCatchUpPanel } from '@/components/modeling-wizard/steps/fees/RetroactiveFeeCatchUpPanel';

function renderPanel(overrides: Partial<React.ComponentProps<typeof RetroactiveFeeCatchUpPanel>>) {
  const onChange = vi.fn();
  render(
    <RetroactiveFeeCatchUpPanel
      rate={2}
      basis="committed"
      firstFeeYear={3}
      value={{ enabled: false, accrualStartMonth: 0 }}
      onChange={onChange}
      {...overrides}
    />
  );
  return { onChange };
}

describe('RetroactiveFeeCatchUpPanel', () => {
  it('names the setting as a fee setting, not the GP carry catch-up', () => {
    renderPanel({});

    expect(screen.getByRole('heading', { name: /retroactive fee catch-up/i })).toBeInTheDocument();
    expect(screen.getByText(/not the GP carry catch-up/i)).toBeInTheDocument();
  });

  it('disables the switch when fees begin in fund year 1', () => {
    renderPanel({ firstFeeYear: 1 });

    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/no fee months are missed/i)).toBeInTheDocument();
  });

  it('reports the enable request to the form', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({});

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows the charged amount and its drivers when enabled', () => {
    renderPanel({ value: { enabled: true, accrualStartMonth: 0 } });

    // 24 missed months at 2% / 12 per month = 4.00% of committed capital
    expect(screen.getByText('4.00%')).toBeInTheDocument();
    expect(
      screen.getByText(/of committed capital, charged once in fund month 24/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/missed months charged/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the GP carry catch-up in the Waterfall step does not change/i)
    ).toBeInTheDocument();
  });

  it('shows how many months the limit removed', () => {
    renderPanel({ value: { enabled: true, accrualStartMonth: 0, maxCatchUpMonths: 6 } });

    expect(screen.getByText('1.00%')).toBeInTheDocument();
    expect(screen.getByText('6 of 24')).toBeInTheDocument();
    expect(screen.getByText('6 months')).toBeInTheDocument();
  });

  it('shows the resolver message for an invalid accrual start', () => {
    renderPanel({
      value: { enabled: true, accrualStartMonth: 30 },
      errors: { accrualStartMonth: 'Fee accrual must start before the first fee month (month 24)' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/must start before the first fee month/i);
  });
});
