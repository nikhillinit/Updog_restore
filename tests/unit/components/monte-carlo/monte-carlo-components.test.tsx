/**
 * Monte Carlo Component Tests
 *
 * Tests for CalibrationStatusCard, DataQualityCard, RecommendationsPanel, ConfigForm.
 * All components live in client/src/components/monte-carlo/.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DataQualityResult, BacktestConfig, BacktestMetric } from '@shared/types/backtesting';

// Mock useScenarios before component imports
vi.mock('@/hooks/useBacktesting', () => ({
  useScenarios: vi.fn(() => ({
    data: {
      scenarios: ['financial_crisis_2008', 'dotcom_bust_2000', 'covid_2020', 'custom'] as const,
    },
    isLoading: false,
    error: null,
  })),
}));

import { CalibrationStatusCard } from '../../../../client/src/components/monte-carlo/CalibrationStatusCard';
import { DataQualityCard } from '../../../../client/src/components/monte-carlo/DataQualityCard';
import { RecommendationsPanel } from '../../../../client/src/components/monte-carlo/RecommendationsPanel';
import { ConfigForm } from '../../../../client/src/components/monte-carlo/ConfigForm';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDataQuality(overrides: Partial<DataQualityResult> = {}): DataQualityResult {
  return {
    hasBaseline: true,
    baselineAgeInDays: 0,
    varianceHistoryCount: 12,
    snapshotAvailable: true,
    isStale: false,
    warnings: [],
    overallQuality: 'good',
    ...overrides,
  };
}

// ===========================================================================
// CalibrationStatusCard
// ===========================================================================

describe('CalibrationStatusCard', () => {
  it('renders "Well Calibrated" label text', () => {
    render(<CalibrationStatusCard calibrationStatus="well-calibrated" modelQualityScore={85} />);
    expect(screen.getByText('Well Calibrated')).toBeInTheDocument();
  });

  it('renders quality score number inside the gauge', () => {
    render(<CalibrationStatusCard calibrationStatus="well-calibrated" modelQualityScore={85} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('uses green stroke (#10b981) when score >= 70', () => {
    const { container } = render(
      <CalibrationStatusCard calibrationStatus="well-calibrated" modelQualityScore={75} />
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const scorePath = paths[1]!;
    expect(scorePath.getAttribute('stroke')).toBe('#10b981');
    expect(scorePath.getAttribute('stroke-dasharray')).toBe('75, 100');
  });

  it('uses amber stroke (#f59e0b) when score is in 40-69 range', () => {
    const { container } = render(
      <CalibrationStatusCard calibrationStatus="under-predicting" modelQualityScore={50} />
    );
    const scorePath = container.querySelectorAll('path')[1]!;
    expect(scorePath.getAttribute('stroke')).toBe('#f59e0b');
    expect(scorePath.getAttribute('stroke-dasharray')).toBe('50, 100');
  });

  it('uses red stroke (#ef4444) when score < 40', () => {
    const { container } = render(
      <CalibrationStatusCard calibrationStatus="insufficient-data" modelQualityScore={25} />
    );
    const scorePath = container.querySelectorAll('path')[1]!;
    expect(scorePath.getAttribute('stroke')).toBe('#ef4444');
    expect(scorePath.getAttribute('stroke-dasharray')).toBe('25, 100');
  });
});

// ===========================================================================
// DataQualityCard
// ===========================================================================

describe('DataQualityCard', () => {
  it('renders "Good" badge text when overallQuality is good', () => {
    render(<DataQualityCard dataQuality={makeDataQuality({ overallQuality: 'good' })} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('renders "Poor" badge text when overallQuality is poor', () => {
    render(<DataQualityCard dataQuality={makeDataQuality({ overallQuality: 'poor' })} />);
    expect(screen.getByText('Poor')).toBeInTheDocument();
  });

  it('shows "5d old" when hasBaseline=true and baselineAgeInDays=5', () => {
    render(
      <DataQualityCard dataQuality={makeDataQuality({ hasBaseline: true, baselineAgeInDays: 5 })} />
    );
    expect(screen.getByText('5d old')).toBeInTheDocument();
  });

  it('shows "Missing" when hasBaseline is false', () => {
    render(
      <DataQualityCard
        dataQuality={makeDataQuality({ hasBaseline: false, baselineAgeInDays: null })}
      />
    );
    expect(screen.getByText('Missing')).toBeInTheDocument();
  });

  it('renders warning messages', () => {
    const warnings = ['Baseline is stale', 'Low variance history'];
    render(<DataQualityCard dataQuality={makeDataQuality({ warnings })} />);
    expect(screen.getByText('Baseline is stale')).toBeInTheDocument();
    expect(screen.getByText('Low variance history')).toBeInTheDocument();
  });
});

// ===========================================================================
// RecommendationsPanel
// ===========================================================================

describe('RecommendationsPanel', () => {
  it('returns null for empty recommendations array', () => {
    const { container } = render(<RecommendationsPanel recommendations={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders correct number of list items', () => {
    const recs = ['Increase simulation runs', 'Add more scenarios', 'Update baseline'];
    render(<RecommendationsPanel recommendations={recs} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('renders recommendation text content', () => {
    const recs = ['Re-calibrate after Q2 data'];
    render(<RecommendationsPanel recommendations={recs} />);
    expect(screen.getByText('Re-calibrate after Q2 data')).toBeInTheDocument();
  });
});

// ===========================================================================
// ConfigForm
// ===========================================================================

describe('ConfigForm', () => {
  const defaultProps = {
    fundId: 1,
    onSubmit: vi.fn(),
    disabled: false,
    lastConfig: null,
  };

  it('renders default start date input with value "2020-01-01"', () => {
    render(<ConfigForm {...defaultProps} />);
    const startInput = screen.getByLabelText('Start Date') as HTMLInputElement;
    expect(startInput.value).toBe('2020-01-01');
  });

  it('renders default end date input with value "2025-01-01"', () => {
    render(<ConfigForm {...defaultProps} />);
    const endInput = screen.getByLabelText('End Date') as HTMLInputElement;
    expect(endInput.value).toBe('2025-01-01');
  });

  it('shows "Running..." when disabled=true', () => {
    render(<ConfigForm {...defaultProps} disabled={true} />);
    expect(screen.getByText('Running...')).toBeInTheDocument();
  });

  it('shows "Run Backtest" when disabled=false', () => {
    render(<ConfigForm {...defaultProps} disabled={false} />);
    expect(screen.getByText('Run Backtest')).toBeInTheDocument();
  });

  it('renders IRR, TVPI, DPI metric checkboxes', () => {
    render(<ConfigForm {...defaultProps} />);
    expect(screen.getByText('IRR')).toBeInTheDocument();
    expect(screen.getByText('TVPI')).toBeInTheDocument();
    expect(screen.getByText('DPI')).toBeInTheDocument();
  });

  it('initializes from lastConfig values', () => {
    const lastConfig: BacktestConfig = {
      fundId: 1,
      startDate: '2023-06-01',
      endDate: '2024-06-01',
      simulationRuns: 5000,
      comparisonMetrics: ['tvpi'] as BacktestMetric[],
    };
    render(<ConfigForm {...defaultProps} lastConfig={lastConfig} />);
    const startInput = screen.getByLabelText('Start Date') as HTMLInputElement;
    expect(startInput.value).toBe('2023-06-01');
  });

  it('onSubmit builds correct payload', () => {
    const onSubmit = vi.fn();
    const { container } = render(<ConfigForm {...defaultProps} onSubmit={onSubmit} />);
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const config = onSubmit.mock.calls[0]![0] as BacktestConfig;
    expect(config.fundId).toBe(1);
    expect(config.startDate).toBe('2020-01-01');
    expect(config.endDate).toBe('2025-01-01');
    expect(config.simulationRuns).toBe(10000);
    expect(config.comparisonMetrics).toEqual(expect.arrayContaining(['irr', 'tvpi', 'dpi']));
  });

  it('does NOT include "custom" in scenario labels', () => {
    render(<ConfigForm {...defaultProps} />);
    // "custom" should be filtered out; only named scenarios appear
    expect(screen.queryByText('custom')).not.toBeInTheDocument();
  });

  it('historicalScenarios only included when enabled AND selected', () => {
    const onSubmit = vi.fn();
    const { container } = render(<ConfigForm {...defaultProps} onSubmit={onSubmit} />);
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    const config = onSubmit.mock.calls[0]![0] as BacktestConfig;
    // Scenarios not enabled by default, so historicalScenarios should be absent
    expect(config.historicalScenarios).toBeUndefined();
    expect(config.includeHistoricalScenarios).toBe(false);
  });
});
