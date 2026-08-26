/**
 * Ambient-state source guard for the deterministic reserve substrate adapter
 * (Tranche 4, ADR-045).
 *
 * Same pattern as tests/unit/reserve-substrate/ambient-guard.test.ts: the
 * adapter must receive every ambient capability through its
 * CalculationContext, never via Math.random, argless new Date(), Date.now,
 * or process.env. The canonical serializer module is scanned too - it is new
 * substrate-side code this tranche. The legacy DeterministicReserveEngine.ts
 * is intentionally NOT scanned: its remaining default-path ambient reads
 * (the Date.now and NODE_ENV fallbacks inside the ADR-045 capability seam)
 * are characterized, seam-gated behavior, and the adapter always overrides
 * them with ctx-derived capabilities.
 */

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const GUARDED_FILES = [
  'deterministic-reserve-substrate-adapter.ts',
  'deterministic-reserve-canonical.ts',
];

describe('deterministic reserve adapter ambient-state source guard', () => {
  it('the adapter never reaches for Math.random, argless new Date(), Date.now, or process.env', async () => {
    // The shared node-setup mocks fs.readFileSync; this guard needs the real one.
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const reservesDir = path.join(process.cwd(), 'shared', 'core', 'reserves');
    const ambientPatterns: [string, RegExp][] = [
      ['Math.random', /Math\.random/],
      ['argless new Date()', /new Date\(\s*\)/],
      ['process.env', /process\.env/],
      ['Date.now', /Date\.now/],
    ];
    const violations: string[] = [];
    for (const file of GUARDED_FILES) {
      const raw = fs.readFileSync(path.join(reservesDir, file), 'utf8');
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
