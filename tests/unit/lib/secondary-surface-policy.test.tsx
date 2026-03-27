import { afterEach, describe, expect, it, vi } from 'vitest';

type SurfaceFlagOverrides = {
  HIDE_PLANNING_SURFACE?: boolean;
  HIDE_KPI_SURFACES?: boolean;
};

async function loadPolicy(flags: SurfaceFlagOverrides = {}) {
  vi.resetModules();
  vi.doMock('@/core/flags/featureFlags', () => ({
    FLAGS: {
      HIDE_PLANNING_SURFACE: flags.HIDE_PLANNING_SURFACE ?? true,
      HIDE_KPI_SURFACES: flags.HIDE_KPI_SURFACES ?? true,
    },
  }));

  return import('@/lib/secondary-surface-policy');
}

describe('secondary surface policy', () => {
  afterEach(() => {
    vi.unmock('@/core/flags/featureFlags');
    vi.resetModules();
  });

  it('quarantines planning by default and exposes the truthful reserve-planning fallback', async () => {
    const { getSecondarySurfacePolicy, getSecondarySurfaceRedirect, isSecondarySurfaceNavVisible } =
      await loadPolicy();

    expect(getSecondarySurfacePolicy('planning').enabled).toBe(false);
    expect(getSecondarySurfacePolicy('planning').disabledRedirect).toBe(
      '/portfolio?tab=reserve-planning'
    );
    expect(getSecondarySurfaceRedirect('/planning')).toBe('/portfolio?tab=reserve-planning');
    expect(isSecondarySurfaceNavVisible('planning')).toBe(false);
  });

  it('allows planning to be explicitly re-enabled', async () => {
    const { getSecondarySurfacePolicy, getSecondarySurfaceRedirect, isSecondarySurfaceNavVisible } =
      await loadPolicy({
        HIDE_PLANNING_SURFACE: false,
      });

    expect(getSecondarySurfacePolicy('planning').enabled).toBe(true);
    expect(getSecondarySurfaceRedirect('/planning')).toBeNull();
    expect(isSecondarySurfaceNavVisible('planning')).toBe(true);
  });

  it('quarantines KPI manager and submission together by default', async () => {
    const { getSecondarySurfacePolicy, getSecondarySurfaceRedirect } = await loadPolicy();

    expect(getSecondarySurfacePolicy('kpi-manager').enabled).toBe(false);
    expect(getSecondarySurfaceRedirect('/kpi-manager')).toBe('/dashboard');
    expect(getSecondarySurfaceRedirect('/kpi-submission')).toBe('/dashboard');
  });

  it('leaves unrelated routes and nav items untouched', async () => {
    const { getSecondarySurfaceRedirect, isSecondarySurfaceNavVisible } = await loadPolicy();

    expect(getSecondarySurfaceRedirect('/dashboard')).toBeNull();
    expect(isSecondarySurfaceNavVisible('model-results')).toBe(true);
  });
});
