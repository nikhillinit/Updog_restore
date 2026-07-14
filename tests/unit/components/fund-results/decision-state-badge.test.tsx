import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DecisionStateBadge } from '@/components/fund-results/DecisionStateBadge';

describe('DecisionStateBadge', () => {
  it('renders the actionable state as a full-ink label with no dot', () => {
    render(<DecisionStateBadge state="actionable" />);

    const label = screen.getByText('Actionable');
    expect(label).toHaveClass('text-pov-charcoal');
    expect(screen.queryByTestId('decision-state-dot')).not.toBeInTheDocument();
  });

  it('renders the indicative state as a muted label with an amber dot', () => {
    render(<DecisionStateBadge state="indicative" />);

    expect(screen.getByText('Indicative')).toHaveClass('text-presson-textMuted');
    const dot = screen.getByTestId('decision-state-dot');
    expect(dot).toHaveClass('border-warning/50', 'bg-warning/10');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the not-actionable state as a muted label with a hollow dot', () => {
    render(<DecisionStateBadge state="not_actionable" />);

    expect(screen.getByText('Not actionable')).toHaveClass('text-presson-textMuted');
    const dot = screen.getByTestId('decision-state-dot');
    expect(dot).toHaveClass('border-charcoal-400', 'bg-transparent');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('never renders forbidden status classes in any state', () => {
    const forbidden = /success|positive|confidence-|charcoal-500|warning-dark|#10b981|#127E3D/;
    for (const state of ['actionable', 'indicative', 'not_actionable'] as const) {
      const { container, unmount } = render(
        <DecisionStateBadge state={state} details={['Reason copy.']} />
      );
      expect(container.innerHTML).not.toMatch(forbidden);
      unmount();
    }
  });

  it('keeps the dot aria-hidden inside the visible text label', () => {
    render(<DecisionStateBadge state="indicative" />);

    const label = screen.getByText('Indicative');
    const dot = screen.getByTestId('decision-state-dot');
    expect(dot.parentElement).toBe(label);
    expect(label).toBeVisible();
  });

  it('exposes details in a keyboard-reachable tooltip', async () => {
    render(<DecisionStateBadge state="indicative" details={['First reason.', 'Second reason.']} />);

    const trigger = screen.getByText('Indicative');
    expect(trigger).toHaveAttribute('tabindex', '0');

    fireEvent.focus(trigger);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('First reason.');
    expect(tooltip).toHaveTextContent('Second reason.');
    expect(tooltip.parentElement).toHaveClass(
      'motion-reduce:animate-none',
      'motion-reduce:transition-none'
    );
  });

  it('preserves the given order of details', async () => {
    render(
      <DecisionStateBadge
        state="not_actionable"
        details={['Zulu reason.', 'Alpha reason.', 'Mike reason.']}
      />
    );

    fireEvent.focus(screen.getByText('Not actionable'));
    const tooltip = await screen.findByRole('tooltip');
    const items = Array.from(tooltip.querySelectorAll('li')).map((item) => item.textContent);
    expect(items).toEqual(['Zulu reason.', 'Alpha reason.', 'Mike reason.']);
  });

  it('honors label, ariaLabel, and testIdPrefix overrides', () => {
    render(
      <DecisionStateBadge
        state="not_actionable"
        label="Facts unavailable"
        ariaLabel="Facts unavailable for Acme"
        testIdPrefix="acme-facts"
      />
    );

    expect(screen.getByText('Facts unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText('Facts unavailable for Acme')).toBeInTheDocument();
    expect(screen.getByTestId('acme-facts-dot')).toBeInTheDocument();
  });
});
