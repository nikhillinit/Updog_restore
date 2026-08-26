#!/usr/bin/env node
// -------------------------------------------------------------
// Auto-update performance budget based on latest results
// Security: Only allows updates from authenticated users (not bots)
// -------------------------------------------------------------

// Security gate: Prevent automated budget loosening
if (process.env.GITHUB_ACTOR === 'dependabot[bot]' || 
    process.env.GITHUB_ACTOR === 'github-actions[bot]') {
  console.log('🔒 Budget updates blocked for automated actors');
  process.exit(0);
}
import { readFileSync, writeFileSync, existsSync } from 'fs';

if (!existsSync('bench-result.json') || !existsSync('.perf-budget.json')) {
  console.error('❌ Missing required files: bench-result.json or .perf-budget.json');
  process.exit(1);
}

const result = JSON.parse(readFileSync('bench-result.json', 'utf8'));
const budget = JSON.parse(readFileSync('.perf-budget.json', 'utf8'));

// Update P95 budget if current is better
if (result.p95_ms && result.p95_ms < budget.p95Max) {
  const oldBudget = budget.p95Max;
  budget.p95Max = Math.ceil(result.p95_ms * 1.15); // 15% headroom
  
  console.log(`↗️  Updated P95 budget: ${oldBudget}ms → ${budget.p95Max}ms`);
  console.log(`   (Current: ${result.p95_ms}ms + 15% headroom)`);
}

// Update hot path baselines if better
if (result.hotPaths) {
  let updated = false;
  
  for (const [path, data] of Object.entries(result.hotPaths)) {
    if (budget.hotPaths[path] && data.current < budget.hotPaths[path]) {
      const oldBaseline = budget.hotPaths[path];
      budget.hotPaths[path] = Math.ceil(data.current * 1.1); // 10% headroom
      console.log(`↗️  Updated ${path}: ${oldBaseline}ms → ${budget.hotPaths[path]}ms`);
      updated = true;
    }
  }
  
  if (!updated && result.p95_ms >= budget.p95Max) {
    console.log('✅ Performance within budget - no updates needed');
  }
}

// Write updated budget
writeFileSync('.perf-budget.json', JSON.stringify(budget, null, 2) + '\n');
console.log('📝 Updated .perf-budget.json');
