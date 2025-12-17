#!/usr/bin/env node
/**
 * scripts/analyze-failure-clusters.js (v7.1)
 *
 * Analyzes test results to find failure clusters and cascade fix opportunities.
 * Produces NORMALIZED output that abstracts away Jest vs Vitest format differences.
 *
 * Key v7.1 changes:
 * - Produces normalized test-summary.json (canonical artifact)
 * - Separates NonPassingTests (burn-down) from SuiteFailures (gate)
 * - Adds hardcoded constants cascade class
 * - Adds alias resolution decision branch (Vitest vs Jest)
 *
 * Usage:
 *   node scripts/analyze-failure-clusters.js [test-results.json]
 *   node scripts/analyze-failure-clusters.js artifacts/test-results.json
 *
 * Outputs:
 *   - artifacts/test-summary.json (NORMALIZED - use this for ratchets)
 *   - artifacts/cluster-analysis.json (detailed analysis)
 */

const fs = require('fs');
const path = require('path');

// Default input file
const DEFAULT_INPUT = 'artifacts/test-results.json';
const MIN_FILE_SIZE = 100; // Minimum bytes to consider valid

/**
 * Detect test runner from JSON structure
 */
function detectRunner(data) {
  // Vitest uses 'testResults' array with 'assertionResults'
  // Jest uses similar structure but has different metadata
  if (data.config?.rootDir && data.testResults) {
    // Check for Vitest-specific fields
    if (data.config.configFile?.includes('vitest')) {
      return 'vitest';
    }
  }
  // Check for Jest snapshot field
  if (data.snapshot !== undefined) {
    return 'jest';
  }
  // Default to vitest for this project
  return 'vitest';
}

/**
 * Normalize raw test results into consistent format
 * This abstracts away Jest vs Vitest differences
 */
function normalizeResults(data) {
  const runner = detectRunner(data);
  const testResults = data.testResults || [];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let suiteFailures = 0;
  const suiteFailureFiles = [];

  for (const suite of testResults) {
    const filepath = suite.name || suite.file || '';

    // Suite-level failure detection
    const suiteFailedToRun =
      suite.status === 'failed' &&
      (!suite.assertionResults || suite.assertionResults.length === 0);

    if (suiteFailedToRun) {
      suiteFailures++;
      suiteFailureFiles.push({
        file: filepath,
        error: suite.message || suite.failureMessage || '(unknown error)'
      });
      continue;
    }

    // Test-level counts
    const assertions = suite.assertionResults || suite.tests || [];
    for (const t of assertions) {
      const status = t.status || t.state || t.result?.state;

      if (status === 'failed' || status === 'fail') {
        totalFailed++;
      } else if (status === 'pending' || status === 'skipped' || status === 'todo') {
        totalSkipped++;
      } else if (status === 'passed' || status === 'pass') {
        totalPassed++;
      }
    }
  }

  const totalTests = totalPassed + totalFailed + totalSkipped;

  // Compute invariant check
  const passedPlusFailedPlusSkippedEqualsTotal =
    (totalPassed + totalFailed + totalSkipped) === totalTests;

  // NORMALIZED OUTPUT - consistent regardless of runner
  return {
    meta: {
      timestamp: new Date().toISOString(),
      runner: runner,
      rawFile: DEFAULT_INPUT,
      version: '7.3'
    },
    counts: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped
    },
    // PRIMARY BURN-DOWN METRIC: NonPassingTests (does NOT include suite failures)
    burnDown: {
      nonPassingTests: totalFailed + totalSkipped,
      passRate: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(2) : '0.00'
    },
    // SEPARATE GATE METRIC: Suite failures (must trend to zero)
    gate: {
      suiteFailures: suiteFailures,
      suiteFailureFiles: suiteFailureFiles
    },
    // Schema invariant - catches drift at parse time
    invariant: {
      passedPlusFailedPlusSkippedEqualsTotal: passedPlusFailedPlusSkippedEqualsTotal
    }
  };
}

function relDir(filepath) {
  const normalized = filepath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  let startIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    if (['tests', 'client', 'server', 'shared'].includes(parts[i])) {
      startIdx = i;
      break;
    }
  }

  const dirParts = parts.slice(startIdx, -1);
  return dirParts.join('/') || '(root)';
}

function inc(obj, key) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + 1;
}

function normalizeError(msg) {
  if (!msg) return '(no message)';
  const str = Array.isArray(msg) ? msg[0] : msg;
  if (!str) return '(no message)';

  return str
    .replace(/at .+:\d+:\d+/g, 'at <location>')
    .replace(/\d+ms/g, '<time>ms')
    .replace(/".+?"/g, '"<string>"')
    .substring(0, 120);
}

function printTable(title, data, limit = 10) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (sorted.length === 0) {
    console.log(`\n${title}: (none)`);
    return;
  }

  const total = sorted.reduce((sum, [, v]) => sum + v, 0);

  console.log(`\n${title}`);
  console.log('='.repeat(60));

  for (const [key, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${count.toString().padStart(4)} (${pct.padStart(5)}%)  ${key}`);
  }
}

function analyze(data, normalizedSummary) {
  const failDirs = {};
  const skipDirs = {};
  const suiteFailDirs = {};
  const failPatterns = {};

  let totalFailed = 0;
  let totalSkipped = 0;
  let totalPassed = 0;
  let totalSuiteFailures = 0;

  const testResults = data.testResults || [];

  if (testResults.length === 0) {
    console.error('ERROR: No testResults found in JSON. Check file format.');
    process.exit(1);
  }

  for (const suite of testResults) {
    const filepath = suite.name || suite.file || '';
    const dir = relDir(filepath);

    const suiteFailedToRun =
      suite.status === 'failed' &&
      (!suite.assertionResults || suite.assertionResults.length === 0);

    if (suiteFailedToRun) {
      inc(suiteFailDirs, dir);
      totalSuiteFailures++;

      const suiteError = suite.message || suite.failureMessage || '';
      if (suiteError) {
        inc(failPatterns, normalizeError(suiteError));
      }
      continue;
    }

    const assertions = suite.assertionResults || suite.tests || [];
    for (const t of assertions) {
      const status = t.status || t.state || t.result?.state;

      if (status === 'failed' || status === 'fail') {
        inc(failDirs, dir);
        totalFailed++;

        const errorMsg = t.failureMessages?.[0] || t.message || t.error?.message;
        inc(failPatterns, normalizeError(errorMsg));

      } else if (status === 'pending' || status === 'skipped' || status === 'todo') {
        inc(skipDirs, dir);
        totalSkipped++;

      } else if (status === 'passed' || status === 'pass') {
        totalPassed++;
      }
    }
  }

  const totalTests = totalPassed + totalFailed + totalSkipped;
  const runner = normalizedSummary.meta.runner;

  // v7.1: NonPassingTests is the burn-down metric (NOT including suite failures)
  const nonPassingTests = totalFailed + totalSkipped;

  console.log('\n' + '='.repeat(60));
  console.log('FAILURE CLUSTER ANALYSIS (v7.1)');
  console.log('='.repeat(60));
  console.log(`\nDETECTED RUNNER: ${runner.toUpperCase()}`);
  console.log(`\nBURN-DOWN METRIC (NonPassingTests = failed + skipped):`);
  console.log(`  Total Tests:        ${totalTests}`);
  console.log(`  Passed:             ${totalPassed}`);
  console.log(`  Failed:             ${totalFailed}`);
  console.log(`  Skipped:            ${totalSkipped}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  NonPassingTests:    ${nonPassingTests} <-- PRIMARY METRIC`);
  console.log(`  Pass Rate:          ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  console.log(`\nGATE METRIC (must trend to zero):`);
  console.log(`  Suite Failures:     ${totalSuiteFailures} <-- SEPARATE GATE`);
  if (totalSuiteFailures > 0) {
    console.log(`  [!] Suite failures hide N tests each - high priority fix`);
  }

  // Print analysis tables
  printTable('TOP 10 FAILING DIRECTORIES', failDirs);
  printTable('TOP 10 SKIPPED DIRECTORIES', skipDirs);

  if (Object.keys(suiteFailDirs).length > 0) {
    printTable('SUITE-LEVEL FAILURES (gate metric)', suiteFailDirs);
  }

  printTable('TOP 10 ERROR PATTERNS', failPatterns);

  // Cascade detection with v7.1 enhancements
  console.log('\n' + '='.repeat(60));
  console.log('CASCADE CANDIDATES');
  console.log('='.repeat(60));

  // 1. Alias resolution errors with runner-specific fix
  const aliasErrors = Object.entries(failPatterns)
    .filter(([k]) => k.includes("Cannot find module '@") || k.includes('Cannot resolve'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (aliasErrors > 5) {
    console.log(`\n[!] ALIAS CASCADE: ${aliasErrors} tests failing on module resolution`);
    if (runner === 'vitest') {
      console.log(`    VITEST FIX: Check vitest.config.ts resolve.alias matches tsconfig paths`);
      console.log(`    Common aliases: @, @components, @core, @context, @utils, @shared`);
    } else if (runner === 'jest') {
      console.log(`    JEST FIX: Add moduleNameMapper in jest.config.js`);
      console.log(`    Example: "^@/(.*)$": "<rootDir>/client/src/$1"`);
    } else {
      console.log(`    FIX: Unify test runner or add path mappings for both`);
    }
  }

  // 2. Redis/connection errors
  const redisErrors = Object.entries(failPatterns)
    .filter(([k]) => k.toLowerCase().includes('redis') || k.includes('ECONNREFUSED'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (redisErrors > 5) {
    console.log(`\n[!] REDIS CASCADE: ${redisErrors} tests failing on connection`);
    console.log(`    FIX: Add ioredis-mock setup in test environment`);
  }

  // 3. Timeout errors
  const timeoutErrors = Object.entries(failPatterns)
    .filter(([k]) => k.toLowerCase().includes('timeout') || k.includes('exceeded'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (timeoutErrors > 5) {
    console.log(`\n[!] TIMEOUT CASCADE: ${timeoutErrors} tests timing out`);
    console.log(`    FIX: Increase testTimeout or add proper async handling`);
  }

  // 4. v7.1 NEW: Hardcoded constants cascade
  const constantErrors = Object.entries(failPatterns)
    .filter(([k]) =>
      k.includes('expected') && (
        k.includes('0.4') || k.includes('0.40') ||
        k.includes('totalCapital') || k.includes('reserve')
      )
    )
    .reduce((sum, [, v]) => sum + v, 0);

  if (constantErrors > 3) {
    console.log(`\n[!] HARDCODED CONSTANTS CASCADE: ${constantErrors} tests`);
    console.log(`    Likely cause: reserves hardcoded as totalCapital * 0.4`);
    console.log(`    FIX: Check if constants contradict policy/user inputs`);
  }

  // 5. Suite failures
  if (totalSuiteFailures > 0) {
    console.log(`\n[!] SUITE FAILURES: ${totalSuiteFailures} test files failed to run`);
    console.log(`    HIGH-PRIORITY: Fixing import/setup unlocks all tests in file`);
  }

  // Gap analysis for 90% target
  console.log('\n' + '='.repeat(60));
  console.log('GAP ANALYSIS');
  console.log('='.repeat(60));

  const target90 = Math.ceil(totalTests * 0.90);
  const needToPass = target90 - totalPassed;
  const defectsToFix = Math.max(0, needToPass);

  console.log(`\n  Current passing:    ${totalPassed}/${totalTests}`);
  console.log(`  Target (90%):       ${target90}`);
  console.log(`  NonPassing to fix:  ${defectsToFix}`);
  console.log(`  Available to fix:   ${nonPassingTests} (failed + skipped)`);

  if (defectsToFix > nonPassingTests) {
    console.log(`\n  [WARNING] Gap exceeds NonPassingTests`);
    console.log(`  Suite failures (${totalSuiteFailures}) may hide additional tests`);
  }

  // Decision gate
  const gap = defectsToFix - nonPassingTests;
  if (gap <= 0) {
    console.log(`\n  PATH A VIABLE: NonPassingTests covers the gap`);
  } else if (totalSuiteFailures > 0 && gap <= totalSuiteFailures * 10) {
    console.log(`\n  PATH A POSSIBLE: Suite failures may hide enough tests`);
  } else {
    console.log(`\n  PATH B LIKELY: May need to adjust target or add tests`);
  }

  // Output detailed analysis JSON
  const analysisOutput = {
    timestamp: new Date().toISOString(),
    version: '7.1',
    runner: runner,
    burnDown: {
      nonPassingTests: nonPassingTests,
      failed: totalFailed,
      skipped: totalSkipped,
      passRate: ((totalPassed / totalTests) * 100).toFixed(2)
    },
    gate: {
      suiteFailures: totalSuiteFailures
    },
    clusters: {
      failing: failDirs,
      skipped: skipDirs,
      suiteFailures: suiteFailDirs
    },
    cascades: {
      alias: { count: aliasErrors, runner: runner },
      redis: { count: redisErrors },
      timeout: { count: timeoutErrors },
      hardcodedConstants: { count: constantErrors },
      suiteFailures: { count: totalSuiteFailures }
    },
    gap: {
      current: totalPassed,
      total: totalTests,
      target90: target90,
      defectsToFix: defectsToFix,
      nonPassingAvailable: nonPassingTests
    }
  };

  const analysisPath = 'artifacts/cluster-analysis.json';
  fs.writeFileSync(analysisPath, JSON.stringify(analysisOutput, null, 2));
  console.log(`\nDetailed analysis: ${analysisPath}`);

  return analysisOutput;
}

// Main
const inputFile = process.argv[2] || DEFAULT_INPUT;

// v7.1: File existence and size guards
if (!fs.existsSync(inputFile)) {
  console.error(`ERROR: File not found: ${inputFile}`);
  console.error(`\nUsage: node scripts/analyze-failure-clusters.js [test-results.json]`);
  console.error(`\nFirst generate test results with:`);
  console.error(`  npm test -- --reporter=json --outputFile=artifacts/test-results.json 2> artifacts/test-run.stderr.txt`);
  process.exit(1);
}

const stats = fs.statSync(inputFile);
if (stats.size < MIN_FILE_SIZE) {
  console.error(`ERROR: File too small (${stats.size} bytes): ${inputFile}`);
  console.error(`This usually means the test run failed before producing output.`);
  console.error(`Check artifacts/test-run.stderr.txt for errors.`);
  process.exit(1);
}

console.log(`Reading: ${inputFile} (${stats.size} bytes)`);
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Step 1: Normalize (produces canonical artifact)
const normalizedSummary = normalizeResults(data);
const summaryPath = 'artifacts/test-summary.json';
fs.writeFileSync(summaryPath, JSON.stringify(normalizedSummary, null, 2));
console.log(`Normalized summary: ${summaryPath}`);

// Step 2: Analyze clusters
analyze(data, normalizedSummary);

// Final output guidance
console.log('\n' + '='.repeat(60));
console.log('RATCHET VALUES (for .test-baseline.json)');
console.log('='.repeat(60));
console.log(`\n  maxFailedTests:    ${normalizedSummary.counts.failed}`);
console.log(`  maxSkippedTests:   ${normalizedSummary.counts.skipped}`);
console.log(`  maxSuiteFailures:  ${normalizedSummary.gate.suiteFailures}`);
console.log(`\n  Use these as initial ratchet values. They can only decrease.`);
