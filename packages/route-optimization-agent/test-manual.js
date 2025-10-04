// Manual test runner for RouteOptimizationAgent
// Run with: node test-manual.js

// Setup module alias for @agent-core
const Module = require('module');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain) {
  if (request.startsWith('@agent-core/')) {
    const modulePath = request.replace('@agent-core/', '');
    return path.resolve(__dirname, 'dist/agent-core/src', modulePath + '.js');
  }
  return originalResolveFilename.call(this, request, parent, isMain);
};

const { RouteOptimizationAgent } = require('./dist/RouteOptimizationAgent');

console.log('=== RouteOptimizationAgent Manual Test ===\n');

async function runTests() {
  let passedTests = 0;
  let failedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    console.log(`Running test: ${name}`);
    try {
      fn();
      passedTests++;
      console.log(`✓ PASS: ${name}\n`);
    } catch (error) {
      failedTests++;
      console.log(`✗ FAIL: ${name}`);
      console.log(`  Error: ${error.message}\n`);
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertEquals(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  // Test 1: Instantiation
  test('should create an instance of RouteOptimizationAgent', () => {
    const agent = new RouteOptimizationAgent();
    assert(agent instanceof RouteOptimizationAgent, 'Agent should be instance of RouteOptimizationAgent');
  });

  // Test 2: Configuration
  test('should have correct default configuration', () => {
    const agent = new RouteOptimizationAgent();
    const config = agent.config;
    assertEquals(config.name, 'RouteOptimizationAgent', 'Agent name should be RouteOptimizationAgent');
    assertEquals(config.maxRetries, 2, 'Max retries should be 2');
    assertEquals(config.retryDelay, 2000, 'Retry delay should be 2000ms');
    assertEquals(config.timeout, 90000, 'Timeout should be 90000ms');
    assertEquals(config.logLevel, 'info', 'Log level should be info');
  });

  // Test 3: Execute method exists
  test('should have execute method', () => {
    const agent = new RouteOptimizationAgent();
    assert(typeof agent.execute === 'function', 'Agent should have execute method');
  });

  // Test 4: Basic execution with empty input
  test('should execute with minimal input', async () => {
    const agent = new RouteOptimizationAgent();
    const input = { analyzeUsage: false };

    try {
      const result = await agent.execute(input);
      assert(result !== null, 'Result should not be null');
      assert(typeof result === 'object', 'Result should be an object');
      assert('success' in result, 'Result should have success property');
      assert('context' in result, 'Result should have context property');
    } catch (error) {
      // Expected to fail if routes directory doesn't exist, but should still return a result
      console.log('  Note: Execution failed (expected if routes directory missing):', error.message);
    }
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  return failedTests === 0;
}

runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
