import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const manifestDir = path.join(repoRoot, 'scripts', 'prod-schema-manifests');
const migrationsDir = path.join(repoRoot, 'migrations');

interface ManifestSqlFiles {
  file: string;
  sqlFiles: string[];
}

function loadManifestSqlFiles(directory: string): ManifestSqlFiles[] {
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as {
        sqlFiles?: string[];
      };

      return { file, sqlFiles: manifest.sqlFiles ?? [] };
    });
}

function canonicalForwardMigrationFiles(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter((file) => {
      const match = /^(\d{4})_.*\.sql$/i.exec(file);
      return match !== null && Number(match[1]) >= 31 && !/_ROLLBACK\.sql$/i.test(file);
    })
    .sort();
}

function assertForwardMigrationCoverage(
  manifests: ManifestSqlFiles[],
  canonicalForwardMigrations: string[]
): void {
  const referenceCount = new Map<string, number>();

  for (const { file, sqlFiles } of manifests) {
    for (const sqlFile of sqlFiles) {
      expect(sqlFile, `${file} -> ${sqlFile}`).not.toContain('..');
      expect(path.isAbsolute(sqlFile), `${file} -> ${sqlFile}`).toBe(false);
      expect(sqlFile, `${file} -> ${sqlFile}`).not.toMatch(/rollback/i);

      const normalizedSqlFile = path.normalize(sqlFile).split(path.sep).join(path.posix.sep);
      referenceCount.set(normalizedSqlFile, (referenceCount.get(normalizedSqlFile) ?? 0) + 1);
    }
  }

  for (const migration of canonicalForwardMigrations) {
    expect(referenceCount.get(`migrations/${migration}`), migration).toBe(1);
  }
}

describe('prod-schema manifest forward migration coverage', () => {
  const manifests = loadManifestSqlFiles(manifestDir);
  const canonicalForwardMigrations = canonicalForwardMigrationFiles(migrationsDir);

  for (const migration of canonicalForwardMigrations) {
    it(`assigns ${migration} to exactly one manifest`, () => {
      assertForwardMigrationCoverage(manifests, [migration]);
    });
  }

  it('negative control: reports duplicate manifest ownership', () => {
    expect(() =>
      assertForwardMigrationCoverage(
        [
          {
            file: 'first.json',
            sqlFiles: ['migrations/0031_user_identity_grants_revocation.sql'],
          },
          {
            file: 'second.json',
            sqlFiles: ['migrations/0031_user_identity_grants_revocation.sql'],
          },
        ],
        ['0031_user_identity_grants_revocation.sql']
      )
    ).toThrowError(/0031_user_identity_grants_revocation\.sql/);
  });

  it('negative control: reports parent-directory manifest paths', () => {
    expect(() =>
      assertForwardMigrationCoverage(
        [
          {
            file: 'traversal.json',
            sqlFiles: ['../migrations/0031_user_identity_grants_revocation.sql'],
          },
        ],
        ['0031_user_identity_grants_revocation.sql']
      )
    ).toThrowError(
      /traversal\.json -> \.\.\/migrations\/0031_user_identity_grants_revocation\.sql/
    );
  });
});
