#!/usr/bin/env tsx
/**
 * Migration Verification Script
 * Validates database schema before and after migrations
 */

import { db } from '../../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface SchemaSnapshot {
  tables: Record<string, TableInfo>;
  views: string[];
  indexes: Record<string, IndexInfo[]>;
  constraints: Record<string, ConstraintInfo[]>;
  timestamp: string;
}

interface TableInfo {
  columns: ColumnInfo[];
  rowCount: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

interface ConstraintInfo {
  name: string;
  type: string;
  definition: string;
}

async function captureSchemaSnapshot(): Promise<SchemaSnapshot> {
  console.log('📸 Capturing schema snapshot...');

  // Get all tables
  const tablesResult = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables: Record<string, TableInfo> = {};

  for (const row of tablesResult.rows) {
    const tableName = row.table_name as string;

    // Get column information
    const columnsResult = await db.execute(sql`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = ${tableName}
      ORDER BY ordinal_position
    `);

    const columns = columnsResult.rows.map((col: any) => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default,
    }));

    // Get row count
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`));
    const rowCount = Number(countResult.rows[0]?.count || 0);

    tables[tableName] = { columns, rowCount };
  }

  // Get views
  const viewsResult = await db.execute(sql`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  const views = viewsResult.rows.map((row: any) => row.table_name);

  // Get indexes
  const indexesResult = await db.execute(sql`
    SELECT
      t.relname as table_name,
      i.relname as index_name,
      a.attname as column_name,
      ix.indisunique as is_unique
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND t.relkind = 'r'
    ORDER BY t.relname, i.relname, a.attnum
  `);

  const indexes: Record<string, IndexInfo[]> = {};
  const indexMap: Record<string, { columns: string[]; unique: boolean }> = {};

  for (const row of indexesResult.rows as any[]) {
    const key = `${row.table_name}.${row.index_name}`;
    if (!indexMap[key]) {
      indexMap[key] = { columns: [], unique: row.is_unique };
    }
    indexMap[key].columns.push(row.column_name);
  }

  for (const [key, value] of Object.entries(indexMap)) {
    const [tableName, indexName] = key.split('.');
    if (!indexes[tableName]) {
      indexes[tableName] = [];
    }
    indexes[tableName].push({
      name: indexName,
      columns: value.columns,
      unique: value.unique,
    });
  }

  // Get constraints
  const constraintsResult = await db.execute(sql`
    SELECT
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      pg_get_constraintdef(c.oid) as definition
    FROM information_schema.table_constraints tc
    JOIN pg_constraint c ON c.conname = tc.constraint_name
    WHERE tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name
  `);

  const constraints: Record<string, ConstraintInfo[]> = {};

  for (const row of constraintsResult.rows as any[]) {
    if (!constraints[row.table_name]) {
      constraints[row.table_name] = [];
    }
    constraints[row.table_name].push({
      name: row.constraint_name,
      type: row.constraint_type,
      definition: row.definition,
    });
  }

  return {
    tables,
    views,
    indexes,
    constraints,
    timestamp: new Date().toISOString(),
  };
}

async function compareSnapshots(before: SchemaSnapshot, after: SchemaSnapshot) {
  console.log('\n🔍 Comparing schema snapshots...\n');

  let hasChanges = false;
  const changes: string[] = [];

  // Compare tables
  const beforeTables = Object.keys(before.tables);
  const afterTables = Object.keys(after.tables);

  // New tables
  const newTables = afterTables.filter(t => !beforeTables.includes(t));
  if (newTables.length > 0) {
    hasChanges = true;
    changes.push(`✅ Added tables: ${newTables.join(', ')}`);
  }

  // Dropped tables
  const droppedTables = beforeTables.filter(t => !afterTables.includes(t));
  if (droppedTables.length > 0) {
    hasChanges = true;
    changes.push(`⚠️  Dropped tables: ${droppedTables.join(', ')}`);
  }

  // Modified tables
  for (const tableName of beforeTables.filter(t => afterTables.includes(t))) {
    const beforeTable = before.tables[tableName];
    const afterTable = after.tables[tableName];

    // Compare columns
    const beforeColumns = beforeTable.columns.map(c => c.name);
    const afterColumns = afterTable.columns.map(c => c.name);

    const newColumns = afterColumns.filter(c => !beforeColumns.includes(c));
    const droppedColumns = beforeColumns.filter(c => !afterColumns.includes(c));

    if (newColumns.length > 0) {
      hasChanges = true;
      changes.push(`  ✅ ${tableName}: Added columns: ${newColumns.join(', ')}`);
    }

    if (droppedColumns.length > 0) {
      hasChanges = true;
      changes.push(`  ⚠️  ${tableName}: Dropped columns: ${droppedColumns.join(', ')}`);
    }

    // Check for column modifications
    for (const colName of beforeColumns.filter(c => afterColumns.includes(c))) {
      const beforeCol = beforeTable.columns.find(c => c.name === colName)!;
      const afterCol = afterTable.columns.find(c => c.name === colName)!;

      if (beforeCol.type !== afterCol.type) {
        hasChanges = true;
        changes.push(`  ⚠️  ${tableName}.${colName}: Type changed from ${beforeCol.type} to ${afterCol.type}`);
      }

      if (beforeCol.nullable !== afterCol.nullable) {
        hasChanges = true;
        changes.push(`  ⚠️  ${tableName}.${colName}: Nullable changed from ${beforeCol.nullable} to ${afterCol.nullable}`);
      }
    }

    // Check data loss
    if (afterTable.rowCount < beforeTable.rowCount) {
      hasChanges = true;
      changes.push(`  ⚠️  ${tableName}: Row count decreased from ${beforeTable.rowCount} to ${afterTable.rowCount}`);
    }
  }

  // Compare views
  const newViews = after.views.filter(v => !before.views.includes(v));
  const droppedViews = before.views.filter(v => !after.views.includes(v));

  if (newViews.length > 0) {
    hasChanges = true;
    changes.push(`✅ Added views: ${newViews.join(', ')}`);
  }

  if (droppedViews.length > 0) {
    hasChanges = true;
    changes.push(`⚠️  Dropped views: ${droppedViews.join(', ')}`);
  }

  // Display results
  if (!hasChanges) {
    console.log('✅ No schema changes detected');
  } else {
    console.log('📋 Schema Changes:\n');
    changes.forEach(change => console.log(change));
  }

  return { hasChanges, changes };
}

async function verifyMigration() {
  try {
    const snapshotsDir = path.join(process.cwd(), 'migrations', 'snapshots');

    // Ensure snapshots directory exists
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }

    // Check for pre-migration snapshot
    const preSnapshotPath = path.join(snapshotsDir, 'pre-migration.json');

    if (!fs.existsSync(preSnapshotPath)) {
      console.log('📸 No pre-migration snapshot found, creating one...');
      const snapshot = await captureSchemaSnapshot();
      fs.writeFileSync(preSnapshotPath, JSON.stringify(snapshot, null, 2));
      console.log('✅ Pre-migration snapshot created');
      process.exit(0);
    }

    // Load pre-migration snapshot
    console.log('📂 Loading pre-migration snapshot...');
    const preSnapshot: SchemaSnapshot = JSON.parse(fs.readFileSync(preSnapshotPath, 'utf-8'));

    // Capture post-migration snapshot
    const postSnapshot = await captureSchemaSnapshot();

    // Save post-migration snapshot
    const postSnapshotPath = path.join(snapshotsDir, `post-migration-${Date.now()}.json`);
    fs.writeFileSync(postSnapshotPath, JSON.stringify(postSnapshot, null, 2));
    console.log('✅ Post-migration snapshot saved');

    // Compare snapshots
    const { hasChanges, changes } = await compareSnapshots(preSnapshot, postSnapshot);

    // Clean up pre-migration snapshot
    fs.unlinkSync(preSnapshotPath);

    if (hasChanges) {
      console.log('\n✅ Migration verification completed with changes');
      process.exit(0);
    } else {
      console.log('\n✅ Migration verification completed - no changes');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Migration verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifyMigration();