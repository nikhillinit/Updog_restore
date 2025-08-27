#!/usr/bin/env node
// Test Risk Assessment Matrix
// Categorizes and prioritizes test failures for systematic fixing

interface TestFailure {
  file: string;
  test: string;
  category: 'timing' | 'state' | 'mock' | 'async' | 'logic';
  risk: 'low' | 'medium' | 'high';
  complexity: 1 | 2 | 3 | 4 | 5;
  dependencies: string[];
  fixPattern?: string;
  estimatedTime: string;
}

// Based on actual test failures from analysis
export const testFailures: TestFailure[] = [
  {
    file: 'tests/unit/circuit-breaker.test.ts',
    test: 'should track request counts',
    category: 'logic',
    risk: 'low',
    complexity: 2,
    dependencies: [],
    fixPattern: 'Counter logic - only count get() operations, not set()',
    estimatedTime: '30 mins'
  },
  {
    file: 'tests/unit/reserves-engine.test.ts',
    test: 'should use cached results for identical calculations',
    category: 'timing',
    risk: 'low',
    complexity: 2,
    dependencies: ['performance measurement'],
    fixPattern: 'Timing assertion - cache warmup or precision issue',
    estimatedTime: '20 mins'
  },
  {
    file: 'tests/unit/reserves-engine.test.ts',
    test: 'should skip risk adjustments when disabled',
    category: 'logic',
    risk: 'low',
    complexity: 2,
    dependencies: [],
    fixPattern: 'Assertion logic - verify risk adjustment bypass',
    estimatedTime: '20 mins'
  },
  {
    file: 'tests/unit/health-cache.test.ts',
    test: 'should generate new response after TTL expires',
    category: 'timing',
    risk: 'medium',
    complexity: 3,
    dependencies: ['cache TTL'],
    fixPattern: 'Cache header validation - check TTL timing',
    estimatedTime: '30 mins'
  },
  {
    file: 'tests/unit/inflight-capacity.test.ts',
    test: 'should deduplicate concurrent identical requests',
    category: 'state',
    risk: 'medium',
    complexity: 3,
    dependencies: ['promise equality'],
    fixPattern: 'Promise reference equality - ensure same promise returned',
    estimatedTime: '45 mins'
  },
  {
    file: 'tests/unit/inflight-simple.test.ts',
    test: 'should track requests while in-flight',
    category: 'async',
    risk: 'high',
    complexity: 4,
    dependencies: ['async coordination'],
    fixPattern: 'Async timing - test timeout issue, needs proper cleanup',
    estimatedTime: '1 hour'
  },
  {
    file: 'tests/unit/inflight-capacity.test.ts',
    test: 'should throw when capacity is exceeded',
    category: 'async',
    risk: 'high',
    complexity: 4,
    dependencies: ['async coordination', 'capacity limits'],
    fixPattern: 'Async deadlock - capacity exhaustion handling',
    estimatedTime: '1 hour'
  },
  {
    file: 'tests/unit/inflight-capacity.test.ts',
    test: 'should support manual cancellation',
    category: 'async',
    risk: 'high',
    complexity: 5,
    dependencies: ['async coordination', 'cancellation tokens'],
    fixPattern: 'Async cancellation - proper cleanup and promise rejection',
    estimatedTime: '1.5 hours'
  }
];

// Sort by risk then complexity
export const executionOrder = testFailures.sort((a, b) => {
  const riskOrder = { low: 1, medium: 2, high: 3 };
  return riskOrder[a.risk] - riskOrder[b.risk] || a.complexity - b.complexity;
});

// Analysis functions
export function analyzeTestFailures() {
  console.log('📊 Test Failure Risk Matrix');
  console.log('============================\n');

  // Group by risk level
  const byRisk = {
    low: testFailures.filter(t => t.risk === 'low'),
    medium: testFailures.filter(t => t.risk === 'medium'),
    high: testFailures.filter(t => t.risk === 'high')
  };

  console.log('🟢 Low Risk Tests (Fix First):');
  byRisk.low.forEach(t => {
    console.log(`  - ${t.test} (${t.file.split('/').pop()})`);
    console.log(`    Pattern: ${t.fixPattern}`);
    console.log(`    Time: ${t.estimatedTime}\n`);
  });

  console.log('🟡 Medium Risk Tests:');
  byRisk.medium.forEach(t => {
    console.log(`  - ${t.test} (${t.file.split('/').pop()})`);
    console.log(`    Pattern: ${t.fixPattern}`);
    console.log(`    Time: ${t.estimatedTime}\n`);
  });

  console.log('🔴 High Risk Tests (Fix Last):');
  byRisk.high.forEach(t => {
    console.log(`  - ${t.test} (${t.file.split('/').pop()})`);
    console.log(`    Pattern: ${t.fixPattern}`);
    console.log(`    Time: ${t.estimatedTime}\n`);
  });

  // Summary statistics
  console.log('\n📈 Summary Statistics:');
  console.log(`  Total failures: ${testFailures.length}`);
  console.log(`  By category: ${JSON.stringify(
    testFailures.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )}`);
  
  const totalTime = testFailures.reduce((sum, t) => {
    const hours = parseFloat(t.estimatedTime.split(' ')[0]);
    const unit = t.estimatedTime.includes('hour') ? 60 : 1;
    return sum + (hours * unit);
  }, 0);
  
  console.log(`  Estimated total time: ${Math.round(totalTime / 60)} hours ${totalTime % 60} mins`);
  
  console.log('\n🎯 Recommended Execution Order:');
  executionOrder.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.test} [${t.risk}/${t.complexity}]`);
  });
}

// Main execution
analyzeTestFailures();