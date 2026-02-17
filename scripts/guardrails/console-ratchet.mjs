#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const BASELINE_PATH = path.join('.baselines', 'console-prod-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const ROOT = process.cwd();

const SOURCES = [
  'client/src/**/*.{ts,tsx,js}',
  'server/**/*.{ts,tsx,js}',
  'shared/**/*.{ts,tsx,js}',
];

const IGNORE = [
  '**/node_modules/**',
  'client/src/debug/**',
  'server/examples/**',
  '**/*.d.ts',
];

const DISALLOWED_METHODS = ['log', 'debug', 'info', 'table', 'group', 'groupEnd'];

function countInContent(content) {
  const byMethod = Object.fromEntries(DISALLOWED_METHODS.map((method) => [method, 0]));

  for (const method of DISALLOWED_METHODS) {
    const regex = new RegExp(`\\bconsole\\.${method}\\s*\\(`, 'g');
    const matches = content.match(regex);
    byMethod[method] = matches ? matches.length : 0;
  }

  return byMethod;
}

function aggregateCounts(fileCounts) {
  const totalByMethod = Object.fromEntries(DISALLOWED_METHODS.map((method) => [method, 0]));
  let total = 0;
  for (const counts of Object.values(fileCounts)) {
    for (const method of DISALLOWED_METHODS) {
      totalByMethod[method] += counts[method];
      total += counts[method];
    }
  }
  return { total, byMethod: totalByMethod };
}

async function collectCounts() {
  const files = await glob(SOURCES, { ignore: IGNORE, nodir: true });
  const fileCounts = {};

  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const content = fs.readFileSync(abs, 'utf8');
    const counts = countInContent(content);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      fileCounts[file.replace(/\\/g, '/')] = counts;
    }
  }

  return fileCounts;
}

function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function printSummary(current, fileCounts) {
  console.log(`[console-ratchet] total disallowed console calls: ${current.total}`);
  for (const method of DISALLOWED_METHODS) {
    console.log(`  - ${method}: ${current.byMethod[method]}`);
  }

  const top = Object.entries(fileCounts)
    .map(([file, counts]) => [file, Object.values(counts).reduce((sum, n) => sum + n, 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (top.length > 0) {
    console.log('[console-ratchet] top offenders:');
    for (const [file, count] of top) {
      console.log(`  - ${count}: ${file}`);
    }
  }
}

async function main() {
  const fileCounts = await collectCounts();
  const current = aggregateCounts(fileCounts);
  printSummary(current, fileCounts);

  if (WRITE_BASELINE) {
    writeBaseline({
      total: current.total,
      byMethod: current.byMethod,
      generatedAt: new Date().toISOString(),
      scope: SOURCES,
      ignore: IGNORE,
      disallowedMethods: DISALLOWED_METHODS,
    });
    console.log(`[console-ratchet] baseline written to ${BASELINE_PATH}`);
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error(`[console-ratchet] baseline missing: ${BASELINE_PATH}`);
    console.error('[console-ratchet] run with --write-baseline to initialize');
    process.exit(1);
  }

  if (current.total > baseline.total) {
    console.error(
      `[console-ratchet] failed: current ${current.total} > baseline ${baseline.total}`
    );
    process.exit(1);
  }

  console.log(`[console-ratchet] pass: current ${current.total} <= baseline ${baseline.total}`);
}

main().catch((error) => {
  console.error('[console-ratchet] failed:', error);
  process.exit(1);
});
