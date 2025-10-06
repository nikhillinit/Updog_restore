#!/usr/bin/env node
/**
 * Git Security Utilities
 * Provides safe wrappers for Git operations to prevent command injection
 */

import { execFileSync, spawnSync } from 'child_process';

/**
 * Validates a Git ref (branch, tag, commit) using Git's own validation
 * This is more reliable than regex as it uses Git's internal rules
 *
 * @param {string} ref - The Git ref to validate
 * @param {object} options - Validation options
 * @param {boolean} options.allowBranch - Allow branch refs (default: true)
 * @param {boolean} options.allowTag - Allow tag refs (default: true)
 * @param {boolean} options.normalize - Normalize the ref (default: false)
 * @throws {Error} if ref is invalid
 * @returns {string} The validated (and optionally normalized) ref
 */
export function assertValidGitRef(ref, options = {}) {
  const { allowBranch = true, allowTag = true, normalize = false } = options;

  if (!ref || typeof ref !== 'string') {
    throw new Error('Git ref must be a non-empty string');
  }

  // Trim whitespace
  const trimmed = ref.trim();

  if (trimmed.length === 0) {
    throw new Error('Git ref cannot be empty or whitespace');
  }

  // Check for obvious injection attempts
  const dangerousChars = /[;&|`$(){}[\]<>\\]/;
  if (dangerousChars.test(trimmed)) {
    throw new Error(`Git ref contains dangerous characters: ${trimmed}`);
  }

  // Use Git's check-ref-format for validation
  const result = spawnSync(
    'git',
    allowBranch
      ? ['check-ref-format', '--branch', trimmed]
      : ['check-ref-format', trimmed],
    { stdio: 'pipe' }
  );

  if (result.status !== 0) {
    throw new Error(
      `Invalid Git ref: ${trimmed}\n${result.stderr?.toString() || result.stdout?.toString()}`
    );
  }

  // Optionally normalize the ref
  if (normalize) {
    try {
      const normalized = execFileSync(
        'git',
        ['rev-parse', '--abbrev-ref', trimmed],
        { encoding: 'utf8' }
      ).trim();
      return normalized;
    } catch (error) {
      // If normalize fails, return original validated ref
      console.warn(`Warning: Could not normalize ref ${trimmed}:`, error.message);
    }
  }

  return trimmed;
}

/**
 * Safely execute git diff with validated refs
 *
 * @param {string} baseRef - Base Git ref
 * @param {string} headRef - Head Git ref (default: 'HEAD')
 * @param {string[]} extraArgs - Additional Git diff arguments
 * @returns {string} Git diff output
 */
export function safeGitDiff(baseRef, headRef = 'HEAD', extraArgs = []) {
  const validBase = assertValidGitRef(baseRef);
  const validHead = assertValidGitRef(headRef);

  // Build safe argument list
  const args = ['diff', `${validBase}...${validHead}`, ...extraArgs];

  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
    });
  } catch (error) {
    throw new Error(`Git diff failed: ${error.message}`);
  }
}

/**
 * Safely execute git log with validated refs
 *
 * @param {string} baseRef - Base Git ref
 * @param {string} headRef - Head Git ref (default: 'HEAD')
 * @param {string[]} extraArgs - Additional Git log arguments
 * @returns {string} Git log output
 */
export function safeGitLog(baseRef, headRef = 'HEAD', extraArgs = []) {
  const validBase = assertValidGitRef(baseRef);
  const validHead = assertValidGitRef(headRef);

  const args = ['log', `${validBase}..${validHead}`, ...extraArgs];

  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Git log failed: ${error.message}`);
  }
}

/**
 * Safely list files changed between refs
 *
 * @param {string} baseRef - Base Git ref
 * @param {string} headRef - Head Git ref (default: 'HEAD')
 * @returns {string[]} Array of changed file paths
 */
export function safeGitDiffFiles(baseRef, headRef = 'HEAD') {
  const output = safeGitDiff(baseRef, headRef, ['--name-only']);
  return output
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Safely get file changes with validated file path
 *
 * @param {string} baseRef - Base Git ref
 * @param {string} headRef - Head Git ref
 * @param {string} filePath - File path to get changes for
 * @returns {string} Git diff output for the file
 */
export function safeGitDiffFile(baseRef, headRef, filePath) {
  const validBase = assertValidGitRef(baseRef);
  const validHead = assertValidGitRef(headRef);

  // Validate file path doesn't contain dangerous characters
  if (/[;&|`$(){}[\]<>\\]/.test(filePath)) {
    throw new Error(`File path contains dangerous characters: ${filePath}`);
  }

  const args = ['diff', `${validBase}...${validHead}`, '--', filePath];

  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    return ''; // File might not exist or have changes
  }
}

/**
 * Safely execute arbitrary Git commands with validated arguments
 * Use this for Git operations not covered by the specific helpers above
 *
 * @param {string[]} args - Git command arguments (will be validated)
 * @returns {string} Command output
 */
export function safeGitCommand(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('Git command arguments must be a non-empty array');
  }

  // Validate each argument doesn't contain shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]<>\\]/;
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error(`All Git arguments must be strings, got: ${typeof arg}`);
    }
    if (dangerousChars.test(arg)) {
      throw new Error(`Git argument contains dangerous characters: ${arg}`);
    }
  }

  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${error.message}`);
  }
}
