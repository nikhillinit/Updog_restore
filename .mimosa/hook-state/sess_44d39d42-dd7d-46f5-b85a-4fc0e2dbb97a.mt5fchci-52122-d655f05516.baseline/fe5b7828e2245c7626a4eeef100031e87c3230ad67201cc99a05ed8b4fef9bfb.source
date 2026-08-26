import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MoicRankabilityBadge } from '../../../../client/src/components/moic/MoicBasisDisclosure';
import {
  FundMoicFactsBasisV1Schema,
  type FundMoicFactsBasisV1,
} from '@shared/contracts/fund-moic-v1.contract';

const FACTS_HASH = 'a'.repeat(64);

function buildBasis(overrides: Partial<FundMoicFactsBasisV1> = {}): FundMoicFactsBasisV1 {
  return FundMoicFactsBasisV1Schema.parse({
    rankability: 'actionable',
    reasons: ['planning_fmv_active'],
    observedInitialInvestment: '1000000.5',
    observedFollowOnInvestment: '250000',
    observedTotalInvestment: '1250000.5',
    valuationAnchor: {
      kind: 'planning_fmv',
      value: '4000000',
      asOfDate: '2026-07-12',
    },
    planningFmvStatus: 'active',
    currencyStatus: 'base_currency',
    factsInputHash: FACTS_HASH,
    warnings: [],
    ...overrides,
  });
}

describe('MoicRankabilityBadge (DecisionStateBadge domain adapter)', () => {
  it('maps actionable onto the full-ink presentation with no dot and its remediation copy', async () => {
    render(<MoicRankabilityBadge basis={buildBasis()} />);

    const label = screen.getByText('Actionable');
    expect(label).toHaveClass('text-pov-charcoal');
    expect(screen.queryByTestId('moic-rankability-dot')).not.toBeInTheDocument();

    fireEvent.focus(label);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('An active Planning FMV supports this ranking.');
  });

  it('maps indicative onto the muted amber-dot presentation with its remediation copy', async () => {
    render(
      <MoicRankabilityBadge
        basis={buildBasis({
          rankability: 'indicative',
          reasons: ['planning_fmv_stale'],
          planningFmvStatus: 'stale',
        })}
      />
    );

    const label = screen.getByText('Indicative');
    expect(label).toHaveClass('text-presson-textMuted');
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-warning/50',
      'bg-warning/10'
    );

    fireEvent.focus(label);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Refresh the stale Planning FMV before relying on this ranking.'
    );
  });

  it('maps not_actionable onto the muted hollow-dot presentation', () => {
    render(
      <MoicRankabilityBadge
        basis={buildBasis({
          rankability: 'not_actionable',
          reasons: ['valuation_unavailable'],
          valuationAnchor: { kind: 'none', value: null, asOfDate: null },
          planningFmvStatus: 'none',
        })}
      />
    );

    expect(screen.getByText('Not actionable')).toHaveClass('text-presson-textMuted');
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-charcoal-400',
      'bg-transparent'
    );
  });

  it('maps a null basis onto the Facts unavailable (not_actionable) presentation', async () => {
    render(<MoicRankabilityBadge basis={null} />);

    const label = screen.getByText('Facts unavailable');
    expect(label).toHaveClass('text-presson-textMuted');
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-charcoal-400',
      'bg-transparent'
    );

    fireEvent.focus(label);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/supporting facts basis could not be loaded/);
  });

  it('keeps the badge focusable and tooltip-bearing when reasons is empty', async () => {
    // Review P3-4: reasons: [] is schema-valid; the delegated badge must keep
    // the previously unconditional focusable tooltip trigger.
    render(<MoicRankabilityBadge basis={buildBasis({ reasons: [] })} />);

    const label = screen.getByText('Actionable');
    expect(label).toHaveAttribute('tabindex', '0');

    fireEvent.focus(label);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.querySelectorAll('li')).toHaveLength(0);
  });

  it('preserves the deterministic basis.reasons order in the remediation tooltip', async () => {
    render(
      <MoicRankabilityBadge
        basis={buildBasis({
          rankability: 'not_actionable',
          reasons: ['valuation_unavailable', 'currency_blocked', 'planned_reserves_zero'],
          valuationAnchor: { kind: 'none', value: null, asOfDate: null },
          planningFmvStatus: 'none',
          currencyStatus: 'mismatch_blocked',
          factsInputHash: null,
        })}
      />
    );

    fireEvent.focus(screen.getByText('Not actionable'));
    const tooltip = await screen.findByRole('tooltip');
    const items = Array.from(tooltip.querySelectorAll('li')).map((item) => item.textContent);
    expect(items).toEqual([
      'Add a current Planning FMV before relying on this ranking.',
      'Resolve the currency mismatch before relying on this ranking.',
      'Add planned reserves before relying on this ranking.',
    ]);
  });
});
