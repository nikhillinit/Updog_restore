#!/usr/bin/env node
/**
 * Automated production validation suite
 * Runs all critical sanity checks in one command
 */

import { execSync } from 'child_process';

const PROD_HOST = process.env.PROD_HOST || 'http://localhost:5000';
const TEST_KEY = `sanity-${Date.now()}`;
const VERBOSE = process.env.VERBOSE === 'true';

function log(message, level = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level]}${message}${colors.reset}`);
}

async function runCheck(check) {
  const startTime = Date.now();
  try {
    if (VERBOSE) log(`  ⏳ ${check.name}...`, 'info');
    const result = await check.test();
    const duration = Date.now() - startTime;
    log(`  ✅ ${check.name} (${duration}ms)`, 'success');
    return { success: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    log(`  ❌ ${check.name}: ${error.message} (${duration}ms)`, 'error');
    return { success: false, error: error.message, duration };
  }
}

async function validateProduction() {
  log('\n🔍 Production Validation Suite\n', 'info');
  log(`Target: ${PROD_HOST}`, 'info');
  log(`═══════════════════════════════\n`, 'info');

  const checks = [
    {
      name: 'Health Endpoint',
      test: () => {
        const result = execSync(
          `curl -sSf ${PROD_HOST}/healthz`,
          { timeout: 5000, encoding: 'utf8' }
        );
        if (VERBOSE) console.log(result);
        return result;
      }
    },
    {
      name: 'API Health Check',
      test: () => {
        const result = execSync(
          `curl -sSf ${PROD_HOST}/api/health`,
          { timeout: 5000, encoding: 'utf8' }
        );
        const health = JSON.parse(result);
        if (health.status !== 'healthy') {
          throw new Error(`API unhealthy: ${health.status}`);
        }
        return health;
      }
    },
    {
      name: 'Idempotency: Initial Create',
      test: () => {
        const body = JSON.stringify({
          basics: { name: "Test Fund", size: 1000000, modelVersion: "reserves-ev1" },
          strategy: { stages: [] }
        });
        
        const cmd = `curl -s -w "\\n%%{http_code}" -H "Idempotency-Key: ${TEST_KEY}" -H "Content-Type: application/json" -d '${body}' ${PROD_HOST}/api/funds`;
        const result = execSync(cmd, { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        const statusCode = lines[lines.length - 1];
        
        if (!['200', '201'].includes(statusCode)) {
          throw new Error(`Expected 200/201, got ${statusCode}`);
        }
        return { statusCode, body: lines.slice(0, -1).join('\n') };
      }
    },
    {
      name: 'Idempotency: Replay Detection',
      test: () => {
        const body = JSON.stringify({
          basics: { name: "Test Fund", size: 1000000, modelVersion: "reserves-ev1" },
          strategy: { stages: [] }
        });
        
        const cmd = `curl -s -w "\\n%%{http_code}" -H "Idempotency-Key: ${TEST_KEY}" -H "Content-Type: application/json" -d '${body}' ${PROD_HOST}/api/funds`;
        const result = execSync(cmd, { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        const statusCode = lines[lines.length - 1];
        
        if (statusCode !== '200') {
          throw new Error(`Expected 200 (replay), got ${statusCode}`);
        }
        return { statusCode, replayed: true };
      }
    },
    {
      name: 'Idempotency: Conflict Detection',
      test: () => {
        const body = JSON.stringify({
          basics: { name: "Different Fund", size: 2000000, modelVersion: "reserves-ev1" },
          strategy: { stages: [] }
        });
        
        const cmd = `curl -s -w "\\n%%{http_code}" -H "Idempotency-Key: ${TEST_KEY}" -H "Content-Type: application/json" -d '${body}' ${PROD_HOST}/api/funds`;
        const result = execSync(cmd, { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        const statusCode = lines[lines.length - 1];
        
        if (statusCode !== '409') {
          throw new Error(`Expected 409 (conflict), got ${statusCode}`);
        }
        return { statusCode, conflict: true };
      }
    },
    {
      name: 'Performance: Response Time',
      test: () => {
        const perfKey = `perf-${Date.now()}`;
        const body = JSON.stringify({
          basics: { name: "Perf Test", size: 1000000, modelVersion: "reserves-ev1" },
          strategy: { stages: [] }
        });
        
        const startTime = Date.now();
        const cmd = `curl -s -w "\\n%%{http_code}" -H "Idempotency-Key: ${perfKey}" -H "Content-Type: application/json" -d '${body}' ${PROD_HOST}/api/funds`;
        const result = execSync(cmd, { encoding: 'utf8' });
        const responseTime = Date.now() - startTime;
        
        if (responseTime > 2000) {
          throw new Error(`Response time ${responseTime}ms exceeds 2s threshold`);
        }
        
        return { responseTime, threshold: '2000ms', passed: true };
      }
    },
    {
      name: 'Bundle Size Check',
      test: () => {
        // This would normally check the deployed bundle
        // For now, we'll check the local build
        const result = execSync('npm run bundle:check', { encoding: 'utf8' });
        if (!result.includes('Bundle check passed')) {
          throw new Error('Bundle size exceeds limit');
        }
        return { passed: true };
      }
    }
  ];

  const results = [];
  let allPassed = true;

  for (const check of checks) {
    const result = await runCheck(check);
    results.push({ name: check.name, ...result });
    if (!result.success) allPassed = false;
  }

  // Summary
  console.log('\n═══════════════════════════════');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  if (allPassed) {
    log(`\n🎉 All ${passed} validations passed in ${totalDuration}ms\n`, 'success');
  } else {
    log(`\n⚠️  ${failed} of ${results.length} validations failed\n`, 'error');
    results.filter(r => !r.success).forEach(r => {
      log(`   • ${r.name}: ${r.error}`, 'error');
    });
  }

  process.exit(allPassed ? 0 : 1);
}

// Execute
validateProduction().catch(error => {
  log(`\n❌ Validation suite failed: ${error.message}\n`, 'error');
  process.exit(1);
});