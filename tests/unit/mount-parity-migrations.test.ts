import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readJournaledMigrationFiles } from '../../scripts/migration-ledger';
import { COMMON_API_ROUTE_MANIFEST } from '../../shared/routes/api-route-manifest';

const PROD_SCHEMA_MANIFEST_DIR = path.resolve(process.cwd(), 'scripts', 'prod-schema-manifests');

const C1_MOUNTED_TABLES = [
  ...new Set(
    COMMON_API_ROUTE_MANIFEST.flatMap((entry) =>
      entry.migrationParity.kind === 'c1' ? entry.migrationParity.tables : []
    )
  ),
].sort();

// These mounted rounds tables are intentionally flag-gated and not
// prod-reconciled. They remain covered by the journal/mount-parity CREATE TABLE
// assertion below, but they are outside the prod manifest set by design.
const C1_TABLES_EXEMPT_FROM_MANIFEST = new Set([
  'investment_rounds',
  'investment_round_model_overrides',
]);

interface ProdSchemaExpectedTable {
  name: string;
  sharedTable?: boolean;
}

interface ProdSchemaManifest {
  name: string;
  expectedTables?: ProdSchemaExpectedTable[];
}

function migrationSql(): string {
  return readJournaledMigrationFiles(process.cwd())
    .map((migrationFile) => migrationFile.sql)
    .join('\n');
}

function hasCreateTable(sql: string, tableName: string): boolean {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?${escaped}"?\b`,
    'i'
  ).test(sql);
}

function loadProdSchemaManifestFiles(): Array<{ file: string; manifest: ProdSchemaManifest }> {
  return fs
    .readdirSync(PROD_SCHEMA_MANIFEST_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      manifest: JSON.parse(
        fs.readFileSync(path.join(PROD_SCHEMA_MANIFEST_DIR, file), 'utf8')
      ) as ProdSchemaManifest,
    }));
}

describe('makeApp mount parity with journaled migrations', () => {
  it('every C1 mounted table is covered by at least one prod-schema manifest expectedTables', () => {
    const manifests = loadProdSchemaManifestFiles();
    const covered = new Set<string>();

    for (const { manifest } of manifests) {
      for (const table of manifest.expectedTables ?? []) {
        covered.add(table.name);
      }
    }

    const missing = C1_MOUNTED_TABLES.filter(
      (tableName) => !covered.has(tableName) && !C1_TABLES_EXEMPT_FROM_MANIFEST.has(tableName)
    );

    expect(missing).toEqual([]);
  });

  it('no table is owned by more than one manifest unless marked sharedTable', () => {
    const manifests = loadProdSchemaManifestFiles();
    const ownership = new Map<string, string[]>();

    for (const { file, manifest } of manifests) {
      const ownedTableNames = new Set(
        (manifest.expectedTables ?? [])
          .filter((table) => table.sharedTable !== true)
          .map((table) => table.name)
      );

      for (const tableName of [...ownedTableNames].sort()) {
        const owners = ownership.get(tableName) ?? [];
        owners.push(file);
        ownership.set(tableName, owners);
      }
    }

    const collisions = [...ownership.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([tableName, files]) => `${tableName} in ${files.join(',')}`);

    expect(collisions).toEqual([]);
  });

  it('has CREATE TABLE coverage for every C1 mounted table', () => {
    const sql = migrationSql();
    const missingCreateTables = C1_MOUNTED_TABLES.filter(
      (tableName) => !hasCreateTable(sql, tableName)
    );

    expect(missingCreateTables).toEqual([]);
  });

  it('keeps the manifest-exempt rounds tables inside the C1 parity set', () => {
    // Journal coverage itself is asserted by the C1 parity test above; only the
    // prod manifest coverage assertion exempts these dormant, flag-gated tables.
    expect(C1_MOUNTED_TABLES).toContain('investment_rounds');
    expect(C1_MOUNTED_TABLES).toContain('investment_round_model_overrides');
  });

  it('derives every C1 table from common-route schema metadata', () => {
    const manifestSchemaTables = new Set(
      COMMON_API_ROUTE_MANIFEST.flatMap((entry) => entry.schemaTables)
    );
    const missingSchemaDependencies = C1_MOUNTED_TABLES.filter(
      (tableName) => !manifestSchemaTables.has(tableName)
    );
    const nonTableRoutesWithSchemaDependencies = COMMON_API_ROUTE_MANIFEST.filter(
      (entry) => entry.migrationParity.kind === 'non-table' && entry.schemaTables.length > 0
    ).map(({ id }) => id);

    expect(missingSchemaDependencies).toEqual([]);
    expect(nonTableRoutesWithSchemaDependencies).toEqual([]);
  });
});
