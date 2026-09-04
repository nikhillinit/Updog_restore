import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_ROOT = path.resolve(process.cwd(), 'server');

const PAYLOAD_EVALUATION_READERS = new Set([
  'server/services/construction-reconciliation-service.ts',
  'server/services/current-forecast-v2-service.ts',
  'server/services/financial-facts-snapshot-service.ts',
  'server/services/internal-economics/lp-economics-run-service.ts',
  'server/services/reserves/dynamic-reserve-intelligence-service.ts',
]);

const EXEMPT_ID_ONLY_LOOKUPS = {
  'server/lib/fund-scoped-ownership.ts': 'Checks whether a snapshot ID belongs to the fund.',
  'server/services/current-forecast-shadow-trigger.ts':
    'Checks whether a snapshot ID exists for a snapshotInputHash.',
  'server/services/internal-analysis/analysis-checkpoint-service.ts':
    'Checks whether a snapshot ID exists for a snapshotInputHash.',
} as const;

// Plan item 8: every payload/evaluation reader that must adopt the Phase 2 codec,
// including readers that reach rows through getLatestFinancialFactsSnapshot rather
// than a direct table import. Phase 5 adds the latest-reference and metrics handlers.
const CODEC_REQUIRED_READERS = new Set([
  ...PAYLOAD_EVALUATION_READERS,
  'server/services/current-plan-version-service.ts',
  'server/routes/financial-facts.ts',
]);

const CODEC_MODULE = 'parse-persisted-facts-row';

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function importsFinancialFactsSnapshots(source: string): boolean {
  const importDeclarations = /^\s*import\b[\s\S]*?\bfrom\s*['"][^'"]+['"]/gm;
  return [...stripComments(source).matchAll(importDeclarations)].some((match) =>
    /\bfinancialFactsSnapshots\b/.test(match[0])
  );
}

const actualImporters = walk(SERVER_ROOT)
  .filter((absolutePath) => importsFinancialFactsSnapshots(fs.readFileSync(absolutePath, 'utf8')))
  .map((absolutePath) => path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/'))
  .sort();

const expectedImporters = [
  ...PAYLOAD_EVALUATION_READERS,
  ...Object.keys(EXEMPT_ID_ONLY_LOOKUPS),
].sort();

describe('financialFactsSnapshots importer inventory', () => {
  it('classifies every direct server importer as a payload reader or exempt ID lookup', () => {
    expect(actualImporters).toEqual(expectedImporters);
    expect(
      actualImporters.filter(
        (importer) =>
          !PAYLOAD_EVALUATION_READERS.has(importer) &&
          !Object.hasOwn(EXEMPT_ID_ONLY_LOOKUPS, importer)
      )
    ).toEqual([]);
  });

  it('keeps every codec-required reader on hand-rolled parsing until Phase 2', () => {
    for (const reader of CODEC_REQUIRED_READERS) {
      const source = stripComments(fs.readFileSync(path.resolve(process.cwd(), reader), 'utf8'));
      // TODO(Phase 2): flip to expect(...).toContain(CODEC_MODULE) once the codec exists.
      expect(source, reader).not.toContain(CODEC_MODULE);
    }
    expect(
      [...PAYLOAD_EVALUATION_READERS].every((reader) => CODEC_REQUIRED_READERS.has(reader))
    ).toBe(true);
  });

  it('keeps the exempt ID-only lookup reasons explicit', () => {
    expect(EXEMPT_ID_ONLY_LOOKUPS).toEqual({
      'server/lib/fund-scoped-ownership.ts': 'Checks whether a snapshot ID belongs to the fund.',
      'server/services/current-forecast-shadow-trigger.ts':
        'Checks whether a snapshot ID exists for a snapshotInputHash.',
      'server/services/internal-analysis/analysis-checkpoint-service.ts':
        'Checks whether a snapshot ID exists for a snapshotInputHash.',
    });
  });
});
