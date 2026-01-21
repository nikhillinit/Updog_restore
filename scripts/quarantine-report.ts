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

async function generateReport(): Promise<void> {
  const testFiles = await glob('tests/**/*.test.{ts,tsx}', {
    ignore: ['**/node_modules/**'],
  });

  const quarantined: QuarantineEntry[] = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check for @quarantine tag or describe.skip
    if (content.includes('@quarantine') || content.includes('describe.skip')) {
      const parsed = parseQuarantineJSDoc(content);
      const relativePath = path.relative(process.cwd(), file);

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
  const report = generateMarkdownReport(quarantined);

  // Write to file
  const outputPath = 'tests/quarantine/REPORT.md';
  fs.writeFileSync(outputPath, report);

  console.log(`Quarantine report generated: ${outputPath}`);
  console.log(`Total quarantined tests: ${quarantined.length}`);
  console.log(`Documented: ${quarantined.filter((q) => q.owner !== 'Unknown').length}`);
  console.log(`Undocumented: ${quarantined.filter((q) => q.owner === 'Unknown').length}`);
}

function generateMarkdownReport(entries: QuarantineEntry[]): string {
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
- [ ] Add documentation to undocumented quarantines
- [ ] Remove tests that meet exit criteria

## Protocol Reference

See [PROTOCOL.md](./PROTOCOL.md) for quarantine requirements and review process.
`;

  return report;
}

generateReport().catch(console.error);
