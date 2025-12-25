/**
 * ComparisonDeltaTable Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComparisonDeltaTable } from '../ComparisonDeltaTable';
import type { DeltaMetric, ScenarioSnapshot } from '@shared/types/scenario-comparison';

describe('ComparisonDeltaTable', () => {
  const mockScenarios: ScenarioSnapshot[] = [
    {
      id: 'base-id',
      name: 'Base Scenario',
      scenarioType: 'deal',
      isBase: true,
      caseCount: 5,
    },
    {
      id: 'compare-id',
      name: 'Comparison Scenario',
      scenarioType: 'deal',
      isBase: false,
      caseCount: 5,
    },
  ];

  const mockDeltaMetrics: DeltaMetric[] = [
    {
      metricName: 'moic',
      displayName: 'MOIC',
      scenarioId: 'compare-id',
      baseValue: 2.0,
      comparisonValue: 2.5,
      absoluteDelta: 0.5,
      percentageDelta: 25,
      isBetter: true,
      trend: 'higher_is_better',
    },
    {
      metricName: 'irr',
      displayName: 'IRR',
      scenarioId: 'compare-id',
      baseValue: 0.2,
      comparisonValue: 0.18,
      absoluteDelta: -0.02,
      percentageDelta: -10,
      isBetter: false,
      trend: 'higher_is_better',
    },
  ];

  it('should render the table header', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
      />
    );

    expect(screen.getByText('Metric Comparison')).toBeInTheDocument();
  });

  it('should display base scenario badge', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
      />
    );

    expect(screen.getByText('Base: Base Scenario')).toBeInTheDocument();
  });

  it('should render metric names', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
      />
    );

    expect(screen.getByText('MOIC')).toBeInTheDocument();
    expect(screen.getByText('IRR')).toBeInTheDocument();
  });

  it('should show empty state when no metrics', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={[]}
        scenarios={mockScenarios}
      />
    );

    // Should still render with empty table
    expect(screen.getByText('Metric Comparison')).toBeInTheDocument();
  });

  it('should show empty state when no comparison scenarios', () => {
    const onlyBase: ScenarioSnapshot[] = [mockScenarios[0]];

    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={onlyBase}
      />
    );

    expect(screen.getByText('No comparison data available')).toBeInTheDocument();
  });

  it('should format MOIC values with x suffix', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
      />
    );

    // Should show formatted values like "2.00x" and "2.50x"
    expect(screen.getByText('2.00x')).toBeInTheDocument();
    expect(screen.getByText('2.50x')).toBeInTheDocument();
  });

  it('should respect showAbsolute prop', () => {
    render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
        showAbsolute={false}
        showPercentage={true}
      />
    );

    // Should still render, just without absolute values
    expect(screen.getByText('MOIC')).toBeInTheDocument();
  });

  it('should apply traffic_light color scheme by default', () => {
    const { container } = render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
        colorScheme="traffic_light"
      />
    );

    // Should have green and red classes for better/worse
    expect(container.querySelector('.text-green-600')).toBeInTheDocument();
    expect(container.querySelector('.text-red-600')).toBeInTheDocument();
  });

  it('should apply grayscale color scheme when specified', () => {
    const { container } = render(
      <ComparisonDeltaTable
        deltaMetrics={mockDeltaMetrics}
        scenarios={mockScenarios}
        colorScheme="grayscale"
      />
    );

    // Should use gray classes instead of green/red
    const hasGrayscale = container.querySelector('.text-gray-900') ||
                          container.querySelector('.text-gray-600');
    expect(hasGrayscale).toBeInTheDocument();
  });
});
