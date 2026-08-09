#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const CODE = 'canary-exclusion';

// Keep this list aligned with docs/3-code-review/canary-exclusion-worklist.md.
// These are the governed reporting/export query sites, not fund-scoped detail
// routes where an authorized canary principal must retain visibility.
export const GOVERNED_REPORTING_FILES = Object.freeze([
  'server/routes/funds.ts',
  'server/routes/lp-capital-calls.ts',
  'server/routes/lp-distributions.ts',
  'server/routes/lp-documents.ts',
  'server/services/internal-analysis/analysis-checkpoint-service.ts',
  'server/services/lp-calculator.ts',
  'server/services/lp-queries.ts',
  'server/services/pdf-generation/data-fetchers.ts',
  'server/services/time-travel-analytics.ts',
  'server/routes/lp-api.ts',
  'server/storage.ts',
]);

const FUND_OR_ROLLUP_QUERY_PATTERN =
  /\bfunds\b|\b(?:lpCapitalCalls|lpDistributionDetails|lpDocuments|lpFundCommitments|fundEvents)\b/;
const EXCLUSION_IMPORT_PATTERN =
  /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]*canary-exclusion(?:\.[^'"]+)?['"]/m;
const EXCLUSION_USAGE_PATTERN = /\b(?:productionFundPredicate|productionFundSql|withProductionFundPredicate)\s*\(/;

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

export function analyzeSource({ filePath, source }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  if (!FUND_OR_ROLLUP_QUERY_PATTERN.test(source)) return [];
  if (EXCLUSION_IMPORT_PATTERN.test(source) && EXCLUSION_USAGE_PATTERN.test(source)) return [];

  return [
    {
      filePath: normalizedFilePath,
      line: lineNumberAt(source, 0),
      message:
        'governed reporting query references funds or rollup tables without importing the canary exclusion helper',
    },
  ];
}

export function analyzeFiles(files) {
  return files
    .flatMap(analyzeSource)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

export function runSelfTest() {
  const good = analyzeSource({
    filePath: 'server/routes/example.ts',
    source:
      "import { productionFundPredicate } from '../lib/canary-exclusion'; db.select().from(funds).where(productionFundPredicate());",
  });
  const bad = analyzeSource({
    filePath: 'server/routes/example.ts',
    source: 'db.select().from(funds).where(eq(funds.id, id));',
  });
  const commentOnly = analyzeSource({
    filePath: 'server/routes/example.ts',
    source: '// canary-exclusion is required here\ndb.select().from(funds);',
  });
  if (good.length !== 0 || bad.length !== 1 || commentOnly.length !== 1) {
    throw new Error(
      'self-test expected helper-protected query to pass and unprotected query to fail'
    );
  }
}

export function check({ root = process.cwd(), files = GOVERNED_REPORTING_FILES } = {}) {
  const missingFiles = files.filter((filePath) => !fs.existsSync(path.join(root, filePath)));
  const sourceFiles = files
    .filter((filePath) => !missingFiles.includes(filePath))
    .map((filePath) => ({
      filePath,
      source: fs.readFileSync(path.join(root, filePath), 'utf8'),
    }));

  return {
    missingFiles,
    violations: analyzeFiles(sourceFiles),
  };
}

export function runCli({ root = process.cwd() } = {}) {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    console.log(`[${CODE}] self-test pass`);
    return 0;
  }

  const result = check({ root });
  if (result.missingFiles.length === 0 && result.violations.length === 0) {
    console.log(`[${CODE}] pass: ${GOVERNED_REPORTING_FILES.length} governed files checked`);
    return 0;
  }

  console.error(`[${CODE}] failed: governed reporting files are missing canary exclusion coverage`);
  for (const filePath of result.missingFiles) console.error(`  - missing ${filePath}`);
  for (const violation of result.violations) {
    console.error(`  - ${violation.filePath}:${violation.line}`);
    console.error(`    ${violation.message}`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(`[${CODE}] failed:`, error);
    process.exitCode = 1;
  }
}
