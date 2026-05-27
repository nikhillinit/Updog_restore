import { describe, expect, it } from 'vitest';
import { getRedirectTarget, shouldRedirect } from '@/config/routes';
import { NEW_ROUTES, OLD_TO_NEW_REDIRECTS } from '@/core/routes/ia';

describe('IA route story metadata', () => {
  it('does not advertise a dead /model surface', () => {
    expect(NEW_ROUTES.map((route) => route.path)).toEqual([
      '/overview',
      '/portfolio',
      '/operate',
      '/report',
    ]);
  });

  it('does not redirect deterministic surfaces through /model', () => {
    const removedModelSurfaces = [
      '/investments',
      '/investment-table',
      '/financial-modeling',
      '/forecasting',
      '/cash-management',
      '/portfolio-analytics',
      '/cap-tables',
    ];

    for (const pathname of removedModelSurfaces) {
      expect(OLD_TO_NEW_REDIRECTS[pathname]).toBeUndefined();
      expect(shouldRedirect(pathname)).toBe(false);
      expect(getRedirectTarget(pathname)).toBeUndefined();
    }

    expect(Object.values(OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
  });
});
