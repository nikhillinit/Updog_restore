#!/usr/bin/env node
/**
 * Performance budget test for reserves v1.1 calculation
 * Ensures calculations stay within performance targets
 */

import { performance } from 'perf_hooks';
import { calculateReservesSafe } from '../../client/src/lib/reserves-v11.js';

const PERF_BUDGET_MS = process.env.PERF_BUDGET_MS ? parseInt(process.env.PERF_BUDGET_MS) : 100;
const WARMUP_RUNS = 10;
const TEST_RUNS = 100;
const COMPANY_COUNT = 50;

// Generate test data
function generateTestCompanies(count) {
  const companies = [];
  const stages = ['Seed', 'Series A', 'Series B', 'Series C', 'Growth'];
  const sectors = ['SaaS', 'Fintech', 'Healthcare', 'Analytics', 'Infrastructure'];
  
  for (let i = 0; i < count; i++) {
    companies.push({
      id: `company-${i}`,
      name: `Company ${i}`,
      invested_cents: Math.floor(Math.random() * 10000000) + 100000, // $1k - $100k
      exit_moic_bps: Math.floor(Math.random() * 50000) + 10000, // 1x - 5x
      stage: stages[Math.floor(Math.random() * stages.length)],
      sector: sectors[Math.floor(Math.random() * sectors.length)],
      ownership_pct: Math.random() * 0.2 // 0-20%
    });
  }
  
  return companies;
}

// Test configuration
const testInput = {
  companies: generateTestCompanies(COMPANY_COUNT),
  fund_size_cents: 100000000, // $1M
  quarter_index: 2024 * 4 + 2
};

const testConfig = {
  reserve_bps: 1500, // 15%
  remain_passes: 1,
  cap_policy: {
    kind: 'fixed_percent',
    default_percent: 0.5
  },
  audit_level: 'basic'
};

console.log(`\n🚀 Performance Budget Test for Reserves v1.1`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`• Company Count: ${COMPANY_COUNT}`);
console.log(`• Budget Target: ${PERF_BUDGET_MS}ms`);
console.log(`• Test Runs: ${TEST_RUNS}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Warmup
console.log('⏳ Warming up...');
for (let i = 0; i < WARMUP_RUNS; i++) {
  calculateReservesSafe(testInput, testConfig);
}

// Performance test
console.log('🏃 Running performance tests...');
const durations = [];
let errors = 0;

for (let i = 0; i < TEST_RUNS; i++) {
  const start = performance.now();
  
  try {
    const result = calculateReservesSafe(testInput, testConfig);
    if (!result.ok) {
      errors++;
    }
  } catch (e) {
    errors++;
  }
  
  const duration = performance.now() - start;
  durations.push(duration);
  
  // Progress indicator
  if ((i + 1) % 20 === 0) {
    process.stdout.write('.');
  }
}

console.log('\n');

// Calculate statistics
durations.sort((a, b) => a - b);
const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
const min = durations[0];
const max = durations[durations.length - 1];
const p50 = durations[Math.floor(durations.length * 0.5)];
const p95 = durations[Math.floor(durations.length * 0.95)];
const p99 = durations[Math.floor(durations.length * 0.99)];

// Results
console.log('📊 Results');
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`• Average: ${avg.toFixed(2)}ms ${avg <= PERF_BUDGET_MS ? '✅' : '❌'}`);
console.log(`• Min: ${min.toFixed(2)}ms`);
console.log(`• Max: ${max.toFixed(2)}ms`);
console.log(`• P50: ${p50.toFixed(2)}ms`);
console.log(`• P95: ${p95.toFixed(2)}ms`);
console.log(`• P99: ${p99.toFixed(2)}ms`);
console.log(`• Errors: ${errors}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Determine pass/fail
const passed = avg <= PERF_BUDGET_MS && errors === 0;

if (passed) {
  console.log(`✅ PASSED: Performance within budget (${avg.toFixed(2)}ms ≤ ${PERF_BUDGET_MS}ms)\n`);
  process.exit(0);
} else {
  if (avg > PERF_BUDGET_MS) {
    console.error(`❌ FAILED: Performance exceeded budget (${avg.toFixed(2)}ms > ${PERF_BUDGET_MS}ms)`);
  }
  if (errors > 0) {
    console.error(`❌ FAILED: ${errors} errors occurred during testing`);
  }
  console.log('');
  process.exit(1);
}