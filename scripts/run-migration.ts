/**
 * Database migration runner
 * Runs SQL migration files using node-postgres
 */

import { readFileSync } from 'fs';
import { Client } from 'pg';

async function runMigration(migrationFile: string) {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  const client = new Client({ connectionString });

  try {
    console.log('📦 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log(`🚀 Running migration: ${migrationFile}`);
    const sql = readFileSync(migrationFile, 'utf-8');

    await client.query(sql);

    console.log('✅ Migration completed successfully!');

    // Verify the table was created
    console.log('\n📊 Verifying agent_memories table...');
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'agent_memories'
      ORDER BY ordinal_position;
    `);

    console.log('\nTable structure:');
    result.rows.forEach((row) => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the migration
const migrationFile = process.argv[2] || 'migrations/20251031_add_agent_memories.sql';
runMigration(migrationFile).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
