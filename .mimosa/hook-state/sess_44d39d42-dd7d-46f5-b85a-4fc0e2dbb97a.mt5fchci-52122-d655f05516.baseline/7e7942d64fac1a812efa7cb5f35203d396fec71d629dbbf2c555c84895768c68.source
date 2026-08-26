/**
 * Schema Integrity Smoke Test
 *
 * Verifies all schema tables are accessible via barrel exports.
 * Catches runtime issues that TypeScript compilation misses.
 */
import { describe, it, expect, vi } from 'vitest';
import { extname, join } from 'node:path';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '@shared/schema';
import * as dbSchema from '@shared/db-schema';

const retiredSchemaPath = ['schema', 'src'].join('/');
const retiredSchemaAliasPatterns = [
  /\bfrom\s+['"]@schema(?:\/[^'"]*)?['"]/,
  /\bimport\s+['"]@schema(?:\/[^'"]*)?['"]/,
  /\bimport\s*\(\s*['"]@schema(?:\/[^'"]*)?['"]\s*\)/,
  /\brequire\s*\(\s*['"]@schema(?:\/[^'"]*)?['"]\s*\)/,
  /['"]@schema(?:\/\*)?['"]\s*:/,
];

const activeSchemaSurfaceRoots = ['server', 'shared', 'scripts'];
const rootActiveSchemaSurfaceFiles = [
  'package.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'vitest.config.mjs',
  'vitest.config.shared.mjs',
  'PRODUCTION_RUNBOOK.md',
];
const activeSchemaSurfaceExtensions = new Set([
  '.cjs',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
]);
const ignoredActiveSchemaSurfaceDirs = new Set([
  '.cache',
  '.git',
  '.omx',
  'coverage',
  'dist',
  'node_modules',
]);

async function readActualSource(relativePath: string): Promise<string> {
  const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

  return actualFs.readFileSync(join(process.cwd(), relativePath), 'utf8');
}

async function collectActiveSchemaSurfaceFiles(): Promise<string[]> {
  const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const files = new Set(rootActiveSchemaSurfaceFiles);

  const visit = (relativeDir: string): void => {
    const entries = actualFs.readdirSync(join(process.cwd(), relativeDir), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = join(relativeDir, entry.name).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (!ignoredActiveSchemaSurfaceDirs.has(entry.name)) {
          visit(relativePath);
        }
        continue;
      }

      if (entry.isFile() && activeSchemaSurfaceExtensions.has(extname(entry.name))) {
        files.add(relativePath);
      }
    }
  };

  for (const root of activeSchemaSurfaceRoots) {
    if (actualFs.existsSync(join(process.cwd(), root))) {
      visit(root);
    }
  }

  return [...files].sort();
}

describe('Schema Module Integrity', () => {
  describe('Fund Module', () => {
    it('funds table is accessible via barrel export', () => {
      expect(schema.funds).toBeDefined();
      expect(typeof schema.funds).toBe('object');
    });

    it('fundConfigs table is accessible via barrel export', () => {
      expect(schema.fundConfigs).toBeDefined();
      expect(typeof schema.fundConfigs).toBe('object');
    });

    it('fundSnapshots table is accessible via barrel export', () => {
      expect(schema.fundSnapshots).toBeDefined();
      expect(typeof schema.fundSnapshots).toBe('object');
    });
  });

  describe('Portfolio Module', () => {
    it('portfolioCompanies table is accessible via barrel export', () => {
      expect(schema.portfolioCompanies).toBeDefined();
      expect(typeof schema.portfolioCompanies).toBe('object');
    });

    it('investments table is accessible via barrel export', () => {
      expect(schema.investments).toBeDefined();
      expect(typeof schema.investments).toBe('object');
    });

    it('investmentLots table is accessible via barrel export', () => {
      expect(schema.investmentLots).toBeDefined();
      expect(typeof schema.investmentLots).toBe('object');
    });
  });

  describe('Scenario Module', () => {
    it('scenarios table is accessible via barrel export', () => {
      expect(schema.scenarios).toBeDefined();
      expect(typeof schema.scenarios).toBe('object');
    });

    it('scenarioCases table is accessible via barrel export', () => {
      expect(schema.scenarioCases).toBeDefined();
      expect(typeof schema.scenarioCases).toBe('object');
    });

    it('scenarioAuditLogs table is accessible via barrel export', () => {
      expect(schema.scenarioAuditLogs).toBeDefined();
      expect(typeof schema.scenarioAuditLogs).toBe('object');
    });
  });

  describe('Table Structure Validation', () => {
    it('funds table has expected column structure', () => {
      // Verify funds table has key columns
      const fundColumns = Object.keys(schema.funds);
      expect(fundColumns.length).toBeGreaterThan(0);

      // Check for essential fund columns by verifying the table object exists
      // This catches issues where the table might export but be malformed
      expect(schema.funds).toHaveProperty('id');
      expect(schema.funds).toHaveProperty('name');
    });

    it('portfolioCompanies table references funds correctly', () => {
      // Verify the FK relationship is intact
      expect(schema.portfolioCompanies).toHaveProperty('fundId');
    });

    it('scenarios table references portfolioCompanies correctly', () => {
      // Verify the FK relationship is intact
      expect(schema.scenarios).toHaveProperty('companyId');
    });

    it('shares fundId stays text-only until fund IDs are migrated', () => {
      const shareForeignKeyNames = getTableConfig(schema.shares).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      );
      const snapshotForeignKeyNames = getTableConfig(schema.shareSnapshots).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      );

      expect(schema.shares.fundId.dataType).toBe('string');
      expect(shareForeignKeyNames).not.toContain('shares_fund_id_funds_id_fk');
      expect(snapshotForeignKeyNames).toContain('share_snapshots_share_id_shares_id_fk');
    });
  });

  describe('Relational Query Metadata', () => {
    it('exports the relations needed by current with-queries', () => {
      const { tables } = extractTablesRelationalConfig(schema, createTableRelationsHelpers);

      expect(tables.portfolioCompanies?.relations).toHaveProperty('investments');
      expect(tables.investments?.relations).toHaveProperty('company');
      expect(tables.scenarios?.relations).toHaveProperty('cases');
      expect(tables.scenarioCases?.relations).toHaveProperty('scenario');
    });
  });

  describe('Compatibility Barrel', () => {
    it('forwards current database schema surfaces without moving legacy imports', () => {
      expect(dbSchema.funds).toBe(schema.funds);
      expect(dbSchema.portfolioCompanies).toBe(schema.portfolioCompanies);
      expect(dbSchema.limitedPartners).toBeDefined();
      expect(dbSchema.lpCapitalCalls).toBeDefined();
      expect(dbSchema.reserveApprovals).toBeDefined();
      expect(dbSchema.DB_SCHEMA_COMPATIBILITY_MAP.core).toMatchObject({
        legacyImport: '@shared/schema',
        compatibilityImport: '@shared/db-schema',
      });
      expect(dbSchema.DB_SCHEMA_COMPATIBILITY_MAP.lpReporting).toMatchObject({
        legacyImport: '@shared/schema-lp-reporting',
        compatibilityImport: '@shared/db-schema',
      });
    });
  });

  describe('Retired legacy schema package', () => {
    it('keeps active code and config on the canonical shared schema surface', async () => {
      const violations: string[] = [];
      const activeSchemaSurfaceFiles = await collectActiveSchemaSurfaceFiles();

      for (const file of activeSchemaSurfaceFiles) {
        const source = await readActualSource(file);

        if (source.includes(retiredSchemaPath)) {
          violations.push(`${file} contains ${retiredSchemaPath}`);
        }
        if (retiredSchemaAliasPatterns.some((pattern) => pattern.test(source))) {
          violations.push(`${file} contains a retired @schema import or config alias`);
        }
      }

      expect(violations).toEqual([]);
    }, 15_000);
  });
});
