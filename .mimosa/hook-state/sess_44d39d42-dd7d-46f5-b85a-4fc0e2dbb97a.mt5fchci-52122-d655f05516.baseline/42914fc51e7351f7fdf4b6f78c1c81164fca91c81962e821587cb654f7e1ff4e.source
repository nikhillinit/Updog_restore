#!/usr/bin/env node
// Progressive Test Validation Script
// Validates test fixes with increasing iterations

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestResult {
  file: string;
  iterations: number;
  passRate: number;
  failures: number;
  avgTime: number;
}

const fixedTests = [
  'tests/unit/circuit-breaker.test.ts',
  'tests/unit/reserves-engine.test.ts',
  'tests/unit/health-cache.test.ts',
  'tests/unit/inflight-capacity.test.ts',
  'tests/unit/inflight-simple.test.ts'
];

async function runTest(file: string, iterations: number): Promise<TestResult> {
  console.log(`🧪 Testing ${file} ${iterations}x...`);
  
  const results: boolean[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      await execAsync(`npx vitest -c vitest.config.unit.ts run ${file} --reporter=json`);
      results.push(true);
      times.push(Date.now() - start);
      process.stdout.write('✓');
    } catch (error) {
      results.push(false);
      times.push(Date.now() - start);
      process.stdout.write('✗');
    }
  }
  
  console.log(''); // newline
  
  const failures = results.filter(r => !r).length;
  const passRate = (iterations - failures) / iterations;
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  
  return {
    file: file.split('/').pop()!,
    iterations,
    passRate,
    failures,
    avgTime
  };
}

async function progressiveValidation() {
  console.log('🎯 Progressive Test Validation');
  console.log('==============================\n');
  
  const stages = [
    { iterations: 5, confidence: 'initial' },
    { iterations: 10, confidence: 'medium' },
    { iterations: 50, confidence: 'high' }
  ];
  
  const allResults: TestResult[] = [];
  
  for (const stage of stages) {
    console.log(`\n📊 Stage: ${stage.confidence} (${stage.iterations}x)`);
    console.log('─'.repeat(40));
    
    for (const test of fixedTests) {
      const result = await runTest(test, stage.iterations);
      allResults.push(result);
      
      if (result.passRate < 1.0) {
        console.log(`⚠️  ${result.file}: ${result.failures}/${result.iterations} failures (${(result.passRate * 100).toFixed(1)}% pass rate)`);
        
        if (result.passRate < 0.9) {
          console.log(`❌ Test too flaky, skipping higher iterations`);
          break;
        }
      } else {
        console.log(`✅ ${result.file}: STABLE (${result.avgTime.toFixed(0)}ms avg)`);
      }
    }
  }
  
  // Summary
  console.log('\n📈 Validation Summary');
  console.log('======================');
  
  const stableTests = allResults.filter(r => r.passRate === 1.0);
  const flakyTests = allResults.filter(r => r.passRate < 1.0 && r.passRate >= 0.9);
  const failingTests = allResults.filter(r => r.passRate < 0.9);
  
  console.log(`✅ Stable: ${stableTests.length} tests`);
  console.log(`⚠️  Flaky: ${flakyTests.length} tests`);
  console.log(`❌ Failing: ${failingTests.length} tests`);
  
  if (failingTests.length === 0 && flakyTests.length === 0) {
    console.log('\n🎉 All tests are stable!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests need attention');
    process.exit(1);
  }
}

// Run validation
progressiveValidation().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});