import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createWouterWrapper } from '../../../utils/withWouter';

type MockFundContext = {
  currentFund: { id: number; name: string; size: number } | null;
  needsSetup: boolean;
};

type NavigationFlagOverrides = {
  NEW_IA?: boolean;
  HIDE_PLANNING_SURFACE?: boolean;
  HIDE_KPI_SURFACES?: boolean;
};

let mockFundContext: MockFundContext = {
  currentFund: {
    id: 7,
    name: 'Fund Seven',
    size: 25_000_000,
  },
  needsSetup: false,
};

async function loadNavigationModules(flagOverrides: NavigationFlagOverrides = {}) {
  vi.resetModules();
  vi.doMock('@/core/flags/featureFlags', () => ({
    FLAGS: {
      NEW_IA: flagOverrides.NEW_IA ?? false,
      HIDE_PLANNING_SURFACE: flagOverrides.HIDE_PLANNING_SURFACE ?? true,
      HIDE_KPI_SURFACES: flagOverrides.HIDE_KPI_SURFACES ?? true,
    },
  }));
  vi.doMock('@/contexts/FundContext', () => ({
    useFundContext: () => mockFundContext,
  }));

  const navigation = await import('@/components/layout/navigation-config');
  const sidebar = (await import('@/components/layout/sidebar')).default;

  return { Sidebar: sidebar, ...navigation };
}

function hoverSidebar(container: HTMLElement) {
  const aside = container.querySelector('aside');
  expect(aside).not.toBeNull();
  fireEvent.mouseEnter(aside as HTMLElement);
}

describe('sidebar results navigation', () => {
  afterEach(() => {
    mockFundContext = {
      currentFund: {
        id: 7,
        name: 'Fund Seven',
        size: 25_000_000,
      },
      needsSetup: false,
    };
    vi.unmock('@/core/flags/featureFlags');
    vi.unmock('@/contexts/FundContext');
    vi.resetModules();
  });

  it('includes model results in both legacy and NEW_IA navigation modes', async () => {
    const legacy = await loadNavigationModules({ NEW_IA: false });
    expect(legacy.getNavigationItems().some((item) => item.id === 'model-results')).toBe(true);

    const simplified = await loadNavigationModules({ NEW_IA: true });
    expect(simplified.getNavigationItems().some((item) => item.id === 'model-results')).toBe(true);
  });

  it('omits planning from the legacy navigation by default', async () => {
    const { getNavigationItems } = await loadNavigationModules({ NEW_IA: false });

    expect(getNavigationItems().some((item) => item.id === 'planning')).toBe(false);
  });

  it('keeps planning out of navigation even when the route is explicitly re-enabled', async () => {
    const { getNavigationItems } = await loadNavigationModules({
      NEW_IA: false,
      HIDE_PLANNING_SURFACE: false,
    });

    expect(getNavigationItems().some((item) => item.id === 'planning')).toBe(false);
  });

  it('keeps the main navigation limited to the reduced core perimeter', async () => {
    const { getNavigationItems } = await loadNavigationModules({ NEW_IA: false });

    expect(getNavigationItems().map((item) => item.id)).toEqual([
      'dashboard',
      'portfolio',
      'pipeline',
      'model-results',
      'reports',
    ]);
  });

  it('shows settings and help in the sidebar footer for both navigation modes', async () => {
    const legacy = await loadNavigationModules({ NEW_IA: false });
    const simplified = await loadNavigationModules({ NEW_IA: true });

    expect(legacy.getFooterNavigationItems().map((item) => item.id)).toEqual(['settings', 'help']);
    expect(simplified.getFooterNavigationItems().map((item) => item.id)).toEqual([
      'settings',
      'help',
    ]);
  });

  it('prefers the route fund ID over currentFund when resolving the results href', async () => {
    const { getNavigationItems, resolveNavigationHref } = await loadNavigationModules({
      NEW_IA: false,
    });
    const resultsItem = getNavigationItems().find((item) => item.id === 'model-results');

    expect(resultsItem).toBeDefined();
    expect(
      resolveNavigationHref(resultsItem!, {
        location: '/fund-model-results/42',
        currentFundId: 7,
        needsSetup: false,
      })
    ).toBe('/fund-model-results/42');
  });

  it('matches deep-linked results routes back to the stable navigation id', async () => {
    const { getActiveNavigationId } = await loadNavigationModules({ NEW_IA: false });

    expect(getActiveNavigationId('/fund-model-results/42')).toBe('model-results');
    expect(getActiveNavigationId('/fund-model-results/42?tab=summary')).toBe('model-results');
  });

  it('renders a fund-scoped model results link when a current fund is available', async () => {
    const { Sidebar } = await loadNavigationModules({ NEW_IA: false });
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const link = screen.getByRole('link', { name: /model results/i });
    expect(link.getAttribute('href')).toBe('/fund-model-results/7');
  });

  it('keeps the results navigation active and linkable on a deep-linked results route before currentFund hydrates', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { Sidebar, getActiveNavigationId } = await loadNavigationModules({ NEW_IA: false });
    const initialLocation = '/fund-model-results/42';
    const { Wrapper } = createWouterWrapper(initialLocation);
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule={getActiveNavigationId(initialLocation)} />
      </Wrapper>
    );

    hoverSidebar(container);

    const link = screen.getByRole('link', { name: /model results/i });
    expect(link.getAttribute('href')).toBe('/fund-model-results/42');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('renders a disabled results control when no fund can be resolved', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { Sidebar } = await loadNavigationModules({ NEW_IA: false });
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    expect(screen.queryByRole('link', { name: /model results/i })).not.toBeInTheDocument();

    const disabledButton = screen.getByRole('button', { name: /model results/i });
    expect(disabledButton).toBeDisabled();
    expect(disabledButton).toHaveAttribute('aria-disabled', 'true');
  });
});
