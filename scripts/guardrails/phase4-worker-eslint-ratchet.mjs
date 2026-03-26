#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';

const BASELINE_PATH = path.join('.baselines', 'phase4-worker-eslint-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const ROOT = process.cwd();

const FILES = [
  'workers/cohort-worker.ts',
  'workers/pacing-worker.ts',
  'workers/reserve-worker.ts',
];

function normalizePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

async function collectCounts() {
  const eslint = new ESLint({
    cache: false,
    ignore: false,
    cwd: ROOT,
  });
  const report = await eslint.lintFiles(FILES);
  const fileWarnings = {};
  let totalWarnings = 0;
  let totalErrors = 0;

  for (const entry of report) {
    const relativePath = normalizePath(entry.filePath);
    fileWarnings[relativePath] = entry.warningCount;
    totalWarnings += entry.warningCount;
    totalErrors += entry.errorCount;
  }

  return {
    totalWarnings,
    totalErrors,
    fileWarnings,
  };
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

function printSummary(current) {
  console.log(`[phase4-worker-eslint-ratchet] worker warnings: ${current.totalWarnings}`);

  for (const file of FILES) {
    console.log(`  - ${file}: ${current.fileWarnings[file] ?? 0}`);
  }

  if (current.totalErrors > 0) {
    console.log(`  - errors: ${current.totalErrors}`);
  }
}

function assertNoErrors(current) {
  if (current.totalErrors > 0) {
    throw new Error(
      `[phase4-worker-eslint-ratchet] failed: current errors ${current.totalErrors} > 0`
    );
  }
}

function assertMatchesBaseline(current, baseline) {
  const baselineFiles = Object.keys(baseline.fileWarnings ?? {}).sort();
  const currentFiles = Object.keys(current.fileWarnings).sort();

  if (baselineFiles.join('|') !== currentFiles.join('|')) {
    throw new Error(
      `[phase4-worker-eslint-ratchet] failed: file set drifted (${currentFiles.join(', ')})`
    );
  }

  const regressions = [];

  for (const file of currentFiles) {
    const currentWarnings = current.fileWarnings[file] ?? 0;
    const baselineWarnings = baseline.fileWarnings[file] ?? 0;

    if (currentWarnings > baselineWarnings) {
      regressions.push(`${file}: current ${currentWarnings} > baseline ${baselineWarnings}`);
    }
  }

  if (current.totalWarnings > baseline.totalWarnings) {
    regressions.push(
      `total warnings: current ${current.totalWarnings} > baseline ${baseline.totalWarnings}`
    );
  }

  if (regressions.length > 0) {
    throw new Error(`[phase4-worker-eslint-ratchet] failed:\n  - ${regressions.join('\n  - ')}`);
  }
}

async function main() {
  const current = await collectCounts();
  printSummary(current);
  assertNoErrors(current);

  if (WRITE_BASELINE) {
    writeBaseline({
      totalWarnings: current.totalWarnings,
      fileWarnings: current.fileWarnings,
      generatedAt: new Date().toISOString(),
      scope: FILES,
    });
    console.log(`[phase4-worker-eslint-ratchet] baseline written to ${BASELINE_PATH}`);
    return;
  }

  const baseline = readBaseline();

  if (!baseline) {
    throw new Error(
      `[phase4-worker-eslint-ratchet] baseline missing: ${BASELINE_PATH}. Run with --write-baseline to initialize.`
    );
  }

  assertMatchesBaseline(current, baseline);
  console.log(
    `[phase4-worker-eslint-ratchet] pass: current ${current.totalWarnings} <= baseline ${baseline.totalWarnings}`
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
