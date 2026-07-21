#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { glob } from 'glob';

const CODE = 'decimal-string-laundering';
const SCAN_GLOBS = [
  'shared/contracts/**/*.{ts,tsx}',
  'shared/lib/economics/**/*.{ts,tsx}',
  'shared/lib/investment-ledger/**/*.{ts,tsx}',
  'shared/core/cohorts/**/*.{ts,tsx}',
  'server/services/investment-ledger/**/*.{ts,tsx}',
  'server/services/internal-economics/**/*.{ts,tsx}',
];
const NUMBER_CALL = String.raw`\bNumber\s*\([^()\r\n]*\)`;
const TO_NUMBER_CALL = String.raw`\b[A-Za-z_$][\w$]*(?:\s*(?:\.|\?\.)\s*[A-Za-z_$][\w$]*|\s*\[[^\]\r\n]+\])*\s*(?:\.|\?\.)\s*toNumber\s*\(\s*\)`;
const DIRECT_CONVERSION = String.raw`(?:${NUMBER_CALL}|${TO_NUMBER_CALL})`;
const DIRECT_OR_PARENTHESIZED_CONVERSION = String.raw`(?:${DIRECT_CONVERSION}|\(\s*${DIRECT_CONVERSION}\s*\))`;
const SIGNATURES = [
  {
    name: 'String',
    pattern: new RegExp(String.raw`\bString\s*\(\s*${DIRECT_CONVERSION}\s*\)`, 'g'),
  },
  {
    name: 'template literal',
    pattern: new RegExp(String.raw`\$\{\s*${DIRECT_CONVERSION}\s*\}`, 'g'),
  },
  {
    name: 'toFixed',
    pattern: new RegExp(
      String.raw`${DIRECT_OR_PARENTHESIZED_CONVERSION}\s*\.\s*toFixed\s*\([^()\r\n]*\)`,
      'g'
    ),
  },
];

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

export function findDecimalStringLaundering({ filePath, source }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const findings = [];

  for (const signature of SIGNATURES) {
    for (const match of source.matchAll(signature.pattern)) {
      findings.push({
        severity: 'error',
        code: CODE,
        file: normalizedFilePath,
        line: lineNumberAt(source, match.index ?? 0),
        message:
          `Decimal precision laundering through ${signature.name}: ${match[0]}. ` +
          'Keep the value in Decimal form until the final contract serialization boundary.',
      });
    }
  }

  return findings;
}

export function analyze(files) {
  const violations = files
    .flatMap(findDecimalStringLaundering)
    .sort(
      (left, right) =>
        compareStrings(left.file, right.file) ||
        left.line - right.line ||
        compareStrings(left.message, right.message)
    );

  return { ok: violations.length === 0, violations };
}

async function collectSourceFiles(root) {
  const filePaths = await glob(SCAN_GLOBS, {
    cwd: root,
    nodir: true,
    windowsPathsNoEscape: true,
  });

  return filePaths.sort(compareStrings).map((filePath) => {
    const normalizedFilePath = normalizeRepoPath(filePath);
    return {
      filePath: normalizedFilePath,
      source: fs.readFileSync(path.join(root, normalizedFilePath), 'utf8'),
    };
  });
}

export async function check({ root = process.cwd() } = {}) {
  const files = await collectSourceFiles(root);
  return { ...analyze(files), scannedFiles: files.length };
}

export async function runDecimalStringLaunderingCli() {
  const result = await check();

  if (result.ok) {
    console.log(
      `[decimal-string-laundering] pass: ${result.scannedFiles} files scanned; no findings`
    );
    return 0;
  }

  console.error('[decimal-string-laundering] failed: decimal precision laundering found');
  for (const violation of result.violations) {
    console.error(`  - ${violation.file}:${violation.line}`);
    console.error(`    ${JSON.stringify(violation)}`);
  }

  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  runDecimalStringLaunderingCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error('[decimal-string-laundering] failed:', error);
      process.exitCode = 1;
    });
}
