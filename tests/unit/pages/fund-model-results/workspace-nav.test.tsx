/**
 * Workspace navigation row (Plan 9 Wave 9B1, D-F.2/D-F.5; F_1.9.0 preset
 * propagation).
 *
 * Pins the seven-live-destinations-plus-disabled-Operations contract: labels,
 * hrefs, nav-item ORDER (Portfolio Actuals BEFORE Reserves), per-surface
 * active state, disabled-with-reason gating (D-C), the static basis indicator
 * (D-E), and viewPreset-only link propagation (never asOfDate/plan params).
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createWouterWrapper } from '../../../utils/withWouter';
import {
  WorkspaceBasisIndicator,
  WorkspaceNav,
  workspaceNavItems,
  type WorkspaceNavKey,
} from '../../../../client/src/pages/fund-model-results/workspace-nav';

const navMocks = vi.hoisted(() => ({
  viewPreset: 'gp' as 'gp' | 'analyst' | 'operations',
}));

vi.mock('@/hooks/useFundWorkspaceContext', () => ({
  useFundWorkspaceContext: () => ({
    fundId: 42,
    vehicleId: null,
    asOfDate: null,
    currentPlanVersionId: null,
    viewPreset: navMocks.viewPreset,
    setViewPreset: vi.fn(),
  }),
}));

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
  it('produces seven live destinations plus the disabled Operations placeholder', () => {
    const items = workspaceNavItems('42');

    expect(items.map((item) => [item.label, item.href])).toEqual([
      ['Summary', '/fund-model-results/42'],
      ['Forecast', '/financial-modeling?fundId=42'],
      ['Portfolio Actuals', '/portfolio?tab=reserve-planning&fundId=42'],
      ['Reserves', '/fund-model-results/42/moic-analysis'],
      ['Economics', '/fund-model-results/42/analysis'],
      ['Scenarios', '/fund-model-results/42/scenarios'],
      ['Reports', '/fund-model-results/42/reports'],
      ['Operations', null],
    ]);
    const operations = items.find((item) => item.key === 'operations');
    expect(operations?.disabledReason).toBe('Operations workspace not yet available');
  });

  it('pins Portfolio Actuals before Reserves in nav order', () => {
    const labels = workspaceNavItems('42').map((item) => item.label);

    expect(labels.indexOf('Portfolio Actuals')).toBeLessThan(labels.indexOf('Reserves'));
  });

  it('carries the viewPreset query param only on non-default presets', () => {
    const items = workspaceNavItems('42', 'analyst');

    expect(items.map((item) => [item.key, item.href])).toEqual([
      ['summary', '/fund-model-results/42?viewPreset=analyst'],
      ['forecast', '/financial-modeling?fundId=42&viewPreset=analyst'],
      ['portfolio-actuals', '/portfolio?tab=reserve-planning&fundId=42&viewPreset=analyst'],
      ['reserves', '/fund-model-results/42/moic-analysis?viewPreset=analyst'],
      ['analysis', '/fund-model-results/42/analysis?viewPreset=analyst'],
      ['scenarios', '/fund-model-results/42/scenarios?viewPreset=analyst'],
      ['reports', '/fund-model-results/42/reports?viewPreset=analyst'],
      ['operations', null],
    ]);
  });

  it('never ships asOfDate or plan params on any link (viewPreset only)', () => {
    for (const preset of ['gp', 'analyst', 'operations'] as const) {
      for (const item of workspaceNavItems('42', preset)) {
        if (item.href === null) continue;
        expect(item.href).not.toMatch(/asOfDate|planVersion|currentPlanVersionId/);
      }
    }
    // Default preset stays param-free.
    for (const item of workspaceNavItems('42', 'gp')) {
      expect(item.href ?? '').not.toContain('viewPreset');
    }
  });

  it('gates fund-scoped destinations with a reason when no fund is resolved', () => {
    const items = workspaceNavItems(null);
    const byKey = new Map(items.map((item) => [item.key, item]));

    for (const key of ['summary', 'reserves', 'analysis', 'scenarios', 'reports'] as const) {
      expect(byKey.get(key)?.href).toBeNull();
      expect(byKey.get(key)?.disabledReason).toBe('Select a fund to open this view');
    }
    // Forecast and Portfolio Actuals stay live links without a fund param.
    expect(byKey.get('forecast')?.href).toBe('/financial-modeling');
    expect(byKey.get('portfolio-actuals')?.href).toBe('/portfolio?tab=reserve-planning');
    // The Operations placeholder stays disabled with its own reason.
    expect(byKey.get('operations')?.href).toBeNull();
    expect(byKey.get('operations')?.disabledReason).toBe('Operations workspace not yet available');
  });
});

describe('WorkspaceNav', () => {
  afterEach(() => {
    cleanup();
    navMocks.viewPreset = 'gp';
  });

  it('renders all seven live destinations plus the disabled Operations entry', () => {
    renderNav();

    expect(screen.getByTestId('workspace-nav-fund')).toHaveTextContent('Fund Forty Two');
    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Summary',
      'Forecast',
      'Portfolio Actuals',
      'Reserves',
      'Economics',
      'Scenarios',
      'Reports',
    ]);
    for (const link of links) {
      expect(link.className).toContain('underline');
    }
    const operations = screen.getByTestId('workspace-nav-operations-disabled');
    expect(operations).toHaveAttribute('aria-disabled', 'true');
    expect(operations).toHaveTextContent('Operations workspace not yet available');
  });

  it('propagates the context viewPreset onto every live link', () => {
    navMocks.viewPreset = 'analyst';
    renderNav();

    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('href')).toContain('viewPreset=analyst');
      expect(link.getAttribute('href')).not.toMatch(/asOfDate|planVersion/);
    }
  });

  it.each<[WorkspaceNavKey, string]>([
    ['summary', 'Summary'],
    ['forecast', 'Forecast'],
    ['portfolio-actuals', 'Portfolio Actuals'],
    ['reserves', 'Reserves'],
    ['analysis', 'Economics'],
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

    for (const key of ['summary', 'reserves', 'analysis', 'scenarios', 'reports']) {
      const disabled = screen.getByTestId(`workspace-nav-${key}-disabled`);
      expect(disabled).toHaveAttribute('aria-disabled', 'true');
      expect(disabled).toHaveTextContent('Select a fund to open this view');
    }
    expect(screen.getByTestId('workspace-nav-operations-disabled')).toHaveTextContent(
      'Operations workspace not yet available'
    );
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
