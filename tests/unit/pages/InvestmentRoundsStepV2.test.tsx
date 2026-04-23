import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import InvestmentRoundsStepV2 from '@/pages/InvestmentRoundsStepV2';
import { fundStore } from '@/stores/fundStore';
import { createWouterWrapper } from '../../utils/withWouter';

function renderInvestmentRoundsStep() {
  const { Wrapper } = createWouterWrapper('/fund-setup?step=2');
  return render(
    <Wrapper>
      <InvestmentRoundsStepV2 />
    </Wrapper>
  );
}

function getStageElements(stageName: string) {
  const stageLabel = screen
    .getAllByText(stageName)
    .find((element) => element.closest('[role="button"]') != null);
  const summaryRow = stageLabel?.closest('[role="button"]');
  if (!(summaryRow instanceof HTMLDivElement)) {
    throw new Error(`Unable to locate stage summary row for ${stageName}`);
  }

  const stageRoot = summaryRow.parentElement;
  if (!(stageRoot instanceof HTMLDivElement)) {
    throw new Error(`Unable to locate stage root for ${stageName}`);
  }

  return { summaryRow, stageRoot };
}

function getGraduationInput(summaryRow: HTMLElement) {
  return within(summaryRow).getAllByRole('spinbutton')[2];
}

describe('InvestmentRoundsStepV2', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    act(() => {
      fundStore.setState(
        {
          ...fundStore.getInitialState(),
          hydrated: true,
          draftFundId: null,
          draftServerReady: false,
        },
        true
      );
    });
  });

  it('loads pristine defaults with next-step enabled', () => {
    renderInvestmentRoundsStep();

    const { summaryRow } = getStageElements('Series C');
    const gradInput = getGraduationInput(summaryRow);

    expect(gradInput).toHaveValue(0);
    expect(screen.getByTestId('next-step')).toBeEnabled();
  });

  it('disables next-step after an invalid terminal-stage edit', () => {
    renderInvestmentRoundsStep();

    const { summaryRow } = getStageElements('Series C');
    const gradInput = getGraduationInput(summaryRow);

    fireEvent.change(gradInput, { target: { value: '90' } });

    expect(screen.getByTestId('next-step')).toBeDisabled();
  });

  it('restores valid defaults after resetting an invalid terminal stage', () => {
    renderInvestmentRoundsStep();

    const nextButton = screen.getByTestId('next-step');
    const { summaryRow, stageRoot } = getStageElements('Series C');
    const gradInput = getGraduationInput(summaryRow);

    fireEvent.change(gradInput, { target: { value: '90' } });
    expect(nextButton).toBeDisabled();

    fireEvent.click(summaryRow);
    fireEvent.click(within(stageRoot).getByRole('button', { name: /reset to defaults/i }));

    const refreshedSummaryRow = getStageElements('Series C').summaryRow;
    const refreshedGradInput = getGraduationInput(refreshedSummaryRow);

    expect(refreshedGradInput).toHaveValue(0);
    expect(nextButton).toBeEnabled();
  });
});
