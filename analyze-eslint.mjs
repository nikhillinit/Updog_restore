#!/usr/bin/env node
/**
 * ESLint Results Analyzer
 *
 * Analyzes eslint-results.json to provide detailed breakdown of errors and warnings
 * by rule, severity, and file location.
 */

import { readFileSync } from 'fs';

const results = JSON.parse(readFileSync('eslint-results.json', 'utf-8'));

const stats = {
  totalFiles: 0,
  totalErrors: 0,
  totalWarnings: 0,
  byRule: {},
  bySeverity: { error: 0, warning: 0 },
  byDirectory: {},
};

// Process each file
for (const file of results) {
  if (file.messages.length === 0) continue;

  stats.totalFiles++;

  // Extract directory
  const filePath = file.filePath.replace(/\\/g, '/');
  const match = filePath.match(/Updog_restore\/([^\/]+)\//);
  const dir = match ? match[1] : 'root';

  if (!stats.byDirectory[dir]) {
    stats.byDirectory[dir] = { errors: 0, warnings: 0, files: 0 };
  }
  stats.byDirectory[dir].files++;

  // Process each message
  for (const msg of file.messages) {
    const severity = msg.severity === 2 ? 'error' : 'warning';
    const ruleId = msg.ruleId || 'unknown';

    // Count by severity
    stats.bySeverity[severity]++;
    if (severity === 'error') {
      stats.totalErrors++;
      stats.byDirectory[dir].errors++;
    } else {
      stats.totalWarnings++;
      stats.byDirectory[dir].warnings++;
    }

    // Count by rule
    if (!stats.byRule[ruleId]) {
      stats.byRule[ruleId] = { errors: 0, warnings: 0, total: 0 };
    }
    stats.byRule[ruleId][severity]++;
    stats.byRule[ruleId].total++;
  }
}

// Sort rules by total count
const sortedRules = Object.entries(stats.byRule)
  .sort(([, a], [, b]) => b.total - a.total);

// Sort directories by error count
const sortedDirs = Object.entries(stats.byDirectory)
  .sort(([, a], [, b]) => b.errors - a.errors);

// Print summary
console.log('='.repeat(80));
console.log('ESLint Results Analysis');
console.log('='.repeat(80));
console.log();
console.log('OVERALL SUMMARY:');
console.log(`  Files with issues: ${stats.totalFiles}`);
console.log(`  Total errors:      ${stats.totalErrors}`);
console.log(`  Total warnings:    ${stats.totalWarnings}`);
console.log(`  Total problems:    ${stats.totalErrors + stats.totalWarnings}`);
console.log();

console.log('='.repeat(80));
console.log('TOP 20 RULES BY PROBLEM COUNT:');
console.log('='.repeat(80));
console.log();
console.log('Rule ID'.padEnd(50) + 'Errors'.padStart(8) + 'Warnings'.padStart(10) + 'Total'.padStart(8));
console.log('-'.repeat(80));

for (const [ruleId, counts] of sortedRules.slice(0, 20)) {
  console.log(
    ruleId.padEnd(50) +
    counts.errors.toString().padStart(8) +
    counts.warnings.toString().padStart(10) +
    counts.total.toString().padStart(8)
  );
}

console.log();
console.log('='.repeat(80));
console.log('PROBLEMS BY DIRECTORY:');
console.log('='.repeat(80));
console.log();
console.log('Directory'.padEnd(30) + 'Files'.padStart(8) + 'Errors'.padStart(10) + 'Warnings'.padStart(12));
console.log('-'.repeat(80));

for (const [dir, counts] of sortedDirs) {
  console.log(
    dir.padEnd(30) +
    counts.files.toString().padStart(8) +
    counts.errors.toString().padStart(10) +
    counts.warnings.toString().padStart(12)
  );
}

console.log();
console.log('='.repeat(80));
console.log('ERROR-ONLY RULES (for immediate fixing):');
console.log('='.repeat(80));
console.log();

const errorRules = sortedRules.filter(([, counts]) => counts.errors > 0);
console.log('Rule ID'.padEnd(50) + 'Count'.padStart(8));
console.log('-'.repeat(80));

for (const [ruleId, counts] of errorRules) {
  console.log(ruleId.padEnd(50) + counts.errors.toString().padStart(8));
}

console.log();
console.log('='.repeat(80));
console.log('EXPLICIT ANY VIOLATIONS (Phase 2 target):');
console.log('='.repeat(80));
console.log();

const anyRule = stats.byRule['@typescript-eslint/no-explicit-any'];
if (anyRule) {
  console.log(`  Total violations: ${anyRule.total}`);
  console.log(`  Errors:          ${anyRule.errors}`);
  console.log(`  Warnings:        ${anyRule.warnings}`);

  // Find files with most no-explicit-any violations
  const filesByAny = {};
  for (const file of results) {
    const anyCount = file.messages.filter(m => m.ruleId === '@typescript-eslint/no-explicit-any').length;
    if (anyCount > 0) {
      const filePath = file.filePath.replace(/\\/g, '/');
      const shortPath = filePath.split('Updog_restore/')[1] || filePath;
      filesByAny[shortPath] = anyCount;
    }
  }

  const sortedFiles = Object.entries(filesByAny)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  console.log();
  console.log('  Top 15 files with no-explicit-any:');
  console.log('  ' + '-'.repeat(70));
  for (const [file, count] of sortedFiles) {
    console.log(`    ${count.toString().padStart(3)}  ${file}`);
  }
} else {
  console.log('  No no-explicit-any violations found!');
}

console.log();
console.log('='.repeat(80));
