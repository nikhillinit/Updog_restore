#!/usr/bin/env node
/**
 * TypeScript Baseline System - Production Implementation
 *
 * Implements the "ratchet" strategy for gradual TypeScript strict mode migration:
 * 1. Captures baseline of existing errors with context-aware hashing
 * 2. Blocks new errors from being introduced
 * 3. Allows (and tracks) reduction of existing errors
 * 4. Provides per-project progress tracking
 *
 * Key Features:
 * - Context-aware hashing (stable across line number changes)
 * - Cross-platform compatible (Windows/Linux/Mac)
 * - Incremental build support for performance
 * - Multi-project monorepo support
 * - Robust error handling for expected tsc failures
 *
 * Usage:
 *   node scripts/typescript-baseline.js save     # Save/update baseline
 *   node scripts/typescript-baseline.js check    # Check for new errors
 *   node scripts/typescript-baseline.js progress # Show progress metrics
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Configuration
// ============================================================================

const BASELINE_FILE = path.join(__dirname, '..', '.tsc-baseline.json');
const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

const PROJECTS = {
  client: 'tsconfig.client.json',
  server: 'tsconfig.server.json',
  shared: 'tsconfig.shared.json'
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Execute TypeScript compiler for a specific project
 * @param {string} project - Project name
 * @param {string} configFile - TypeScript config file path
 * @returns {string} - TypeScript compiler output (stdout + stderr)
 */
function runProjectCheck(project, configFile) {
  try {
    // Success case: no errors
    return execSync(
      `npx tsc -p ${configFile} --noEmit --pretty false 2>&1`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }  // 10MB buffer
    );
  } catch (error) {
    // Expected case: tsc exits with non-zero code when errors exist
    // When using 2>&1, all output is in stdout
    if (error.stdout) {
      return error.stdout.toString();
    }
    return '';
  }
}

/**
 * Execute TypeScript compiler for all projects
 * @returns {string} - Combined TypeScript compiler output
 */
function runTypeScriptCompiler() {
  let combinedOutput = '';

  for (const [project, configFile] of Object.entries(PROJECTS)) {
    console.log(`  Checking ${project}...`);
    const output = runProjectCheck(project, configFile);
    if (output) {
      combinedOutput += output + '\n';
    }
  }

  return combinedOutput;
}

/**
 * Normalize file path to be cross-platform compatible
 * Always use forward slashes and repo-relative paths
 * @param {string} filePath - Absolute or relative file path
 * @returns {string} - Normalized repo-relative path with forward slashes
 */
function normalizePath(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const relative = path.relative(REPO_ROOT, absolute);
  return relative.replace(/\\/g, '/');  // Force forward slashes (Windows compat)
}

/**
 * Generate context-aware hash for a TypeScript error
 *
 * Hash format: file:TScode:contentHash
 * - file: Normalized repo-relative path
 * - TScode: Error code (e.g., TS2322)
 * - contentHash: SHA1 of the error line content (first 8 chars)
 *
 * This approach is stable across line number changes (adding imports, etc.)
 * Falls back to line-based hash if file reading fails
 *
 * @param {Object} error - Parsed error object
 * @param {Object} fileCache - Cache of file contents
 * @returns {string} - Unique error hash
 */
function generateContextHash(error, fileCache) {
  const normalizedPath = normalizePath(error.file);

  try {
    // Cache file contents for performance
    if (!fileCache[error.file]) {
      fileCache[error.file] = fs.readFileSync(error.file, 'utf8').split('\n');
    }

    // Hash the content of the line causing the error (stable across line moves)
    const lineContent = fileCache[error.file][error.line - 1];
    if (lineContent !== undefined) {
      const normalizedContent = lineContent.trim();
      const contentHash = crypto
        .createHash('sha1')
        .update(normalizedContent)
        .digest('hex')
        .substring(0, 8);

      return `${normalizedPath}:TS${error.code}:${contentHash}`;
    }
  } catch (err) {
    // File reading failed - fall back to line-based hash
    console.warn(`Warning: Could not read file ${error.file}, using line-based hash`);
  }

  // Fallback: line-based hash (less stable but better than nothing)
  return `${normalizedPath}(${error.line},${error.col}):TS${error.code}`;
}

/**
 * Infer project name from file path
 * @param {string} filePath - File path
 * @returns {string} - Project name (client/server/shared/unknown)
 */
function inferProject(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.startsWith('client/')) return 'client';
  if (normalized.startsWith('server/')) return 'server';
  if (normalized.startsWith('shared/')) return 'shared';
  return 'unknown';
}

/**
 * Parse TypeScript compiler output into structured errors
 * Handles multiple error formats and edge cases
 *
 * @param {string} output - Raw tsc output
 * @returns {Array} - Array of parsed error objects
 */
function parseTypeScriptErrors(output) {
  const lines = output.split('\n');
  const errors = [];

  // Multiple regex patterns for robustness
  // Note: Use \r? to handle Windows line endings
  const patterns = [
    // Standard format: file.ts(line,col): error TSXXXX: message
    /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+?)\.?\r?$/,
    // Alternative format: file.ts:line:col - error TSXXXX: message
    /^(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+?)\.?\r?$/
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const [, file, lineNum, col, code, message] = match;
        errors.push({
          file: path.resolve(file),
          line: parseInt(lineNum, 10),
          col: parseInt(col, 10),
          code: code.replace('TS', ''),
          message: message.trim(),
          rawLine: line
        });
        break;  // Stop trying patterns once matched
      }
    }
  }

  return errors;
}

/**
 * Generate baseline from current TypeScript errors
 * @returns {Object} - Baseline object
 */
function generateBaseline() {
  console.log('🔍 Running TypeScript compilation...');
  const startTime = Date.now();

  const output = runTypeScriptCompiler();
  const errors = parseTypeScriptErrors(output);

  console.log(`Found ${errors.length} TypeScript errors`);

  // Generate context-aware hashes
  const fileCache = {};
  const baseline = {
    version: '2.0.0',
    projects: {},
    totalErrors: 0,
    timestamp: new Date().toISOString(),
    buildMode: 'per-project',
    elapsedMs: Date.now() - startTime
  };

  // Group errors by project
  for (const error of errors) {
    const project = inferProject(error.file);
    const hash = generateContextHash(error, fileCache);

    if (!baseline.projects[project]) {
      baseline.projects[project] = {
        errors: [],
        total: 0,
        lastUpdated: baseline.timestamp
      };
    }

    baseline.projects[project].errors.push(hash);
    baseline.projects[project].total++;
    baseline.totalErrors++;
  }

  // Deduplicate errors within each project
  for (const project in baseline.projects) {
    baseline.projects[project].errors = [...new Set(baseline.projects[project].errors)].sort();
    baseline.projects[project].total = baseline.projects[project].errors.length;
  }

  // Recalculate total after deduplication
  baseline.totalErrors = Object.values(baseline.projects)
    .reduce((sum, proj) => sum + proj.total, 0);

  return baseline;
}

/**
 * Load baseline from disk
 * @returns {Object} - Baseline object
 */
function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('❌ No baseline file found');
    console.error(`Expected: ${BASELINE_FILE}`);
    console.error('\n💡 Run: npm run baseline:save');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch (error) {
    console.error('❌ Failed to parse baseline file');
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Save baseline to disk
 */
function saveBaseline() {
  const baseline = generateBaseline();

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));

  console.log('\n✅ Baseline saved successfully');
  console.log(`📝 File: ${BASELINE_FILE}`);
  console.log(`📊 Total errors: ${baseline.totalErrors}`);
  console.log(`⏱️  Build time: ${baseline.elapsedMs}ms`);

  // Show breakdown by project
  console.log('\n📋 Errors by project:');
  for (const [project, data] of Object.entries(baseline.projects)) {
    console.log(`   ${project.padEnd(10)} ${data.total.toString().padStart(4)} errors`);
  }
}

/**
 * Check current errors against baseline
 */
function checkBaseline() {
  const baseline = loadBaseline();
  const current = generateBaseline();

  // Build hash sets for comparison
  const baselineHashes = new Set();
  for (const project in baseline.projects) {
    for (const hash of baseline.projects[project].errors) {
      baselineHashes.add(hash);
    }
  }

  const currentHashes = new Set();
  const currentHashToError = new Map();

  // Regenerate current errors with full details for reporting
  const output = runTypeScriptCompiler();
  const errors = parseTypeScriptErrors(output);
  const fileCache = {};

  for (const error of errors) {
    const hash = generateContextHash(error, fileCache);
    currentHashes.add(hash);
    currentHashToError.set(hash, error);
  }

  // Find new errors (not in baseline)
  const newErrors = [...currentHashes].filter(h => !baselineHashes.has(h));

  // Find fixed errors (in baseline but not current)
  const fixedErrors = [...baselineHashes].filter(h => !currentHashes.has(h));

  // Report results
  console.log('\n📊 TypeScript Baseline Check');
  console.log('─'.repeat(70));
  console.log(`Baseline errors:  ${baseline.totalErrors}`);
  console.log(`Current errors:   ${current.totalErrors}`);
  console.log(`Fixed errors:     ${fixedErrors.length} ✅`);
  console.log(`New errors:       ${newErrors.length} ${newErrors.length > 0 ? '❌' : '✅'}`);
  console.log('─'.repeat(70));

  if (newErrors.length > 0) {
    console.log('\n❌ NEW ERRORS DETECTED (not in baseline):\n');

    // Show first 20 new errors with full details
    const errorsToShow = newErrors.slice(0, 20);
    for (const hash of errorsToShow) {
      const error = currentHashToError.get(hash);
      if (error) {
        console.log(error.rawLine);
      } else {
        console.log(`  ${hash}`);
      }
    }

    if (newErrors.length > 20) {
      console.log(`\n  ... and ${newErrors.length - 20} more errors\n`);
    }

    console.log('\n💡 Options:');
    console.log('   1. Fix the errors before pushing');
    console.log('   2. If these errors are acceptable:');
    console.log('      npm run baseline:save');
    console.log('      git add .tsc-baseline.json');
    console.log('      git commit --amend --no-edit');
    console.log('\n⚠️  Emergency bypass: git push --no-verify');
    console.log('   (Document in commit message why bypass was necessary)');

    process.exit(1);
  }

  if (fixedErrors.length > 0) {
    console.log(`\n✅ GREAT WORK! You fixed ${fixedErrors.length} error(s)`);
    console.log('\n💡 Update the baseline to lock in your improvements:');
    console.log('   npm run baseline:save');
    console.log('   git add .tsc-baseline.json');
    console.log('   git commit --amend --no-edit');
  }

  console.log('\n✅ No new TypeScript errors introduced');
}

/**
 * Show progress metrics
 */
function showProgress() {
  const baseline = loadBaseline();
  const current = generateBaseline();

  console.log('\n📊 TypeScript Error Progress\n');
  console.log('─'.repeat(70));
  console.log('Project    │ Baseline │ Current  │ Fixed    │ Progress');
  console.log('─'.repeat(70));

  let totalFixed = 0;

  for (const project of ['client', 'server', 'shared', 'unknown']) {
    const baselineCount = baseline.projects[project]?.total || 0;
    const currentCount = current.projects[project]?.total || 0;
    const fixed = baselineCount - currentCount;
    const progress = baselineCount > 0 ? ((fixed / baselineCount) * 100) : 0;

    if (baselineCount > 0 || currentCount > 0) {
      console.log(
        `${project.padEnd(10)} │ ${baselineCount.toString().padStart(8)} │ ` +
        `${currentCount.toString().padStart(8)} │ ${fixed.toString().padStart(8)} │ ` +
        `${progress.toFixed(1).padStart(6)}%`
      );
      totalFixed += fixed;
    }
  }

  console.log('─'.repeat(70));
  console.log(
    `${'TOTAL'.padEnd(10)} │ ${baseline.totalErrors.toString().padStart(8)} │ ` +
    `${current.totalErrors.toString().padStart(8)} │ ${totalFixed.toString().padStart(8)} │ ` +
    `${((totalFixed / baseline.totalErrors) * 100).toFixed(1).padStart(6)}%`
  );
  console.log('─'.repeat(70));
  console.log(`\n📅 Baseline last updated: ${new Date(baseline.timestamp).toLocaleString()}`);
  console.log(`⏱️  Check completed in: ${current.elapsedMs}ms\n`);
}

// ============================================================================
// CLI Interface
// ============================================================================

const command = process.argv[2];

switch (command) {
  case 'save':
    saveBaseline();
    break;

  case 'check':
    checkBaseline();
    break;

  case 'progress':
    showProgress();
    break;

  default:
    console.log('TypeScript Baseline System');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/typescript-baseline.js save      # Save/update baseline');
    console.log('  node scripts/typescript-baseline.js check     # Check for new errors');
    console.log('  node scripts/typescript-baseline.js progress  # Show progress metrics');
    console.log('');
    process.exit(1);
}
