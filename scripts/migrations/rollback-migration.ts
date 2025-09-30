#!/usr/bin/env tsx
/**
 * Migration Rollback Script
 * Provides safe rollback capabilities for database migrations
 */

import { db } from '../../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface MigrationRecord {
  name: string;
  timestamp: string;
  hash: string;
  appliedAt: string;
}

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
    console.error('❌ Failed to fetch migration history:', error);
    return [];
  }
}

async function createRollbackPoint(name: string) {
  console.log(`📸 Creating rollback point: ${name}...`);

  try {
    // Create a database dump
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'migrations', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `rollback-${timestamp}.json`);

    // Store migration state
    const migrationHistory = await getMigrationHistory();

    const rollbackData = {
      name,
      timestamp,
      migrations: migrationHistory,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(backupPath, JSON.stringify(rollbackData, null, 2));

    console.log(`✅ Rollback point created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ Failed to create rollback point:', error);
    throw error;
  }
}

async function listRollbackPoints() {
  const backupDir = path.join(process.cwd(), 'migrations', 'backups');

  if (!fs.existsSync(backupDir)) {
    console.log('No rollback points found');
    return [];
  }

  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('rollback-') && f.endsWith('.json'))
    .sort()
    .reverse();

  console.log('\n📋 Available rollback points:\n');

  files.forEach((file, index) => {
    const filePath = path.join(backupDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`${index + 1}. ${data.name || 'Unnamed'}`);
    console.log(`   Created: ${data.createdAt}`);
    console.log(`   Migrations: ${data.migrations.length}`);
    console.log(`   File: ${file}\n`);
  });

  return files;
}

async function rollbackToPoint(migrationName: string) {
  console.log(`\n⚠️  DANGER: Rolling back to migration: ${migrationName}`);
  console.log('This operation will:');
  console.log('  1. Remove all migrations applied after this point');
  console.log('  2. Potentially cause data loss');
  console.log('  3. Require manual intervention for data restoration\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<void>((resolve, reject) => {
    rl.question('Type "ROLLBACK" to confirm: ', async (answer) => {
      rl.close();

      if (answer !== 'ROLLBACK') {
        console.log('❌ Rollback cancelled');
        reject(new Error('Rollback cancelled by user'));
        return;
      }

      try {
        // Get current migration history
        const migrations = await getMigrationHistory();
        const targetIndex = migrations.findIndex(m => m.name === migrationName);

        if (targetIndex === -1) {
          throw new Error(`Migration ${migrationName} not found in history`);
        }

        // Remove migrations after target
        const migrationsToRemove = migrations.slice(0, targetIndex);

        console.log(`\n🔄 Removing ${migrationsToRemove.length} migrations...\n`);

        for (const migration of migrationsToRemove) {
          console.log(`  - ${migration.name}`);
          await db.execute(sql`
            DELETE FROM drizzle_migrations
            WHERE name = ${migration.name}
          `);
        }

        console.log('\n✅ Rollback completed');
        console.log('⚠️  Note: Schema changes were not reverted - manual SQL required');
        console.log('⚠️  Note: Data changes were not reverted - restore from backup if needed');

        resolve();
      } catch (error) {
        console.error('❌ Rollback failed:', error);
        reject(error);
      }
    });
  });
}

async function generateRollbackSQL(migrationName: string) {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse();

  console.log(`\n📝 Generating rollback SQL for: ${migrationName}\n`);

  // Find migrations to rollback
  const migrations = await getMigrationHistory();
  const targetIndex = migrations.findIndex(m => m.name.includes(migrationName));

  if (targetIndex === -1) {
    console.error(`❌ Migration ${migrationName} not found`);
    return;
  }

  const migrationsToRollback = migrations.slice(0, targetIndex + 1);

  console.log('Migrations to rollback:');
  migrationsToRollback.forEach(m => console.log(`  - ${m.name}`));

  console.log('\n⚠️  Manual rollback SQL required:');
  console.log('The following steps should be performed manually:\n');

  console.log('1. Identify schema changes in affected migrations');
  console.log('2. Write corresponding DROP/ALTER statements');
  console.log('3. Test rollback on staging environment');
  console.log('4. Execute rollback on production with backup');
  console.log('\nExample rollback SQL:');
  console.log('-- DROP TABLE IF EXISTS new_table;');
  console.log('-- ALTER TABLE existing_table DROP COLUMN new_column;');
  console.log('-- DROP INDEX IF EXISTS new_index;');
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'create':
        await createRollbackPoint(arg || 'manual');
        break;

      case 'list':
        await listRollbackPoints();
        break;

      case 'rollback':
        if (!arg) {
          console.error('❌ Migration name required');
          console.log('Usage: tsx rollback-migration.ts rollback <migration-name>');
          process.exit(1);
        }
        await rollbackToPoint(arg);
        break;

      case 'generate-sql':
        if (!arg) {
          console.error('❌ Migration name required');
          console.log('Usage: tsx rollback-migration.ts generate-sql <migration-name>');
          process.exit(1);
        }
        await generateRollbackSQL(arg);
        break;

      default:
        console.log('Usage:');
        console.log('  tsx rollback-migration.ts create [name]     - Create rollback point');
        console.log('  tsx rollback-migration.ts list              - List rollback points');
        console.log('  tsx rollback-migration.ts rollback <name>   - Rollback to migration');
        console.log('  tsx rollback-migration.ts generate-sql <name> - Generate rollback SQL');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  }
}

main();