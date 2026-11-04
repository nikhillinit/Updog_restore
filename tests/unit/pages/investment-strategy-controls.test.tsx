import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvestmentStrategyStep from '@/pages/InvestmentStrategyStep';
import { fundStore } from '@/stores/fundStore';

vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));
vi.mock('@/lib/migrate-legacy-pipeline', () => ({
  migrateLegacyPipelineProfiles: vi.fn(),
}));

describe('InvestmentStrategyStep pipeline controls', () => {
  beforeEach(() => {
    fundStore.setState({
      pipelineProfiles: [
        {
          id: 'default',
          name: 'Default',
          stages: [
            {
              id: 'pre-seed',
              name: 'Pre-Seed',
              roundSize: undefined,
              valuation: 8.5,
              valuationType: 'post',
              esopPct: 0,
              graduationRate: 35,
              exitRate: 10,
              exitValuation: 25,
              monthsToGraduate: 18,
              monthsToExit: 24,
            },
          ],
        },
      ],
    });
  });

  it('edits and persists months to exit for each pipeline stage', () => {
    render(<InvestmentStrategyStep />);
    fireEvent.click(screen.getByTestId('edit-profile-default'));

    const input = screen.getByTestId('pipeline-months-to-exit-pre-seed');
    expect(input).toHaveAccessibleName('Months to Exit for Pre-Seed');
    fireEvent.change(input, { target: { value: '18' } });

    expect(fundStore.getState().pipelineProfiles[0]?.stages[0]?.monthsToExit).toBe(18);
  });
});
