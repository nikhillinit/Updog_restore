#!/usr/bin/env node

/**
 * Check markdown links in documentation files
 * Cross-platform script to validate all links in docs/analysis
 */

import { glob } from 'glob';
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Find all markdown files in docs/analysis
const files = glob.sync('docs/analysis/**/*.md', { cwd: rootDir });

let totalLinks = 0;
let brokenLinks = 0;
const errors = [];

console.log(`Checking links in ${files.length} markdown files...`);

for (const file of files) {
  const filePath = join(rootDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const fileDir = dirname(filePath);

  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkText = match[1];
    const linkUrl = match[2];
    totalLinks++;

    // Skip external links (http/https)
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      continue;
    }

    // Skip anchors without files
    if (linkUrl.startsWith('#')) {
      continue;
    }

    // Parse link URL (remove anchor)
    const [linkPath, anchor] = linkUrl.split('#');

    if (!linkPath) continue;

    // Resolve relative path
    let targetPath;
    if (linkPath.startsWith('/')) {
      // Root-relative path
      targetPath = join(rootDir, linkPath);
    } else {
      // Relative path
      targetPath = resolve(fileDir, linkPath);
    }

    // Check if file exists
    if (!existsSync(targetPath)) {
      brokenLinks++;
      errors.push({
        file: file,
        link: linkUrl,
        text: linkText,
        target: targetPath,
      });
    }
  }
}

// Report results
if (brokenLinks === 0) {
  console.log(`\n[PASS] All ${totalLinks} links are valid`);
  process.exit(0);
} else {
  console.error(`\n[FAIL] Found ${brokenLinks} broken links out of ${totalLinks} total:\n`);

  for (const error of errors) {
    console.error(`  File: ${error.file}`);
    console.error(`  Link: [${error.text}](${error.link})`);
    console.error(`  Target not found: ${error.target}`);
    console.error('');
  }

  process.exit(1);
}
