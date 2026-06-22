import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ALL_FLAGS } from '@shared/feature-flags/flag-definitions';
import { useFlag } from '@/shared/useFlags';

// Regression guard: the flag groups are typed `Record<string, FeatureFlag>`, so
// `FlagKey` collapses to `string` and `useFlag('enable_investment_rounds')`
// compiles even when the key is NOT registered. If the key is missing from
// ALL_FLAGS the gate is silently always-false AND not runtime-overridable, which
// makes the whole investment-rounds surface dead. These runtime checks catch that.
describe('enable_investment_rounds flag registration', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('is registered in ALL_FLAGS and defaults OFF', () => {
    expect(Object.keys(ALL_FLAGS)).toContain('enable_investment_rounds');
    expect(ALL_FLAGS['enable_investment_rounds']?.enabled).toBe(false);
  });

  it('defaults OFF but is runtime-overridable (so dev can enable it)', () => {
    const off = renderHook(() => useFlag('enable_investment_rounds'));
    expect(off.result.current).toBe(false);

    window.localStorage.setItem('ff_enable_investment_rounds', '1');
    const on = renderHook(() => useFlag('enable_investment_rounds'));
    expect(on.result.current).toBe(true);
  });
});
