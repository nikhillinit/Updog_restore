/**
 * PortfolioTabs URL sync (Plan 9 Wave 9B1 review P2-4).
 *
 * Pins that switching tabs rewrites ONLY the tab param and preserves every
 * other query param (fundId carried by the workspace nav in particular).
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { PortfolioTabs } from '../../../../client/src/components/portfolio/PortfolioTabs';

vi.mock('../../../../client/src/components/portfolio/tabs/OverviewTab', () => ({
  OverviewTab: () => <div>Overview Tab Stub</div>,
}));
vi.mock('../../../../client/src/components/portfolio/tabs/AllocationsTab', () => ({
  AllocationsTab: () => <div>Allocations Tab Stub</div>,
}));
vi.mock('../../../../client/src/components/portfolio/tabs/ReallocationTab', () => ({
  ReallocationTab: () => <div>Reallocation Tab Stub</div>,
}));

function renderTabs(path: string) {
  const location = memoryLocation({ path, record: true });
  const result = render(
    <Router hook={location.hook}>
      <PortfolioTabs />
    </Router>
  );
  return { ...result, location };
}

describe('PortfolioTabs URL state', () => {
  afterEach(() => cleanup());

  it('preserves fundId (and other params) when switching tabs', async () => {
    const user = userEvent.setup();
    const { location } = renderTabs('/portfolio?tab=companies&fundId=7');

    await user.click(screen.getByRole('tab', { name: 'Reserve Planning' }));

    expect(location.history?.at(-1)).toBe('/portfolio?tab=reserve-planning&fundId=7');
    expect(screen.getByText('Allocations Tab Stub')).toBeInTheDocument();
  });

  it('still writes the tab param when no other params exist', async () => {
    const user = userEvent.setup();
    const { location } = renderTabs('/portfolio');

    await user.click(screen.getByRole('tab', { name: 'Reserve Planning' }));

    expect(location.history?.at(-1)).toBe('/portfolio?tab=reserve-planning');
  });
});
