#!/usr/bin/env node
/**
 * scripts/test-ratchet-check.js (v7.3)
 *
 * Cross-platform test ratchet enforcement using NORMALIZED test-summary.json.
 * Replaces bash+jq implementation for Windows/Linux/macOS compatibility.
 *
 * Features:
 * - Reads ONLY from normalized test-summary.json (never raw)
 * - Separate governance: maxFailedTests, maxSkippedTests, maxSuiteFailures
 * - NEW: minTotalTests governance (prevents test deletion gaming)
 * - Split --init (first time) vs --update (downward only)
 * - Schema invariant validation
 * - Detailed delta report on failure
 *
 * Usage:
 *   node scripts/test-ratchet-check.js              # Check against baseline
 *   node scripts/test-ratchet-check.js --init       # Initialize baseline (first time only)
 *   node scripts/test-ratchet-check.js --force-init # Force overwrite baseline (dangerous)
 *   node scripts/test-ratchet-check.js --update     # Lock in improvements (downward only)
 *
 * Exit codes:
 *   0 - All ratchets pass (or init/update succeeded)
 *   1 - Ratchet violation (regression detected)
 *   2 - Setup error (missing files, invalid schema)
 *   3 - Governance error (tried to ratchet upward or decrease total)
 */

const fs = require('fs');
const path = require('path');

// File paths
const BASELINE_FILE = '.test-baseline.json';
const SUMMARY_FILE = path.join('artifacts', 'test-summary.json');
const CLUSTER_FILE = path.join('artifacts', 'cluster-analysis.json');
const STDERR_FILE = path.join('artifacts', 'test-run.stderr.txt');
const MIN_FILE_SIZE = 100;

// Parse command line
const args = process.argv.slice(2);
const mode = args[0] || 'check';

console.log('============================================================');
console.log('TEST RATCHET CHECK (v7.3 - Node)');
console.log('============================================================');

/**
 * Read and validate test-summary.json
 * Returns normalized data or exits with error
 */
function readSummary() {
  if (!fs.existsSync(SUMMARY_FILE)) {
    console.error(`ERROR: Summary file not found: ${SUMMARY_FILE}`);
    console.error('');
    console.error('Run the full pipeline first:');
    console.error('  npm run baseline:test:check');
    process.exit(2);
  }

  const stats = fs.statSync(SUMMARY_FILE);
  if (stats.size < MIN_FILE_SIZE) {
    console.error(`ERROR: Summary file too small (${stats.size} bytes)`);
    console.error('This usually means test run failed before producing output.');
    if (fs.existsSync(STDERR_FILE)) {
      console.error('');
      console.error(`Last lines from ${STDERR_FILE}:`);
      const stderr = fs.readFileSync(STDERR_FILE, 'utf8');
      console.error(stderr.split('\n').slice(-20).join('\n'));
    }
    process.exit(2);
  }

  try {
    const data = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));

    // Validate required fields
    const required = ['counts', 'burnDown', 'gate'];
    for (const field of required) {
      if (!data[field]) {
        console.error(`ERROR: Summary missing required field: ${field}`);
        process.exit(2);
      }
    }

    // Validate counts sub-fields
    const countFields = ['total', 'passed', 'failed', 'skipped'];
    for (const field of countFields) {
      if (typeof data.counts[field] !== 'number') {
        console.error(`ERROR: Summary missing counts.${field}`);
        process.exit(2);
      }
    }

    // Validate invariant: passed + failed + skipped === total
    const sum = data.counts.passed + data.counts.failed + data.counts.skipped;
    if (sum !== data.counts.total) {
      console.error(`ERROR: Invariant violation: passed(${data.counts.passed}) + failed(${data.counts.failed}) + skipped(${data.counts.skipped}) = ${sum} !== total(${data.counts.total})`);
      process.exit(2);
    }

    return data;
  } catch (err) {
    console.error(`ERROR: Failed to parse summary: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Read baseline file
 * Returns null if not found (for --init check)
 */
function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch (err) {
    console.error(`ERROR: Failed to parse baseline: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Create baseline JSON from summary
 */
function createBaseline(summary) {
  return {
    version: '7.3',
    created: summary.meta?.timestamp || new Date().toISOString(),
    policy: {
      maxFailedTests: summary.counts.failed,
      maxSkippedTests: summary.counts.skipped,
      maxSuiteFailures: summary.gate.suiteFailures,
      minTotalTests: summary.counts.total
    },
    note: 'Ratchets can only decrease (except minTotalTests which can only increase). Use --update to lock in improvements.'
  };
}

/**
 * Read cluster analysis for failure details
 */
function readClusters() {
  if (!fs.existsSync(CLUSTER_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(CLUSTER_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Print formatted delta report
 */
function printDeltaReport(baseline, current) {
  const policy = baseline.policy;

  console.log('');
  console.log('DELTA REPORT:');
  console.log('  Baseline vs Current:');
  console.log('  ' + '-'.repeat(55));
  console.log(`  ${'Metric'.padEnd(20)} ${'Baseline'.padStart(10)} ${'Current'.padStart(10)} ${'Delta'.padStart(10)}`);
  console.log('  ' + '-'.repeat(55));

  const metrics = [
    ['Failed Tests', policy.maxFailedTests, current.counts.failed],
    ['Skipped Tests', policy.maxSkippedTests, current.counts.skipped],
    ['Suite Failures', policy.maxSuiteFailures, current.gate.suiteFailures],
    ['Total Tests', policy.minTotalTests, current.counts.total]
  ];

  for (const [name, base, curr] of metrics) {
    const delta = curr - base;
    const sign = delta > 0 ? '+' : '';
    console.log(`  ${name.padEnd(20)} ${String(base).padStart(10)} ${String(curr).padStart(10)} ${(sign + delta).padStart(10)}`);
  }

  console.log('  ' + '-'.repeat(55));

  const baseNonPassing = policy.maxFailedTests + policy.maxSkippedTests;
  const currNonPassing = current.counts.failed + current.counts.skipped;
  const npDelta = currNonPassing - baseNonPassing;
  const npSign = npDelta > 0 ? '+' : '';
  console.log(`  ${'NonPassingTests'.padEnd(20)} ${String(baseNonPassing).padStart(10)} ${String(currNonPassing).padStart(10)} ${(npSign + npDelta).padStart(10)}`);
}

/**
 * Print cluster analysis details
 */
function printClusterDetails(clusters) {
  if (!clusters) return;

  console.log('');
  console.log('TOP FAILING DIRECTORIES:');
  const failDirs = Object.entries(clusters.clusters?.failing || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (failDirs.length === 0) {
    console.log('  (none)');
  } else {
    for (const [dir, count] of failDirs) {
      console.log(`  ${count} failures in ${dir}`);
    }
  }

  console.log('');
  console.log('CASCADE PATTERNS:');
  const cascades = clusters.cascades || {};
  if (cascades.alias?.count > 0) console.log(`  Alias resolution: ${cascades.alias.count}`);
  if (cascades.redis?.count > 0) console.log(`  Redis/connection: ${cascades.redis.count}`);
  if (cascades.timeout?.count > 0) console.log(`  Timeout errors: ${cascades.timeout.count}`);
  if (cascades.hardcodedConstants?.count > 0) console.log(`  Hardcoded constants: ${cascades.hardcodedConstants.count}`);
}

// ==================== MODE HANDLERS ====================

if (mode === '--init') {
  const summary = readSummary();
  const existing = readBaseline();

  if (existing) {
    console.error(`ERROR: Baseline already exists at ${BASELINE_FILE}`);
    console.error('');
    console.error('To lock in improvements, use:');
    console.error('  npm run baseline:test:update');
    console.error('');
    console.error('To force overwrite (DANGEROUS), use:');
    console.error('  node scripts/test-ratchet-check.js --force-init');
    process.exit(3);
  }

  const baseline = createBaseline(summary);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));

  console.log('');
  console.log(`Created ${BASELINE_FILE}:`);
  console.log(JSON.stringify(baseline, null, 2));
  console.log('');
  console.log('Commit this file to lock in the ratchet.');
  process.exit(0);
}

if (mode === '--force-init') {
  const summary = readSummary();
  const existing = readBaseline();

  console.log('');
  console.log('WARNING: Force-initializing baseline. This can normalize regressions!');

  if (existing) {
    console.log('');
    console.log('Previous baseline:');
    console.log(JSON.stringify(existing, null, 2));
  }

  const baseline = createBaseline(summary);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));

  console.log('');
  console.log('New baseline:');
  console.log(JSON.stringify(baseline, null, 2));
  console.log('');
  console.log('CAUTION: Review carefully before committing.');
  process.exit(0);
}

if (mode === '--update') {
  const summary = readSummary();
  const baseline = readBaseline();

  if (!baseline) {
    console.error(`ERROR: No baseline to update. Use --init first.`);
    process.exit(2);
  }

  const policy = baseline.policy;

  // GOVERNANCE: Refuse any upward movement (except total which must not decrease)
  const violations = [];

  if (summary.counts.failed > policy.maxFailedTests) {
    violations.push(`Failed tests increased (${summary.counts.failed} > ${policy.maxFailedTests})`);
  }
  if (summary.counts.skipped > policy.maxSkippedTests) {
    violations.push(`Skipped tests increased (${summary.counts.skipped} > ${policy.maxSkippedTests})`);
  }
  if (summary.gate.suiteFailures > policy.maxSuiteFailures) {
    violations.push(`Suite failures increased (${summary.gate.suiteFailures} > ${policy.maxSuiteFailures})`);
  }
  if (summary.counts.total < policy.minTotalTests) {
    violations.push(`Total tests decreased (${summary.counts.total} < ${policy.minTotalTests}) - tests may have been deleted`);
  }

  if (violations.length > 0) {
    console.error('');
    console.error('ERROR: Cannot update baseline - governance violations:');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    console.error('');
    console.error('Ratchets can only improve. Fix the regressions first.');
    process.exit(3);
  }

  // Check if anything improved
  const improved =
    summary.counts.failed < policy.maxFailedTests ||
    summary.counts.skipped < policy.maxSkippedTests ||
    summary.gate.suiteFailures < policy.maxSuiteFailures ||
    summary.counts.total > policy.minTotalTests;

  if (!improved) {
    console.log('');
    console.log('No improvements to lock in. Baseline unchanged.');
    process.exit(0);
  }

  // Show delta
  console.log('');
  console.log('BASELINE UPDATE (locking in improvements):');
  console.log('');
  console.log(`  maxFailedTests:    ${policy.maxFailedTests} -> ${summary.counts.failed} (delta: ${summary.counts.failed - policy.maxFailedTests})`);
  console.log(`  maxSkippedTests:   ${policy.maxSkippedTests} -> ${summary.counts.skipped} (delta: ${summary.counts.skipped - policy.maxSkippedTests})`);
  console.log(`  maxSuiteFailures:  ${policy.maxSuiteFailures} -> ${summary.gate.suiteFailures} (delta: ${summary.gate.suiteFailures - policy.maxSuiteFailures})`);
  console.log(`  minTotalTests:     ${policy.minTotalTests} -> ${summary.counts.total} (delta: +${summary.counts.total - policy.minTotalTests})`);

  const newBaseline = createBaseline(summary);
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(newBaseline, null, 2));

  console.log('');
  console.log(`Updated ${BASELINE_FILE}`);
  console.log('Commit this file to lock in the improvements.');
  process.exit(0);
}

// Default: CHECK mode
const summary = readSummary();
const baseline = readBaseline();

if (!baseline) {
  console.error(`ERROR: Baseline file not found: ${BASELINE_FILE}`);
  console.error('');
  console.error('Initialize baseline with:');
  console.error('  npm run baseline:test:init');
  process.exit(2);
}

const policy = baseline.policy;

console.log('');
console.log(`BASELINE RATCHETS (from ${BASELINE_FILE}):`);
console.log(`  maxFailedTests:      ${policy.maxFailedTests}`);
console.log(`  maxSkippedTests:     ${policy.maxSkippedTests}`);
console.log(`  maxSuiteFailures:    ${policy.maxSuiteFailures}`);
console.log(`  minTotalTests:       ${policy.minTotalTests}`);
console.log('  ' + '-'.repeat(30));
console.log(`  maxNonPassingTests:  ${policy.maxFailedTests + policy.maxSkippedTests} (derived)`);

console.log('');
console.log(`CURRENT VALUES (from ${SUMMARY_FILE}):`);
console.log(`  totalTests:          ${summary.counts.total}`);
console.log(`  passedTests:         ${summary.counts.passed}`);
console.log(`  failedTests:         ${summary.counts.failed}`);
console.log(`  skippedTests:        ${summary.counts.skipped}`);
console.log(`  suiteFailures:       ${summary.gate.suiteFailures}`);
console.log('  ' + '-'.repeat(30));
console.log(`  NonPassingTests:     ${summary.counts.failed + summary.counts.skipped} (burn-down metric)`);
console.log(`  passRate:            ${summary.burnDown.passRate}%`);

console.log('');

// Check ratchets
const violations = [];
const improvements = { failed: 0, skipped: 0, suite: 0, total: 0 };

// Failed tests
if (summary.counts.failed > policy.maxFailedTests) {
  const regression = summary.counts.failed - policy.maxFailedTests;
  console.log(`[FAIL] Failed tests increased: ${summary.counts.failed} > ${policy.maxFailedTests}`);
  console.log(`       Regression: +${regression} new failures`);
  violations.push('failed');
} else {
  improvements.failed = policy.maxFailedTests - summary.counts.failed;
  if (improvements.failed > 0) {
    console.log(`[PASS] Failed tests: ${summary.counts.failed} <= ${policy.maxFailedTests} (improved by ${improvements.failed})`);
  } else {
    console.log(`[PASS] Failed tests: ${summary.counts.failed} <= ${policy.maxFailedTests}`);
  }
}

// Skipped tests
if (summary.counts.skipped > policy.maxSkippedTests) {
  const regression = summary.counts.skipped - policy.maxSkippedTests;
  console.log(`[FAIL] Skipped tests increased: ${summary.counts.skipped} > ${policy.maxSkippedTests}`);
  console.log(`       Regression: +${regression} new skips`);
  violations.push('skipped');
} else {
  improvements.skipped = policy.maxSkippedTests - summary.counts.skipped;
  if (improvements.skipped > 0) {
    console.log(`[PASS] Skipped tests: ${summary.counts.skipped} <= ${policy.maxSkippedTests} (improved by ${improvements.skipped})`);
  } else {
    console.log(`[PASS] Skipped tests: ${summary.counts.skipped} <= ${policy.maxSkippedTests}`);
  }
}

// Suite failures (gate metric)
console.log('');
console.log('GATE METRIC (suite failures must trend to zero):');
if (summary.gate.suiteFailures > policy.maxSuiteFailures) {
  const regression = summary.gate.suiteFailures - policy.maxSuiteFailures;
  console.log(`[FAIL] Suite failures increased: ${summary.gate.suiteFailures} > ${policy.maxSuiteFailures}`);
  console.log(`       Regression: +${regression} new suite failures`);
  violations.push('suiteFailures');
} else if (summary.gate.suiteFailures === 0) {
  console.log('[PASS] Suite failures: 0 (gate satisfied)');
} else {
  improvements.suite = policy.maxSuiteFailures - summary.gate.suiteFailures;
  if (improvements.suite > 0) {
    console.log(`[PASS] Suite failures: ${summary.gate.suiteFailures} <= ${policy.maxSuiteFailures} (improved by ${improvements.suite})`);
  } else {
    console.log(`[PASS] Suite failures: ${summary.gate.suiteFailures} <= ${policy.maxSuiteFailures}`);
  }
}

// Total tests (anti-gaming)
console.log('');
console.log('TOTAL TESTS (must not decrease):');
if (summary.counts.total < policy.minTotalTests) {
  const decrease = policy.minTotalTests - summary.counts.total;
  console.log(`[FAIL] Total tests decreased: ${summary.counts.total} < ${policy.minTotalTests}`);
  console.log(`       Tests removed: ${decrease} (possible gaming)`);
  violations.push('totalDecreased');
} else {
  improvements.total = summary.counts.total - policy.minTotalTests;
  if (improvements.total > 0) {
    console.log(`[PASS] Total tests: ${summary.counts.total} >= ${policy.minTotalTests} (added ${improvements.total})`);
  } else {
    console.log(`[PASS] Total tests: ${summary.counts.total} >= ${policy.minTotalTests}`);
  }
}

console.log('');
console.log('============================================================');

if (violations.length > 0) {
  console.log('RESULT: RATCHET VIOLATION');

  printDeltaReport(baseline, summary);

  const clusters = readClusters();
  printClusterDetails(clusters);

  if (fs.existsSync(STDERR_FILE)) {
    console.log('');
    console.log(`For test runner errors, check: ${STDERR_FILE}`);
  }

  console.log('');
  console.log('To fix: address the regressions, then re-run:');
  console.log('  npm run baseline:test:check');

  process.exit(1);
} else {
  console.log('RESULT: ALL RATCHETS PASS');

  const totalBurned = improvements.failed + improvements.skipped;
  if (totalBurned > 0 || improvements.suite > 0 || improvements.total > 0) {
    console.log('');
    console.log(`Defects burned this cycle: ${totalBurned}`);
    console.log(`  - Failed tests fixed: ${improvements.failed}`);
    console.log(`  - Skipped tests fixed: ${improvements.skipped}`);
    if (improvements.suite > 0) {
      console.log(`  - Suite failures fixed: ${improvements.suite}`);
    }
    if (improvements.total > 0) {
      console.log(`  - New tests added: ${improvements.total}`);
    }
    console.log('');
    console.log('Lock in progress by updating baseline:');
    console.log('  npm run baseline:test:update');
  }

  process.exit(0);
}
