#!/usr/bin/env node
// scripts/check-leader-table.mjs
//
// Cross-shell verification that the live DB has the `variance_planner_leader`
// table. Used by Phase 01-variance-automation-1c3-followons Plan 01 Task 3's
// <verify> block so that the check runs identically under both bash (CI) and
// PowerShell (local dev on Windows). See CLAUDE.md section windows_environment.
//
// Exit codes:
//   0 - table exists in the live DB
//   2 - DATABASE_URL is not set (precondition failure - fix and re-run)
//   3 - DB connection failed
//   4 - table is missing from the live DB (Plan 01 Task 2 db:push did not run)
//
// Usage: node scripts/check-leader-table.mjs

import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'ERROR: DATABASE_URL is not set. This plan requires a live Postgres connection string ' +
        'to verify the variance_planner_leader table was pushed successfully. Set DATABASE_URL ' +
        '(e.g. the Neon test endpoint from the MEMORY note "Neon Database") and re-run.'
    );
    process.exit(2);
  }

  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'variance_planner_leader'"
    );
    if (result.rows.length !== 1) {
      console.error(
        'ERROR: variance_planner_leader table is missing from the live DB. Run `npm run db:push` ' +
          'first (or confirm the Drizzle block in shared/schema.ts landed before this check).'
      );
      process.exit(4);
    }
    console.log('OK: variance_planner_leader table exists in the live DB');
    process.exit(0);
  } catch (err) {
    console.error(
      'ERROR: DB connection or query failed:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(3);
  } finally {
    await pool.end().catch(() => {
      /* ignore cleanup errors */
    });
  }
}

void main();
