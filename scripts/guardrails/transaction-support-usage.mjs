#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { glob } from 'glob';
import { pathToFileURL } from 'node:url';

const CODE = 'transaction-support-usage';
const ADR_073_MESSAGE =
  'ADR-073: atomicity-requiring paths must use guarded single-statement CTEs or a transaction-capable driver; extending the fallback/wrapper requires an ADR amendment';
const RUN_WITH_TRANSACTION_FALLBACK = 'runWithTransactionFallback';
const RUN_IN_TRANSACTION = 'runInTransaction';

const ALLOWLIST = {
  [RUN_WITH_TRANSACTION_FALLBACK]: new Set([
    'server/lib/transaction-support.ts',
    'server/services/current-forecast-v2-service.ts',
    'server/services/current-forecast-reference-service.ts',
    'server/services/current-forecast-resume-command.ts',
  ]),
  [RUN_IN_TRANSACTION]: new Set([
    'server/services/lp-reporting/report-package-service.ts',
    'server/services/lp-reporting/planning-fmv-override-service.ts',
  ]),
};

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

function importFindings({ filePath, source }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const findings = [];
  const importPattern = /import\s+([\s\S]*?)\s+from\s+['"][^'"]*transaction-support['"]/g;

  for (const match of source.matchAll(importPattern)) {
    const importedNames = match[1].match(/\b(?:runWithTransactionFallback|runInTransaction)\b/g) ?? [];
    if (importedNames.length === 0 && match[1].includes('*')) importedNames.push('transaction-support module');
    for (const name of new Set(importedNames)) {
      const isTest = normalizedFilePath.startsWith('tests/');
      const allowed = isTest || normalizedFilePath === 'server/lib/transaction-support.ts' ||
        (name !== 'transaction-support module' && ALLOWLIST[name]?.has(normalizedFilePath));
      if (allowed) continue;
      findings.push({
        severity: 'error',
        code: CODE,
        file: normalizedFilePath,
        line: lineNumberAt(source, match.index ?? 0),
        message: `${name} import is outside its ADR-073 allowlist. ${ADR_073_MESSAGE}`,
      });
    }
  }
  return findings;
}

function localWithTransactionFindings({ filePath, source }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const findings = [];
  const definitionPattern = /\bfunction\s+withTransaction\s*\(|\b(?:const|let)\s+withTransaction\s*=\s*(?:async\s*)?\(/g;
  for (const match of source.matchAll(definitionPattern)) {
    findings.push({
      severity: 'error',
      code: CODE,
      file: normalizedFilePath,
      line: lineNumberAt(source, match.index ?? 0),
      message: `Local withTransaction helper is forbidden under server/services. ${ADR_073_MESSAGE}`,
    });
  }
  return findings;
}

export function analyze(files) {
  const violations = files
    .flatMap((file) => [...importFindings(file), ...(file.filePath.startsWith('server/services/') ? localWithTransactionFindings(file) : [])])
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.message.localeCompare(right.message));
  return { ok: violations.length === 0, violations };
}

async function collectSourceFiles(root) {
  const filePaths = await glob(['server/**/*.ts', 'tests/**/*.ts'], {
    cwd: root,
    nodir: true,
    windowsPathsNoEscape: true,
  });
  return filePaths.sort().map((filePath) => {
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

export async function runTransactionSupportUsageCli() {
  const result = await check();
  if (result.ok) {
    console.log(`[${CODE}] pass: ${result.scannedFiles} files scanned; allowlists intact`);
    return 0;
  }

  console.error(`[${CODE}] failed: transaction-support usage outside ADR-073 boundaries`);
  for (const violation of result.violations) {
    console.error(`  - ${violation.file}:${violation.line}`);
    console.error(`    ${violation.message}`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runTransactionSupportUsageCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[${CODE}] failed:`, error);
      process.exitCode = 1;
    });
}
