import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWouterWrapper } from '../../utils/withWouter';
import FundModelResultsMoicAnalysisPage from '../../../client/src/pages/fund-model-results-moic-analysis';
import type { FundMoicRankingsResponseV2 } from '../../../shared/contracts/fund-moic-v2.contract';

const useFundMoicRankingsV2 = vi.fn();

vi.mock('../../../client/src/hooks/use-moic', () => ({
  useFundMoicRankingsV2: (fundId: number | null) => useFundMoicRankingsV2(fundId),
}));

function makeV2(): FundMoicRankingsResponseV2 {
  return {
    contractVersion: '2.1.0',
    fundId: 7,
    rankings: [
      {
        rank: 1,
        investmentId: '101',
        investmentName: 'Acme Corp',
        reservesMoic: {
          value: 2.8,
          description: 'Expected return on planned reserves',
          formula: 'reserve exit value / planned reserves',
        },
      },
    ],
    provenance: {
      mode: 'legacy',
      warnings: ['shadow_residency_pending'],
    },
    latestReconciliation: {
      runId: '55',
      createdAt: '2026-06-24T00:00:00.000Z',
      currentInputMatches: false,
    },
    materiality: { status: 'stale', candidateMaterial: true, epsilon: 1e-8 },
    modePreview: {
      calculationKey: 'fund_moic_rankings_exit_probability',
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: true,
      shadowStartedAt: '2026-06-24T00:00:00.000Z',
      eligibleAt: '2026-07-01T00:00:00.000Z',
      residencyDaysRequired: 7,
      residencyStatus: 'pending',
      currentSourceMatchesAccepted: false,
      unreconciledEditsPresent: true,
      blockers: ['kill_switch_active', 'reserve_exit_multiple_source_incomplete'],
      version: 2,
    },
    moicInputSummary: {
      sourceVersion: 'moic-exit-probability-v1',
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 1,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 1,
      activationBlockingDefaultedReserveExitMultipleCount: 1,
    },
    roundEvidenceSummary: {
      activeRoundCount: 0,
      activeOverrideCount: 0,
      warningCodes: [],
    },
    generatedAt: '2026-06-24T00:00:00.000Z',
  };
}

function renderPage(path = '/fund-model-results/7/moic-analysis') {
  const { Wrapper } = createWouterWrapper(path);
  return render(
    <Wrapper>
      <FundModelResultsMoicAnalysisPage />
    </Wrapper>
  );
}

describe('FundModelResultsMoicAnalysisPage', () => {
  beforeEach(() => {
    useFundMoicRankingsV2.mockReset();
  });

  it('renders mode, stale materiality, source completeness, and blockers', () => {
    useFundMoicRankingsV2.mockReturnValue({
      data: makeV2(),
      error: null,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('stale')).toBeInTheDocument();
    expect(screen.getByText('shadow / shadow')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('reserve_exit_multiple_source_incomplete')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('candidate-output-a')).not.toBeInTheDocument();
    expect(screen.queryByText('rawDiff')).not.toBeInTheDocument();
  });
});
