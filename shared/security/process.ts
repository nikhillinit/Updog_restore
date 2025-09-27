/**
 * Security utilities for safe process execution
 * Prevents command injection vulnerabilities
 */

import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { URL } from 'url';

const execFile = promisify(execFileCallback);

// Strict allowlist for binaries
export const ALLOWED_BINARIES = Object.freeze({
  GIT: 'git',
  NPM: 'npm',
  NPX: 'npx',
  NODE: 'node',
  PSQL: 'psql',
  CURL: 'curl', // Consider replacing with fetch
} as const);

/**
 * Validates a branch name or file path
 */
export function validatePathOrBranch(input: string, maxLength = 255): string {
  if (!input || input.length > maxLength) {
    throw new Error(`Invalid input: must be 1-${maxLength} characters`);
  }
  
  // Allow alphanumeric, dots, slashes, hyphens, underscores
  if (!/^[\w./-]+$/.test(input)) {
    throw new Error('Invalid characters in path/branch name');
  }
  
  // Prevent path traversal
  if (input.includes('..')) {
    throw new Error('Path traversal detected');
  }
  
  return input;
}

/**
 * Validates a URL and returns parsed URL object
 */
export function validateUrl(url: string, allowedProtocols = ['https:', 'http:']): URL {
  try {
    const parsed = new URL(url);
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Safe git diff execution
 */
export async function gitDiffSafe(baseBranch: string, file: string) {
  const safeBranch = validatePathOrBranch(baseBranch);
  const safeFile = validatePathOrBranch(file);
  
  return execFile(ALLOWED_BINARIES.GIT, [
    'diff',
    `${safeBranch}...HEAD`,
    '--',
    safeFile
  ], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB max
    timeout: 30000 // 30 second timeout
  });
}

/**
 * Safe npm/npx execution
 */
export async function npmRunSafe(script: string, args: string[] = []) {
  // Validate script name
  if (!/^[\w:-]+$/.test(script)) {
    throw new Error('Invalid npm script name');
  }
  
  // Validate all arguments
  const safeArgs = args.map(arg => validatePathOrBranch(arg));
  
  return execFile(ALLOWED_BINARIES.NPM, [
    'run',
    script,
    '--',
    ...safeArgs
  ], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024, // 50MB for build outputs
    timeout: 300000 // 5 minute timeout for builds
  });
}

/**
 * Environment-based HTTP check
 */
export function assertHttpsInProduction(url: string): void {
  if (process.env['NODE_ENV'] === 'production') {
    const parsed = validateUrl(url, ['https:', 'http:']);
    if (parsed.protocol === 'http:') {
      throw new Error('HTTP not allowed in production');
    }
  }
}