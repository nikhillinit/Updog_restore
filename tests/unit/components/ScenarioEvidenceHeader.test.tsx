import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioEvidenceHeader } from '../../../client/src/components/results/ScenarioEvidenceHeader';
import type { ScenarioEvidenceSourceV1 } from '../../../client/src/components/results/scenario-evidence';

describe('ScenarioEvidenceHeader', () => {
  it('renders current scenario provenance with config versions and source', () => {
    render(<ScenarioEvidenceHeader evidence={evidence()} testId="scenario-evidence" />);

    const header = screen.getByTestId('scenario-evidence');
    expect(within(header).getByText('CURRENT')).toBeInTheDocument();
    expect(within(header).getByText('SCENARIO 00000000')).toBeInTheDocument();
    expect(within(header).getByText('MODE sync_fee_profile')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE CONFIG v4')).toBeInTheDocument();
    expect(within(header).getByText('PUBLISHED CONFIG v4')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
  });

  it('renders explicit accessible explanations for stale, failed, and unavailable states', () => {
    const states: ScenarioEvidenceSourceV1['state'][] = [
      'STALE_PUBLISH',
      'STALE_CONFIG',
      'FAILED',
      'UNAVAILABLE',
    ];

    for (const state of states) {
      const { unmount } = render(<ScenarioEvidenceHeader evidence={evidence({ state })} />);
      const badge = screen.getByText(state);

      expect(badge).toHaveAttribute('title');
      expect(badge).toHaveAttribute('aria-label');
      expect(badge.getAttribute('aria-label')).not.toBe('');

      unmount();
    }
  });

  it('renders unavailable segments for null or invalid evidence fields', () => {
    render(
      <ScenarioEvidenceHeader
        evidence={evidence({
          scenarioSetId: null,
          sourceConfigVersion: null,
          currentPublishedConfigVersion: null,
          calculatedAt: 'not-a-date',
          state: 'UNAVAILABLE',
        })}
        testId="scenario-evidence"
      />
    );

    const header = screen.getByTestId('scenario-evidence');
    expect(within(header).getByText('SCENARIO UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE CONFIG UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('PUBLISHED CONFIG UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('CALCULATED UNAVAILABLE')).toBeInTheDocument();
  });
});

function evidence(overrides: Partial<ScenarioEvidenceSourceV1> = {}): ScenarioEvidenceSourceV1 {
  return {
    scenarioSetId: '00000000-0000-0000-0000-000000000111',
    scenarioSetName: 'Fee sensitivity',
    calculationMode: 'sync_fee_profile',
    sourceConfigVersion: 4,
    currentPublishedConfigVersion: 4,
    calculatedAt: '2026-05-26T12:00:00.000Z',
    source: 'fund_snapshots',
    state: 'CURRENT',
    reason: null,
    ...overrides,
  };
}
