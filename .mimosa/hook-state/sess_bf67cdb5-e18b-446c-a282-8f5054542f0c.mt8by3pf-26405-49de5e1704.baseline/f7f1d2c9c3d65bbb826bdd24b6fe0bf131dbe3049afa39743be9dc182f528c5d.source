/**
 * Test Rate Limiting for AI Endpoints
 *
 * Tests that rate limiting is properly enforced for:
 * - /api/ai/proposals (10/hour)
 * - /api/ai/ask (30/hour)
 * - /api/ai/collaborate (5/hour)
 *
 * Usage:
 *   npm run dev (in one terminal)
 *   npx tsx scripts/test-rate-limiting.ts (in another)
 */

const API_BASE = process.env.API_URL || 'http://localhost:5000';

interface RateLimitTest {
  endpoint: string;
  limit: number;
  payload: any;
}

const tests: RateLimitTest[] = [
  {
    endpoint: '/api/ai/ask',
    limit: 30,
    payload: {
      prompt: 'What is 2+2?',
      models: ['deepseek'], // Use cheapest model for testing
    },
  },
  {
    endpoint: '/api/ai/proposals',
    limit: 10,
    payload: {
      topic: 'Test proposal for rate limiting',
      complexity: 'simple',
    },
  },
  {
    endpoint: '/api/ai/collaborate',
    limit: 5,
    payload: {
      problem: 'Test collaboration',
      models: ['deepseek'],
    },
  },
];

async function makeRequest(endpoint: string, payload: any): Promise<Response> {
  return fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function testRateLimit(test: RateLimitTest) {
  console.log(`\n📊 Testing ${test.endpoint} (limit: ${test.limit}/hour)`);
  console.log('='.repeat(60));

  let successCount = 0;
  let rateLimitedCount = 0;
  let errorCount = 0;

  // Try to exceed the limit
  const attempts = test.limit + 3;

  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await makeRequest(test.endpoint, test.payload);
      const data = await response.json();

      // Check rate limit headers
      const remaining = response.headers.get('RateLimit-Remaining');
      const limit = response.headers.get('RateLimit-Limit');
      const reset = response.headers.get('RateLimit-Reset');

      if (response.status === 429) {
        rateLimitedCount++;
        console.log(`  [${i}/${attempts}] ❌ RATE LIMITED (as expected after ${test.limit} requests)`);
        console.log(`     Response: ${data.error}`);
        console.log(`     Retry after: ${data.retryAfter || 'unknown'}`);
      } else if (response.ok) {
        successCount++;
        console.log(`  [${i}/${attempts}] ✅ SUCCESS (remaining: ${remaining}/${limit})`);
      } else {
        errorCount++;
        console.log(`  [${i}/${attempts}] ⚠️  ERROR ${response.status}: ${data.error || 'Unknown'}`);
      }

      // Small delay to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      errorCount++;
      console.log(`  [${i}/${attempts}] ⚠️  NETWORK ERROR: ${error}`);
    }
  }

  console.log('\n📈 Summary:');
  console.log(`  Successful: ${successCount}/${attempts}`);
  console.log(`  Rate Limited: ${rateLimitedCount}/${attempts}`);
  console.log(`  Errors: ${errorCount}/${attempts}`);

  // Validation
  const expectedSuccess = Math.min(test.limit, attempts);
  const expectedRateLimited = Math.max(0, attempts - test.limit);

  if (successCount === expectedSuccess && rateLimitedCount === expectedRateLimited) {
    console.log(`  ✅ PASS: Rate limiting is working correctly!`);
    return true;
  } else {
    console.log(`  ❌ FAIL: Expected ${expectedSuccess} success, ${expectedRateLimited} rate limited`);
    return false;
  }
}

async function main() {
  console.log('🔬 Rate Limiting Test Suite');
  console.log('Testing AI endpoints for proper rate limiting enforcement\n');
  console.log(`API Base: ${API_BASE}\n`);

  // Check if server is running
  try {
    const healthCheck = await fetch(`${API_BASE}/health`);
    if (!healthCheck.ok) {
      console.error('❌ Server is not responding. Make sure the server is running:');
      console.error('   npm run dev');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Cannot connect to server. Make sure the server is running:');
    console.error('   npm run dev');
    console.error(`\nError: ${error}`);
    process.exit(1);
  }

  console.log('✅ Server is running\n');

  const results: boolean[] = [];

  for (const test of tests) {
    const passed = await testRateLimit(test);
    results.push(passed);

    // Wait between tests to reset rate limit window
    if (test !== tests[tests.length - 1]) {
      console.log('\n⏳ Waiting 5 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Results');
  console.log('='.repeat(60));

  tests.forEach((test, i) => {
    const status = results[i] ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${test.endpoint} (${test.limit}/hour)`);
  });

  const allPassed = results.every(r => r);
  console.log('\n' + '='.repeat(60));

  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('\nRate limiting is properly configured and working.');
    console.log('P1 Security Control: ✅ Active\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('\nRate limiting may not be working correctly.');
    console.log('Review the logs above for details.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
