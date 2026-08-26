import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CALC_SUBSTRATE_CONTRACT_VERSION } from '../../../shared/core/calc-substrate/calc-basis';
import { createCalculationContext } from '../../../shared/core/calc-substrate/calculation-context';

describe('createCalculationContext', () => {
  it('builds a frozen context with working injected capabilities', () => {
    const ctx = createCalculationContext({
      calculationKey: 'demo_reserve',
      seed: 42,
      asOf: '2026-07-17T00:00:00Z',
      flags: { shadow_compare: true },
    });
    expect(ctx.contractVersion).toBe(CALC_SUBSTRATE_CONTRACT_VERSION);
    expect(ctx.calculationKey).toBe('demo_reserve');
    expect(ctx.rng.next()).toBe(0.002643892541527748);
    expect(ctx.clock.isoNow()).toBe('2026-07-17T00:00:00.000Z');
    expect(ctx.flags['shadow_compare']).toBe(true);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.flags)).toBe(true);
    expect(() => {
      (ctx.flags as Record<string, boolean>)['injected'] = true;
    }).toThrow(TypeError);
  });

  it('rejects invalid calculation keys, seeds, and instants', () => {
    const valid = { calculationKey: 'demo_reserve', seed: 42, asOf: '2026-07-17T00:00:00Z' };
    expect(() => createCalculationContext({ ...valid, calculationKey: 'Demo' })).toThrow();
    expect(() => createCalculationContext({ ...valid, seed: 0 })).toThrow(RangeError);
    expect(() => createCalculationContext({ ...valid, asOf: '2026-07-17' })).toThrow(RangeError);
  });
});

describe('ambient-state source guard', () => {
  it('the substrate never reaches for Math.random, argless new Date(), or process.env', async () => {
    // The shared node-setup mocks fs.readFileSync; this guard needs the real one.
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const substrateDir = path.join(process.cwd(), 'shared', 'core', 'calc-substrate');
    const sources = fs.readdirSync(substrateDir).filter((f) => f.endsWith('.ts'));
    expect(sources.length).toBeGreaterThanOrEqual(7);
    const ambientPatterns: [string, RegExp][] = [
      ['Math.random', /Math\.random/],
      ['argless new Date()', /new Date\(\s*\)/],
      ['process.env', /process\.env/],
      ['Date.now', /Date\.now/],
    ];
    const violations: string[] = [];
    for (const file of sources) {
      const raw = fs.readFileSync(path.join(substrateDir, file), 'utf8');
      // Guard executable code only: doc comments may name the forbidden APIs.
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const [label, pattern] of ambientPatterns) {
        if (pattern.test(text)) {
          violations.push(`${file} uses ${label}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
