import { describe, expect, it } from 'vitest';
import { getRedirectTarget, shouldRedirect } from '@/config/routes';
import { NEW_ROUTES, OLD_TO_NEW_REDIRECTS } from '@/core/routes/ia';

describe('legacy route map', () => {
  it('does not imply a live /model destination for deterministic legacy surfaces', () => {
    const removedModelMappings = [
      '/planning',
      '/forecasting',
      '/scenario-builder',
      '/financial-modeling',
      '/allocation-manager',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
    ];

    for (const pathname of removedModelMappings) {
      expect(shouldRedirect(pathname)).toBe(false);
      expect(getRedirectTarget(pathname)).toBeUndefined();
    }
  });

  it('preserves non-model legacy redirects that still have owned destinations', () => {
    expect(getRedirectTarget('/dashboard')).toBe('/overview');
    expect(getRedirectTarget('/analytics')).toBe('/report');
    expect(getRedirectTarget('/kpi-manager')).toBe('/operate');
  });

  it('does not leave deterministic route-story metadata pointing at /model', () => {
    expect(NEW_ROUTES.map((route) => route.path)).not.toContain('/model');

    const deterministicLegacySurfaces = [
      '/planning',
      '/forecasting',
      '/scenario-builder',
      '/financial-modeling',
      '/allocation-manager',
      '/moic-analysis',
      '/return-the-fund',
      '/partial-sales',
    ];

    for (const pathname of deterministicLegacySurfaces) {
      expect(OLD_TO_NEW_REDIRECTS[pathname]).toBeUndefined();
    }
  });
});
