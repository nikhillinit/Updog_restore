#!/usr/bin/env node
/**
 * Atomic lane execution with stale lock recovery
 * Prevents TOCTOU races and handles crashed processes
 */

import { open, unlink, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_LOCK_AGE_MS = 10 * 60 * 1000; // 10 minutes

async function isLockStale(path) {
  try {
    const stats = await stat(path);
    return Date.now() - stats.mtimeMs > MAX_LOCK_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Execute a lane with atomic locking
 * @param {string} name - Lane name (e.g., "exact-optional")
 * @param {string[]} files - Files to process
 * @param {Function} fn - Processing function
 * @returns {Promise<{status: string, reason?: string}>}
 */
export async function executeLane(name, files, fn) {
  const lockDir = 'artifacts/week2/locks';
  const lockPath = `${lockDir}/${name}.lock`;

  // Ensure lock directory exists
  if (!existsSync(lockDir)) {
    await mkdir(lockDir, { recursive: true });
  }

  let handle;

  try {
    // Atomic lock acquisition with 'wx' (exclusive create)
    handle = await open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({
      pid: process.pid,
      started: new Date().toISOString(),
      lane: name,
      files: files.length
    }, null, 2));

    console.log(`✓ Acquired lock for lane: ${name} (${files.length} files)`);

    // Execute lane work
    for (const file of files) {
      await fn(file);
    }

    console.log(`✓ Completed lane: ${name}`);
    return { status: 'completed' };

  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock exists - check if stale
      if (await isLockStale(lockPath)) {
        console.warn(`⚠ Removing stale lock for ${name} (>10min old)`);
        await unlink(lockPath);
        // Retry once
        return executeLane(name, files, fn);
      }

      console.log(`⊘ Lane ${name} locked by another process`);
      return { status: 'skipped', reason: 'locked' };
    }
    throw err;
  } finally {
    await handle?.close();

    // Clean up lock
    try {
      await unlink(lockPath);
    } catch {
      // Lock file may not exist if creation failed
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const laneName = process.argv[2];
  const files = process.argv.slice(3);

  if (!laneName || files.length === 0) {
    console.error('Usage: node execute-lane.mjs <lane-name> <file1> [file2...]');
    process.exit(1);
  }

  const result = await executeLane(laneName, files, async (file) => {
    console.log(`Processing: ${file}`);
    // Placeholder - actual processing done by caller
  });

  console.log(`Result: ${result.status}`);
  process.exit(result.status === 'completed' ? 0 : 1);
}
