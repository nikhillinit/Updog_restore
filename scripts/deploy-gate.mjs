#!/usr/bin/env node
/**
 * Production deployment gate - all checks must pass
 * This script enforces the deployment contract
 */

import { execSync } from 'child_process';
import fs from 'fs';

const checks = [];
let allPassed = true;

function runCheck(name, command, critical = true) {
  process.stdout.write(`  → ${name}...`);
  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    console.log(' ✅');
    checks.push({ name, status: 'passed' });
    return true;
  } catch (error) {
    console.log(' ❌');
    checks.push({ name, status: 'failed', error: error.message });
    if (critical) allPassed = false;
    return false;
  }
}

console.log('🚀 Production Deployment Gate\n');
console.log('═══════════════════════════════\n');

// Pre-deployment checks
console.log('📋 Pre-flight checks:');
runCheck('TypeScript compilation', 'npx tsc --noEmit');
runCheck('Lint check', 'npm run lint --silent');
runCheck('Smoke tests', 'npm run test:smoke --silent');

// Build checks  
console.log('\n📦 Build validation:');
runCheck('Production build', 'npm run build --silent');
runCheck('Bundle size (<350KB)', 'npm run bundle:check --silent');

// Runtime checks
console.log('\n🔧 Runtime validation:');
runCheck('Health endpoints', 'node scripts/prod-sanity.mjs');

// Generate deployment manifest
const manifest = {
  timestamp: new Date().toISOString(),
  git_sha: execSync('git rev-parse --short HEAD').toString().trim(),
  git_branch: execSync('git branch --show-current').toString().trim(),
  node_version: process.version,
  checks,
  passed: allPassed
};

fs.writeFileSync('deployment-manifest.json', JSON.stringify(manifest, null, 2));

// Summary
console.log('\n═══════════════════════════════');
if (allPassed) {
  console.log('✅ All deployment gates passed!');
  console.log('\nNext steps:');
  console.log('  1. Deploy to staging: npm run deploy:staging');
  console.log('  2. Run rollout: ROLLOUT_WINDOW=5 node scripts/smart-rollout.mjs');
  console.log('  3. Monitor: node scripts/monitor-health.mjs 30 0.5');
  process.exit(0);
} else {
  console.log('❌ Deployment blocked - fix failures above');
  console.log('\nFailed checks:');
  checks.filter(c => c.status === 'failed').forEach(c => {
    console.log(`  • ${c.name}`);
  });
  process.exit(1);
}