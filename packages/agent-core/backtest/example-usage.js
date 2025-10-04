#!/usr/bin/env node
/**
 * Example Usage Script for Backtest Dataset
 *
 * Demonstrates how to query and analyze the backtesting dataset
 * for agent evaluation and training purposes.
 */

const dataset = require('./backtest-dataset.json');

// Helper function to print formatted results
function printSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function printCase(tc, includeDetails = false) {
  console.log(`\n${tc.id}: ${tc.description}`);
  console.log(`  Type: ${tc.type} | Severity: ${tc.severity} | Complexity: ${tc.complexity}/10`);
  console.log(`  Files: ${tc.files.length} | Lines: ${tc.linesChanged} | Pattern: ${tc.pattern}`);

  if (includeDetails) {
    console.log(`  Error: ${tc.errorMessage.substring(0, 100)}...`);
    console.log(`  Solution: ${tc.humanSolution.substring(0, 100)}...`);
    console.log(`  Applicability: TS=${tc.agentApplicability.typeScriptFix} Test=${tc.agentApplicability.testRepair} Lint=${tc.agentApplicability.lintFix}`);
  }
}

// Example 1: Get all simple cases for quick testing
printSection('EXAMPLE 1: Simple Cases (Complexity 1-3)');
const simpleCases = dataset.testCases.filter(tc => tc.complexity <= 3);
console.log(`Found ${simpleCases.length} simple cases:\n`);
simpleCases.forEach(tc => printCase(tc));

// Example 2: Get TypeScript error cases
printSection('EXAMPLE 2: TypeScript Error Cases');
const tsErrors = dataset.testCases.filter(tc => tc.type === 'typescript-error');
console.log(`Found ${tsErrors.length} TypeScript error cases:\n`);
tsErrors.slice(0, 5).forEach(tc => printCase(tc));
console.log(`\n... and ${tsErrors.length - 5} more`);

// Example 3: Get Test Repair Agent applicable cases
printSection('EXAMPLE 3: Test Repair Agent Cases');
const testRepairCases = dataset.testCases.filter(tc => tc.agentApplicability.testRepair);
console.log(`Found ${testRepairCases.length} applicable cases:\n`);
testRepairCases.forEach(tc => printCase(tc));

// Example 4: Get critical severity cases
printSection('EXAMPLE 4: Critical Severity Cases');
const criticalCases = dataset.testCases.filter(tc => tc.severity === 'critical');
console.log(`Found ${criticalCases.length} critical cases:\n`);
criticalCases.forEach(tc => printCase(tc, true));

// Example 5: Analyze patterns
printSection('EXAMPLE 5: Pattern Analysis');
const patternCounts = {};
dataset.testCases.forEach(tc => {
  patternCounts[tc.pattern] = (patternCounts[tc.pattern] || 0) + 1;
});
const sortedPatterns = Object.entries(patternCounts)
  .sort((a, b) => b[1] - a[1]);

console.log('\nPattern Distribution:');
sortedPatterns.forEach(([pattern, count]) => {
  const percentage = ((count / dataset.testCases.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(count / 2));
  console.log(`  ${pattern.padEnd(25)} ${count.toString().padStart(2)} (${percentage}%) ${bar}`);
});

// Example 6: Get recommended evaluation sets
printSection('EXAMPLE 6: Recommended Evaluation Sets');

console.log('\n🚀 Quick Smoke Test (15 min):');
const smokeTest = ['tc-006', 'tc-022', 'tc-034'];
smokeTest.forEach(id => {
  const tc = dataset.testCases.find(t => t.id === id);
  printCase(tc);
});

console.log('\n\n📊 Standard Evaluation (1 hour):');
const standardTest = {
  'Test Repair': ['tc-012', 'tc-004', 'tc-031'],
  'TypeScript Fix': ['tc-006', 'tc-022', 'tc-001', 'tc-008', 'tc-009'],
  'Lint Fix': ['tc-022', 'tc-034', 'tc-007']
};

Object.entries(standardTest).forEach(([agent, ids]) => {
  console.log(`\n  ${agent} Agent (${ids.length} cases):`);
  ids.forEach(id => {
    const tc = dataset.testCases.find(t => t.id === id);
    console.log(`    - ${tc.id}: ${tc.description} (${tc.complexity}/10)`);
  });
});

// Example 7: Complexity distribution
printSection('EXAMPLE 7: Complexity Distribution');
const complexityBuckets = {
  'Simple (1-3)': dataset.testCases.filter(tc => tc.complexity <= 3),
  'Medium (4-6)': dataset.testCases.filter(tc => tc.complexity >= 4 && tc.complexity <= 6),
  'Complex (7-9)': dataset.testCases.filter(tc => tc.complexity >= 7 && tc.complexity <= 9),
  'Very Complex (10)': dataset.testCases.filter(tc => tc.complexity === 10)
};

console.log('\nComplexity Distribution:');
Object.entries(complexityBuckets).forEach(([bucket, cases]) => {
  const percentage = ((cases.length / dataset.testCases.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(cases.length / 2));
  console.log(`  ${bucket.padEnd(20)} ${cases.length.toString().padStart(2)} (${percentage}%) ${bar}`);
});

// Example 8: Time to resolution analysis
printSection('EXAMPLE 8: Time to Resolution');
const timeCategories = {};
dataset.testCases.forEach(tc => {
  const cat = tc.timeToResolve;
  timeCategories[cat] = (timeCategories[cat] || 0) + 1;
});

console.log('\nResolution Time Distribution:');
Object.entries(timeCategories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([time, count]) => {
    const percentage = ((count / dataset.testCases.length) * 100).toFixed(1);
    console.log(`  ${time.padEnd(20)} ${count.toString().padStart(2)} (${percentage}%)`);
  });

// Example 9: Agent applicability matrix
printSection('EXAMPLE 9: Agent Applicability Matrix');
const applicability = {
  testRepair: dataset.testCases.filter(tc => tc.agentApplicability.testRepair).length,
  typeScriptFix: dataset.testCases.filter(tc => tc.agentApplicability.typeScriptFix).length,
  lintFix: dataset.testCases.filter(tc => tc.agentApplicability.lintFix).length
};

console.log('\nAgent Applicability:');
Object.entries(applicability).forEach(([agent, count]) => {
  const percentage = ((count / dataset.testCases.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(count / 3));
  console.log(`  ${agent.padEnd(20)} ${count.toString().padStart(2)} (${percentage}%) ${bar}`);
});

// Example 10: Filter by multiple criteria
printSection('EXAMPLE 10: Complex Queries');

console.log('\n🎯 High-complexity TypeScript errors (good for testing AI limits):');
const complexTS = dataset.testCases.filter(tc =>
  tc.type === 'typescript-error' &&
  tc.complexity >= 7
);
complexTS.forEach(tc => printCase(tc));

console.log('\n\n🔧 Quick wins for Test Repair Agent (low complexity, high applicability):');
const quickTestWins = dataset.testCases.filter(tc =>
  tc.agentApplicability.testRepair &&
  tc.complexity <= 5
);
quickTestWins.forEach(tc => printCase(tc));

console.log('\n\n⚡ AI-assisted cases (learn from successful AI patterns):');
const aiCases = dataset.testCases.filter(tc =>
  tc.pattern === 'ai-assisted' ||
  tc.pattern === 'ai-consensus' ||
  tc.pattern === 'mass-cleanup'
);
aiCases.forEach(tc => printCase(tc, true));

// Example 11: Generate custom test suite
printSection('EXAMPLE 11: Custom Test Suite Generator');

function generateTestSuite(name, criteria) {
  const cases = dataset.testCases.filter(criteria);
  console.log(`\n${name}:`);
  console.log(`Total cases: ${cases.length}`);
  console.log(`Average complexity: ${(cases.reduce((sum, tc) => sum + tc.complexity, 0) / cases.length).toFixed(1)}/10`);
  console.log(`\nCase list:`);
  cases.forEach((tc, i) => {
    console.log(`  ${i + 1}. ${tc.id} - ${tc.description.substring(0, 60)}... (${tc.complexity}/10)`);
  });
}

generateTestSuite(
  '🎓 Training Set for TypeScript Fix Agent',
  tc => tc.agentApplicability.typeScriptFix && tc.complexity >= 4 && tc.complexity <= 7
);

generateTestSuite(
  '🧪 Advanced Test Repair Scenarios',
  tc => tc.agentApplicability.testRepair && tc.complexity >= 7
);

// Final summary
printSection('DATASET SUMMARY');
console.log(`
Total Test Cases: ${dataset.testCases.length}
Timeframe: ${dataset.metadata.timeframe}
Repository: ${dataset.metadata.repository}
Version: ${dataset.metadata.version}

Distribution:
  - TypeScript Errors: ${dataset.testCases.filter(tc => tc.type === 'typescript-error').length}
  - Bug Fixes: ${dataset.testCases.filter(tc => tc.type === 'bug-fix').length}
  - Test Failures: ${dataset.testCases.filter(tc => tc.type === 'test-failure').length}
  - Build Errors: ${dataset.testCases.filter(tc => tc.type === 'build-error').length}
  - Other: ${dataset.testCases.filter(tc => !['typescript-error', 'bug-fix', 'test-failure', 'build-error'].includes(tc.type)).length}

Severity:
  - Critical: ${dataset.testCases.filter(tc => tc.severity === 'critical').length}
  - High: ${dataset.testCases.filter(tc => tc.severity === 'high').length}
  - Medium: ${dataset.testCases.filter(tc => tc.severity === 'medium').length}
  - Low: ${dataset.testCases.filter(tc => tc.severity === 'low').length}

For detailed analysis, see:
  - BACKTEST_SUMMARY.md
  - AGENT_EVALUATION_GUIDE.md
`);

printSection('END OF EXAMPLES');
console.log('\n💡 Tip: Modify this script to create custom queries for your agent evaluation needs!\n');
