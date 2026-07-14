/**
 * Workspace navigation row (Plan 9 Wave 9B1, D-F.2/D-F.5).
 *
 * Pins the six-item contract: labels, hrefs, nav-item ORDER (Portfolio
 * Actuals BEFORE Reserves), per-surface active state, disabled-with-reason
 * gating (D-C), and the static basis indicator (D-E).
 */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createWouterWrapper } from '../../../utils/withWouter';
import {
  WorkspaceBasisIndicator,
  WorkspaceNav,
  workspaceNavItems,
  type WorkspaceNavKey,
} from '../../../../client/src/pages/fund-model-results/workspace-nav';

function renderNav(props?: Partial<React.ComponentProps<typeof WorkspaceNav>>) {
  const { Wrapper } = createWouterWrapper('/fund-model-results/42');
  return render(
    <WorkspaceNav
      fundId="42"
      fundLabel="Fund Forty Two"
      active="summary"
      indicator={<WorkspaceBasisIndicator mode="construction" />}
      {...props}
    />,
    { wrapper: Wrapper }
  );
}

describe('workspaceNavItems', () => {
  it('produces the six-destination contract with fund-carrying hrefs', () => {
    const items = workspaceNavItems('42');

    expect(items.map((item) => [item.label, item.href])).toEqual([
      ['Summary', '/fund-model-results/42'],
      ['Forecast', '/financial-modeling?fundId=42'],
      ['Portfolio Actuals', '/portfolio?tab=reserve-planning&fundId=42'],
      ['Reserves', '/fund-model-results/42/moic-analysis'],
      ['Scenarios', '/fund-model-results/42/scenarios'],
      ['Reports', '/fund-model-results/42/reports'],
    ]);
  });

  it('pins Portfolio Actuals before Reserves in nav order', () => {
    const labels = workspaceNavItems('42').map((item) => item.label);

    expect(labels.indexOf('Portfolio Actuals')).toBeLessThan(labels.indexOf('Reserves'));
  });

  it('gates fund-scoped destinations with a reason when no fund is resolved', () => {
    const items = workspaceNavItems(null);
    const byKey = new Map(items.map((item) => [item.key, item]));

    for (const key of ['summary', 'reserves', 'scenarios', 'reports'] as const) {
      expect(byKey.get(key)?.href).toBeNull();
      expect(byKey.get(key)?.disabledReason).toBe('Select a fund to open this view');
    }
    // Forecast and Portfolio Actuals stay live links without a fund param.
    expect(byKey.get('forecast')?.href).toBe('/financial-modeling');
    expect(byKey.get('portfolio-actuals')?.href).toBe('/portfolio?tab=reserve-planning');
  });
});

describe('WorkspaceNav', () => {
  afterEach(() => cleanup());

  it('renders fund context plus all six destinations as underlined links', () => {
    renderNav();

    expect(screen.getByTestId('workspace-nav-fund')).toHaveTextContent('Fund Forty Two');
    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Summary',
      'Forecast',
      'Portfolio Actuals',
      'Reserves',
      'Scenarios',
      'Reports',
    ]);
    for (const link of links) {
      expect(link.className).toContain('underline');
    }
  });

  it.each<[WorkspaceNavKey, string]>([
    ['summary', 'Summary'],
    ['forecast', 'Forecast'],
    ['portfolio-actuals', 'Portfolio Actuals'],
    ['reserves', 'Reserves'],
    ['scenarios', 'Scenarios'],
    ['reports', 'Reports'],
  ])('marks only the active destination with aria-current on the %s surface', (key, label) => {
    renderNav({ active: key });

    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    const active = within(nav).getByRole('link', { name: label });
    expect(active).toHaveAttribute('aria-current', 'page');
    const currentLinks = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(currentLinks).toHaveLength(1);
  });

  it('renders gated destinations disabled with visible reasons, never dead links', () => {
    renderNav({ fundId: null, active: 'forecast' });

    for (const key of ['summary', 'reserves', 'scenarios', 'reports']) {
      const disabled = screen.getByTestId(`workspace-nav-${key}-disabled`);
      expect(disabled).toHaveAttribute('aria-disabled', 'true');
      expect(disabled).toHaveTextContent('Select a fund to open this view');
    }
    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
  });

  it('renders the static construction-basis indicator', () => {
    renderNav();

    expect(screen.getByText('Basis: Construction')).toBeInTheDocument();
  });

  it('renders the current-basis and side-by-side indicator variants', () => {
    renderNav({ indicator: <WorkspaceBasisIndicator mode="current" /> });
    expect(screen.getByText('Basis: Current')).toBeInTheDocument();
    cleanup();

    renderNav({ indicator: <WorkspaceBasisIndicator mode="side-by-side" /> });
    expect(screen.getByText('Basis: Construction and Current — side by side')).toBeInTheDocument();
  });
});
