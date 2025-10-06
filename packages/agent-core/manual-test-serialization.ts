/**
 * Manual test script to verify worker thread serialization
 * Run with: npx ts-node manual-test-serialization.ts
 */

import { serializeAsync, shutdownSerializationPool } from './src/SerializationHelper';

async function testWorkerThreadSerialization() {
  console.log('=== Worker Thread Serialization Test ===\n');

  // Test 1: Small object (should use sync path)
  console.log('Test 1: Small object (sync path)');
  const smallObj = { id: 1, name: 'test', active: true };
  const start1 = Date.now();
  const result1 = await serializeAsync(smallObj);
  const duration1 = Date.now() - start1;
  console.log(`✓ Serialized in ${duration1}ms`);
  console.log(`  Truncated: ${result1.truncated}`);
  console.log(`  Size: ${result1.serialized.length} chars\n`);

  // Test 2: Large object (should use worker thread)
  console.log('Test 2: Large object (worker thread path)');
  const largeObj = {
    data: Array.from({ length: 200 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      description: 'This is a test item with a longer description to increase size',
      metadata: {
        tags: ['tag1', 'tag2', 'tag3'],
        priority: i % 3,
        timestamp: new Date().toISOString()
      }
    }))
  };

  const start2 = Date.now();
  const result2 = await serializeAsync(largeObj);
  const duration2 = Date.now() - start2;
  console.log(`✓ Serialized in ${duration2}ms`);
  console.log(`  Truncated: ${result2.truncated}`);
  console.log(`  Size: ${result2.serialized.length} chars`);
  console.log(`  Original size: ${result2.originalSize || result2.serialized.length} chars\n`);

  // Test 3: Very large object with truncation
  console.log('Test 3: Very large object (with truncation)');
  const veryLargeObj = {
    data: Array.from({ length: 2000 }, (_, i) => ({
      id: i,
      text: 'Lorem ipsum dolor sit amet '.repeat(10),
      nested: {
        array: Array.from({ length: 10 }, (_, j) => ({ value: j * i }))
      }
    }))
  };

  const start3 = Date.now();
  const result3 = await serializeAsync(veryLargeObj, {
    maxSize: 50000,
    truncate: true
  });
  const duration3 = Date.now() - start3;
  console.log(`✓ Serialized in ${duration3}ms`);
  console.log(`  Truncated: ${result3.truncated}`);
  console.log(`  Size: ${result3.serialized.length} chars`);
  if (result3.originalSize) {
    console.log(`  Original size: ${result3.originalSize} chars`);
    console.log(`  Reduction: ${Math.round((1 - result3.serialized.length / result3.originalSize) * 100)}%`);
  }
  console.log();

  // Test 4: Event loop responsiveness
  console.log('Test 4: Event loop responsiveness during serialization');
  let timeoutFired = false;
  let timeoutDelay = 0;

  const timeoutStart = Date.now();
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      timeoutDelay = Date.now() - timeoutStart;
      timeoutFired = true;
      resolve();
    }, 50);
  });

  // Serialize large object while timeout is pending
  const serializePromise = serializeAsync(veryLargeObj);

  await Promise.all([timeoutPromise, serializePromise]);

  if (timeoutFired) {
    console.log(`✓ Event loop remained responsive`);
    console.log(`  Timeout fired after ${timeoutDelay}ms (expected ~50ms)`);
    console.log(`  Event loop blocking: ${timeoutDelay > 100 ? 'DETECTED ⚠️' : 'None ✓'}\n`);
  }

  // Test 5: Circular reference handling
  console.log('Test 5: Circular reference handling');
  const circular: Record<string, unknown> = { id: 1, name: 'circular' };
  circular.self = circular;

  const start5 = Date.now();
  const result5 = await serializeAsync(circular);
  const duration5 = Date.now() - start5;
  console.log(`✓ Handled in ${duration5}ms`);
  console.log(`  Truncated: ${result5.truncated}`);
  const parsed5 = JSON.parse(result5.serialized);
  console.log(`  Error detected: ${!!parsed5._serializationError}\n`);

  // Cleanup
  console.log('Shutting down worker pool...');
  await shutdownSerializationPool();
  console.log('✓ Worker pool shut down successfully\n');

  console.log('=== All Tests Completed ===');
}

testWorkerThreadSerialization().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
