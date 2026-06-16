import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StressScenarioProofPanel } from '@/components/dashboard/StressScenarioProofPanel';
import type { StressTestScenario } from '@/core/LiquidityEngine';

const scenarios: StressTestScenario[] = [
  {
    name: 'Distribution delay',
    description: 'LP distributions arrive later than expected',
    endingCash: 3_000_000,
    impactRating: 'medium',
    probability: 0.35,
  },
  {
    name: 'Market downturn',
    description: 'Combined adverse market stress',
    endingCash: 1_000_000,
    impactRating: 'high',
    probability: 0.15,
  },
];

describe('StressScenarioProofPanel', () => {
  it('renders nothing when no panel state is present', () => {
    render(
      <StressScenarioProofPanel
        scenarios={scenarios}
        baselineCash={5_000_000}
        state={null}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('Distribution delay')).not.toBeInTheDocument();
  });

  it('shows the matched scenario proof when the panel is open', () => {
    render(
      <StressScenarioProofPanel
        scenarios={scenarios}
        baselineCash={5_000_000}
        state={{ panel: 'scenario', object: '0', tab: 'proof' }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Distribution delay')).toBeInTheDocument();
    expect(screen.getByText('LP distributions arrive later than expected')).toBeInTheDocument();
    expect(screen.getByText('Baseline cash position')).toBeInTheDocument();
    expect(screen.getByText('$5.0M')).toBeInTheDocument();
    expect(screen.getByText('$3.0M')).toBeInTheDocument();
    expect(screen.getByText('-$2.0M')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('calls onClose when the close affordance is used', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <StressScenarioProofPanel
        scenarios={scenarios}
        baselineCash={5_000_000}
        state={{ panel: 'scenario', object: '0' }}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an unavailable message when the scenario index is out of range', () => {
    render(
      <StressScenarioProofPanel
        scenarios={scenarios}
        baselineCash={5_000_000}
        state={{ panel: 'scenario', object: '9' }}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/this scenario is unavailable/i)).toBeInTheDocument();
  });
});
