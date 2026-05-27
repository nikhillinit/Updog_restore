import { describe, expect, it } from 'vitest';
import { getRedirectTarget, shouldRedirect } from '@/config/routes';
import {
  NEW_ROUTES as CLIENT_NEW_ROUTES,
  OLD_TO_NEW_REDIRECTS as CLIENT_OLD_TO_NEW_REDIRECTS,
} from '@/core/routes/ia';

describe('legacy route map', () => {
  it('does not keep removed legacy surfaces in the active redirect map', () => {
    const removedLegacyMappings = [
      '/investments',
      '/investments-table',
      '/investment-table',
      '/planning',
      '/forecasting',
      '/scenario-builder',
      '/financial-modeling',
      '/allocation-manager',
      '/cash-management',
      '/portfolio-analytics',
      '/cap-tables',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
      '/time-travel',
    ];

    for (const pathname of removedLegacyMappings) {
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
    expect(CLIENT_NEW_ROUTES.map((route) => route.path)).toEqual([
      '/overview',
      '/portfolio',
      '/operate',
      '/report',
    ]);

    const removedLegacySurfaces = [
      '/investments',
      '/investment-table',
      '/planning',
      '/forecasting',
      '/scenario-builder',
      '/financial-modeling',
      '/allocation-manager',
      '/cash-management',
      '/portfolio-analytics',
      '/cap-tables',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
    ];

    for (const pathname of removedLegacySurfaces) {
      expect(CLIENT_OLD_TO_NEW_REDIRECTS[pathname]).toBeUndefined();
    }

    expect(Object.values(CLIENT_OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
  });
});
