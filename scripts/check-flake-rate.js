#!/usr/bin/env node
/**
 * Flake Rate Detection Script
 *
 * Analyzes Playwright JSON reporter output to detect flaky tests.
 * A test is considered flaky if it required retries to pass.
 *
 * Usage:
 *   npx playwright test --reporter=json > test-results.json
 *   node scripts/check-flake-rate.js test-results.json
 *
 * Exit codes:
 *   0 - No flaky tests (or flake rate below threshold)
 *   1 - Flake rate exceeds threshold
 */

const fs = require('fs');
const path = require('path');

const FLAKE_THRESHOLD = 0.15; // 15% flake rate triggers failure
const QUARANTINE_THRESHOLD = 0.15; // Tests with >15% flake rate should be quarantined

/**
 * Parse Playwright JSON report
 */
function parseReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    console.log(`Report file not found: ${reportPath}`);
    console.log('Run tests with: npx playwright test --reporter=json > test-results.json');
    return null;
  }

  const content = fs.readFileSync(reportPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Analyze test results for flakiness
 */
function analyzeFlakiness(report) {
  const testResults = [];

  // Flatten all suites and tests
  function processTests(suites) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests) {
            const results = test.results || [];
            const retryCount = results.length - 1; // First attempt doesn't count as retry
            const passed = results.some(r => r.status === 'passed');
            const failed = results.every(r => r.status === 'failed');

            testResults.push({
              title: spec.title,
              file: suite.file,
              retries: retryCount,
              passed,
              failed,
              flaky: retryCount > 0 && passed, // Passed after retries = flaky
            });
          }
        }
      }

      if (suite.suites) {
        processTests(suite.suites);
      }
    }
  }

  if (report.suites) {
    processTests(report.suites);
  }

  return testResults;
}

/**
 * Generate flake report
 */
function generateReport(testResults) {
  const total = testResults.length;
  const flaky = testResults.filter(t => t.flaky);
  const failed = testResults.filter(t => t.failed);
  const passed = testResults.filter(t => t.passed && !t.flaky);

  const flakeRate = total > 0 ? flaky.length / total : 0;

  console.log('\n=== Flake Rate Report ===\n');
  console.log(`Total Tests: ${total}`);
  console.log(`Passed (clean): ${passed.length}`);
  console.log(`Passed (flaky): ${flaky.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`\nFlake Rate: ${(flakeRate * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(FLAKE_THRESHOLD * 100).toFixed(1)}%`);

  if (flaky.length > 0) {
    console.log('\n=== Flaky Tests ===\n');
    for (const test of flaky) {
      console.log(`  [FLAKY] ${test.title}`);
      console.log(`          File: ${test.file}`);
      console.log(`          Retries: ${test.retries}`);
    }
  }

  // Identify tests that should be quarantined
  const shouldQuarantine = flaky.filter(t => t.retries >= 2);
  if (shouldQuarantine.length > 0) {
    console.log('\n=== Recommended for Quarantine ===\n');
    for (const test of shouldQuarantine) {
      console.log(`  - ${test.title} (${test.retries} retries)`);
    }
    console.log('\nAdd these to tests/e2e/quarantine.skip.ts');
  }

  return { flakeRate, flakyTests: flaky, total };
}

/**
 * Main entry point
 */
function main() {
  const reportPath = process.argv[2] || 'test-results.json';

  console.log(`Analyzing: ${reportPath}`);

  const report = parseReport(reportPath);
  if (!report) {
    process.exit(0); // No report = skip analysis
  }

  const testResults = analyzeFlakiness(report);
  const { flakeRate, flakyTests } = generateReport(testResults);

  // Exit with error if flake rate exceeds threshold
  if (flakeRate > FLAKE_THRESHOLD) {
    console.log(`\n[FAIL] Flake rate ${(flakeRate * 100).toFixed(1)}% exceeds threshold ${(FLAKE_THRESHOLD * 100).toFixed(1)}%`);
    process.exit(1);
  }

  if (flakyTests.length > 0) {
    console.log(`\n[WARN] ${flakyTests.length} flaky test(s) detected`);
  } else {
    console.log('\n[PASS] No flaky tests detected');
  }

  process.exit(0);
}

main();
