import { describe, expect, it } from 'vitest';
import { APP_ROUTES, ARCHIVED_PLACEHOLDER_ROUTES } from '@/App';

describe('IA route story metadata', () => {
  it('keeps deterministic surfaces owned by runtime routes instead of /model redirects', () => {
    const runtimeRoutePaths = APP_ROUTES.map((route) => route.path);
    const archivedPlaceholderRoutes = new Map(
      ARCHIVED_PLACEHOLDER_ROUTES.map((route) => [route.path, route.redirectTarget])
    );
    const runtimeOwnedModelSurfaces = ['/financial-modeling', '/forecasting'];

    expect(runtimeRoutePaths).toEqual(expect.arrayContaining(runtimeOwnedModelSurfaces));
    expect(archivedPlaceholderRoutes.get('/investments')).toBe('/portfolio');

    expect(runtimeRoutePaths).not.toContain('/investment-table');
    expect(archivedPlaceholderRoutes.has('/investment-table')).toBe(false);
  });
});
