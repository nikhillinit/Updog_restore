import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';

// s8.1 slice 3 (ADR-023): reconcile-prod-schema.mjs verifies sentinels BY NAME
// (findMissingSentinels), so a manifest sentinel that its own SQL never creates
// would false-fail every post-apply prod verification. The Docker clone proof
// covers this end-to-end but only fires on schema-path changes; this pin covers
// every manifest edit at unit speed. Prod audit 2026-07-02 (artifact sha256
// 62131f6a...cf72b86) established the C1 manifest tables are NOT YET on prod,
// so self-consistency against the manifests' own SQL is the reconcile target
// until the operator apply happens.

const repoRoot = process.cwd();
const manifestDir = path.join(repoRoot, 'scripts', 'prod-schema-manifests');

interface ManifestTable {
  name: string;
  constraints?: string[];
  indexes?: string[];
}

interface Manifest {
  name: string;
  sqlFiles?: string[];
  expectedTables?: ManifestTable[];
}

function loadManifestFiles(): Array<{ file: string; manifest: Manifest }> {
  return fs
    .readdirSync(manifestDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      manifest: JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8')) as Manifest,
    }));
}

function namesCreatedBySql(sqlFiles: string[]): Set<string> {
  const created = new Set<string>();
  const patterns = [
    /CONSTRAINT\s+"([^"]+)"/gi,
    /CONSTRAINT\s+([a-z0-9_]+)\s/gi,
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi,
  ];

  for (const sqlFile of sqlFiles) {
    const sql = fs.readFileSync(path.join(repoRoot, sqlFile), 'utf8');
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(sql)) !== null) {
        const name = match[1];
        if (name) {
          created.add(pgIdentifier(name.toLowerCase()));
        }
      }
    }
  }

  return created;
}

describe('prod-schema manifest sentinels', () => {
  const manifests = loadManifestFiles();

  it('finds the four PR-1 manifests', () => {
    expect(manifests.map((entry) => entry.file)).toEqual([
      '01-cohort.json',
      '02-fund-moic.json',
      '03-operating-tasks.json',
      '04-lp-reporting.json',
    ]);
  });

  it('every referenced sqlFile exists in the repo', () => {
    for (const { file, manifest } of manifests) {
      for (const sqlFile of manifest.sqlFiles ?? []) {
        expect(fs.existsSync(path.join(repoRoot, sqlFile)), `${file} -> ${sqlFile}`).toBe(true);
      }
    }
  });

  it('every sentinel name is created by the manifest own SQL (63-byte aware)', () => {
    const failures: string[] = [];

    for (const { file, manifest } of manifests) {
      const created = namesCreatedBySql(manifest.sqlFiles ?? []);
      for (const table of manifest.expectedTables ?? []) {
        for (const sentinel of [...(table.constraints ?? []), ...(table.indexes ?? [])]) {
          if (!created.has(pgIdentifier(sentinel.toLowerCase()))) {
            failures.push(`${file}: ${sentinel}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('no duplicate sentinel names within a manifest', () => {
    for (const { file, manifest } of manifests) {
      const seen: string[] = [];
      for (const table of manifest.expectedTables ?? []) {
        seen.push(...(table.constraints ?? []), ...(table.indexes ?? []));
      }
      const duplicates = seen.filter((name, index) => seen.indexOf(name) !== index);
      expect(duplicates, `${file} duplicate sentinels`).toEqual([]);
    }
  });
});
