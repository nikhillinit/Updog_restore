import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createWouterWrapper } from '../../../utils/withWouter';

type MockFundContext = {
  currentFund: { id: number; name: string; size: number } | null;
  needsSetup: boolean;
};

let mockFundContext: MockFundContext = {
  currentFund: {
    id: 7,
    name: 'Fund Seven',
    size: 25_000_000,
  },
  needsSetup: false,
};

async function loadNavigationModules() {
  vi.resetModules();
  vi.doMock('@/contexts/FundContext', () => ({
    useFundContext: () => mockFundContext,
  }));

  const navigation = await import('@/components/layout/navigation-config');
  const sidebar = (await import('@/components/layout/sidebar')).default;
  const expandableSidebar = (await import('@/components/layout/expandable-sidebar')).default;
  const { MobileNavigation } = await import('@/App');

  return {
    Sidebar: sidebar,
    ExpandableSidebar: expandableSidebar,
    MobileNavigation,
    ...navigation,
  };
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
    vi.unmock('@/contexts/FundContext');
    vi.resetModules();
  });

  it('includes model results in the stabilized navigation', async () => {
    const navigation = await loadNavigationModules();
    expect(navigation.getNavigationItems().some((item) => item.id === 'model-results')).toBe(true);
  });

  it('omits planning from the navigation by default', async () => {
    const { getNavigationItems } = await loadNavigationModules();

    expect(getNavigationItems().some((item) => item.id === 'planning')).toBe(false);
  });

  it('keeps the main navigation limited to the governed core perimeter', async () => {
    const { getNavigationItems } = await loadNavigationModules();

    expect(getNavigationItems().map((item) => item.id)).toEqual([
      'dashboard',
      'portfolio',
      'pipeline',
      'performance',
      'financial-modeling',
      'model-results',
      'sensitivity-analysis',
      'reports',
    ]);
  });

  it('shows settings and help in the sidebar footer', async () => {
    const navigation = await loadNavigationModules();

    expect(navigation.getFooterNavigationItems().map((item) => item.id)).toEqual([
      'settings',
      'help',
    ]);
  });

  it('prefers the route fund ID over currentFund when resolving the results href', async () => {
    const { getNavigationItems, resolveNavigationHref } = await loadNavigationModules();
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
    const { getActiveNavigationId } = await loadNavigationModules();

    expect(getActiveNavigationId('/fund-model-results/42')).toBe('model-results');
    expect(getActiveNavigationId('/fund-model-results/42?tab=summary')).toBe('model-results');
    expect(getActiveNavigationId('/model-results')).toBe('model-results');
    expect(getActiveNavigationId('/forecasting')).toBe('financial-modeling');
    expect(getActiveNavigationId('/sensitivity-analysis')).toBe('sensitivity-analysis');
  });

  it('renders a fund-scoped model results link when a current fund is available', async () => {
    const { Sidebar } = await loadNavigationModules();
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

  it('renders a fund-scoped forecasting link when a current fund is available', async () => {
    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const link = screen.getByRole('link', { name: /forecasting/i });
    expect(link.getAttribute('href')).toBe('/forecasting?fundId=7');
  });

  it('keeps Performance discoverable by accessible name while collapsed', async () => {
    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    const link = screen.getByRole('link', { name: /performance/i });
    expect(link.getAttribute('href')).toBe('/performance');
    expect(link).toHaveAttribute('title', 'Performance');
  });

  it('keeps every governed desktop item discoverable by accessible name while collapsed', async () => {
    const { Sidebar, getNavigationItems, getFooterNavigationItems } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');

    render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    const items = [...getNavigationItems(), ...getFooterNavigationItems()];
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('keeps expanded desktop links aligned with the shared navigation hrefs', async () => {
    const { Sidebar, getNavigationItems, getFooterNavigationItems, resolveNavigationHref } =
      await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const context = {
      location: '/dashboard',
      currentFundId: 7,
      needsSetup: false,
    };

    for (const item of [...getNavigationItems(), ...getFooterNavigationItems()]) {
      const expectedHref = resolveNavigationHref(item, context);
      if (!expectedHref) continue;
      expect(screen.getByRole('link', { name: item.label }).getAttribute('href')).toBe(
        expectedHref
      );
    }
  });

  it('marks normal active routes with aria-current', async () => {
    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/performance');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="performance" />
      </Wrapper>
    );

    hoverSidebar(container);

    expect(screen.getByRole('link', { name: /performance/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('explains setup-gated disabled navigation controls', async () => {
    mockFundContext = {
      currentFund: {
        id: 7,
        name: 'Fund Seven',
        size: 25_000_000,
      },
      needsSetup: true,
    };

    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const dashboard = screen.getByRole('button', { name: /dashboard/i });
    expect(dashboard).toBeDisabled();
    expect(dashboard).toHaveAttribute('aria-describedby', 'sidebar-disabled-reason-dashboard');
    expect(document.getElementById('sidebar-disabled-reason-dashboard')).toHaveTextContent(
      'Complete fund setup to access this route.'
    );
  });

  it('does not render legacy chart-category controls in the navigation rail', async () => {
    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    expect(screen.queryByRole('button', { name: /chart types/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Basic Charts')).not.toBeInTheDocument();
  });

  it('keeps mobile navigation links on the same shared route map', async () => {
    const {
      MobileNavigation,
      getNavigationItems,
      getFooterNavigationItems,
      resolveNavigationHref,
    } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const onNavigate = vi.fn();

    render(
      <Wrapper>
        <MobileNavigation activeModule="dashboard" onNavigate={onNavigate} />
      </Wrapper>
    );

    const context = {
      location: '/dashboard',
      currentFundId: 7,
      needsSetup: false,
    };

    for (const item of [...getNavigationItems(), ...getFooterNavigationItems()]) {
      const expectedHref = resolveNavigationHref(item, context);
      if (!expectedHref) continue;
      expect(screen.getByRole('link', { name: item.label }).getAttribute('href')).toBe(
        expectedHref
      );
    }
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the results navigation active and linkable on a deep-linked results route before currentFund hydrates', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { Sidebar, getActiveNavigationId } = await loadNavigationModules();
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

  it('links to the model-results recovery route when no fund can be resolved', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const link = screen.getByRole('link', { name: /model results/i });
    expect(link.getAttribute('href')).toBe('/model-results');
  });

  it('links to the forecasting recovery route when no fund can be resolved', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { Sidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <Sidebar activeModule="dashboard" />
      </Wrapper>
    );

    hoverSidebar(container);

    const link = screen.getByRole('link', { name: /forecasting/i });
    expect(link.getAttribute('href')).toBe('/forecasting');
  });

  it('keeps expandable model results linkable to the recovery route without a fund', async () => {
    mockFundContext = {
      currentFund: null,
      needsSetup: false,
    };

    const { ExpandableSidebar } = await loadNavigationModules();
    const { Wrapper } = createWouterWrapper('/dashboard');
    const { container } = render(
      <Wrapper>
        <ExpandableSidebar activeModule="dashboard" onModuleChange={vi.fn()} />
      </Wrapper>
    );

    hoverSidebar(container);
    fireEvent.click(screen.getByRole('button', { name: /administration/i }));

    const link = screen.getByRole('link', { name: /model results/i });
    expect(link.getAttribute('href')).toBe('/model-results');
    expect(screen.getByRole('button', { name: /model results/i })).not.toBeDisabled();
  });
});
