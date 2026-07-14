import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoicBasisDisclosure } from '../../../../client/src/components/moic/MoicBasisDisclosure';
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

describe('MoicBasisDisclosure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders schema-valid actionable evidence, money, warnings, and a copy-full-hash action', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const basis = buildBasis({
      warnings: [
        {
          code: 'ROUND_MODEL_OVERRIDE_APPLIED',
          severity: 'info',
          message: 'A reviewed round model override was applied.',
        },
      ],
    });

    expect(FundMoicFactsBasisV1Schema.parse(basis)).toEqual(basis);

    render(<MoicBasisDisclosure basis={basis} investmentName="Acme Corp" />);

    const actionable = screen.getByText('Actionable');
    expect(actionable).toHaveClass('text-pov-charcoal');
    expect(actionable.className).not.toMatch(/success|positive|confidence|rounded|border|bg-/);
    expect(screen.getByText('1,000,000.50')).toHaveClass('tabular-nums');
    expect(screen.getByText('250,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('1,250,000.50')).toHaveClass('tabular-nums');
    expect(screen.getByText('Planning FMV')).toBeInTheDocument();
    expect(screen.getByText('4,000,000.00')).toHaveClass('tabular-nums');
    expect(screen.getByText('2026-07-12')).toHaveClass('tabular-nums');
    expect(screen.getByText('Active Planning FMV')).toBeInTheDocument();
    expect(screen.getByText('Base currency')).toBeInTheDocument();
    expect(screen.getByText(FACTS_HASH.slice(0, 12))).toBeInTheDocument();
    expect(screen.getByText('A reviewed round model override was applied.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy facts input hash for Acme Corp' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(FACTS_HASH));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders indicative remediation copy and exposes the reason on badge focus', async () => {
    const basis = buildBasis({
      rankability: 'indicative',
      reasons: ['planning_fmv_stale', 'exit_probability_missing', 'reserve_exit_multiple_missing'],
      planningFmvStatus: 'stale',
    });

    render(<MoicBasisDisclosure basis={basis} investmentName="Beta Labs" />);

    const indicative = screen.getByText('Indicative');
    expect(indicative).toHaveClass('text-presson-textMuted');
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-warning/50',
      'bg-warning/10'
    );
    expect(
      screen.getByText('Refresh the stale Planning FMV before relying on this ranking.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add an exit probability before relying on this ranking.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add a reserve exit multiple before relying on this ranking.')
    ).toBeInTheDocument();

    fireEvent.focus(indicative);
    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.parentElement).toHaveClass(
        'motion-reduce:animate-none',
        'motion-reduce:transition-none'
      );
      expect(tooltip).toHaveTextContent(
        'Refresh the stale Planning FMV before relying on this ranking.'
      );
    });
  });

  it('preserves decimal-string precision beyond Number.MAX_SAFE_INTEGER', () => {
    const basis = buildBasis({
      observedInitialInvestment: '9007199254740993',
    });

    render(<MoicBasisDisclosure basis={basis} investmentName="Precision Co" />);

    expect(screen.getByText('9,007,199,254,740,993.00')).toHaveClass('tabular-nums');
  });

  it('renders not-actionable and null-basis states with text labels and hollow dots', () => {
    const basis = buildBasis({
      rankability: 'not_actionable',
      reasons: ['valuation_unavailable', 'currency_blocked', 'planned_reserves_zero'],
      valuationAnchor: { kind: 'none', value: null, asOfDate: null },
      planningFmvStatus: 'none',
      currencyStatus: 'mismatch_blocked',
      factsInputHash: null,
    });
    const { unmount } = render(<MoicBasisDisclosure basis={basis} investmentName="Gamma Bio" />);

    expect(screen.getByText('Not actionable')).toHaveClass('text-presson-textMuted');
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-charcoal-400',
      'bg-transparent'
    );
    expect(
      screen.getByText('Add a current Planning FMV before relying on this ranking.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Resolve the currency mismatch before relying on this ranking.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Add planned reserves before relying on this ranking.')
    ).toBeInTheDocument();
    expect(screen.getByText('No valuation anchor')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /copy facts input hash/i })
    ).not.toBeInTheDocument();

    unmount();
    render(<MoicBasisDisclosure basis={null} investmentName="Delta Co" />);

    expect(screen.getAllByText('Facts unavailable').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/supporting facts basis could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByTestId('moic-rankability-dot')).toHaveClass(
      'border-charcoal-400',
      'bg-transparent'
    );
  });
});
