import { act, useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const initialRecycling: ExitRecyclingInput = {
  enabled: true,
  recyclingCap: 15,
  recyclingPeriod: 5,
  exitRecyclingRate: 75,
  mgmtFeeRecyclingRate: 0,
};

function AutosaveObserver() {
  const [savedValues, setSavedValues] = useState<ExitRecyclingInput[]>([]);
  const lastSaved = savedValues.at(-1);
  const observeSave = useCallback((value: ExitRecyclingInput) => {
    setSavedValues((current) => [...current, value]);
  }, []);

  return (
    <>
      <ExitRecyclingStep
        initialData={initialRecycling}
        onSave={observeSave}
        fundFinancials={fundFinancials}
      />
      <output aria-label="autosave state">
        {savedValues.length} {savedValues.length === 1 ? 'save' : 'saves'}; exit recycling rate{' '}
        {lastSaved ? `${lastSaved.exitRecyclingRate}%` : 'unavailable'}; period{' '}
        {lastSaved ? `${lastSaved.recyclingPeriod} years` : 'unavailable'}
      </output>
    </>
  );
}

async function advanceTimers(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('exit recycling autosave debounce behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('batches rapid typing into one observable autosave with the final value', async () => {
    render(<AutosaveObserver />);
    const rateInput = screen.getByLabelText(/^Exit Recycling Rate/i);

    fireEvent.change(rateInput, { target: { value: '8' } });
    fireEvent.change(rateInput, { target: { value: '80' } });
    await advanceTimers(500);

    expect(screen.getByLabelText('autosave state')).toHaveTextContent(
      '1 save; exit recycling rate 80%'
    );
  });

  it('does not autosave an edited field before the debounce window ends', async () => {
    render(<AutosaveObserver />);
    const periodInput = screen.getByLabelText(/^Recycling Period \(years\)/i);

    fireEvent.change(periodInput, { target: { value: '6' } });
    expect(periodInput).toHaveValue(6);

    await advanceTimers(499);

    expect(screen.getByLabelText('autosave state')).toHaveTextContent(
      '0 saves; exit recycling rate unavailable; period unavailable'
    );
  });

  it('publishes exactly one autosave after the debounce window elapses', async () => {
    render(<AutosaveObserver />);
    const periodInput = screen.getByLabelText(/^Recycling Period \(years\)/i);

    fireEvent.change(periodInput, { target: { value: '6' } });
    await advanceTimers(500);

    expect(screen.getByLabelText('autosave state')).toHaveTextContent(
      '1 save; exit recycling rate 75%; period 6 years'
    );

    await advanceTimers(500);
    expect(screen.getByLabelText('autosave state')).toHaveTextContent('1 save');
  });
});
