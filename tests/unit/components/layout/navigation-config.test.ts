/**
 * Navigation config -- regression test for the IA cleanup that landed alongside
 * the sensitivity stress slice. Pure data assertion (no React render needed):
 * the sidebar item with id "sensitivity-analysis" must surface as
 * "Sensitivity Analysis" rather than the legacy "Backtesting" label that
 * predated the multi-tab sensitivity surface.
 */

import { describe, expect, it } from 'vitest';
import { getNavigationItems } from '@/components/layout/navigation-config';

describe('navigation-config sensitivity item', () => {
  it('exposes the sensitivity-analysis sidebar item with the new label', () => {
    const items = getNavigationItems();
    const item = items.find((i) => i.id === 'sensitivity-analysis');

    expect(item).toBeDefined();
    expect(item?.label).toBe('Sensitivity Analysis');
  });

  it('does NOT use the legacy "Backtesting" label', () => {
    const items = getNavigationItems();
    const item = items.find((i) => i.id === 'sensitivity-analysis');

    expect(item).toBeDefined();
    expect(item?.label).not.toBe('Backtesting');
  });

  it('keeps the sensitivity-analysis target path stable (no nav structure change)', () => {
    const items = getNavigationItems();
    const item = items.find((i) => i.id === 'sensitivity-analysis');

    expect(item).toBeDefined();
    expect(item?.target.kind).toBe('static');
    if (item?.target.kind === 'static') {
      expect(item.target.path).toBe('/sensitivity-analysis');
    }
  });
});
