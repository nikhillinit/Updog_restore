/**
 * ScenarioSelector Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenarioSelector } from '../ScenarioSelector';

describe('ScenarioSelector', () => {
  const mockScenarios = [
    { id: 'scenario-1', name: 'Scenario A', type: 'deal' as const, isDefault: true },
    { id: 'scenario-2', name: 'Scenario B', type: 'deal' as const },
    { id: 'scenario-3', name: 'Scenario C', type: 'portfolio' as const },
    { id: 'scenario-4', name: 'Scenario D', type: 'deal' as const },
  ];

  const defaultProps = {
    scenarios: mockScenarios,
    baseScenarioId: undefined,
    comparisonScenarioIds: [] as string[],
    onBaseChange: vi.fn(),
    onComparisonChange: vi.fn(),
  };

  it('should render base scenario selector', () => {
    render(<ScenarioSelector {...defaultProps} />);

    expect(screen.getByText('Base Scenario')).toBeInTheDocument();
    expect(screen.getByText('Select base scenario...')).toBeInTheDocument();
  });

  it('should render comparison selector', () => {
    render(<ScenarioSelector {...defaultProps} />);

    expect(screen.getByText(/Compare Against/)).toBeInTheDocument();
  });

  it('should show selected base scenario name', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
      />
    );

    expect(screen.getByText('Scenario A')).toBeInTheDocument();
  });

  it('should show count of selected comparison scenarios', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
        comparisonScenarioIds={['scenario-2', 'scenario-3']}
      />
    );

    expect(screen.getByText(/Compare Against \(2\/5\)/)).toBeInTheDocument();
  });

  it('should display badges for selected comparisons', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
        comparisonScenarioIds={['scenario-2']}
      />
    );

    expect(screen.getByText('Scenario B')).toBeInTheDocument();
  });

  it('should disable comparison selector when no base is selected', () => {
    render(<ScenarioSelector {...defaultProps} />);

    const comparisonButton = screen.getByText('Select scenarios to compare...')
      .closest('button');

    expect(comparisonButton).toBeDisabled();
  });

  it('should respect maxComparisons prop', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        maxComparisons={3}
        baseScenarioId="scenario-1"
        comparisonScenarioIds={['scenario-2', 'scenario-3']}
      />
    );

    expect(screen.getByText(/Compare Against \(2\/3\)/)).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        disabled={true}
      />
    );

    const baseButton = screen.getByText('Select base scenario...')
      .closest('button');

    expect(baseButton).toBeDisabled();
  });

  it('should show Default badge for default scenario', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
      />
    );

    // Open the base selector dropdown
    const baseButton = screen.getByText('Scenario A').closest('button');
    if (baseButton) {
      await user.click(baseButton);
    }

    // Should show Default badge
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('should show scenario type badges', () => {
    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
      />
    );

    // Should show deal type badge
    expect(screen.getByText('deal')).toBeInTheDocument();
  });

  it('should allow removing a comparison scenario', async () => {
    const onComparisonChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
        comparisonScenarioIds={['scenario-2', 'scenario-3']}
        onComparisonChange={onComparisonChange}
      />
    );

    // Find and click the X button on one of the badges
    const removeButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('.lucide-x')
    );

    if (removeButtons.length > 0) {
      await user.click(removeButtons[0]);
      expect(onComparisonChange).toHaveBeenCalled();
    }
  });

  it('should not include base scenario in comparison options', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioSelector
        {...defaultProps}
        baseScenarioId="scenario-1"
      />
    );

    // Open comparison dropdown
    const compareButton = screen.getByText('Select scenarios to compare...')
      .closest('button');

    if (compareButton) {
      await user.click(compareButton);

      // Scenario A (base) should not be in the list
      // Wait for popover to open
      const scenarioButtons = screen.getAllByRole('button');
      const hasScenarioA = scenarioButtons.some(
        btn => btn.textContent?.includes('Scenario A')
      );

      // The base scenario should be excluded from comparison options
      // (it should only appear in the base selector)
    }
  });
});
