import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import InvestmentRoundsStepV2 from '@/pages/InvestmentRoundsStepV2';
import { fundStore } from '@/stores/fundStore';
import { createWouterWrapper } from '../../utils/withWouter';

function renderInvestmentRoundsStep({ strict = false } = {}) {
  const { Wrapper } = createWouterWrapper('/fund-setup?step=2');
  const tree = (
    <Wrapper>
      <InvestmentRoundsStepV2 />
    </Wrapper>
  );
  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

function getStageElements(stageName: string) {
  const stageLabel = screen
    .getAllByText(stageName)
    .find((element) => element.closest('[role="button"]') != null);
  const summaryRow = stageLabel?.closest('[role="button"]');
  if (!(summaryRow instanceof HTMLDivElement)) {
    throw new Error(`Unable to locate stage summary row for ${stageName}`);
  }

  const stageRoot = summaryRow.parentElement?.parentElement;
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

  // F_1.3.6 5b: mount never syncs this step's table into the store (StrictMode double-invokes
  // mount effects, so a skip-first-run guard would still sync); a user edit does, and the stored
  // sector profiles and allocations survive both (the old mount sync cleared them).
  it('leaves the stored strategy alone on mount and syncs stages only after a user edit', () => {
    const markerStages = [
      { id: 'marker-stage', name: 'Marker', graduate: 30, exit: 10, months: 18 },
    ];
    const sectorProfiles = [
      { id: 'marker-sector', name: 'Climate', targetPercentage: 100, description: 'Marker' },
    ];
    const allocations = [
      { id: 'marker-alloc', category: 'New Investments', percentage: 100, description: 'Marker' },
    ];
    act(() => {
      fundStore.setState({ stages: markerStages, sectorProfiles, allocations });
    });

    renderInvestmentRoundsStep({ strict: true });

    expect(fundStore.getState().stages).toEqual(markerStages);
    expect(fundStore.getState().sectorProfiles).toEqual(sectorProfiles);
    expect(fundStore.getState().allocations).toEqual(allocations);

    const { summaryRow } = getStageElements('Seed');
    fireEvent.change(getGraduationInput(summaryRow), { target: { value: '45' } });

    const stages = fundStore.getState().stages;
    expect(stages.map((stage) => stage.name)).toEqual([
      'Pre-Seed',
      'Seed',
      'Series A',
      'Series B',
      'Series C',
    ]);
    expect(stages.find((stage) => stage.name === 'Seed')?.graduate).toBe(45);
    expect(fundStore.getState().sectorProfiles).toEqual(sectorProfiles);
    expect(fundStore.getState().allocations).toEqual(allocations);
  });
});
