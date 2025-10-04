// Simple test runner to verify ZencoderAgent works
import { ZencoderAgent } from './dist/index.js';

async function runTests() {
  console.log('Starting ZencoderAgent tests...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Instantiation
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 1,
      timeout: 10000,
    });
    console.log('✓ Test 1: ZencoderAgent instantiation');
    passed++;
  } catch (error) {
    console.log('✗ Test 1: ZencoderAgent instantiation');
    console.error(error);
    failed++;
  }

  // Test 2: Execute with typescript-fix task (dry run)
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 1,
      timeout: 10000,
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'typescript-fix',
      maxFixes: 0,
    });

    if (result.success && result.data && result.data.task === 'typescript-fix') {
      console.log('✓ Test 2: Execute typescript-fix task');
      passed++;
    } else {
      console.log('✗ Test 2: Execute typescript-fix task - invalid result');
      console.log('Result:', JSON.stringify(result, null, 2));
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 2: Execute typescript-fix task');
    console.error(error);
    failed++;
  }

  // Test 3: Execute with test-fix task (dry run)
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 1,
      timeout: 10000,
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'test-fix',
      maxFixes: 0,
    });

    if (result.success && result.data && result.data.task === 'test-fix') {
      console.log('✓ Test 3: Execute test-fix task');
      passed++;
    } else {
      console.log('✗ Test 3: Execute test-fix task - invalid result');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 3: Execute test-fix task');
    console.error(error);
    failed++;
  }

  // Test 4: Execute with eslint-fix task (dry run)
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 1,
      timeout: 10000,
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'eslint-fix',
      maxFixes: 0,
    });

    if (result.success && result.data && result.data.task === 'eslint-fix') {
      console.log('✓ Test 4: Execute eslint-fix task');
      passed++;
    } else {
      console.log('✗ Test 4: Execute eslint-fix task - invalid result');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 4: Execute eslint-fix task');
    console.error(error);
    failed++;
  }

  // Test 5: Execute with dependency-update task (dry run)
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 1,
      timeout: 10000,
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'dependency-update',
      maxFixes: 0,
    });

    if (result.success && result.data && result.data.task === 'dependency-update') {
      console.log('✓ Test 5: Execute dependency-update task');
      passed++;
    } else {
      console.log('✗ Test 5: Execute dependency-update task - invalid result');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 5: Execute dependency-update task');
    console.error(error);
    failed++;
  }

  // Test 6: Result structure validation
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'typescript-fix',
      maxFixes: 0,
    });

    const hasRequiredFields =
      result.data &&
      typeof result.data.task === 'string' &&
      typeof result.data.filesAnalyzed === 'number' &&
      typeof result.data.filesFixed === 'number' &&
      Array.isArray(result.data.fixes) &&
      typeof result.data.summary === 'string' &&
      typeof result.data.timeMs === 'number';

    if (hasRequiredFields) {
      console.log('✓ Test 6: Result structure validation');
      passed++;
    } else {
      console.log('✗ Test 6: Result structure validation - missing fields');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 6: Result structure validation');
    console.error(error);
    failed++;
  }

  // Test 7: Error handling for invalid task
  try {
    const agent = new ZencoderAgent({
      name: 'test-agent',
      maxRetries: 0,
    });

    const result = await agent.execute({
      projectRoot: process.cwd(),
      task: 'invalid-task',
      maxFixes: 0,
    });

    if (!result.success && result.error) {
      console.log('✓ Test 7: Error handling for invalid task');
      passed++;
    } else {
      console.log('✗ Test 7: Error handling for invalid task - should have failed');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 7: Error handling for invalid task');
    console.error(error);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
