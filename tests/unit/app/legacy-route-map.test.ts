import { describe, expect, it } from 'vitest';
import { APP_ROUTES, ARCHIVED_PLACEHOLDER_ROUTES } from '@/App';
import { getRedirectTarget, shouldRedirect } from '@/config/routes';
import {
  NEW_ROUTES as CLIENT_NEW_ROUTES,
  OLD_TO_NEW_REDIRECTS as CLIENT_OLD_TO_NEW_REDIRECTS,
} from '@/core/routes/ia';

describe('legacy route map', () => {
  it('does not keep removed legacy surfaces in the active redirect map', () => {
    const removedLegacyRedirectMappings = [
      '/investments-table',
      '/investment-table',
      '/scenario-builder',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
      '/time-travel',
    ];

    for (const pathname of removedLegacyRedirectMappings) {
      expect(shouldRedirect(pathname)).toBe(false);
      expect(getRedirectTarget(pathname)).toBeUndefined();
    }
  });

  it('preserves non-model legacy redirects that still have owned destinations', () => {
    expect(getRedirectTarget('/dashboard')).toBe('/overview');
    expect(getRedirectTarget('/analytics')).toBe('/report');
    expect(getRedirectTarget('/kpi-manager')).toBe('/operate');
  });

  it('does not leave removed legacy route-story metadata in the active map', () => {
    const runtimeRoutePaths = APP_ROUTES.map((route) => route.path);
    const archivedPlaceholderRoutes = new Map(
      ARCHIVED_PLACEHOLDER_ROUTES.map((route) => [route.path, route.redirectTarget])
    );

    expect(CLIENT_NEW_ROUTES.map((route) => route.path)).toEqual([
      '/overview',
      '/portfolio',
      '/operate',
      '/report',
    ]);

    expect(runtimeRoutePaths).toEqual(
      expect.arrayContaining([
        '/financial-modeling',
        '/forecasting',
        '/allocation-manager',
        '/cash-management',
        '/portfolio-analytics',
        '/cap-tables',
      ])
    );
    expect(archivedPlaceholderRoutes.get('/planning')).toBe('/portfolio?tab=reserve-planning');
    expect(archivedPlaceholderRoutes.get('/investments')).toBe('/portfolio');

    const removedLegacyRedirectSurfaces = [
      '/investment-table',
      '/scenario-builder',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
    ];

    for (const pathname of removedLegacyRedirectSurfaces) {
      expect(CLIENT_OLD_TO_NEW_REDIRECTS[pathname]).toBeUndefined();
      expect(runtimeRoutePaths).not.toContain(pathname);
      expect(archivedPlaceholderRoutes.has(pathname)).toBe(false);
    }

    expect(Object.values(CLIENT_OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
  });
});
