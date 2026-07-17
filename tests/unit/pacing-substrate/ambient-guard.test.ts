/**
 * Ambient-state source guard for the pacing substrate adapter (ADR-043).
 *
 * Same pattern as tests/unit/calc-substrate/calculation-context.test.ts: the
 * adapter must receive every ambient capability through its
 * CalculationContext, never via Math.random, argless new Date(), Date.now,
 * or process.env. The legacy PacingEngine.ts is intentionally NOT scanned:
 * its process.env read is characterized legacy behavior, out of scope until
 * its own adoption tranche.
 */

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const GUARDED_FILES = ['pacing-substrate-adapter.ts'];

describe('pacing adapter ambient-state source guard', () => {
  it('the adapter never reaches for Math.random, argless new Date(), Date.now, or process.env', async () => {
    // The shared node-setup mocks fs.readFileSync; this guard needs the real one.
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const pacingDir = path.join(process.cwd(), 'shared', 'core', 'pacing');
    const ambientPatterns: [string, RegExp][] = [
      ['Math.random', /Math\.random/],
      ['argless new Date()', /new Date\(\s*\)/],
      ['process.env', /process\.env/],
      ['Date.now', /Date\.now/],
    ];
    const violations: string[] = [];
    for (const file of GUARDED_FILES) {
      const raw = fs.readFileSync(path.join(pacingDir, file), 'utf8');
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
