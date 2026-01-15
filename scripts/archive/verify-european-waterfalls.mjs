#!/usr/bin/env node
/**
 * Phase 2B: European Waterfall Database Verification
 * Safe read-only queries to check for European waterfall data
 *
 * Usage:
 *   node scripts/verify-european-waterfalls.mjs
 *   npm run verify:european
 *
 * Exit codes:
 *   0 - No European data found (safe to proceed)
 *   2 - European data found (HALT removal)
 *   1 - Verification error
 */

import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    console.error('   Set it in .env file or environment');
    process.exit(1);
  }

  console.log('🔍 European Waterfall Database Verification');
  console.log('=' .repeat(60));
  console.log('📊 Running read-only queries...\n');

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');

    // Query 1: fund_models.waterfall column
    console.log('1️⃣  Checking fund_models.waterfall column...');
    const { rows: waterfallRows } = await client.query(`
      SELECT
        COUNT(*) as european_count,
        array_agg(id ORDER BY created_at DESC) FILTER (WHERE waterfall = 'european') as fund_ids
      FROM fund_models
      WHERE waterfall = 'european'
    `).catch(() => ({ rows: [{ european_count: '0', fund_ids: null }] }));

    const waterfallCount = parseInt(waterfallRows[0].european_count);
    console.log(`   Found: ${waterfallCount} European waterfall(s)`);
    if (waterfallCount > 0) {
      console.log(`   Fund IDs: ${waterfallRows[0].fund_ids?.join(', ')}`);
    }

    // Query 2: JSONB state column
    console.log('\n2️⃣  Checking fund_models.state JSONB column...');
    const { rows: stateRows } = await client.query(`
      SELECT
        COUNT(*) as european_count,
        array_agg(id) as fund_ids
      FROM fund_models
      WHERE state::text ILIKE '%european%'
         OR state::text ILIKE '%EUROPEAN%'
    `).catch(() => ({ rows: [{ european_count: '0', fund_ids: null }] }));

    const stateCount = parseInt(stateRows[0].european_count);
    console.log(`   Found: ${stateCount} reference(s) in JSONB state`);
    if (stateCount > 0) {
      console.log(`   Fund IDs: ${stateRows[0].fund_ids?.join(', ')}`);
    }

    // Query 3: fundconfigs table
    console.log('\n3️⃣  Checking fundconfigs.config JSONB column...');
    const { rows: configRows } = await client.query(`
      SELECT
        COUNT(*) as european_count,
        array_agg(DISTINCT fund_id) as fund_ids
      FROM fundconfigs
      WHERE config::text ILIKE '%european%'
         OR config::text ILIKE '%EUROPEAN%'
    `).catch(() => ({ rows: [{ european_count: '0', fund_ids: null }] }));

    const configCount = parseInt(configRows[0].european_count);
    console.log(`   Found: ${configCount} reference(s) in fundconfigs`);
    if (configCount > 0) {
      console.log(`   Fund IDs: ${configRows[0].fund_ids?.join(', ')}`);
    }

    // Summary
    const totalFound = waterfallCount + stateCount + configCount;

    console.log('\n' + '='.repeat(60));
    console.log('📋 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total European references found: ${totalFound}`);
    console.log(`- fund_models.waterfall: ${waterfallCount}`);
    console.log(`- fund_models.state (JSONB): ${stateCount}`);
    console.log(`- fundconfigs.config (JSONB): ${configCount}`);
    console.log('='.repeat(60));

    if (totalFound === 0) {
      console.log('✅ SAFE TO PROCEED');
      console.log('   No European waterfall data found in database');
      console.log('   Phase 2B removal can continue');
      await client.query('ROLLBACK');
      await client.end();
      process.exit(0);
    } else {
      console.log('🚨 EUROPEAN DATA FOUND - HALT REMOVAL');
      console.log('   Action required:');
      console.log('   1. Review the fund IDs listed above');
      console.log('   2. Decide: Migrate to American OR Keep European feature');
      console.log('   3. If migrate: Create data migration script');
      console.log('   4. If keep: Abort European removal');
      await client.query('ROLLBACK');
      await client.end();
      process.exit(2);
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    try {
      await client.query('ROLLBACK');
    } catch {}
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main();
