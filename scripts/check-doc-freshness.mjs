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

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const STALE_THRESHOLD_DAYS = 7;
const DOCS_TO_CHECK = [
  'docs/**/*.md',
  '.claude/**/*.md',
  'PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md',
  'cheatsheets/**/*.md',
];

// Parse command-line arguments
const args = process.argv.slice(2);
const failOnStale = args.includes('--fail-on-stale');

/**
 * Get last git modification date for a file
 */
function getGitModificationDate(filePath) {
  try {
    const gitDate = execSync(
      `git log -1 --format="%ai" -- "${filePath}"`,
      { encoding: 'utf-8' }
    ).trim();

    if (!gitDate) {
      return null; // File not in git
    }

    return new Date(gitDate);
  } catch (error) {
    return null; // Git error or file not tracked
  }
}

/**
 * Extract date from document frontmatter or content
 */
async function getDocumentDate(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Try frontmatter first (YAML-style)
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const dateMatch = frontmatter.match(/(?:date|lastUpdated|last_updated):\s*([^\n]+)/i);
      if (dateMatch) {
        return new Date(dateMatch[1].trim());
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
 * Get all markdown files matching patterns
 */
async function getMarkdownFiles(patterns) {
  const files = [];

  for (const pattern of patterns) {
    try {
      const globPattern = pattern.replace(/\*\*/g, '*');
      const result = execSync(
        `git ls-files "${globPattern}"`,
        { encoding: 'utf-8' }
      ).trim();

      if (result) {
        files.push(...result.split('\n'));
      }
    } catch (error) {
      // Pattern didn't match any files, that's okay
    }
  }

  return [...new Set(files)]; // Deduplicate
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

  const files = await getMarkdownFiles(DOCS_TO_CHECK);
  console.log(`[INFO] Found ${files.length} markdown files to check\n`);

  const results = {
    fresh: [],
    stale: [],
    noDocDate: [],
    noGitDate: [],
  };

  for (const file of files) {
    const docDate = await getDocumentDate(file);
    const gitDate = getGitModificationDate(file);

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

  if (results.noDocDate.length > 0 && results.noDocDate.length < 10) {
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
