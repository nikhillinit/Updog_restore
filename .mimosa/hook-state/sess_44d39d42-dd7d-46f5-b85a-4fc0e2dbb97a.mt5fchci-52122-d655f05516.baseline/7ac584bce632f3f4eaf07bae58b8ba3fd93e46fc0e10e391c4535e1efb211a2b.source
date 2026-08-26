/**
 * Ambient-state source guard for the constrained reserve substrate adapter
 * (Tranche 5, ADR-046).
 *
 * Same pattern as tests/unit/reserve-substrate/ambient-guard.test.ts and the
 * Tranche 4 guard: the adapter must receive every ambient capability through
 * its CalculationContext, never via Math.random, argless new Date(), Date.now,
 * or process.env. Only the adapter is scanned - there is no canonical-serializer
 * module this tranche (the engine is wrapped, not restated). The legacy
 * ConstrainedReserveEngine.ts is intentionally NOT scanned (it is clean anyway:
 * this is the first tranche whose adopted engine needed zero source edits).
 */

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const GUARDED_FILES = ['constrained-reserve-substrate-adapter.ts'];

describe('constrained reserve adapter ambient-state source guard', () => {
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
