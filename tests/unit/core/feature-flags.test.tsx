import { afterEach, describe, expect, it, vi } from 'vitest';

describe('legacy feature-flags compatibility', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps route-facing flags out of the legacy compatibility shim', async () => {
    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect('ENABLE_LP_REPORTING' in FLAGS).toBe(false);
    expect('ONBOARDING_TOUR' in FLAGS).toBe(false);
    expect('UI_CATALOG' in FLAGS).toBe(false);
  });

  it('prefers a localStorage override for remaining compatibility flags', async () => {
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('FF_ENABLE_ENGINE_INTEGRATION', 'true');

    const { FLAGS } = await import('@/core/flags/featureFlags');

    expect(FLAGS.NEW_IA).toBe(true);
    expect(FLAGS.ENABLE_ENGINE_INTEGRATION).toBe(true);
  });
});
