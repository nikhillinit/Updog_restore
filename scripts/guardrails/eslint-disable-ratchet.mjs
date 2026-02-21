#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const BASELINE_PATH = path.join('.baselines', 'eslint-file-disable-baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const ROOT = process.cwd();

const SOURCES = [
  'client/src/**/*.{ts,tsx,js}',
  'server/**/*.{ts,tsx,js}',
  'shared/**/*.{ts,tsx,js}',
  'types/**/*.d.ts',
];

const IGNORE = [
  '**/node_modules/**',
];

const FILE_LEVEL_DISABLE_REGEX = /^\s*\/\*\s*eslint-disable\b/m;

async function collectFileLevelDisables() {
  const files = await glob(SOURCES, { ignore: IGNORE, nodir: true });
  const matches = [];
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const content = fs.readFileSync(abs, 'utf8');
    if (FILE_LEVEL_DISABLE_REGEX.test(content)) {
      matches.push(file.replace(/\\/g, '/'));
    }
  }
  return matches.sort();
}

function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

async function main() {
  const files = await collectFileLevelDisables();
  console.log(`[eslint-disable-ratchet] file-level disables: ${files.length}`);
  for (const file of files.slice(0, 20)) {
    console.log(`  - ${file}`);
  }
  if (files.length > 20) {
    console.log(`  ... ${files.length - 20} more`);
  }

  if (WRITE_BASELINE) {
    writeBaseline({
      total: files.length,
      files,
      generatedAt: new Date().toISOString(),
      scope: SOURCES,
      ignore: IGNORE,
      detector: FILE_LEVEL_DISABLE_REGEX.source,
    });
    console.log(`[eslint-disable-ratchet] baseline written to ${BASELINE_PATH}`);
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error(`[eslint-disable-ratchet] baseline missing: ${BASELINE_PATH}`);
    console.error('[eslint-disable-ratchet] run with --write-baseline to initialize');
    process.exit(1);
  }

  if (files.length > baseline.total) {
    console.error(
      `[eslint-disable-ratchet] failed: current ${files.length} > baseline ${baseline.total}`
    );
    process.exit(1);
  }

  console.log(
    `[eslint-disable-ratchet] pass: current ${files.length} <= baseline ${baseline.total}`
  );
}

main().catch((error) => {
  console.error('[eslint-disable-ratchet] failed:', error);
  process.exit(1);
});
