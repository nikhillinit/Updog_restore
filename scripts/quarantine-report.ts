#!/usr/bin/env npx tsx
/**
 * Quarantine Report Generator
 *
 * Scans test files for @quarantine JSDoc tags and generates a markdown report
 * for monthly review of quarantined tests.
 *
 * Usage: npm run quarantine:report
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface QuarantineEntry {
  file: string;
  owner: string;
  reason: string;
  exitCriteria: string;
  addedDate: string;
  age: number;
}

interface QuarantinePolicy {
  staticSkipThreshold: number;
}

interface StaticSkipSummary {
  count: number;
  threshold: number;
  status: 'PASS' | 'FAIL';
}

const POLICY_PATH = 'tests/quarantine/policy.json';

function readPolicy(): QuarantinePolicy {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf-8')) as Partial<QuarantinePolicy>;

  if (
    !Number.isInteger(policy.staticSkipThreshold) ||
    policy.staticSkipThreshold === undefined ||
    policy.staticSkipThreshold < 1
  ) {
    throw new Error(`${POLICY_PATH} must define a positive integer staticSkipThreshold`);
  }

  return {
    staticSkipThreshold: policy.staticSkipThreshold,
  };
}

function parseQuarantineJSDoc(content: string): Partial<QuarantineEntry> | null {
  const quarantineMatch = content.match(/@quarantine/);
  if (!quarantineMatch) return null;

  const ownerMatch = content.match(/@owner\s+(.+?)(?:\n|\*)/);
  const reasonMatch = content.match(/@reason\s+(.+?)(?:\n|\*)/);
  const exitMatch = content.match(/@exitCriteria\s+(.+?)(?:\n|\*)/);
  const dateMatch = content.match(/@addedDate\s+(\d{4}-\d{2}-\d{2})/);

  return {
    owner: ownerMatch?.[1]?.trim() || 'Unknown',
    reason: reasonMatch?.[1]?.trim() || 'Not documented',
    exitCriteria: exitMatch?.[1]?.trim() || 'Not specified',
    addedDate: dateMatch?.[1] || 'Unknown',
  };
}

function calculateAge(dateStr: string): number {
  if (dateStr === 'Unknown') return -1;
  const added = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24));
}

async function summarizeStaticSkips(threshold: number): Promise<StaticSkipSummary> {
  const testFiles = await glob('tests/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**'],
  });

  const count = testFiles.filter((file) => {
    const content = fs.readFileSync(file, 'utf-8');
    return /describe\.skip\(/.test(content);
  }).length;

  return {
    count,
    threshold,
    status: count <= threshold ? 'PASS' : 'FAIL',
  };
}

async function generateReport(): Promise<void> {
  const policy = readPolicy();
  const staticSkipSummary = await summarizeStaticSkips(policy.staticSkipThreshold);
  const testFiles = await glob('tests/**/*.test.{ts,tsx}', {
    ignore: ['**/node_modules/**'],
  });

  const quarantined: QuarantineEntry[] = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check for @quarantine tag or describe.skip
    if (content.includes('@quarantine') || /describe\.skip\(/.test(content)) {
      const parsed = parseQuarantineJSDoc(content);
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');

      quarantined.push({
        file: relativePath,
        owner: parsed?.owner || 'Unknown',
        reason: parsed?.reason || 'Not documented (describe.skip without @quarantine)',
        exitCriteria: parsed?.exitCriteria || 'Not specified',
        addedDate: parsed?.addedDate || 'Unknown',
        age: calculateAge(parsed?.addedDate || 'Unknown'),
      });
    }
  }

  // Generate markdown report
  const report = generateMarkdownReport(quarantined, staticSkipSummary);

  // Write to file
  const outputPath = 'tests/quarantine/REPORT.md';
  fs.writeFileSync(outputPath, report);

  console.log(`Quarantine report generated: ${outputPath}`);
  console.log(`Total quarantined files: ${quarantined.length}`);
  console.log(
    `Static skips: ${staticSkipSummary.count}/${staticSkipSummary.threshold} (${staticSkipSummary.status})`
  );
  console.log(`Documented: ${quarantined.filter((q) => q.owner !== 'Unknown').length}`);
  console.log(`Undocumented: ${quarantined.filter((q) => q.owner === 'Unknown').length}`);
}

function generateMarkdownReport(
  entries: QuarantineEntry[],
  staticSkipSummary: StaticSkipSummary
): string {
  const now = new Date().toISOString().split('T')[0];
  const documented = entries.filter((e) => e.owner !== 'Unknown');
  const undocumented = entries.filter((e) => e.owner === 'Unknown');

  let report = `# Quarantine Report

Generated: ${now}

## Summary

| Metric | Count |
|--------|-------|
| Total Quarantined | ${entries.length} |
| Documented | ${documented.length} |
| Undocumented | ${undocumented.length} |
| Static describe.skip files | ${staticSkipSummary.count} |
| Static skip threshold | ${staticSkipSummary.threshold} |
| Static skip status | ${staticSkipSummary.status} |

This report tracks quarantined files, not the total number of skipped
assertions inside those files.

The static skip threshold is defined in \`tests/quarantine/policy.json\`.
The report generator and \`skip-counter.yml\` both read that same policy file.

## Documented Quarantines

| File | Owner | Reason | Exit Criteria | Age (days) |
|------|-------|--------|---------------|------------|
`;

  for (const entry of documented) {
    report += `| \`${entry.file}\` | ${entry.owner} | ${entry.reason} | ${entry.exitCriteria} | ${entry.age >= 0 ? entry.age : 'N/A'} |\n`;
  }

  if (undocumented.length > 0) {
    report += `
## Undocumented Quarantines (Action Required)

These tests use \`describe.skip\` but lack proper \`@quarantine\` documentation.

| File | Reason |
|------|--------|
`;

    for (const entry of undocumented) {
      report += `| \`${entry.file}\` | ${entry.reason} |\n`;
    }
  }

  report += `
## Review Checklist

- [ ] Review each quarantined test for exit criteria status
- [ ] Update owners if team members have changed
- [${undocumented.length === 0 ? 'x' : ' '}] Add documentation to undocumented quarantines
- [ ] Remove tests that meet exit criteria

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
`;

  return report;
}

generateReport().catch(console.error);
