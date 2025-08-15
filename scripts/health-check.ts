
/**
 * Verify critical fixes are in place
 */

import { execSync } from 'child_process';

const checks = [
  {
    name: 'Redis connectivity',
    check: () => {
      if (!process.env.REDIS_URL) {
        return { passed: false, message: 'REDIS_URL not configured' };
      }
      try {
        execSync('redis-cli ping', { stdio: 'pipe' });
        return { passed: true, message: 'Redis is accessible' };
      } catch {
        return { passed: false, message: 'Redis is not accessible' };
      }
    }
  },
  {
    name: 'Database pool configuration',
    check: () => {
      const poolMax = parseInt(process.env.DB_POOL_MAX || '20');
      const poolMin = parseInt(process.env.DB_POOL_MIN || '2');
      
      if (poolMax < 10) {
        return { passed: false, message: `Pool max (${poolMax}) too low for production` };
      }
      if (poolMin < 2) {
        return { passed: false, message: `Pool min (${poolMin}) too low` };
      }
      return { passed: true, message: `Pool configured: min=${poolMin}, max=${poolMax}` };
    }
  },
  {
    name: 'Rate limiting',
    check: () => {
      if (process.env.RATE_LIMIT_REDIS_URL) {
        return { passed: true, message: 'Distributed rate limiting configured' };
      }
      return { passed: false, message: 'Using in-memory rate limiting (not suitable for clusters)' };
    }
  },
  {
    name: 'Error tracking',
    check: () => {
      if (process.env.SENTRY_DSN) {
        return { passed: true, message: 'Sentry configured' };
      }
      return { passed: false, message: 'No error tracking configured' };
    }
  }
];

console.log('\n🔍 Production Readiness Checks:\n');

let allPassed = true;
for (const { name, check } of checks) {
  const result = check();
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${result.message}`);
  if (!result.passed) allPassed = false;
}

if (!allPassed) {
  console.log('\n⚠️  Some checks failed. Review configuration before production deployment.');
  process.exit(1);
} else {
  console.log('\n✅ All critical checks passed!');
}
