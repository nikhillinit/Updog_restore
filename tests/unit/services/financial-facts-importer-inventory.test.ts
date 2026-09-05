import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_ROOT = path.resolve(process.cwd(), 'server');

const PAYLOAD_EVALUATION_READERS = new Set([
  'server/services/construction-reconciliation-service.ts',
  'server/services/current-forecast-v2-service.ts',
  'server/services/internal-economics/lp-economics-run-service.ts',
  'server/services/reserves/dynamic-reserve-intelligence-service.ts',
]);

const DIRECT_FACTS_WRITERS = new Set(['server/services/financial-facts-snapshot-service.ts']);

const EXEMPT_ID_ONLY_LOOKUPS = {
  'server/lib/fund-scoped-ownership.ts': 'Checks whether a snapshot ID belongs to the fund.',
  'server/services/current-forecast-shadow-trigger.ts':
    'Checks whether a snapshot ID exists for a snapshotInputHash.',
  'server/services/internal-analysis/analysis-checkpoint-service.ts':
    'Checks whether a snapshot ID exists for a snapshotInputHash.',
  'server/services/metrics-aggregator.ts':
    'Reads only snapshot id and snapshot_input_hash to fingerprint the metrics cache.',
  'server/services/financial-facts/terminal-head.ts':
    'Resolves the terminal snapshot using fund-scoped lineage metadata.',
} as const;

// Plan item 8: every payload/evaluation reader that must adopt the Phase 2 codec,
// including readers that reach rows through getLatestFinancialFactsSnapshot rather
// than a direct table import. Phase 5 adds the latest-reference and metrics handlers.
const CODEC_REQUIRED_READERS = new Set([
  ...PAYLOAD_EVALUATION_READERS,
  'server/routes/lp-reporting/imports.ts',
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

function referencesFinancialFactsSnapshots(source: string): boolean {
  // Identifier scan (not import parsing) so namespace access such as
  // `schema.financialFactsSnapshots` is inventoried too.
  return /\bfinancialFactsSnapshots\b/.test(stripComments(source));
}

function writesAcceptedPilotRowOrMark(source: string): boolean {
  const uncommented = stripComments(source);
  return (
    uncommented.includes('actuals_pilot_v1') &&
    /(?:\bINSERT\s+INTO\s+(?:cash_flow_events|valuation_marks)\b|\.insert\(\s*(?:cashFlowEvents|valuationMarks)\s*\))/i.test(
      uncommented
    )
  );
}

type ServerSource = { relativePath: string; source: string };

function acceptedPilotRowMarkWriters(sources: readonly ServerSource[]): string[] {
  return sources
    .filter(({ source }) => writesAcceptedPilotRowOrMark(source))
    .map(({ relativePath }) => relativePath)
    .sort();
}

const PILOT_PUBLISHER = 'server/services/lp-reporting/actuals-pilot-publish-service.ts';
const serverSources = walk(SERVER_ROOT).map((absolutePath) => ({
  relativePath: path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/'),
  source: fs.readFileSync(absolutePath, 'utf8'),
}));

const actualImporters = serverSources
  .filter(({ source }) => referencesFinancialFactsSnapshots(source))
  .map(({ relativePath }) => relativePath)
  .sort();

const expectedImporters = [
  ...PAYLOAD_EVALUATION_READERS,
  ...DIRECT_FACTS_WRITERS,
  ...Object.keys(EXEMPT_ID_ONLY_LOOKUPS),
].sort();

describe('financialFactsSnapshots importer inventory', () => {
  it('classifies every direct server importer as a payload reader or exempt ID lookup', () => {
    expect(actualImporters).toEqual(expectedImporters);
  });

  it('requires every codec-required reader to import the shared codec', () => {
    for (const reader of CODEC_REQUIRED_READERS) {
      const source = stripComments(fs.readFileSync(path.resolve(process.cwd(), reader), 'utf8'));
      expect(source, reader).toContain(CODEC_MODULE);
    }
  });

  it('allows only the publisher to insert accepted pilot rows and marks', () => {
    const unauthorizedWriter = {
      relativePath: 'server/services/unauthorized-pilot-writer.ts',
      source: `INSERT INTO cash_flow_events (status, imported_from)
        VALUES ('approved', 'actuals_pilot_v1')`,
    };

    expect(acceptedPilotRowMarkWriters(serverSources)).toEqual([PILOT_PUBLISHER]);
    expect(acceptedPilotRowMarkWriters([unauthorizedWriter])).toEqual([
      unauthorizedWriter.relativePath,
    ]);
  });
});
