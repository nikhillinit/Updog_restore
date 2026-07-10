import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Task 8 forbid-guard. After hoisting the route registries to shared/, no server
// module may import the client layer. This locks that boundary so the
// server -> client dependency (server route-policy importing the client route
// registry) cannot silently return.

const repoRoot = process.cwd();

function serverTsFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  };
  walk(path.resolve(repoRoot, 'server'));
  return files;
}

// Static `import ... from '<spec>'` / `export ... from '<spec>'`. Commented lines
// (starting with //) never match because the line must begin with import/export.
const IMPORT_FROM = /^\s*(?:import|export)\b[^\n]*\bfrom\s+['"]([^'"]+)['"]/gm;

function importsClient(spec: string): boolean {
  return /(^|\/)client\/src\//.test(spec) || spec.startsWith('@/');
}

describe('server -> client import boundary (Task 8 forbid-guard)', () => {
  const files = serverTsFiles();

  it('scans a non-trivial number of server .ts files (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no server .ts file importing the client layer (client/src/** or @/**)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const match of src.matchAll(IMPORT_FROM)) {
        const spec = match[1] ?? '';
        if (importsClient(spec)) {
          offenders.push(`${path.relative(repoRoot, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
