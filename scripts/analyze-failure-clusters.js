#!/usr/bin/env node
/**
 * scripts/analyze-failure-clusters.js (v7)
 *
 * Analyzes test results to find failure clusters - directories with high
 * concentrations of failures that may indicate cascade fix opportunities.
 *
 * Supports both Jest AND Vitest JSON output formats.
 *
 * Usage:
 *   node scripts/analyze-failure-clusters.js [test-results.json]
 *   node scripts/analyze-failure-clusters.js artifacts/test-results.json
 *
 * If no file specified, reads from artifacts/test-results.json
 */

const fs = require('fs');
const path = require('path');

// Default input file
const DEFAULT_INPUT = 'artifacts/test-results.json';

function relDir(filepath) {
  // Extract directory relative to project root
  const normalized = filepath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  // Find tests/ or client/ or server/ as anchor
  let startIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    if (['tests', 'client', 'server', 'shared'].includes(parts[i])) {
      startIdx = i;
      break;
    }
  }

  // Return directory (excluding filename)
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

  // Normalize common patterns
  return str
    .replace(/at .+:\d+:\d+/g, 'at <location>')
    .replace(/\d+ms/g, '<time>ms')
    .replace(/".+?"/g, '"<string>"')
    .substring(0, 100);
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

function analyze(data) {
  const failDirs = {};
  const skipDirs = {};
  const suiteFailDirs = {};
  const failPatterns = {};

  let totalFailed = 0;
  let totalSkipped = 0;
  let totalPassed = 0;
  let totalSuiteFailures = 0;

  // Handle both Vitest and Jest formats
  const testResults = data.testResults || [];

  if (testResults.length === 0) {
    console.error('ERROR: No testResults found in JSON. Check file format.');
    process.exit(1);
  }

  for (const suite of testResults) {
    const filepath = suite.name || suite.file || '';
    const dir = relDir(filepath);

    // 1) Suite-level failure (test suite failed to run entirely)
    //    This is a cascade candidate - fixing import/setup unlocks all tests
    const suiteFailedToRun =
      suite.status === 'failed' &&
      (!suite.assertionResults || suite.assertionResults.length === 0);

    if (suiteFailedToRun) {
      inc(suiteFailDirs, dir);
      totalSuiteFailures++;

      // Try to extract error pattern from suite message
      const suiteError = suite.message || suite.failureMessage || '';
      if (suiteError) {
        inc(failPatterns, normalizeError(suiteError));
      }
      continue;
    }

    // 2) Test-level failures & skips
    const assertions = suite.assertionResults || suite.tests || [];
    for (const t of assertions) {
      // Support both Jest (status) and Vitest (state) formats
      const status = t.status || t.state || t.result?.state;

      if (status === 'failed' || status === 'fail') {
        inc(failDirs, dir);
        totalFailed++;

        // Extract error pattern
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

  // Summary
  const totalTests = totalPassed + totalFailed + totalSkipped;
  const totalDefects = totalFailed + totalSkipped + totalSuiteFailures;

  console.log('\n' + '='.repeat(60));
  console.log('FAILURE CLUSTER ANALYSIS');
  console.log('='.repeat(60));
  console.log(`\nSUMMARY:`);
  console.log(`  Total Tests:      ${totalTests}`);
  console.log(`  Passed:           ${totalPassed}`);
  console.log(`  Failed:           ${totalFailed}`);
  console.log(`  Skipped:          ${totalSkipped}`);
  console.log(`  Suite Failures:   ${totalSuiteFailures}`);
  console.log(`  ─────────────────────────`);
  console.log(`  Total Defects:    ${totalDefects} (failed + skipped + suite failures)`);
  console.log(`  Pass Rate:        ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  // Print analysis tables
  printTable('TOP 10 FAILING DIRECTORIES', failDirs);
  printTable('TOP 10 SKIPPED DIRECTORIES', skipDirs);

  if (Object.keys(suiteFailDirs).length > 0) {
    printTable('SUITE-LEVEL FAILURES (cascade candidates)', suiteFailDirs);
  }

  printTable('TOP 10 ERROR PATTERNS', failPatterns);

  // Cascade detection heuristics
  console.log('\n' + '='.repeat(60));
  console.log('CASCADE CANDIDATES');
  console.log('='.repeat(60));

  // Alias resolution errors
  const aliasErrors = Object.entries(failPatterns)
    .filter(([k]) => k.includes("Cannot find module '@") || k.includes('Cannot resolve'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (aliasErrors > 5) {
    console.log(`\n[!] ALIAS CASCADE: ${aliasErrors} tests failing on module resolution`);
    console.log(`    FIX: Check vitest.config.ts resolve.alias + tsconfig paths`);
  }

  // Redis/connection errors
  const redisErrors = Object.entries(failPatterns)
    .filter(([k]) => k.toLowerCase().includes('redis') || k.includes('ECONNREFUSED'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (redisErrors > 5) {
    console.log(`\n[!] REDIS CASCADE: ${redisErrors} tests failing on connection`);
    console.log(`    FIX: Add ioredis-mock setup in test environment`);
  }

  // Timeout errors
  const timeoutErrors = Object.entries(failPatterns)
    .filter(([k]) => k.toLowerCase().includes('timeout') || k.includes('exceeded'))
    .reduce((sum, [, v]) => sum + v, 0);

  if (timeoutErrors > 5) {
    console.log(`\n[!] TIMEOUT CASCADE: ${timeoutErrors} tests timing out`);
    console.log(`    FIX: Increase testTimeout or add proper async handling`);
  }

  // Suite failures are always high-priority cascades
  if (totalSuiteFailures > 0) {
    console.log(`\n[!] SUITE FAILURES: ${totalSuiteFailures} test files failed to run`);
    console.log(`    These are HIGH-PRIORITY - fixing setup unlocks all tests in file`);
  }

  // Gap analysis for 90% target
  console.log('\n' + '='.repeat(60));
  console.log('GAP ANALYSIS');
  console.log('='.repeat(60));

  const target90 = Math.ceil(totalTests * 0.90);
  const needToPass = target90 - totalPassed;
  const defectsToFix = Math.max(0, needToPass);

  console.log(`\n  Current passing: ${totalPassed}/${totalTests}`);
  console.log(`  Target (90%):    ${target90}`);
  console.log(`  Gap:             ${defectsToFix} tests must be fixed`);

  if (defectsToFix > totalDefects) {
    console.log(`\n  [WARNING] Gap exceeds known defects - check test discovery`);
  }

  // Output JSON for programmatic consumption
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      suiteFailures: totalSuiteFailures,
      defects: totalDefects,
      passRate: ((totalPassed / totalTests) * 100).toFixed(1)
    },
    clusters: {
      failing: failDirs,
      skipped: skipDirs,
      suiteFailures: suiteFailDirs
    },
    cascades: {
      alias: aliasErrors,
      redis: redisErrors,
      timeout: timeoutErrors,
      suite: totalSuiteFailures
    },
    gap: {
      current: totalPassed,
      target90: target90,
      defectsToFix: defectsToFix
    }
  };

  // Write analysis output
  const outputPath = 'artifacts/cluster-analysis.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nAnalysis saved to: ${outputPath}`);

  return output;
}

// Main
const inputFile = process.argv[2] || DEFAULT_INPUT;

if (!fs.existsSync(inputFile)) {
  console.error(`ERROR: File not found: ${inputFile}`);
  console.error(`\nUsage: node scripts/analyze-failure-clusters.js [test-results.json]`);
  console.error(`\nFirst generate test results with:`);
  console.error(`  npx vitest run --reporter=json --outputFile=artifacts/test-results.json`);
  process.exit(1);
}

console.log(`Reading: ${inputFile}`);
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
analyze(data);
