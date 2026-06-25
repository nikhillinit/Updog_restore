import React from 'react';
import { act } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeesExpensesStep } from '@/components/modeling-wizard/steps/FeesExpensesStep';
import type { FeesExpensesInput } from '@/schemas/modeling-wizard.schemas';

const baseFeesExpenses: FeesExpensesInput = {
  managementFee: {
    rate: 2,
    basis: 'committed',
    stepDown: { enabled: false },
  },
  adminExpenses: {
    annualAmount: 0.5,
    growthRate: 3,
  },
};

function getInput(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function waitForRealTimers(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function setupUser() {
  return userEvent.setup();
}

describe('FeesExpensesStep', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-saves valid fee and admin inputs after the debounce window', async () => {
    const user = setupUser();
    const onSave = vi.fn<(data: FeesExpensesInput) => void>();
    render(<FeesExpensesStep initialData={baseFeesExpenses} onSave={onSave} />);

    onSave.mockClear();

    await user.clear(getInput(/^Rate \(%\)/i));
    await user.type(getInput(/^Rate \(%\)/i), '2.5');
    await user.clear(getInput(/^Annual Amount/i));
    await user.type(getInput(/^Annual Amount/i), '0.75');

    expect(getInput(/^Rate \(%\)/i)).toHaveValue(2.5);
    expect(getInput(/^Annual Amount/i)).toHaveValue(0.75);
    expect(onSave).not.toHaveBeenCalled();

    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls.at(-1)?.[0];
    expect(saved?.managementFee.rate).toBe(2.5);
    expect(saved?.managementFee.basis).toBe('committed');
    expect(saved?.adminExpenses.annualAmount).toBe(0.75);
    expect(saved?.adminExpenses.growthRate).toBe(3);
  });

  it('does not save invalid management-fee values', async () => {
    const user = setupUser();
    const onSave = vi.fn<(data: FeesExpensesInput) => void>();
    render(<FeesExpensesStep initialData={baseFeesExpenses} onSave={onSave} />);

    onSave.mockClear();

    await user.clear(getInput(/^Rate \(%\)/i));
    await user.type(getInput(/^Rate \(%\)/i), '6');
    await waitForRealTimers(350);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('preserves step-down fields while the section is toggled off', async () => {
    const onSave = vi.fn<(data: FeesExpensesInput) => void>();
    render(
      <FeesExpensesStep
        initialData={{
          ...baseFeesExpenses,
          managementFee: {
            ...baseFeesExpenses.managementFee,
            rate: 2.5,
            stepDown: { enabled: true, afterYear: 5, newRate: 1.5 },
          },
        }}
        onSave={onSave}
      />
    );

    expect(getInput(/^After Year$/i)).toHaveValue(5);
    expect(getInput(/^New Rate/i)).toHaveValue(1.5);

    const stepDownSwitch = screen.getByRole('switch', { name: /enable fee step-down/i });
    fireEvent.click(stepDownSwitch);

    expect(screen.queryByLabelText(/^After Year$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^New Rate/i)).not.toBeInTheDocument();

    fireEvent.click(stepDownSwitch);

    expect(getInput(/^After Year$/i)).toHaveValue(5);
    expect(getInput(/^New Rate/i)).toHaveValue(1.5);

    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0];
      expect(saved?.managementFee.stepDown).toMatchObject({
        enabled: true,
        afterYear: 5,
        newRate: 1.5,
      });
    });
  });
});
