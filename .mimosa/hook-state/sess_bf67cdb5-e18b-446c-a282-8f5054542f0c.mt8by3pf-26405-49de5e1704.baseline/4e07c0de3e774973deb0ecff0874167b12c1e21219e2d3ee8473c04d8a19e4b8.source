import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ALL_FLAGS } from '@shared/feature-flags/flag-definitions';
import { getEnvFlag, getFlagSnapshot, useFlag } from '@/shared/useFlags';

// Regression guards for the Part B ramp. The live UI resolves the flag via
// client/src/shared/useFlags.ts in priority order:
//   runtime (?ff_/localStorage) ?? VITE_ENABLE_INVESTMENT_ROUNDS ?? ALL_FLAGS.enabled ?? false
// The per-environment lever is the VITE_* build env, NOT a per-env branch in
// flag-definitions.ts (none exists) and NOT the global ALL_FLAGS.enabled bit
// (flipping that enables prod too - the NO-GO tripwire below).
describe('enable_investment_rounds flag registration', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('is registered in ALL_FLAGS and the global default stays OFF (prod-leak tripwire)', () => {
    expect(Object.keys(ALL_FLAGS)).toContain('enable_investment_rounds');
    expect(ALL_FLAGS['enable_investment_rounds']?.enabled).toBe(false);
  });

  it('defaults OFF but is runtime-overridable (manual dev verification)', () => {
    const off = renderHook(() => useFlag('enable_investment_rounds'));
    expect(off.result.current).toBe(false);

    window.localStorage.setItem('ff_enable_investment_rounds', '1');
    const on = renderHook(() => useFlag('enable_investment_rounds'));
    expect(on.result.current).toBe(true);
  });

  it('VITE_ENABLE_INVESTMENT_ROUNDS=true is the per-environment ON lever (dev/staging)', () => {
    const env = { VITE_ENABLE_INVESTMENT_ROUNDS: 'true' };

    expect(getEnvFlag('enable_investment_rounds', env)).toBe(true);
    expect(getFlagSnapshot(env).enable_investment_rounds).toBe(true);
  });

  it('VITE_ENABLE_INVESTMENT_ROUNDS=false takes precedence over the default (prod build resolves OFF)', () => {
    const env = { VITE_ENABLE_INVESTMENT_ROUNDS: 'false' };

    expect(getEnvFlag('enable_investment_rounds', env)).toBe(false);
    expect(getFlagSnapshot(env).enable_investment_rounds).toBe(false);
  });
});
