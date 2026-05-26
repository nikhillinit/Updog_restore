import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioSetsSummary } from '../../../../client/src/components/fund-results/ScenarioSetsSummary';
import type { ScenariosSectionPayloadV1 } from '../../../../shared/contracts/fund-scenario-sets-v1.contract';

describe('ScenarioSetsSummary', () => {
  it('renders read-only scenario set cards with staleness and best TVPI', () => {
    render(<ScenarioSetsSummary payload={scenarioPayload()} />);

    expect(screen.getByTestId('scenario-sets-summary')).toBeInTheDocument();
    expect(screen.getByText('2 scenario sets')).toBeInTheDocument();
    expect(screen.getAllByText('Needs recalculation').length).toBeGreaterThanOrEqual(1);

    const feeCard = screen.getByText('Fee sensitivity').closest('article');
    if (!(feeCard instanceof HTMLElement)) {
      throw new Error('Fee sensitivity card was not rendered');
    }
    expect(within(feeCard).getByText('2 variants · Source config v4')).toBeInTheDocument();
    expect(within(feeCard).getByText('Best TVPI')).toBeInTheDocument();
    expect(within(feeCard).getByText('2.10x')).toBeInTheDocument();
    expect(within(feeCard).getByText('Higher carry')).toBeInTheDocument();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

function scenarioPayload(): ScenariosSectionPayloadV1 {
  return {
    version: 'fund-scenarios-v1',
    aggregateStaleness: 'STALE_PUBLISH',
    sets: [
      {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        calculatedAt: '2026-05-26T12:30:00.000Z',
        staleness: 'CURRENT',
        variantCount: 2,
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            name: 'Lower fee',
            overrideType: 'fee_profile',
            economicsSummary: economicsSummary({ finalTvpi: 1.7 }),
          },
          {
            variantId: '00000000-0000-0000-0000-000000000113',
            name: 'Higher carry',
            overrideType: 'fee_profile',
            economicsSummary: economicsSummary({ finalTvpi: 2.1 }),
          },
        ],
      },
      {
        scenarioSetId: '00000000-0000-0000-0000-000000000211',
        name: 'Upside fees',
        sourceConfigId: 13,
        sourceConfigVersion: 3,
        calculatedAt: '2026-05-26T12:00:00.000Z',
        staleness: 'STALE_PUBLISH',
        variantCount: 1,
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000212',
            name: 'Upside',
            overrideType: 'fee_profile',
            economicsSummary: economicsSummary({ finalTvpi: 1.9 }),
          },
        ],
      },
    ],
  };
}

function economicsSummary(overrides: Partial<{ finalTvpi: number }> = {}) {
  return {
    grossIrr: 0.2,
    lpNetIrr: 0.15,
    gpNetIrr: null,
    totalLpPaidIn: 9_800_000,
    totalGpCommitmentCalled: 200_000,
    totalManagementFees: 2_000_000,
    totalExpenses: 0,
    totalRecycled: 0,
    totalLpDistributions: 14_000_000,
    totalGpInvestmentDistributions: 300_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 2_000_000,
    finalDpi: 0.6,
    finalRvpi: 0.8,
    finalTvpi: overrides.finalTvpi ?? 1.4,
    finalClawbackDue: 0,
    maxEscrowAvailable: 0,
    netGpCarryAfterClawback: 500_000,
  };
}
