#!/usr/bin/env node
/**
 * scripts/run-tests-for-baseline.js
 *
 * Cross-platform test runner that:
 * 1. Ensures artifacts/ directory exists
 * 2. Runs Vitest with JSON output
 * 3. Captures stderr to file
 * 4. Tolerates test failures but fails on runner crashes
 * 5. Validates output file exists and is parseable
 *
 * Exit codes:
 *   0 - Tests ran (pass or fail), JSON is valid
 *   1 - Runner crashed or JSON is invalid/missing
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'artifacts';
const RESULTS_FILE = path.join(ARTIFACTS_DIR, 'test-results.json');
const STDERR_FILE = path.join(ARTIFACTS_DIR, 'test-run.stderr.txt');
const MIN_FILE_SIZE = 100;

// Ensure artifacts directory exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  console.log(`Created ${ARTIFACTS_DIR}/`);
}

// Clear previous stderr file
if (fs.existsSync(STDERR_FILE)) {
  fs.unlinkSync(STDERR_FILE);
}

// Open stderr file for writing
const stderrStream = fs.createWriteStream(STDERR_FILE);

console.log('Running tests with JSON output...');
console.log(`  Output: ${RESULTS_FILE}`);
console.log(`  Stderr: ${STDERR_FILE}`);
console.log('');

// Determine vitest command based on platform
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// Run: cross-env TZ=UTC vitest run --reporter=json --outputFile=...
const child = spawn(npmCmd, [
  'run', 'test:unit', '--',
  '--reporter=json',
  `--outputFile=${RESULTS_FILE}`
], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, TZ: 'UTC' },
  shell: isWindows // Use shell on Windows to handle .cmd files
});

// Capture stdout (vitest outputs JSON summary here too)
child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// Capture stderr to file AND console
child.stderr.on('data', (data) => {
  stderrStream.write(data);
  process.stderr.write(data);
});

child.on('close', (code) => {
  stderrStream.end();

  console.log('');
  console.log(`Test runner exited with code: ${code}`);

  // Validate output file exists
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`ERROR: Output file not created: ${RESULTS_FILE}`);
    console.error('');
    console.error('This usually means Vitest crashed before writing output.');
    console.error(`Check ${STDERR_FILE} for details.`);
    process.exit(1);
  }

  // Validate file size (catches truncated/empty files)
  const stats = fs.statSync(RESULTS_FILE);
  if (stats.size < MIN_FILE_SIZE) {
    console.error(`ERROR: Output file too small (${stats.size} bytes)`);
    console.error('');
    console.error('This usually means Vitest crashed during execution.');
    console.error(`Check ${STDERR_FILE} for details.`);
    process.exit(1);
  }

  // Validate JSON is parseable
  try {
    const content = fs.readFileSync(RESULTS_FILE, 'utf8');
    const data = JSON.parse(content);

    // Basic structure validation
    if (!data.testResults && !data.numTotalTests) {
      console.error('ERROR: JSON missing expected fields (testResults or numTotalTests)');
      console.error('');
      console.error('The output format may be incompatible.');
      process.exit(1);
    }

    // Extract summary for display
    const total = data.numTotalTests || data.testResults?.length || 0;
    const passed = data.numPassedTests || 0;
    const failed = data.numFailedTests || 0;

    console.log('');
    console.log('Test run complete:');
    console.log(`  Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
    console.log(`  Output: ${RESULTS_FILE} (${stats.size} bytes)`);

    // Exit 0 even if tests failed - we got valid output
    // The ratchet check will handle test failure detection
    process.exit(0);

  } catch (parseError) {
    console.error(`ERROR: JSON parse failed: ${parseError.message}`);
    console.error('');
    console.error(`Check ${STDERR_FILE} for test runner errors.`);
    process.exit(1);
  }
});

child.on('error', (err) => {
  stderrStream.end();
  console.error(`ERROR: Failed to spawn test runner: ${err.message}`);
  process.exit(1);
});
