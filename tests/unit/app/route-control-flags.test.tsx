import { afterEach, describe, expect, it, vi } from 'vitest';

describe('route control flags', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps route and admin exposure disabled by default in development', async () => {
    const { resolveRouteControlFlag } = await import('@/app/route-control-flags');

    expect(resolveRouteControlFlag('enable_lp_reporting')).toBe(false);
    expect(resolveRouteControlFlag('onboarding_tour')).toBe(false);
    expect(resolveRouteControlFlag('ui_catalog')).toBe(false);
  });

  it('ignores localStorage overrides for route and admin exposure', async () => {
    localStorage.setItem('ff_enable_lp_reporting', 'true');
    localStorage.setItem('ff_onboarding_tour', 'true');
    localStorage.setItem('ff_ui_catalog', 'true');

    const { resolveRouteControlFlag } = await import('@/app/route-control-flags');

    expect(resolveRouteControlFlag('enable_lp_reporting')).toBe(false);
    expect(resolveRouteControlFlag('onboarding_tour')).toBe(false);
    expect(resolveRouteControlFlag('ui_catalog')).toBe(false);
  });

  it('honors environment overrides through the generated registry path', async () => {
    vi.stubEnv('VITE_ENABLE_LP_REPORTING', 'true');
    vi.stubEnv('VITE_ONBOARDING_TOUR', 'true');
    vi.stubEnv('VITE_UI_CATALOG', 'true');

    const { resolveRouteControlFlag } = await import('@/app/route-control-flags');

    expect(resolveRouteControlFlag('enable_lp_reporting')).toBe(true);
    expect(resolveRouteControlFlag('onboarding_tour')).toBe(true);
    expect(resolveRouteControlFlag('ui_catalog')).toBe(true);
  });
});
