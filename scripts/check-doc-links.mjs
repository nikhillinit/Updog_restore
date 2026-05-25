#!/usr/bin/env node

/**
 * Check markdown links in documentation files.
 *
 * Default scan covers active docs + root governance files. Pass --analysis-only
 * to restrict to the original docs/analysis/** scope (legacy behavior).
 * Pass --report-only to print broken refs without exiting non-zero (useful for
 * baselining before a deletion PR cleans up stale references).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkMarkdownFiles,
  collectMarkdownFiles,
  formatBrokenLinkError,
} from './lib/doc-link-checker.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const analysisOnly = args.has('--analysis-only');
const reportOnly = args.has('--report-only');

const files = collectMarkdownFiles({ rootDir, analysisOnly });

console.log(
  `Checking links in ${files.length} markdown files${analysisOnly ? ' (analysis-only)' : ''}...`,
);

const result = checkMarkdownFiles({ files, rootDir });

if (result.brokenLinks === 0) {
  console.log(`\n[PASS] All ${result.totalLinks} links are valid`);
  process.exit(0);
}

console.error(
  `\n[FAIL] Found ${result.brokenLinks} broken links out of ${result.totalLinks} total:\n`,
);

for (const error of result.errors) {
  console.error(formatBrokenLinkError(error));
  console.error('');
}

if (reportOnly) {
  console.error(`[REPORT-ONLY] Exiting 0 despite ${result.brokenLinks} broken links.`);
  process.exit(0);
}

process.exit(1);
