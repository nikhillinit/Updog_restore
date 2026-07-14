import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ForecastBasisControl,
  ScenarioOverlayControl,
} from '@/components/fund-results/FundForecastModeSelector';
import type { ScenarioOverlay } from '@/components/fund-results/financial-evidence';

const SAVED_OVERLAY: ScenarioOverlay = {
  kind: 'saved',
  scenarioSetId: '00000000-0000-0000-0000-000000000111',
  variantId: null,
  name: 'Fee sensitivity',
  baseBasis: 'construction',
  baseInputHash: 'd'.repeat(64),
  baseAsOfDate: '2026-07-01',
};

describe('ForecastBasisControl', () => {
  it('renders an ink-only segmented control labeled "Forecast basis"', () => {
    render(<ForecastBasisControl value="construction" onChange={() => {}} />);

    const group = screen.getByRole('radiogroup', { name: 'Forecast basis' });
    const construction = screen.getByRole('radio', { name: 'Construction' });
    const current = screen.getByRole('radio', { name: 'Current' });
    expect(construction).toHaveAttribute('aria-checked', 'true');
    expect(current).toHaveAttribute('aria-checked', 'false');
    // ink-only: no status hue anywhere in the control
    expect(group.innerHTML).not.toMatch(/success|positive|warning|info|blue|green|red/);
  });

  it('fires onChange for the unselected basis only', () => {
    const onChange = vi.fn();
    render(<ForecastBasisControl value="construction" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Current' }));
    expect(onChange).toHaveBeenCalledWith('current');
    fireEvent.click(screen.getByRole('radio', { name: 'Construction' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disables a basis WITH its visible reason', () => {
    render(
      <ForecastBasisControl
        value="construction"
        onChange={() => {}}
        disabledBases={{ current: 'Current basis requires published actuals.' }}
      />
    );

    expect(screen.getByRole('radio', { name: 'Current' })).toBeDisabled();
    expect(screen.getByText(/Current basis requires published actuals\./)).toBeInTheDocument();
  });

  it('renders the locked variant with its reason and disabled segments', () => {
    render(<ForecastBasisControl value="current" onChange={() => {}} locked />);

    expect(screen.getByText('Locked by selected scenario')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Construction' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Current' })).toBeDisabled();
  });

  it('renders the static indicator variant as "Basis: <x>"', () => {
    render(<ForecastBasisControl value="current" variant="indicator" />);

    expect(screen.getByText('Basis: Current')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

describe('ScenarioOverlayControl', () => {
  it('renders the scenario with its basis label and as-of date', () => {
    render(<ScenarioOverlayControl overlay={SAVED_OVERLAY} onClear={() => {}} />);

    expect(
      screen.getByText(/Scenario: Fee sensitivity — based on Construction · as of/)
    ).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toHaveClass('tabular-nums');
  });

  it('fires the clear action', () => {
    const onClear = vi.fn();
    render(<ScenarioOverlayControl overlay={SAVED_OVERLAY} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear scenario Fee sensitivity' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no scenario overlay is applied', () => {
    const { container } = render(
      <ScenarioOverlayControl overlay={{ kind: 'none' }} onClear={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
