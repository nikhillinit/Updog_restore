import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Wave 2 feature-flags boundary', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps LP reporting disabled by default', async () => {
    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.ENABLE_LP_REPORTING).toBe(false);
  });

  it('prefers a localStorage override for standard client flags', async () => {
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('FF_ENABLE_LP_REPORTING', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.NEW_IA).toBe(true);
    expect(FLAGS.ENABLE_LP_REPORTING).toBe(true);
  });

  it('uses environment values for admin-only flags', async () => {
    vi.stubEnv('VITE_UI_CATALOG', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.UI_CATALOG).toBe(true);
  });
});
