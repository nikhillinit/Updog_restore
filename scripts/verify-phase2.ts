/**
 * Quick verification script for Phase 2 implementation
 */

import { Client } from 'pg';

async function verify() {
  console.log('🔍 Phase 2 Implementation Verification\n');
  console.log('='.repeat(50));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Database connection successful');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'agent_memories'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ agent_memories table exists');

      // Get row count
      const countResult = await client.query('SELECT COUNT(*) FROM agent_memories');
      console.log(`✅ Total memories in database: ${countResult.rows[0].count}`);

      // Check for pgvector extension
      const vectorCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_extension WHERE extname = 'vector'
        );
      `);

      if (vectorCheck.rows[0].exists) {
        console.log('✅ pgvector extension enabled');
      } else {
        console.log('⚠️  pgvector extension not found');
      }
    } else {
      console.log('❌ agent_memories table not found');
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Phase 2 verification complete!');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verify();
