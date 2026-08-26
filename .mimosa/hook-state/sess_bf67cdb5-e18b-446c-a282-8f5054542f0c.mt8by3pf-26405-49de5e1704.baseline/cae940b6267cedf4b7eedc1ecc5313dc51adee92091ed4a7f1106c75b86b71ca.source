import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const forbiddenClientModules = [
  'client/src/core/cohorts/advanced-engine',
  'client/src/core/cohorts/resolvers',
  'client/src/core/cohorts/company-cohorts',
  'client/src/core/cohorts/cash-flows',
  'client/src/core/cohorts/metrics',
] as const;

const importSpecifierPattern =
  /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|export\s+\*\s+from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"];/gm;

async function getServerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getServerFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeSpecifier(fromFile: string, specifier: string): string {
  if (specifier.startsWith('.')) {
    return path
      .relative(process.cwd(), path.resolve(path.dirname(fromFile), specifier))
      .replace(/\\/g, '/')
      .replace(/\.(ts|tsx|js|jsx)$/, '');
  }

  return specifier.replace(/\.(ts|tsx|js|jsx)$/, '');
}

async function getImportSpecifiers(filePath: string): Promise<string[]> {
  const source = await readFile(filePath, 'utf8');

  return [...source.matchAll(importSpecifierPattern)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')
    .filter(Boolean)
    .map((specifier) => normalizeSpecifier(filePath, specifier));
}

describe('Analysis Cohort server boundary', () => {
  it('does not import analysis cohort implementation from client modules', async () => {
    const serverFiles = await getServerFiles(path.resolve(process.cwd(), 'server'));
    const violations: string[] = [];

    for (const filePath of serverFiles) {
      const specifiers = await getImportSpecifiers(filePath);
      for (const specifier of specifiers) {
        if (forbiddenClientModules.includes(specifier as (typeof forbiddenClientModules)[number])) {
          violations.push(`${path.relative(process.cwd(), filePath)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
