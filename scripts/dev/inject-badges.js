#!/usr/bin/env node
/**
 * Inject CI status badges into README.md, idempotently.
 * - calc-parity:   actions/workflows/calc-parity.yml
 * - perf-smoke:    actions/workflows/perf-smoke.yml
 *
 * If badges already exist, this script is a no-op.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoOwner = 'nikhillinit';
const repoName  = 'Updog_restore';

const calcBadge = `[![calc-parity](https://github.com/${repoOwner}/${repoName}/actions/workflows/calc-parity.yml/badge.svg?branch=main)](https://github.com/${repoOwner}/${repoName}/actions/workflows/calc-parity.yml)`;
const perfBadge = `[![perf-smoke](https://github.com/${repoOwner}/${repoName}/actions/workflows/perf-smoke.yml/badge.svg?branch=main)](https://github.com/${repoOwner}/${repoName}/actions/workflows/perf-smoke.yml)`;

const badgesBlock =
  `<!-- badges: start -->\n` +
  `${calcBadge} ${perfBadge}\n` +
  `<!-- badges: end -->\n`;

const readmePath = path.join(process.cwd(), 'README.md');
if (!fs.existsSync(readmePath)) {
  console.error('README.md not found in repo root. Aborting.');
  process.exit(1);
}

const original = fs.readFileSync(readmePath, 'utf8');

// If badges already present, do nothing
if (original.includes('actions/workflows/calc-parity.yml') &&
    original.includes('actions/workflows/perf-smoke.yml')) {
  console.log('Badges already present — no changes made.');
  process.exit(0);
}

// If a badges block exists, replace its contents; otherwise, prepend at top
const startMarker = '<!-- badges: start -->';
const endMarker   = '<!-- badges: end -->';

let updated;
if (original.includes(startMarker) && original.includes(endMarker)) {
  const before = original.split(startMarker)[0];
  const after  = original.split(endMarker)[1] ?? '';
  updated = before + badgesBlock + after.trimStart();
} else {
  // Prepend badges and leave a blank line after for readability
  updated = badgesBlock + '\n' + original;
}

fs.writeFileSync(readmePath, updated, 'utf8');
console.log('Badges injected into README.md.');
