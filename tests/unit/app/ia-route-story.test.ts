import { describe, expect, it } from 'vitest';
import { APP_ROUTES, ARCHIVED_PLACEHOLDER_ROUTES } from '@/App';
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

  it('keeps deterministic surfaces owned by runtime routes instead of /model redirects', () => {
    const runtimeRoutePaths = APP_ROUTES.map((route) => route.path);
    const archivedPlaceholderRoutes = new Map(
      ARCHIVED_PLACEHOLDER_ROUTES.map((route) => [route.path, route.redirectTarget])
    );
    const runtimeOwnedModelSurfaces = ['/financial-modeling', '/forecasting'];

    expect(runtimeRoutePaths).toEqual(expect.arrayContaining(runtimeOwnedModelSurfaces));
    expect(archivedPlaceholderRoutes.get('/investments')).toBe('/portfolio');

    for (const pathname of runtimeOwnedModelSurfaces) {
      expect(OLD_TO_NEW_REDIRECTS[pathname]).toBeUndefined();
      expect(shouldRedirect(pathname)).toBe(false);
      expect(getRedirectTarget(pathname)).toBeUndefined();
    }

    expect(runtimeRoutePaths).not.toContain('/investment-table');
    expect(archivedPlaceholderRoutes.has('/investment-table')).toBe(false);
    expect(shouldRedirect('/investment-table')).toBe(false);
    expect(getRedirectTarget('/investment-table')).toBeUndefined();
    expect(Object.values(OLD_TO_NEW_REDIRECTS)).not.toContain('/model');
  });
});
