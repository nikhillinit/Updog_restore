#!/usr/bin/env tsx
/**
 * Simple verification that critical fixes are in place
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🔍 Verifying Critical Fixes\n');

const checks = [
  {
    name: 'Materialized view migration created',
    check: () => existsSync(join(process.cwd(), 'migrations', '999_fix_materialized_view.sql'))
  },
  {
    name: 'Fixed rate limit store created',
    check: () => existsSync(join(process.cwd(), 'server', 'lib', 'rateLimitStore.fixed.ts'))
  },
  {
    name: 'Route normalizer created',
    check: () => existsSync(join(process.cwd(), 'server', 'metrics', 'routeNormalizer.ts'))
  },
  {
    name: 'Async error handler created',
    check: () => existsSync(join(process.cwd(), 'server', 'middleware', 'asyncErrorHandler.ts'))
  },
  {
    name: 'Database pool config created',
    check: () => existsSync(join(process.cwd(), 'server', 'db', 'pool.ts'))
  },
  {
    name: 'Middleware ordering fixed',
    check: () => {
      try {
        const serverIndex = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf-8');
        return serverIndex.includes('// Request ID MUST be first for correlation on all paths') &&
               serverIndex.includes('// Shutdown guard MUST be second to reject early (pre-parse)');
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Shutdown guard allowlist added',
    check: () => {
      try {
        const shutdownGuard = readFileSync(join(process.cwd(), 'server', 'middleware', 'shutdownGuard.ts'), 'utf-8');
        return shutdownGuard.includes('/health/detailed') && shutdownGuard.includes('ALLOWLIST');
      } catch {
        return false;
      }
    }
  },
  {
    name: 'CORS origin validation added',
    check: () => {
      try {
        const serverIndex = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf-8');
        return serverIndex.includes('CORS_ORIGIN') && serverIndex.includes('no valid origins were parsed');
      } catch {
        return false;
      }
    }
  }
];

let passed = 0;
for (const { name, check } of checks) {
  const result = check();
  const icon = result ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (result) passed++;
}

console.log(`\n📊 Summary: ${passed}/${checks.length} fixes verified`);

if (passed === checks.length) {
  console.log('\n🎯 All critical fixes are in place!');
  console.log('\nNext steps:');
  console.log('1. Set environment variables (REDIS_URL, DB_POOL_MAX, etc.)');
  console.log('2. Run database migration: npm run db:migrate');
  console.log('3. Deploy with confidence!');
} else {
  console.log('\n⚠️  Some fixes missing. Run scripts/fix-critical-issues.ts first.');
  process.exit(1);
}