/**
 * Vitest integration that proves:
 *  1) withFaults can introduce non-finite values
 *  2) assertFiniteDeep blocks them (returns ok=false with path)
 *
 * Replace the engine stub with your real engine if you want end-to-end coverage.
 *   TODO: import { runMonteCarlo } from '../../server/engine/runMonteCarlo';
 */

import { describe, it, expect } from 'vitest';
import { withFaults } from '../../server/engine/fault-injector';
import { assertFiniteDeep } from '../../server/middleware/engine-guards';

// --- Engine stub (replace with real engine import to test actual pipeline)
type Params = { fundSize: number; horizonQuarters: number; reserves: number };
function engineStub(p: Params) {
  // A deterministic-looking but finite output
  const base = (p.fundSize / 1e6) * 0.01 + p.horizonQuarters * 0.001 - p.reserves * 0.1;
  return {
    moic: Math.max(0.01, 1.2 + base * 0.01),
    irr: Math.min(0.6, Math.max(-0.9, 0.15 + base * 0.005)),
    median: 1.1 + base * 0.002,
    percentiles: { '5': 0.6, '50': 1.1, '95': 2.1 },
  };
}

describe('WASM/Engine fault injection + non-finite guard', () => {
  it('rejects non-finite outputs when faults are present', async () => {
    const faulty = withFaults(engineStub, { rate: 0.7, seed: 42, targetKeys: ['irr', 'moic', 'percentiles'] });
    let foundNonFinite = false;

    // Try a handful of runs to surface a fault
    for (let i = 0; i < 10; i++) {
      const result = await faulty({ fundSize: 50e6, horizonQuarters: 16, reserves: 0.2 });
      const g = assertFiniteDeep(result);
      if (!g.ok && g.reason === 'non-finite-number') {
        foundNonFinite = true;
        expect(g.path).toMatch(/\$\.((irr|moic|median|percentiles)(\.|\[|$))/);
        break;
      }
    }

    expect(foundNonFinite).toBe(true);
  });

  it('passes when faults are disabled (rate=0)', async () => {
    const safe = withFaults(engineStub, { rate: 0, seed: 7 });
    for (let i = 0; i < 5; i++) {
      const result = await safe({ fundSize: 75e6, horizonQuarters: 20, reserves: 0.25 });
      const g = assertFiniteDeep(result);
      expect(g.ok).toBe(true);
    }
  });

  it('guards detect NaN at any depth', () => {
    const data = {
      topLevel: 42,
      nested: {
        deep: {
          value: NaN,
        },
      },
    };
    
    const g = assertFiniteDeep(data);
    expect(g.ok).toBe(false);
    expect(g.path).toBe('$.nested.deep.value');
    expect(g.reason).toBe('non-finite-number');
  });

  it('guards detect Infinity in arrays', () => {
    const data = {
      values: [1, 2, Infinity, 4],
    };
    
    const g = assertFiniteDeep(data);
    expect(g.ok).toBe(false);
    expect(g.path).toBe('$.values[2]');
    expect(g.reason).toBe('non-finite-number');
  });

  it('guards handle complex nested structures', () => {
    const data = {
      results: {
        simulations: [
          { irr: 0.12, moic: 1.5 },
          { irr: -Infinity, moic: 1.2 },
          { irr: 0.18, moic: 1.8 },
        ],
        summary: {
          mean: 0.15,
          percentiles: {
            '25': 0.1,
            '50': NaN,
            '75': 0.2,
          },
        },
      },
    };
    
    const g = assertFiniteDeep(data);
    expect(g.ok).toBe(false);
    // Should find the first non-finite value
    expect(g.reason).toBe('non-finite-number');
  });

  it('guards respect depth limits', () => {
    let deeply = { value: 1 };
    for (let i = 0; i < 60; i++) {
      deeply = { nested: deeply };
    }
    
    const g = assertFiniteDeep(deeply, { maxDepth: 50 });
    expect(g.ok).toBe(false);
    expect(g.reason).toBe('too-deep');
  });

  it('guards respect breadth limits', () => {
    const wide = {
      items: Array(300).fill(0).map((_, i) => ({ index: i, value: Math.random() })),
    };
    
    const g = assertFiniteDeep(wide, { maxBreadth: 200 });
    expect(g.ok).toBe(false);
    expect(g.reason).toBe('too-broad');
  });

  it('withFaults preserves original when disabled in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.ENGINE_FAULT_ENABLE = '0';
    
    const wrapped = withFaults(engineStub, { rate: 1.0 }); // 100% fault rate
    const result = await wrapped({ fundSize: 100e6, horizonQuarters: 12, reserves: 0.15 });
    
    const g = assertFiniteDeep(result);
    expect(g.ok).toBe(true); // Should not inject faults in production
    
    process.env.NODE_ENV = originalEnv;
    delete process.env.ENGINE_FAULT_ENABLE;
  });
});