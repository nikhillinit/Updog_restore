import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Wave 2 feature-flags boundary', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefers a localStorage override for standard client flags', async () => {
    localStorage.setItem('FF_NEW_IA', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.NEW_IA).toBe(true);
  });

  it('uses environment values for admin-only flags', async () => {
    vi.stubEnv('VITE_UI_CATALOG', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.UI_CATALOG).toBe(true);
  });
});
