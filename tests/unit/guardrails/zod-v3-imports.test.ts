import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
const roots = ['server', 'shared', 'client/src', 'workers', 'api', 'lib', 'scripts'];

function v3Imports(source: string) {
  return ts
    .preProcessFile(source, true, true)
    .importedFiles.filter(
      ({ fileName }) => fileName === 'zod/v3' || fileName.startsWith('zod/v3/')
    );
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'tests', '__tests__'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() &&
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
      ? [path]
      : [];
  });
}

describe('production imports use the patched Zod runtime', () => {
  it.each([
    "import { z } from 'zod/v3';",
    "import 'zod/v3';",
    "export * from 'zod/v3';",
    "const z = require('zod/v3');",
    "const z = import('zod/v3');",
    "import z = require('zod/v3');",
    "import { z } from 'zod/v3/index.js';",
  ])('detects a v3 import: %s', (source) => {
    expect(v3Imports(source)).toHaveLength(1);
  });

  it('ignores comments, ordinary strings, and supported imports', () => {
    expect(
      v3Imports(`
        // import 'zod/v3';
        const example = "require('zod/v3')";
        import { z } from 'zod';
        import * as core from 'zod/v4/core';
      `)
    ).toEqual([]);
  });

  it('bans the vulnerable v3 compatibility entry point across production sources', () => {
    const violations: string[] = [];
    for (const root of roots) {
      const files = sourceFiles(join(process.cwd(), root));
      expect(files.length, `Production source root ${root}`).toBeGreaterThan(0);
      for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const imported of v3Imports(source)) {
          const line = source.slice(0, imported.pos).split('\n').length;
          violations.push(`${relative(process.cwd(), file)}:${line}: ${imported.fileName}`);
        }
      }
    }
    expect(violations, 'CVE-2023-54404 remains reachable through zod/v3').toEqual([]);
  });
});
