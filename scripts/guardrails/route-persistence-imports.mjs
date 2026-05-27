#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { glob } from 'glob';

const BASELINE_PATH = path.join('.baselines', 'route-persistence-imports.json');
const ROUTE_GLOB = 'server/routes/**/*.ts';
const ROOT = process.cwd();

const IMPORT_SPECIFIER_PATTERN =
  /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function withoutKnownExtension(filePath) {
  return filePath.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/, '');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

function resolveImportTarget(filePath, specifier) {
  const normalizedFilePath = normalizeRepoPath(filePath);

  if (specifier.startsWith('@server/')) {
    return normalizeRepoPath(path.posix.join('server', specifier.slice('@server/'.length)));
  }

  if (specifier === '@server') {
    return 'server';
  }

  if (specifier.startsWith('server/')) {
    return normalizeRepoPath(specifier);
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const baseDirectory = path.posix.dirname(normalizedFilePath);
  return normalizeRepoPath(path.posix.normalize(path.posix.join(baseDirectory, specifier)));
}

function isPersistenceTarget(targetPath) {
  const normalizedTarget = withoutKnownExtension(normalizeRepoPath(targetPath));

  return (
    normalizedTarget === 'server/db' ||
    normalizedTarget.startsWith('server/db/') ||
    normalizedTarget === 'server/db-serverless' ||
    normalizedTarget === 'server/storage' ||
    normalizedTarget.startsWith('server/storage/')
  );
}

export function findRoutePersistenceImports({ filePath, source }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const imports = [];

  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;

    const target = resolveImportTarget(normalizedFilePath, specifier);
    if (!target || !isPersistenceTarget(target)) continue;

    imports.push({
      filePath: normalizedFilePath,
      line: lineNumberAt(source, match.index ?? 0),
      specifier,
      target,
    });
  }

  return imports;
}

export function analyzeRoutePersistenceImports({ routeFiles, allowedRouteFiles }) {
  const allowed = new Set((allowedRouteFiles || []).map(normalizeRepoPath));
  const imports = routeFiles.flatMap(findRoutePersistenceImports);
  const currentRouteFiles = [...new Set(imports.map((entry) => entry.filePath))].sort(
    compareStrings
  );
  const unexpectedRouteFiles = currentRouteFiles
    .filter((filePath) => !allowed.has(filePath))
    .sort(compareStrings);
  const unexpectedRouteFileSet = new Set(unexpectedRouteFiles);
  const retiredAllowedRouteFiles = [...allowed]
    .filter((filePath) => !currentRouteFiles.includes(filePath))
    .sort(compareStrings);
  const unexpectedImports = imports
    .filter((entry) => unexpectedRouteFileSet.has(entry.filePath))
    .sort((left, right) => compareStrings(left.filePath, right.filePath) || left.line - right.line);

  return {
    imports,
    currentRouteFiles,
    unexpectedRouteFiles,
    retiredAllowedRouteFiles,
    unexpectedImports,
  };
}

async function collectRouteFiles({ root = ROOT, routeGlob = ROUTE_GLOB } = {}) {
  const files = await glob(routeGlob, {
    cwd: root,
    ignore: ['**/*.d.ts'],
    nodir: true,
    windowsPathsNoEscape: true,
  });

  return files.sort(compareStrings).map((filePath) => {
    const normalizedFilePath = normalizeRepoPath(filePath);
    return {
      filePath: normalizedFilePath,
      source: fs.readFileSync(path.join(root, normalizedFilePath), 'utf8'),
    };
  });
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readBaseline(baselinePath = BASELINE_PATH) {
  if (!fs.existsSync(baselinePath)) {
    return null;
  }

  return readJsonFile(baselinePath);
}

function writeBaseline({ analysis, baselinePath = BASELINE_PATH }) {
  const baseline = {
    allowedRouteFiles: analysis.currentRouteFiles,
    generatedAt: new Date().toISOString(),
    policy:
      'No new server route files may import db or storage persistence modules directly. Move new persistence access behind services.',
    restrictedModules: ['server/db', 'server/db/*', 'server/db-serverless', 'server/storage'],
    scope: [ROUTE_GLOB],
  };

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  return baseline;
}

function printAnalysisResult(result) {
  console.log(
    `[route-persistence-imports] route files importing persistence: ${result.currentRouteFiles.length}`
  );

  if (result.currentRouteFiles.length > 0) {
    for (const filePath of result.currentRouteFiles) {
      console.log(`  - ${filePath}`);
    }
  }

  if (result.retiredAllowedRouteFiles.length > 0) {
    console.log(
      `[route-persistence-imports] retired allowlist entries: ${result.retiredAllowedRouteFiles.length}`
    );
    for (const filePath of result.retiredAllowedRouteFiles) {
      console.log(`  - ${filePath}`);
    }
  }
}

function failUnexpectedRouteImports(unexpectedImports) {
  console.error(
    '[route-persistence-imports] failed: new route files import db/storage persistence directly'
  );

  for (const entry of unexpectedImports) {
    console.error(`  - ${entry.filePath}:${entry.line} imports ${entry.specifier}`);
  }

  console.error(
    '[route-persistence-imports] move new persistence access behind a service or explicitly update the baseline after refactor review'
  );
}

export async function runRoutePersistenceImportsCli({
  argv = process.argv.slice(2),
  baselinePath = BASELINE_PATH,
  root = ROOT,
  routeGlob = ROUTE_GLOB,
} = {}) {
  const routeFiles = await collectRouteFiles({ root, routeGlob });
  const currentAnalysis = analyzeRoutePersistenceImports({
    routeFiles,
    allowedRouteFiles: [],
  });

  if (argv.includes('--write-baseline')) {
    const baseline = writeBaseline({ analysis: currentAnalysis, baselinePath });
    console.log(
      `[route-persistence-imports] baseline written to ${baselinePath} (${baseline.allowedRouteFiles.length} route files)`
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  if (!baseline) {
    console.error(`[route-persistence-imports] baseline missing: ${baselinePath}`);
    console.error('[route-persistence-imports] run with --write-baseline to initialize');
    return 1;
  }

  const result = analyzeRoutePersistenceImports({
    routeFiles,
    allowedRouteFiles: baseline.allowedRouteFiles,
  });
  printAnalysisResult(result);

  if (result.unexpectedRouteFiles.length > 0) {
    failUnexpectedRouteImports(result.unexpectedImports);
    return 1;
  }

  console.log('[route-persistence-imports] pass: no unexpected route persistence imports');
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  runRoutePersistenceImportsCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error('[route-persistence-imports] failed:', error);
      process.exitCode = 1;
    });
}
