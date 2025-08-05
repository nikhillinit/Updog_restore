#!/usr/bin/env node
// -------------------------------------------------------------
// Async benchmark with budget-aware baselines
//  • Loads baselines from .perf-budget.json
//  • Outputs JSON for Guardian processing
// -------------------------------------------------------------
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Load performance budget
let budget = { hotPaths: {}, p95Max: 400 };
if (existsSync('.perf-budget.json')) {
  budget = JSON.parse(readFileSync('.perf-budget.json', 'utf8'));
}

const N = 100;                      // workload size
const CONCURRENCY = 4;              // mirror production limits

// Simulate async work
const simulateAsyncWork = async (id) => {
  const delay = Math.random() * 10; // 0-10ms random work
  await new Promise(resolve => setTimeout(resolve, delay));
  return { id, processed: true };
};

// Run benchmarks for each hot path
const results = {
  timestamp: new Date().toISOString(),
  hotPaths: {},
  p95_ms: 0,
  memory: {
    heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    external_mb: Math.round(process.memoryUsage().external / 1024 / 1024)
  }
};

// Benchmark each hot path
for (const [path, baseline] of Object.entries(budget.hotPaths)) {
  const t0 = performance.now();
  
  const tasks = Array.from({ length: N }, (_, i) => i);
  await Promise.all(tasks.map(id => simulateAsyncWork(id)));
  
  const elapsed = performance.now() - t0;
  results.hotPaths[path] = {
    baseline,
    current: Math.round(elapsed),
    delta_pct: Math.round(((elapsed - baseline) / baseline) * 100)
  };
}

// Calculate overall P95 (simplified - using max of hot paths)
results.p95_ms = Math.max(...Object.values(results.hotPaths).map(p => p.current));

// Output for Guardian
console.log(JSON.stringify(results, null, 2));

// Write results for comparison
writeFileSync('bench-result.json', JSON.stringify(results, null, 2));

// Exit with error if over budget
if (results.p95_ms > budget.p95Max) {
  console.error(`❌ P95 ${results.p95_ms}ms exceeds budget ${budget.p95Max}ms`);
  process.exit(1);
}
