import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { glob } from 'glob';

const CODE = 'legacy-calculation-consumers';
const MANIFEST_PATH = path.join('config', 'calculation-migration-manifest.json');
const IMPORT_SPECIFIER_PATTERN =
  /\bimport\s+(?:type\s+)?(?:[^'\"]*?\s+from\s+)?['\"]([^'\"]+)['\"]|import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)|export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['\"]([^'\"]+)['\"]/gm;
const KNOWN_EXTENSION_PATTERN = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function withoutKnownExtension(filePath) {
  return filePath.replace(KNOWN_EXTENSION_PATTERN, '');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

function resolveImportTarget(filePath, specifier) {
  const aliases = [
    ['@/', 'client/src/'],
    ['@shared/', 'shared/'],
    ['@server/', 'server/'],
  ];

  for (const [prefix, targetPrefix] of aliases) {
    if (specifier.startsWith(prefix)) {
      return normalizeRepoPath(`${targetPrefix}${specifier.slice(prefix.length)}`);
    }
  }

  if (/^(?:server|client|shared)\//.test(specifier)) {
    return normalizeRepoPath(specifier);
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  return normalizeRepoPath(
    path.posix.normalize(path.posix.join(path.posix.dirname(normalizeRepoPath(filePath)), specifier))
  );
}

function targetMatchesDeclaredPath(targetPath, declaredPath) {
  const target = withoutKnownExtension(normalizeRepoPath(targetPath));
  const declared = withoutKnownExtension(normalizeRepoPath(declaredPath));

  return target === declared || (declared.endsWith('/index') && target === declared.slice(0, -6));
}

function importedNames(statement) {
  const namedBindings = statement.match(/\{([\s\S]*?)\}/);
  if (!namedBindings) return [];

  return namedBindings[1]
    .split(',')
    .map((binding) => binding.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim())
    .filter(Boolean);
}

export function findLegacyCalculationConsumers({ filePath, source }, manifest) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const findings = [];

  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;

    const target = resolveImportTarget(normalizedFilePath, specifier);
    if (!target) continue;

    const names = new Set(importedNames(match[0]));

    for (const [entryClass, entry] of Object.entries(manifest.entryClasses)) {
      const allowedConsumers = new Set(
        entry.allowedConsumers.map((consumer) => normalizeRepoPath(consumer.file))
      );
      if (allowedConsumers.has(normalizedFilePath)) continue;

      const importsProtectedModule = entry.protectedModules.some((modulePath) =>
        targetMatchesDeclaredPath(target, modulePath)
      );
      const importsProtectedBarrelSymbol =
        entry.reExportingBarrels.some((barrelPath) =>
          targetMatchesDeclaredPath(target, barrelPath)
        ) && entry.protectedSymbols.some((symbol) => names.has(symbol));

      if (!importsProtectedModule && !importsProtectedBarrelSymbol) continue;

      findings.push({
        severity: 'error',
        code: CODE,
        file: normalizedFilePath,
        line: lineNumberAt(source, match.index ?? 0),
        specifier,
        entryClass,
        message:
          `Unexpected ${entryClass} consumer imports ${specifier}. ` +
          `Migrate the consumer to ${manifest.replacementMilestone} or explicitly review the manifest allowlist.`,
      });
    }
  }

  return findings;
}

export function analyze(files, manifest) {
  const violations = files
    .flatMap((file) => findLegacyCalculationConsumers(file, manifest))
    .sort(
      (left, right) =>
        compareStrings(left.file, right.file) ||
        left.line - right.line ||
        compareStrings(left.entryClass, right.entryClass)
    );

  return { ok: violations.length === 0, violations };
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
}

async function collectSourceFiles({ root, manifest }) {
  const filePaths = await glob(manifest.scanScope.include, {
    cwd: root,
    ignore: manifest.scanScope.exclude,
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

export async function check({ root = process.cwd(), manifest = readManifest(root) } = {}) {
  const files = await collectSourceFiles({ root, manifest });
  return { ...analyze(files, manifest), scannedFiles: files.length };
}
