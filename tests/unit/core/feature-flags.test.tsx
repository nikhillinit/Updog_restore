import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Wave 2 feature-flags boundary', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps unfinished secondary surfaces quarantined by default', async () => {
    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.HIDE_PLANNING_SURFACE).toBe(true);
    expect(FLAGS.HIDE_KPI_SURFACES).toBe(true);
  });

  it('prefers a localStorage override for standard client flags', async () => {
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('FF_HIDE_PLANNING_SURFACE', 'false');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.NEW_IA).toBe(true);
    expect(FLAGS.HIDE_PLANNING_SURFACE).toBe(false);
  });

  it('uses environment values for admin-only flags', async () => {
    vi.stubEnv('VITE_UI_CATALOG', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.UI_CATALOG).toBe(true);
  });
});
