import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { ALL_FLAGS } from '@shared/feature-flags/flag-definitions';
import { getEnvFlag, getFlagSnapshot, useFlag } from '@/shared/useFlags';

describe('enable_planning_fmv_overrides flag registration', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('is registered in ALL_FLAGS and the global default stays OFF', () => {
    expect(Object.keys(ALL_FLAGS)).toContain('enable_planning_fmv_overrides');
    expect(ALL_FLAGS['enable_planning_fmv_overrides']?.enabled).toBe(false);
  });

  it('defaults OFF but is runtime-overridable', () => {
    const off = renderHook(() => useFlag('enable_planning_fmv_overrides'));
    expect(off.result.current).toBe(false);

    window.localStorage.setItem('ff_enable_planning_fmv_overrides', '1');
    const on = renderHook(() => useFlag('enable_planning_fmv_overrides'));
    expect(on.result.current).toBe(true);
  });

  it('VITE_ENABLE_PLANNING_FMV_OVERRIDES=true is the per-environment ON lever', () => {
    const env = { VITE_ENABLE_PLANNING_FMV_OVERRIDES: 'true' };

    expect(getEnvFlag('enable_planning_fmv_overrides', env)).toBe(true);
    expect(getFlagSnapshot(env).enable_planning_fmv_overrides).toBe(true);
  });
});
