import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('flagAdapter: getInitialFlagStates', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear env vars that might carry over
    for (const key of Object.keys(import.meta.env)) {
      if (key.startsWith('VITE_ENABLE_') || key === 'VITE_NEW_IA' || key === 'VITE_ENV') {
        delete (import.meta.env as Record<string, unknown>)[key];
      }
    }
  });

  it('defaults to generated development registry values when env vars are absent', async () => {
    const { getInitialFlagStates } = await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_pipeline_dnd']).toBe(false);
    expect(states['enable_new_ia']).toBe(true);
    expect(states['enable_modeling_wizard']).toBe(true);
    expect(states['enable_reserve_engine']).toBe(true);
    expect(states['enable_lp_reporting']).toBe(false);
  });

  it('enables flag when VITE env var is set to "true"', async () => {
    (import.meta.env as Record<string, unknown>)['VITE_ENABLE_PIPELINE_DND'] = 'true';

    const { getInitialFlagStates } = await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_pipeline_dnd']).toBe(true);
  });

  it('disables flag when VITE env var is set to "false"', async () => {
    (import.meta.env as Record<string, unknown>)['VITE_ENABLE_PIPELINE_DND'] = 'false';

    const { getInitialFlagStates } = await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_pipeline_dnd']).toBe(false);
  });

  it('brand_tokens is always on regardless of env', async () => {
    const { getInitialFlagStates } = await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_brand_tokens']).toBe(true);
  });

  it('maps legacy wizard allocation keys to generated canonical reserve flags', async () => {
    (import.meta.env as Record<string, unknown>)['VITE_ENV'] = 'staging';
    (import.meta.env as Record<string, unknown>)['VITE_ENABLE_WIZARD_STEP_ALLOCATIONS'] = 'true';

    const { getInitialFlagStates } = await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_wizard_step_reserves']).toBe(true);
    expect(states['enable_wizard_step_allocations']).toBe(true);
  });

  it('respects generated dependencies when checking flags', async () => {
    (import.meta.env as Record<string, unknown>)['VITE_NEW_IA'] = 'false';

    const { getInitialFlagStates, isFlagEnabled } =
      await import('../../../client/src/core/flags/flagAdapter');
    const states = getInitialFlagStates();

    expect(states['enable_modeling_wizard']).toBe(true);
    expect(isFlagEnabled('enable_modeling_wizard', states)).toBe(false);
  });
});
