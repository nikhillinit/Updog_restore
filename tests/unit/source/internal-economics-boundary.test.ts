/**
 * D4 boundary guard: internal-economics lane source-level constraints.
 *
 * Reads .ts files from shared/lib/internal-economics/ and
 * shared/contracts/internal-economics/ and asserts forbidden patterns
 * are absent. No engine code is executed.
 *
 * Rules enforced:
 *  1. No WaterfallTypeSchema import
 *  2. No import from shared/contracts/economics-v1.contract.ts
 *  3. No Date.now / new Date() / Math.random (purity)
 *  4. No direct american-ledger import except through D3 (ledger-allocation-v1.ts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LIB_DIR = 'shared/lib/internal-economics';
const CONTRACTS_DIR = 'shared/contracts/internal-economics';

const readDir = (relDir: string): Array<{ name: string; source: string }> => {
  const abs = path.resolve(process.cwd(), relDir);
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.ts'))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(abs, name), 'utf8'),
    }));
};

const allFiles = [...readDir(LIB_DIR), ...readDir(CONTRACTS_DIR)];

describe('internal-economics boundary (D4)', () => {
  it('no file imports WaterfallTypeSchema', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} imports WaterfallTypeSchema`).not.toMatch(/WaterfallTypeSchema/);
    }
  });

  it('no file imports from shared/contracts/economics-v1.contract', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} imports from legacy economics-v1.contract`).not.toMatch(
        /economics-v1\.contract/
      );
    }
  });

  it('no file uses Date.now, new Date(), or Math.random (purity)', () => {
    for (const { name, source } of allFiles) {
      expect(source, `${name} contains Date.now`).not.toMatch(/\bDate\.now\b/);
      expect(source, `${name} contains new Date()`).not.toMatch(/\bnew\s+Date\s*\(/);
      expect(source, `${name} contains Math.random`).not.toMatch(/\bMath\.random\b/);
    }
  });

  it('no lib file imports american-ledger except ledger-allocation-v1.ts', () => {
    const libFiles = readDir(LIB_DIR).filter((f) => f.name !== 'ledger-allocation-v1.ts');
    for (const { name, source } of libFiles) {
      expect(source, `${name} imports american-ledger directly (must go through D3)`).not.toMatch(
        /american-ledger/
      );
    }
  });
});
