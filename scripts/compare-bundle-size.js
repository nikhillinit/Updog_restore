#!/usr/bin/env node

/**
 * Compare bundle sizes between base and current branches
 *
 * Usage: node scripts/compare-bundle-size.js
 *
 * Reads:
 *   - size-limit-base.json (baseline from base branch)
 *   - size-limit-current.json (current build results)
 *
 * Outputs:
 *   - bundle-size-diff.json (detailed comparison)
 *   - Console summary
 *
 * Exit codes:
 *   0: All limits passed
 *   1: One or more limits exceeded
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const BYTES_PER_KB = 1024;

/**
 * Parse size value to bytes
 * Handles both string format ("150 KB") and numeric bytes from size-limit
 * @param {string|number|null|undefined} value - size value
 * @returns {number|null} Size in bytes, or null if not provided
 */
function parseSize(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') {
    throw new Error(`Invalid size format: ${value}`);
  }

  const match = value.trim().match(/^([\d.]+)\s*(KB|MB|B)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${value}`);
  }

  const [, numStr, unit] = match;
  const numValue = parseFloat(numStr);

  switch (unit.toUpperCase()) {
    case 'B':
      return numValue;
    case 'KB':
      return numValue * BYTES_PER_KB;
    case 'MB':
      return numValue * BYTES_PER_KB * BYTES_PER_KB;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < BYTES_PER_KB) {
    return `${bytes.toFixed(0)} B`;
  } else if (bytes < BYTES_PER_KB * BYTES_PER_KB) {
    return `${(bytes / BYTES_PER_KB).toFixed(2)} KB`;
  } else {
    return `${(bytes / BYTES_PER_KB / BYTES_PER_KB).toFixed(2)} MB`;
  }
}

/**
 * Calculate percentage difference
 * @param {number} current
 * @param {number} base
 * @returns {number}
 */
function percentDiff(current, base) {
  if (base === 0) return current > 0 ? 100 : 0;
  return ((current - base) / base) * 100;
}

/**
 * Main comparison function
 */
function compareResults() {
  const baseFile = join(rootDir, 'size-limit-base.json');
  const currentFile = join(rootDir, 'size-limit-current.json');
  const outputFile = join(rootDir, 'bundle-size-diff.json');

  // Check if files exist
  if (!existsSync(currentFile)) {
    console.error('❌ Error: size-limit-current.json not found');
    console.error('   Run: npm run size-limit:check');
    process.exit(1);
  }

  const hasBase = existsSync(baseFile);
  if (!hasBase) {
    console.warn('⚠️  Warning: size-limit-base.json not found');
    console.warn('   This is expected for the first run or PRs without base comparison');
  }

  // Read current results
  let current;
  try {
    current = JSON.parse(readFileSync(currentFile, 'utf-8'));
  } catch (error) {
    console.error('❌ Error reading size-limit-current.json:', error.message);
    process.exit(1);
  }

  // Read base results (if available)
  let base = null;
  if (hasBase) {
    try {
      base = JSON.parse(readFileSync(baseFile, 'utf-8'));
    } catch (error) {
      console.warn('⚠️  Warning: Could not parse size-limit-base.json:', error.message);
    }
  }

  // Prepare comparison results
  const comparison = {
    timestamp: new Date().toISOString(),
    hasBase,
    results: [],
    summary: {
      total: current.length,
      passed: 0,
      failed: 0,
      improved: 0,
      regressed: 0
    }
  };

  let allPassed = true;

  console.log('\n📊 Bundle Size Comparison\n');
  console.log('─'.repeat(80));

  // Compare each entry
  for (const currentEntry of current) {
    const baseEntry = base?.find(b => b.name === currentEntry.name);

    // size-limit outputs sizeLimit (bytes) not limit (string)
    const limitBytes = parseSize(currentEntry.sizeLimit ?? currentEntry.limit);
    const currentBytes = currentEntry.size;
    const baseBytes = baseEntry?.size || null;

    // Treat missing passed field as non-failure
    const passed = currentEntry.passed !== false;
    const diffFromBase = baseBytes !== null ? currentBytes - baseBytes : null;
    const diffPercent = baseBytes !== null ? percentDiff(currentBytes, baseBytes) : null;

    // Format limit for display - use sizeLimit if available, else config string
    const limitFormatted = typeof currentEntry.sizeLimit === 'number'
      ? formatSize(currentEntry.sizeLimit)
      : (currentEntry.limit ?? 'No limit');

    const result = {
      name: currentEntry.name,
      limit: limitBytes,
      limitFormatted,
      current: currentBytes,
      currentFormatted: formatSize(currentBytes),
      base: baseBytes,
      baseFormatted: baseBytes !== null ? formatSize(baseBytes) : null,
      diff: diffFromBase,
      diffFormatted: diffFromBase !== null ? formatSize(Math.abs(diffFromBase)) : null,
      diffPercent: diffPercent !== null ? diffPercent.toFixed(2) : null,
      passed,
      status: passed ? 'PASS' : 'FAIL'
    };

    comparison.results.push(result);

    // Update summary
    if (passed) {
      comparison.summary.passed++;
    } else {
      comparison.summary.failed++;
      allPassed = false;
    }

    if (diffFromBase !== null) {
      if (diffFromBase < 0) {
        comparison.summary.improved++;
      } else if (diffFromBase > 0) {
        comparison.summary.regressed++;
      }
    }

    // Console output
    const statusIcon = passed ? '✅' : '❌';
    const statusText = passed ? 'PASS' : 'FAIL';

    console.log(`${statusIcon} ${result.name}`);
    console.log(`   Limit:   ${result.limitFormatted}`);
    console.log(`   Current: ${result.currentFormatted} (${statusText})`);

    if (result.base !== null) {
      const diffIcon = diffFromBase < 0 ? '↓' : diffFromBase > 0 ? '↑' : '→';
      const diffColor = diffFromBase < 0 ? '' : diffFromBase > 0 ? '' : '';
      console.log(`   Base:    ${result.baseFormatted}`);
      console.log(`   Change:  ${diffIcon} ${result.diffFormatted} (${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%)`);
    }

    console.log('');
  }

  console.log('─'.repeat(80));
  console.log('\n📈 Summary\n');
  console.log(`   Total Checks:    ${comparison.summary.total}`);
  console.log(`   ✅ Passed:        ${comparison.summary.passed}`);
  console.log(`   ❌ Failed:        ${comparison.summary.failed}`);

  if (hasBase) {
    console.log(`   ↓ Improved:      ${comparison.summary.improved}`);
    console.log(`   ↑ Regressed:     ${comparison.summary.regressed}`);
  }

  console.log('');

  // Write comparison to file
  writeFileSync(outputFile, JSON.stringify(comparison, null, 2), 'utf-8');
  console.log(`📝 Detailed comparison written to: ${outputFile}\n`);

  // Exit with appropriate code
  if (!allPassed) {
    console.error('❌ Bundle size check FAILED - one or more limits exceeded\n');
    process.exit(1);
  } else {
    console.log('✅ Bundle size check PASSED - all limits satisfied\n');
    process.exit(0);
  }
}

// Run comparison
try {
  compareResults();
} catch (error) {
  console.error('❌ Unexpected error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
