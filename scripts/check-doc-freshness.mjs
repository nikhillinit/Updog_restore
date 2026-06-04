#!/usr/bin/env node
/**
 * Documentation Freshness Checker
 *
 * Prevents documentation drift by comparing doc timestamps with git modification dates.
 * Flags documents that are >7 days stale compared to their last git modification.
 *
 * Reuses pattern from scripts/check-migration-status.mjs
 *
 * Usage:
 *   node scripts/check-doc-freshness.mjs [--fail-on-stale]
 *
 * Options:
 *   --fail-on-stale  Exit with code 1 if any stale documents found (for CI)
 */

import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
// Configuration
const STALE_THRESHOLD_DAYS = 7;
const DOC_PATHS_TO_CHECK = [
  'docs',
  '.claude',
  'PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md',
  'cheatsheets',
];
const EXCLUDE_PREFIXES = [
  'docs/archive/',
  'docs/observability/archive/',
];
let usingFilesystemFallback = false;

// Parse command-line arguments
const args = process.argv.slice(2);
const failOnStale = args.includes('--fail-on-stale');

/**
 * Normalize paths for prefix checks and reporting.
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Get the filesystem modification date for a file.
 */
async function getFilesystemModificationDate(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch (error) {
    return null;
  }
}

/**
 * Get last git modification date for a file, or fall back to filesystem mtime
 * when git process execution is unavailable in the current environment.
 */
async function getGitModificationDate(filePath) {
  if (usingFilesystemFallback) {
    return getFilesystemModificationDate(filePath);
  }

  try {
    const gitDate = execFileSync(
      'git',
      ['log', '-1', '--format=%ai', '--', filePath],
      { encoding: 'utf-8' }
    ).trim();

    if (!gitDate) {
      return null; // File not in git
    }

    return new Date(gitDate);
  } catch (error) {
    usingFilesystemFallback = true;
    return getFilesystemModificationDate(filePath);
  }
}

/**
 * Extract date from document frontmatter or content.
 */
async function getDocumentDate(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Try frontmatter first (YAML-style)
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const prioritizedFrontmatterPatterns = [
        /last_updated:\s*([^\n]+)/i,
        /lastUpdated:\s*([^\n]+)/i,
        /date:\s*([^\n]+)/i,
      ];

      for (const pattern of prioritizedFrontmatterPatterns) {
        const dateMatch = frontmatter.match(pattern);
        if (dateMatch) {
          return new Date(dateMatch[1].trim());
        }
      }
    }

    // Try inline date patterns
    const inlineDatePatterns = [
      /Last Updated:\s*(\d{4}-\d{2}-\d{2})/i,
      /Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /Updated:\s*(\d{4}-\d{2}-\d{2})/i,
      /\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/i,
    ];

    for (const pattern of inlineDatePatterns) {
      const match = content.match(pattern);
      if (match) {
        return new Date(match[1]);
      }
    }

    return null; // No date found in document
  } catch (error) {
    return null; // File read error
  }
}

/**
 * Recursively gather markdown files from the configured doc paths.
 */
async function getFilesystemMarkdownFiles(pathsToCheck) {
  const files = [];

  async function walk(entryPath) {
    const normalizedEntryPath = normalizePath(entryPath);
    if (EXCLUDE_PREFIXES.some(prefix => normalizedEntryPath.startsWith(prefix))) {
      return;
    }

    let stats;
    try {
      stats = await fs.stat(entryPath);
    } catch {
      return;
    }

    if (stats.isDirectory()) {
      const entries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const entry of entries) {
        await walk(path.join(entryPath, entry.name));
      }
      return;
    }

    if (stats.isFile() && entryPath.toLowerCase().endsWith('.md')) {
      files.push(normalizedEntryPath);
    }
  }

  for (const entryPath of pathsToCheck) {
    await walk(entryPath);
  }

  return [...new Set(files)];
}

/**
 * Get all tracked markdown files under the configured doc paths.
 *
 * `git ls-files` does not expand the `**` patterns we previously passed here
 * in a portable way, and the old `** -> *` rewrite collapsed recursive matches
 * into root-level-only lookups. Ask git for the tracked paths directly instead,
 * then filter to markdown files in-process.
 */
async function getMarkdownFiles(pathsToCheck) {
  try {
    const result = execFileSync(
      'git',
      ['ls-files', '--', ...pathsToCheck],
      { encoding: 'utf-8' }
    ).trim();

    if (!result) {
      return [];
    }

    const deduped = [...new Set(result.split('\n'))];
    return deduped
      .map(normalizePath)
      .filter(file => file.toLowerCase().endsWith('.md'))
      .filter(file => !EXCLUDE_PREFIXES.some(prefix => file.startsWith(prefix)));
  } catch (error) {
    usingFilesystemFallback = true;
    return getFilesystemMarkdownFiles(pathsToCheck);
  }
}

/**
 * Calculate staleness in days
 */
function calculateStaleness(docDate, gitDate) {
  if (!docDate || !gitDate) {
    return null;
  }

  const diffMs = gitDate - docDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Main freshness check logic
 */
async function checkDocFreshness() {
  console.log('[CHECK] Documentation Freshness Verification');
  console.log(`[INFO] Threshold: ${STALE_THRESHOLD_DAYS} days\n`);

  const files = await getMarkdownFiles(DOC_PATHS_TO_CHECK);
  console.log(`[INFO] Found ${files.length} markdown files to check\n`);
  if (usingFilesystemFallback) {
    console.log('[INFO] Git metadata unavailable; using filesystem modification times as fallback\n');
  }

  const results = {
    fresh: [],
    stale: [],
    noDocDate: [],
    noGitDate: [],
  };

  for (const file of files) {
    const docDate = await getDocumentDate(file);
    const gitDate = await getGitModificationDate(file);

    if (!gitDate) {
      results.noGitDate.push({ file });
      continue;
    }

    if (!docDate) {
      results.noDocDate.push({ file, gitDate });
      continue;
    }

    const staleness = calculateStaleness(docDate, gitDate);

    if (staleness === null) {
      continue; // Skip if we can't determine staleness
    }

    const fileResult = {
      file,
      docDate: docDate && !isNaN(docDate.getTime()) ? docDate.toISOString().split('T')[0] : 'invalid',
      gitDate: gitDate && !isNaN(gitDate.getTime()) ? gitDate.toISOString().split('T')[0] : 'invalid',
      staleness,
    };

    if (staleness > STALE_THRESHOLD_DAYS) {
      results.stale.push(fileResult);
    } else {
      results.fresh.push(fileResult);
    }
  }

  // Report results
  console.log('[RESULTS]');
  console.log(`  Fresh documents: ${results.fresh.length}`);
  console.log(`  Stale documents: ${results.stale.length}`);
  console.log(`  Missing doc date: ${results.noDocDate.length}`);
  console.log(`  Not in git: ${results.noGitDate.length}`);

  if (results.stale.length > 0) {
    console.log('\n[WARNING] Stale Documents Found:');
    results.stale.forEach((item) => {
      console.log(`  [STALE] ${item.file}`);
      console.log(`    Doc date: ${item.docDate}`);
      console.log(`    Git date: ${item.gitDate}`);
      console.log(`    Staleness: ${item.staleness} days\n`);
    });
  }

  if (results.noDocDate.length > 0) {
    console.log('\n[INFO] Documents without date metadata:');
    results.noDocDate.slice(0, 10).forEach((item) => {
      console.log(`  ${item.file}`);
    });
    if (results.noDocDate.length > 10) {
      console.log(`  ... and ${results.noDocDate.length - 10} more`);
    }
  }

  // Summary
  const needsAttention = results.stale.length > 0;

  console.log(`\n[SUMMARY] ${needsAttention ? 'ATTENTION REQUIRED' : 'ALL DOCUMENTS FRESH'}`);

  if (needsAttention) {
    console.log('[ACTION] Update stale documents or verify git dates are correct');
  }

  // Exit code
  if (failOnStale && results.stale.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run check
checkDocFreshness().catch((error) => {
  console.error('\n[ERROR]', error.message);
  if (error.stack) {
    console.error('[STACK]', error.stack);
  }
  process.exit(2);
});
