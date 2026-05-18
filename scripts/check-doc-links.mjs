#!/usr/bin/env node

/**
 * Check markdown links in documentation files.
 *
 * Default scan covers active docs + root governance files. Pass --analysis-only
 * to restrict to the original docs/analysis/** scope (legacy behavior).
 * Pass --report-only to print broken refs without exiting non-zero (useful for
 * baselining before a deletion PR cleans up stale references).
 */

import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const analysisOnly = args.has('--analysis-only');
const reportOnly = args.has('--report-only');

const ROOT_GOVERNANCE_DOCS = [
  'CAPABILITIES.md',
  'DECISIONS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'README.md',
];

const files = analysisOnly
  ? glob.sync('docs/analysis/**/*.md', { cwd: rootDir })
  : [
      ...glob.sync('docs/**/*.md', {
        cwd: rootDir,
        ignore: ['docs/archive/**', 'docs/_generated/**', 'docs/skills/REFL-*.md'],
      }),
      ...ROOT_GOVERNANCE_DOCS.filter((f) => existsSync(join(rootDir, f))),
    ];

let totalLinks = 0;
let brokenLinks = 0;
const errors = [];

console.log(
  `Checking links in ${files.length} markdown files${analysisOnly ? ' (analysis-only)' : ''}...`,
);

for (const file of files) {
  const filePath = join(rootDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const fileDir = dirname(filePath);

  // Match markdown links: [text](url) - skip image links and reference-style links
  const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkText = match[1];
    const linkUrl = match[2].trim();
    totalLinks++;

    // Skip external links and protocols
    if (
      linkUrl.startsWith('http://') ||
      linkUrl.startsWith('https://') ||
      linkUrl.startsWith('mailto:') ||
      linkUrl.startsWith('tel:')
    ) {
      continue;
    }

    // Skip pure anchors
    if (linkUrl.startsWith('#')) {
      continue;
    }

    // Parse link URL (strip anchor + query)
    const [pathPart] = linkUrl.split(/[#?]/);
    if (!pathPart) continue;

    // Resolve relative path
    const targetPath = pathPart.startsWith('/')
      ? join(rootDir, pathPart)
      : resolve(fileDir, pathPart);

    if (!existsSync(targetPath)) {
      brokenLinks++;
      errors.push({
        file,
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
}

console.error(`\n[FAIL] Found ${brokenLinks} broken links out of ${totalLinks} total:\n`);

for (const error of errors) {
  console.error(`  File: ${error.file}`);
  console.error(`  Link: [${error.text}](${error.link})`);
  console.error(`  Target not found: ${error.target}`);
  console.error('');
}

if (reportOnly) {
  console.error(`[REPORT-ONLY] Exiting 0 despite ${brokenLinks} broken links.`);
  process.exit(0);
}

process.exit(1);
