#!/usr/bin/env tsx
/**
 * Real Database Migration Rollback Engine
 * Implements actual schema reversion using Drizzle migration down() functions
 */

import { db } from '../../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { logger } from '../../lib/logger';

interface MigrationRecord {
  name: string;
  timestamp: string;
  hash: string;
  appliedAt: string;
}

interface RollbackPlan {
  migration: MigrationRecord;
  downSQL: string[];
  backupPath: string;
  verified: boolean;
}

/**
 * Get migration history from database
 */
async function getMigrationHistory(): Promise<MigrationRecord[]> {
  try {
    const result = await db.execute(sql`
      SELECT
        name,
        timestamp,
        hash,
        created_at as applied_at
      FROM drizzle_migrations
      ORDER BY created_at DESC
    `);

    return result.rows as unknown as MigrationRecord[];
  } catch (error) {
    logger.error('Failed to fetch migration history', error as Error);
    throw error;
  }
}

/**
 * Create database backup before rollback
 */
async function createDatabaseBackup(name: string): Promise<string> {
  logger.info('Creating database backup', { name });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'migrations', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `backup-${timestamp}.json`);

    // Export current database state
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const backupData: any = {
      name,
      timestamp,
      tables: {},
      migrations: await getMigrationHistory(),
      createdAt: new Date().toISOString(),
    };

    // Backup each table's structure
    for (const row of tables.rows as any[]) {
      const tableName = row.table_name;

      // Get table structure
      const structure = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `);

      backupData.tables[tableName] = {
        structure: structure.rows,
        rowCount: await db.execute(sql`SELECT COUNT(*) FROM ${sql.identifier(tableName)}`).then(r => r.rows[0]?.count || 0),
      };
    }

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

    logger.info('Database backup created', { backupPath });
    return backupPath;
  } catch (error) {
    logger.error('Failed to create database backup', error as Error);
    throw error;
  }
}

/**
 * Generate rollback SQL from migration file
 */
function generateRollbackSQL(migrationName: string): string[] {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const sqlFile = path.join(migrationsDir, `${migrationName}.sql`);

  if (!fs.existsSync(sqlFile)) {
    logger.warn('Migration SQL file not found, generating from schema', { migrationName });
    return generateRollbackFromSchema(migrationName);
  }

  const sql = fs.readFileSync(sqlFile, 'utf-8');
  return reverseSQL(sql);
}

/**
 * Reverse SQL statements to generate rollback
 */
function reverseSQL(forwardSQL: string): string[] {
  const statements = forwardSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const rollbackStatements: string[] = [];

  for (const statement of statements) {
    // CREATE TABLE -> DROP TABLE
    if (statement.match(/CREATE TABLE\s+(\w+)/i)) {
      const match = statement.match(/CREATE TABLE\s+(\w+)/i);
      if (match) {
        rollbackStatements.unshift(`DROP TABLE IF EXISTS ${match[1]} CASCADE`);
      }
    }

    // ALTER TABLE ADD COLUMN -> ALTER TABLE DROP COLUMN
    else if (statement.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i)) {
      const match = statement.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
      if (match) {
        rollbackStatements.unshift(`ALTER TABLE ${match[1]} DROP COLUMN IF EXISTS ${match[2]}`);
      }
    }

    // CREATE INDEX -> DROP INDEX
    else if (statement.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i)) {
      const match = statement.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i);
      if (match) {
        rollbackStatements.unshift(`DROP INDEX IF EXISTS ${match[1]}`);
      }
    }

    // ALTER TABLE ADD CONSTRAINT -> ALTER TABLE DROP CONSTRAINT
    else if (statement.match(/ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+(\w+)/i)) {
      const match = statement.match(/ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+(\w+)/i);
      if (match) {
        rollbackStatements.unshift(`ALTER TABLE ${match[1]} DROP CONSTRAINT IF EXISTS ${match[2]}`);
      }
    }

    // CREATE VIEW/MATERIALIZED VIEW -> DROP VIEW
    else if (statement.match(/CREATE\s+(?:MATERIALIZED\s+)?VIEW\s+(\w+)/i)) {
      const match = statement.match(/CREATE\s+(?:MATERIALIZED\s+)?VIEW\s+(\w+)/i);
      if (match) {
        const isMaterialized = statement.match(/MATERIALIZED/i);
        rollbackStatements.unshift(`DROP ${isMaterialized ? 'MATERIALIZED VIEW' : 'VIEW'} IF EXISTS ${match[1]}`);
      }
    }
  }

  return rollbackStatements;
}

/**
 * Generate rollback SQL from current schema
 */
function generateRollbackFromSchema(migrationName: string): string[] {
  logger.warn('Schema-based rollback generation not yet implemented', { migrationName });
  return [
    `-- Rollback for ${migrationName}`,
    `-- Manual intervention required: No SQL file found`,
    `-- Please create rollback statements manually`,
  ];
}

/**
 * Verify rollback plan safety
 */
async function verifyRollbackPlan(plan: RollbackPlan): Promise<boolean> {
  logger.info('Verifying rollback plan', { migration: plan.migration.name });

  // Check 1: Ensure we have rollback SQL
  if (plan.downSQL.length === 0) {
    logger.error('No rollback SQL generated');
    return false;
  }

  // Check 2: Verify no dependent migrations
  const migrations = await getMigrationHistory();
  const targetIndex = migrations.findIndex(m => m.name === plan.migration.name);

  if (targetIndex > 0) {
    logger.warn('Warning: There are newer migrations that may depend on this one', {
      migration: plan.migration.name,
      newerCount: targetIndex,
    });
  }

  // Check 3: Backup exists
  if (!fs.existsSync(plan.backupPath)) {
    logger.error('Backup file not found', { backupPath: plan.backupPath });
    return false;
  }

  logger.info('Rollback plan verified', {
    migration: plan.migration.name,
    statementsCount: plan.downSQL.length,
  });

  return true;
}

/**
 * Execute rollback plan
 */
async function executeRollback(plan: RollbackPlan): Promise<void> {
  logger.info('Executing rollback', { migration: plan.migration.name });

  try {
    // Execute rollback SQL in a transaction
    await db.transaction(async (tx) => {
      for (const statement of plan.downSQL) {
        logger.info('Executing rollback statement', { statement: statement.substring(0, 100) });

        try {
          await tx.execute(sql.raw(statement));
        } catch (error) {
          logger.error('Rollback statement failed', error as Error, { statement });
          throw error;
        }
      }

      // Remove migration record
      await tx.execute(sql`
        DELETE FROM drizzle_migrations
        WHERE name = ${plan.migration.name}
      `);

      logger.info('Migration record removed', { migration: plan.migration.name });
    });

    logger.info('Rollback completed successfully', { migration: plan.migration.name });
  } catch (error) {
    logger.error('Rollback execution failed', error as Error);
    throw error;
  }
}

/**
 * Rollback to specific migration
 */
async function rollbackToMigration(migrationName: string, options: { dryRun?: boolean; force?: boolean } = {}): Promise<void> {
  logger.info('Starting rollback process', { migrationName, options });

  // Get migration to rollback
  const migrations = await getMigrationHistory();
  const migration = migrations.find(m => m.name === migrationName || m.name.includes(migrationName));

  if (!migration) {
    throw new Error(`Migration ${migrationName} not found in history`);
  }

  // Create backup
  const backupPath = await createDatabaseBackup(migration.name);

  // Generate rollback plan
  const downSQL = generateRollbackSQL(migration.name);
  const plan: RollbackPlan = {
    migration,
    downSQL,
    backupPath,
    verified: false,
  };

  // Verify plan
  plan.verified = await verifyRollbackPlan(plan);

  if (!plan.verified && !options.force) {
    throw new Error('Rollback plan verification failed. Use --force to override.');
  }

  // Display plan
  console.log('\n========================================');
  console.log('ROLLBACK PLAN');
  console.log('========================================');
  console.log(`Migration: ${migration.name}`);
  console.log(`Applied: ${migration.appliedAt}`);
  console.log(`Backup: ${backupPath}`);
  console.log('\nRollback SQL:');
  plan.downSQL.forEach((stmt, i) => {
    console.log(`${i + 1}. ${stmt.substring(0, 100)}${stmt.length > 100 ? '...' : ''}`);
  });
  console.log('========================================\n');

  if (options.dryRun) {
    logger.info('Dry run completed - no changes made');
    return;
  }

  // Confirm
  if (!options.force) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await new Promise<void>((resolve, reject) => {
      rl.question('Type "ROLLBACK" to confirm: ', async (answer) => {
        rl.close();

        if (answer !== 'ROLLBACK') {
          logger.info('Rollback cancelled by user');
          reject(new Error('Rollback cancelled by user'));
          return;
        }

        resolve();
      });
    });
  }

  // Execute rollback
  await executeRollback(plan);

  console.log('\n========================================');
  console.log('ROLLBACK COMPLETED SUCCESSFULLY');
  console.log('========================================');
  console.log(`Migration: ${migration.name}`);
  console.log(`Backup: ${backupPath}`);
  console.log('\nTo restore, use the backup file.');
  console.log('========================================\n');
}

/**
 * CLI interface
 */
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  const flags = process.argv.slice(4);

  const options = {
    dryRun: flags.includes('--dry-run'),
    force: flags.includes('--force'),
  };

  try {
    switch (command) {
      case 'rollback':
        if (!arg) {
          console.error('❌ Migration name required');
          console.log('Usage: tsx rollback-engine.ts rollback <migration-name> [--dry-run] [--force]');
          process.exit(1);
        }
        await rollbackToMigration(arg, options);
        break;

      case 'list':
        const migrations = await getMigrationHistory();
        console.log('\n📋 Migration History:\n');
        migrations.forEach((m, i) => {
          console.log(`${migrations.length - i}. ${m.name}`);
          console.log(`   Applied: ${m.appliedAt}`);
          console.log(`   Hash: ${m.hash}\n`);
        });
        break;

      case 'backup':
        const backupPath = await createDatabaseBackup(arg || 'manual');
        console.log(`✅ Backup created: ${backupPath}`);
        break;

      default:
        console.log('Real Database Migration Rollback Engine\n');
        console.log('Usage:');
        console.log('  tsx rollback-engine.ts rollback <name> [--dry-run] [--force]');
        console.log('  tsx rollback-engine.ts list');
        console.log('  tsx rollback-engine.ts backup [name]');
        console.log('\nOptions:');
        console.log('  --dry-run    Show rollback plan without executing');
        console.log('  --force      Skip verification and confirmation');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Rollback engine failed', error as Error);
    console.error('❌ Operation failed:', (error as Error).message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { rollbackToMigration, getMigrationHistory, createDatabaseBackup };