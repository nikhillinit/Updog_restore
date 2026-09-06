import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isUnifiedFlagEnabled,
  resolveClientRuntimeEnvironment,
} from '@/core/flags/unifiedClientFlags';

describe('client flag runtime policy', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs();
  });

  it('allows browser overrides in development', () => {
    vi.stubEnv('VITE_ENV', 'development');
    localStorage.setItem('ff_enable_lp_reporting', 'true');

    expect(isUnifiedFlagEnabled('enable_lp_reporting')).toBe(true);
  });

  it('ignores browser residue in production', () => {
    vi.stubEnv('VITE_ENV', 'production');
    localStorage.setItem('ff_enable_lp_reporting', 'true');
    window.history.replaceState({}, '', '/?ff_enable_lp_reporting=true');

    expect(isUnifiedFlagEnabled('enable_lp_reporting')).toBe(false);
  });

  it('uses explicit metadata before hostname and treats Vercel as preview', () => {
    expect(
      resolveClientRuntimeEnvironment({
        explicit: 'production',
        hostname: 'updog-git-branch.vercel.app',
      })
    ).toBe('production');
    expect(
      resolveClientRuntimeEnvironment({
        mode: 'production',
        hostname: 'updog-git-branch.vercel.app',
      })
    ).toBe('staging');
    expect(resolveClientRuntimeEnvironment({ hostname: 'updog.pressonventures.com' })).toBe(
      'production'
    );
  });
});
