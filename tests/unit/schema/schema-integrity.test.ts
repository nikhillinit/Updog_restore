/**
 * Schema Integrity Smoke Test
 *
 * Verifies all schema tables are accessible via barrel exports.
 * Catches runtime issues that TypeScript compilation misses.
 */
import { describe, it, expect } from 'vitest';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import * as schema from '@shared/schema';
import * as dbSchema from '@shared/db-schema';

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
});
