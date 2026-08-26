import React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExitRecyclingStep } from '@/components/modeling-wizard/steps/ExitRecyclingStep';
import type {
  ExitRecyclingInput,
  FundFinancialsOutput,
} from '@/schemas/modeling-wizard.schemas';

const fundFinancials: FundFinancialsOutput = {
  fundSize: 100,
  orgExpenses: 0,
  additionalExpenses: [],
  investmentPeriod: 5,
  gpCommitment: 1,
  cashlessSplit: 50,
  managementFee: { rate: 2, stepDown: { enabled: false } },
};

const enabledExitRecycling: ExitRecyclingInput = {
  enabled: true,
  recyclingCap: 15,
  recyclingPeriod: 5,
  exitRecyclingRate: 75,
  mgmtFeeRecyclingRate: 0,
};

function getInput(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('ExitRecyclingStep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('auto-saves valid recycling inputs after the debounce window', async () => {
    const onSave = vi.fn<(data: ExitRecyclingInput) => void>();
    render(
      <ExitRecyclingStep
        initialData={enabledExitRecycling}
        onSave={onSave}
        fundFinancials={fundFinancials}
      />
    );

    fireEvent.change(getInput(/^Recycling Period \(years\)/i), {
      target: { value: '7' },
    });

    await advanceTimers(499);
    expect(onSave).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(onSave).toHaveBeenCalledTimes(1);

    const saved = onSave.mock.calls.at(-1)?.[0];
    expect(saved?.enabled).toBe(true);
    expect(saved?.recyclingPeriod).toBe(7);
    expect(saved?.recyclingCap).toBe(15);
    expect(saved?.exitRecyclingRate).toBe(75);
  });

  it('flushes the last valid recycling data on unmount before the debounce fires', async () => {
    const onSave = vi.fn<(data: ExitRecyclingInput) => void>();
    const { unmount } = render(
      <ExitRecyclingStep
        initialData={enabledExitRecycling}
        onSave={onSave}
        fundFinancials={fundFinancials}
      />
    );

    fireEvent.change(getInput(/^Recycling Period \(years\)/i), {
      target: { value: '6' },
    });

    expect(onSave).not.toHaveBeenCalled();

    unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls.at(-1)?.[0].recyclingPeriod).toBe(6);

    await advanceTimers(500);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('preserves all recycling fields while recycling is disabled', async () => {
    const onSave = vi.fn<(data: ExitRecyclingInput) => void>();
    render(
      <ExitRecyclingStep
        initialData={{
          enabled: true,
          recyclingCap: 20,
          recyclingPeriod: 6,
          exitRecyclingRate: 80,
          mgmtFeeRecyclingRate: 35,
        }}
        onSave={onSave}
        fundFinancials={fundFinancials}
      />
    );

    expect(Number(getInput(/^Recycling Cap/i).value)).toBe(20);
    expect(getInput(/^Recycling Period \(years\)/i)).toHaveValue(6);
    expect(Number(getInput(/^Exit Recycling Rate/i).value)).toBe(80);
    expect(getInput(/^Management Fee Recycling Rate/i)).toHaveValue(35);

    const recyclingSwitch = screen.getByRole('switch', { name: /enable exit recycling/i });
    fireEvent.click(recyclingSwitch);

    expect(screen.queryByLabelText(/^Recycling Cap/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Recycling Period \(years\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Exit Recycling Rate/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Management Fee Recycling Rate/i)).not.toBeInTheDocument();

    fireEvent.click(recyclingSwitch);

    expect(Number(getInput(/^Recycling Cap/i).value)).toBe(20);
    expect(getInput(/^Recycling Period \(years\)/i)).toHaveValue(6);
    expect(Number(getInput(/^Exit Recycling Rate/i).value)).toBe(80);
    expect(getInput(/^Management Fee Recycling Rate/i)).toHaveValue(35);
  });
});
