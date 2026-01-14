#!/usr/bin/env node
/**
 * scripts/quarantine-report.mjs
 *
 * Scans test files for @quarantine tags and .skip() patterns.
 * Generates a markdown report of all quarantined tests.
 *
 * Usage:
 *   node scripts/quarantine-report.mjs
 *   npm run quarantine:report
 *
 * Outputs:
 *   - tests/quarantine/REPORT.md (auto-generated overview)
 *   - Console summary
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Patterns to detect quarantined tests
const QUARANTINE_TAG_PATTERN = /@quarantine\b/;
const SKIP_PATTERN = /\b(describe|test|it)\.skip\s*\(/g;
const METADATA_PATTERNS = {
  reason: /@reason\s+(.+?)(?:\n|$)/i,
  owner: /@owner\s+(.+?)(?:\n|$)/i,
  exit: /@exit\s+(.+?)(?:\n|$)/i,
  date: /@date\s+(.+?)(?:\n|$)/i,
};

/**
 * Extract quarantine metadata from file content
 */
function extractMetadata(content, filePath) {
  const metadata = {
    file: path.relative(ROOT, filePath),
    hasQuarantineTag: QUARANTINE_TAG_PATTERN.test(content),
    skipCount: (content.match(SKIP_PATTERN) || []).length,
    reason: null,
    owner: null,
    exit: null,
    date: null,
  };

  // Extract metadata from @quarantine block
  for (const [key, pattern] of Object.entries(METADATA_PATTERNS)) {
    const match = content.match(pattern);
    if (match) {
      metadata[key] = match[1].trim();
    }
  }

  return metadata;
}

/**
 * Categorize quarantine reason
 */
function categorizeReason(reason) {
  if (!reason) return 'undocumented';
  const lower = reason.toLowerCase();
  if (lower.includes('not implemented') || lower.includes('incomplete')) return 'not-implemented';
  if (lower.includes('redis') || lower.includes('infrastructure')) return 'infrastructure';
  if (lower.includes('flaky') || lower.includes('timing') || lower.includes('race')) return 'flaky';
  if (lower.includes('feature') || lower.includes('flag')) return 'feature-flag';
  if (lower.includes('database') || lower.includes('db')) return 'database';
  return 'other';
}

/**
 * Scan all test files for quarantine indicators
 */
async function scanTestFiles() {
  const testPatterns = [
    'tests/**/*.test.ts',
    'tests/**/*.test.tsx',
    'tests/**/*.spec.ts',
    'tests/**/*.spec.tsx',
    'client/src/**/*.test.ts',
    'client/src/**/*.test.tsx',
  ];

  const files = await glob(testPatterns, { cwd: ROOT, absolute: true });
  const results = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const metadata = extractMetadata(content, file);

      // Only include files with skips or quarantine tags
      if (metadata.skipCount > 0 || metadata.hasQuarantineTag) {
        results.push(metadata);
      }
    } catch (err) {
      console.error(`Error reading ${file}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Generate markdown report
 */
function generateReport(results) {
  const now = new Date().toISOString().split('T')[0];
  const totalSkips = results.reduce((sum, r) => sum + r.skipCount, 0);
  const documented = results.filter(r => r.hasQuarantineTag).length;
  const undocumented = results.length - documented;

  // Group by reason category
  const byReason = {};
  for (const r of results) {
    const category = categorizeReason(r.reason);
    byReason[category] = (byReason[category] || 0) + 1;
  }

  // Group by owner
  const byOwner = {};
  for (const r of results) {
    const owner = r.owner || 'unassigned';
    byOwner[owner] = (byOwner[owner] || 0) + 1;
  }

  // Sort results by skip count (highest first)
  const sorted = [...results].sort((a, b) => b.skipCount - a.skipCount);

  let md = `# Quarantine Report

> Auto-generated on ${now} - DO NOT EDIT MANUALLY
> Run \`npm run quarantine:report\` to regenerate

## Summary

| Metric | Count |
|--------|-------|
| Total files with skips | ${results.length} |
| Total skipped tests | ${totalSkips} |
| Documented (@quarantine) | ${documented} |
| Undocumented | ${undocumented} |

## By Reason Category

| Category | Files |
|----------|-------|
${Object.entries(byReason)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `| ${cat} | ${count} |`)
  .join('\n')}

## By Owner

| Owner | Files |
|-------|-------|
${Object.entries(byOwner)
  .sort((a, b) => b[1] - a[1])
  .map(([owner, count]) => `| ${owner} | ${count} |`)
  .join('\n')}

## Detailed File List

| File | Skips | Documented | Reason | Owner | Exit Criteria |
|------|-------|------------|--------|-------|---------------|
${sorted
  .map(
    r =>
      `| ${r.file} | ${r.skipCount} | ${r.hasQuarantineTag ? 'Yes' : 'No'} | ${r.reason || '-'} | ${r.owner || '-'} | ${r.exit || '-'} |`
  )
  .join('\n')}

## How to Document a Quarantined Test

Add a JSDoc comment above the skipped test:

\`\`\`typescript
/**
 * @quarantine
 * @reason Routes not implemented
 * @owner @username
 * @exit Implement POST /api/endpoint
 * @date ${now}
 */
describe.skip('Feature Name', () => {
  // tests...
});
\`\`\`

## How to Un-Quarantine

1. Fix the underlying issue (implement route, fix flakiness, etc.)
2. Remove the \`.skip\` from the test
3. Remove the \`@quarantine\` JSDoc block
4. Run \`npm run quarantine:report\` to update this report
5. Commit changes
`;

  return md;
}

/**
 * Main entry point
 */
async function main() {
  console.log('Scanning test files for quarantine indicators...\n');

  const results = await scanTestFiles();

  if (results.length === 0) {
    console.log('No quarantined tests found!');
    return;
  }

  // Generate report
  const report = generateReport(results);

  // Write to file
  const reportPath = path.join(ROOT, 'tests/quarantine/REPORT.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);

  // Console summary
  const totalSkips = results.reduce((sum, r) => sum + r.skipCount, 0);
  const documented = results.filter(r => r.hasQuarantineTag).length;

  console.log('='.repeat(50));
  console.log('QUARANTINE REPORT SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files with skips:    ${results.length}`);
  console.log(`Total skipped tests: ${totalSkips}`);
  console.log(`Documented:          ${documented}`);
  console.log(`Undocumented:        ${results.length - documented}`);
  console.log('='.repeat(50));
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
