#!/usr/bin/env node

import console from 'node:console';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { check } from './legacy-calculation-consumers-lib.mjs';

export async function runLegacyCalculationConsumersCli() {
  const result = await check();

  if (result.ok) {
    console.log(
      `[legacy-calculation-consumers] pass: ${result.scannedFiles} files scanned; ` +
        '8 declared consumers; no violations'
    );
    return 0;
  }

  console.error('[legacy-calculation-consumers] failed: unexpected legacy consumers found');
  for (const violation of result.violations) {
    console.error(`  - ${violation.file}:${violation.line} imports ${violation.specifier}`);
    console.error(`    ${JSON.stringify(violation)}`);
  }

  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  runLegacyCalculationConsumersCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error('[legacy-calculation-consumers] failed:', error);
      process.exitCode = 1;
    });
}
