/**
 * Schema Drift Detection for CI
 * Ensures database schema matches expected contract
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface SchemaInfo {
  hash: string;
  timestamp: string;
  migrations: string[];
  tableCount: number;
  indexCount: number;
}

const EXPECTED_SCHEMA_FILE = path.join(process.cwd(), 'docs/contracts/expected-schema.json');
const TEMP_DB_URL = process.env.SCHEMA_TEST_DB_URL || 'postgresql://postgres:postgres@localhost:5432/schema_test';

/**
 * Generate schema hash from pg_dump output
 */
async function generateSchemaHash(dbUrl: string): Promise<SchemaInfo> {
  try {
    // Get schema-only dump (no data)
    const schemaDump = execSync(`pg_dump --schema-only --no-owner --no-privileges "${dbUrl}"`, {
      encoding: 'utf8',
      timeout: 30000
    });

    // Normalize schema (remove comments, whitespace variations)
    const normalizedSchema = schemaDump
      .replace(/--.*$/gm, '') // Remove comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\s*;\s*/g, ';') // Normalize semicolons
      .trim();

    // Generate hash
    const hash = crypto.createHash('sha256').update(normalizedSchema).digest('hex');

    // Get table and index counts
    const tableCount = (schemaDump.match(/CREATE TABLE/g) || []).length;
    const indexCount = (schemaDump.match(/CREATE (?:UNIQUE )?INDEX/g) || []).length;

    // Get applied migrations
    const migrations = await getAppliedMigrations(dbUrl);

    return {
      hash,
      timestamp: new Date().toISOString(),
      migrations,
      tableCount,
      indexCount
    };
  } catch (error) {
    console.error('Error generating schema hash:', error);
    throw error;
  }
}

/**
 * Get list of applied migrations from database
 */
async function getAppliedMigrations(dbUrl: string): Promise<string[]> {
  try {
    // Check if migrations table exists
    const migrationsExist = execSync(`psql "${dbUrl}" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations');"`, {
      encoding: 'utf8'
    }).trim();

    if (migrationsExist === 'f') {
      return []; // No migrations table yet
    }

    // Get applied migrations
    const result = execSync(`psql "${dbUrl}" -t -c "SELECT name FROM migrations ORDER BY id;"`, {
      encoding: 'utf8'
    });

    return result.trim().split('\n').filter(line => line.trim());
  } catch (error) {
    console.warn('Could not read migrations table:', error);
    return [];
  }
}

/**
 * Apply all migrations to a clean database
 */
async function applyMigrations(dbUrl: string): Promise<void> {
  const migrationsDir = path.join(process.cwd(), 'server/db/migrations');
  
  try {
    // Get migration files in order
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql') && /^\d{4}_/.test(f))
      .sort();

    console.log(`Applying ${migrationFiles.length} migrations...`);

    for (const file of migrationFiles) {
      console.log(`  Applying: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      
      // Only run the UP migration part
      const upSection = extractUpSection(sql);
      
      execSync(`psql "${dbUrl}" -f -`, {
        input: upSection,
        encoding: 'utf8',
        timeout: 60000
      });
    }

    console.log('All migrations applied successfully');
  } catch (error) {
    console.error('Error applying migrations:', error);
    throw error;
  }
}

/**
 * Extract UP section from migration file
 */
function extractUpSection(sql: string): string {
  const lines = sql.split('\n');
  const upStart = lines.findIndex(line => line.includes('UP MIGRATION'));
  const downStart = lines.findIndex(line => line.includes('DOWN MIGRATION'));
  
  if (upStart === -1) {
    return sql; // No sections, assume entire file is UP
  }
  
  const startLine = upStart + 1;
  const endLine = downStart === -1 ? lines.length : downStart;
  
  return lines.slice(startLine, endLine).join('\n');
}

/**
 * Test migration rollback
 */
async function testRollback(dbUrl: string): Promise<void> {
  const rollbackDir = path.join(process.cwd(), 'server/db/migrations/rollback');
  
  try {
    const files = await fs.readdir(rollbackDir);
    const rollbackFiles = files
      .filter(f => f.endsWith('_down.sql'))
      .sort()
      .reverse(); // Apply rollbacks in reverse order

    console.log(`Testing rollback with ${rollbackFiles.length} files...`);

    for (const file of rollbackFiles) {
      console.log(`  Rolling back: ${file}`);
      const filePath = path.join(rollbackDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      
      execSync(`psql "${dbUrl}" -f -`, {
        input: sql,
        encoding: 'utf8',
        timeout: 60000
      });
    }

    console.log('Rollback test completed successfully');
  } catch (error) {
    console.error('Error testing rollback:', error);
    throw error;
  }
}

/**
 * Create or recreate test database
 */
async function setupTestDatabase(dbUrl: string): Promise<void> {
  const dbName = new URL(dbUrl).pathname.substring(1);
  const baseUrl = dbUrl.replace(`/${dbName}`, '/postgres');
  
  try {
    // Drop if exists, create new
    execSync(`psql "${baseUrl}" -c "DROP DATABASE IF EXISTS ${dbName};"`, {
      encoding: 'utf8'
    });
    
    execSync(`psql "${baseUrl}" -c "CREATE DATABASE ${dbName};"`, {
      encoding: 'utf8'
    });
    
    console.log(`Test database ${dbName} created`);
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
}

/**
 * Load expected schema from contract file
 */
async function loadExpectedSchema(): Promise<SchemaInfo | null> {
  try {
    const content = await fs.readFile(EXPECTED_SCHEMA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.log('No expected schema file found, will create one');
    return null;
  }
}

/**
 * Save schema info as expected contract
 */
async function saveExpectedSchema(schemaInfo: SchemaInfo): Promise<void> {
  await fs.mkdir(path.dirname(EXPECTED_SCHEMA_FILE), { recursive: true });
  await fs.writeFile(EXPECTED_SCHEMA_FILE, JSON.stringify(schemaInfo, null, 2));
  console.log(`Expected schema saved to ${EXPECTED_SCHEMA_FILE}`);
}

/**
 * Compare schemas and report differences
 */
function compareSchemas(expected: SchemaInfo, actual: SchemaInfo): boolean {
  if (expected.hash === actual.hash) {
    console.log('✅ Schema hash matches expected');
    return true;
  }

  console.error('❌ Schema drift detected!');
  console.error(`Expected hash: ${expected.hash}`);
  console.error(`Actual hash:   ${actual.hash}`);
  console.error(`Expected tables: ${expected.tableCount}, Actual: ${actual.tableCount}`);
  console.error(`Expected indexes: ${expected.indexCount}, Actual: ${actual.indexCount}`);
  
  // Check migration differences
  const expectedMigrations = new Set(expected.migrations);
  const actualMigrations = new Set(actual.migrations);
  
  const missing = [...expectedMigrations].filter(m => !actualMigrations.has(m));
  const extra = [...actualMigrations].filter(m => !expectedMigrations.has(m));
  
  if (missing.length > 0) {
    console.error(`Missing migrations: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.error(`Extra migrations: ${extra.join(', ')}`);
  }

  return false;
}

/**
 * Main schema validation function
 */
async function validateSchema(): Promise<void> {
  const command = process.argv[2];
  
  try {
    if (command === 'generate') {
      console.log('Generating expected schema...');
      
      await setupTestDatabase(TEMP_DB_URL);
      await applyMigrations(TEMP_DB_URL);
      
      const schemaInfo = await generateSchemaHash(TEMP_DB_URL);
      await saveExpectedSchema(schemaInfo);
      
      console.log('✅ Expected schema generated');
      
    } else if (command === 'check') {
      console.log('Checking schema drift...');
      
      const expected = await loadExpectedSchema();
      if (!expected) {
        console.error('❌ No expected schema found. Run with "generate" first.');
        process.exit(1);
      }
      
      await setupTestDatabase(TEMP_DB_URL);
      await applyMigrations(TEMP_DB_URL);
      
      const actual = await generateSchemaHash(TEMP_DB_URL);
      
      const matches = compareSchemas(expected, actual);
      
      if (!matches) {
        console.error('');
        console.error('To fix:');
        console.error('1. If this is intentional, update the contract:');
        console.error('   npm run schema:generate');
        console.error('2. Update docs/contracts/parallel-foundation.md');
        console.error('3. Get team approval for schema changes');
        process.exit(1);
      }
      
      console.log('✅ Schema validation passed');
      
    } else if (command === 'test-rollback') {
      console.log('Testing migration rollback...');
      
      await setupTestDatabase(TEMP_DB_URL);
      await applyMigrations(TEMP_DB_URL);
      
      console.log('Schema before rollback:');
      const beforeRollback = await generateSchemaHash(TEMP_DB_URL);
      console.log(`  Tables: ${beforeRollback.tableCount}, Indexes: ${beforeRollback.indexCount}`);
      
      await testRollback(TEMP_DB_URL);
      
      console.log('Schema after rollback:');
      const afterRollback = await generateSchemaHash(TEMP_DB_URL);
      console.log(`  Tables: ${afterRollback.tableCount}, Indexes: ${afterRollback.indexCount}`);
      
      // Re-apply to test UP again
      await applyMigrations(TEMP_DB_URL);
      const reapplied = await generateSchemaHash(TEMP_DB_URL);
      
      if (beforeRollback.hash === reapplied.hash) {
        console.log('✅ Rollback test passed (UP → DOWN → UP = same schema)');
      } else {
        console.error('❌ Rollback test failed (schema differs after reapply)');
        process.exit(1);
      }
      
    } else {
      console.log('Usage:');
      console.log('  npm run schema:generate  - Generate expected schema hash');
      console.log('  npm run schema:check     - Check for schema drift');
      console.log('  npm run schema:test      - Test migration rollback');
    }
    
  } catch (error) {
    console.error('Schema validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  validateSchema();
}