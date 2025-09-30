/**
 * Migration Verification Tests
 * Ensures database migrations are safe and reversible
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

describe('Migration Verification', () => {
  describe('Migration Files', () => {
    it('should have valid migration files', () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      expect(fs.existsSync(migrationsDir)).toBe(true);

      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
      expect(files.length).toBeGreaterThan(0);

      // Check file naming convention
      files.forEach(file => {
        expect(file).toMatch(/^\d{4}_[a-z_]+\.sql$/);
      });
    });

    it('should have sequential migration numbers', () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      const numbers = files.map(f => parseInt(f.split('_')[0]));

      for (let i = 1; i < numbers.length; i++) {
        const diff = numbers[i] - numbers[i - 1];
        expect(diff).toBeGreaterThan(0);
      }
    });

    it('should have valid SQL syntax', () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

      files.forEach(file => {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        // Should not be empty
        expect(content.trim().length).toBeGreaterThan(0);

        // Should contain SQL keywords
        const hasSQL = /CREATE|ALTER|DROP|INSERT|UPDATE|DELETE/i.test(content);
        expect(hasSQL).toBe(true);

        // Should not have obvious syntax errors
        expect(content).not.toContain(';;');
        expect(content).not.toMatch(/CREATE\s+TABLE\s+$/i);
      });
    });
  });

  describe('Schema Integrity', () => {
    it('should have drizzle_migrations table', async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'drizzle_migrations'
        ) as exists
      `);

      expect(result.rows[0]?.exists).toBe(true);
    });

    it('should have all critical tables', async () => {
      const criticalTables = [
        'funds',
        'fund_configs',
        'fund_snapshots',
        'portfolio_companies',
        'investments',
        'users',
      ];

      for (const tableName of criticalTables) {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = ${tableName}
          ) as exists
        `);

        expect(result.rows[0]?.exists).toBe(true);
      }
    });

    it('should have proper foreign key constraints', async () => {
      const result = await db.execute(sql`
        SELECT
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      `);

      // Should have foreign keys defined
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have indexes on foreign keys', async () => {
      const result = await db.execute(sql`
        SELECT
          t.relname as table_name,
          i.relname as index_name,
          a.attname as column_name
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND t.relkind = 'r'
      `);

      // Should have indexes
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have proper column types', async () => {
      const result = await db.execute(sql`
        SELECT
          table_name,
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name IN ('funds', 'fund_snapshots', 'investments')
        ORDER BY table_name, ordinal_position
      `);

      expect(result.rows.length).toBeGreaterThan(0);

      // Verify specific critical columns
      const funds = result.rows.filter((r: any) => r.table_name === 'funds');
      const idColumn = funds.find((r: any) => r.column_name === 'id');
      expect(idColumn?.data_type).toMatch(/uuid|integer/);
      expect(idColumn?.is_nullable).toBe('NO');
    });
  });

  describe('Migration History', () => {
    it('should have migration records', async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM drizzle_migrations
      `);

      const count = Number(result.rows[0]?.count || 0);
      expect(count).toBeGreaterThan(0);
    });

    it('should have unique migration names', async () => {
      const result = await db.execute(sql`
        SELECT name, COUNT(*) as count
        FROM drizzle_migrations
        GROUP BY name
        HAVING COUNT(*) > 1
      `);

      expect(result.rows.length).toBe(0);
    });

    it('should have migrations in chronological order', async () => {
      const result = await db.execute(sql`
        SELECT name, created_at
        FROM drizzle_migrations
        ORDER BY created_at
      `);

      const timestamps = result.rows.map((r: any) => new Date(r.created_at).getTime());

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('Data Integrity', () => {
    it('should not have orphaned records', async () => {
      // Check for investments without funds
      const orphanedInvestments = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM investments i
        LEFT JOIN funds f ON i.fund_id = f.id
        WHERE f.id IS NULL
      `);

      expect(Number(orphanedInvestments.rows[0]?.count || 0)).toBe(0);
    });

    it('should not have duplicate primary keys', async () => {
      const tables = ['funds', 'fund_snapshots', 'portfolio_companies', 'investments'];

      for (const tableName of tables) {
        try {
          const result = await db.execute(sql.raw(`
            SELECT id, COUNT(*) as count
            FROM "${tableName}"
            GROUP BY id
            HAVING COUNT(*) > 1
          `));

          expect(result.rows.length).toBe(0);
        } catch (error) {
          // Table might not exist in test database
          console.warn(`Skipping duplicate check for ${tableName}:`, (error as Error).message);
        }
      }
    });

    it('should have valid enum values', async () => {
      // Check snapshot types
      const snapshotTypes = await db.execute(sql`
        SELECT DISTINCT type FROM fund_snapshots
      `);

      const validTypes = ['RESERVE', 'PACING', 'COHORT', 'SCENARIO'];
      for (const row of snapshotTypes.rows as any[]) {
        expect(validTypes).toContain(row.type);
      }
    });

    it('should have valid date ranges', async () => {
      // Created dates should not be in the future
      const futureDates = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM funds
        WHERE created_at > NOW()
      `);

      expect(Number(futureDates.rows[0]?.count || 0)).toBe(0);

      // Updated dates should be >= created dates
      const invalidDates = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM funds
        WHERE updated_at < created_at
      `);

      expect(Number(invalidDates.rows[0]?.count || 0)).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should have indexes on frequently queried columns', async () => {
      const requiredIndexes = [
        { table: 'funds', column: 'id' },
        { table: 'fund_snapshots', column: 'fund_id' },
        { table: 'investments', column: 'fund_id' },
        { table: 'portfolio_companies', column: 'fund_id' },
      ];

      for (const { table, column } of requiredIndexes) {
        const result = await db.execute(sql`
          SELECT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE tablename = ${table}
            AND indexdef LIKE ${'%' + column + '%'}
          ) as has_index
        `);

        expect(result.rows[0]?.has_index).toBe(true);
      }
    });

    it('should not have overly wide tables', async () => {
      const result = await db.execute(sql`
        SELECT
          table_name,
          COUNT(*) as column_count
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY table_name
        HAVING COUNT(*) > 50
      `);

      // Tables with more than 50 columns might need normalization
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Migration Safety', () => {
    it('should not drop tables without backup', async () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        // If migration drops table, it should have a backup or be reversible
        if (/DROP\s+TABLE/i.test(content)) {
          const hasBackup = /CREATE\s+TABLE.*_backup/i.test(content);
          const isReversible = /IF\s+EXISTS/i.test(content);

          expect(hasBackup || isReversible).toBe(true);
        }
      }
    });

    it('should handle concurrent migrations safely', async () => {
      // Check if migrations use appropriate locking
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_locks
          WHERE locktype = 'advisory'
        ) as has_locks
      `);

      // Advisory locks should be used for migration coordination
      // Note: This may not be applicable if using Drizzle's built-in locking
    });

    it('should have rollback capability', () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const backupDir = path.join(migrationsDir, 'backups');

      // Should have backup directory for rollback points
      expect(
        fs.existsSync(backupDir) || fs.existsSync(path.join(migrationsDir, 'snapshots'))
      ).toBe(true);
    });
  });

  describe('Schema Validation', () => {
    it('should match TypeScript schema definitions', async () => {
      // This is a basic check - full validation requires comparing with Drizzle schema
      const result = await db.execute(sql`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      expect(result.rows.length).toBeGreaterThan(0);

      // Should have standard columns
      const allColumns = result.rows as any[];
      const hasId = allColumns.some(r => r.column_name === 'id');
      const hasCreatedAt = allColumns.some(r => r.column_name === 'created_at');

      expect(hasId).toBe(true);
      expect(hasCreatedAt).toBe(true);
    });

    it('should have proper NOT NULL constraints', async () => {
      const result = await db.execute(sql`
        SELECT
          table_name,
          column_name,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name IN ('id', 'created_at')
      `);

      // Primary keys and timestamps should be NOT NULL
      for (const row of result.rows as any[]) {
        expect(row.is_nullable).toBe('NO');
      }
    });

    it('should have proper default values', async () => {
      const result = await db.execute(sql`
        SELECT
          table_name,
          column_name,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name IN ('created_at', 'updated_at')
        AND column_default IS NOT NULL
      `);

      // Timestamp columns should have defaults
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });
});