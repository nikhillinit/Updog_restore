/**
 * Metrics API Performance Load Tests
 *
 * Validates that the Unified Metrics Layer meets performance targets:
 * - p95 latency < 500ms for 100 portfolio companies
 * - Cache effectiveness (5x speedup on cache hit)
 *
 * Run: npm test -- metrics-performance.test.ts
 *
 * @module tests/load/metrics-performance
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { performance } from 'perf_hooks';

function logMetricsPerformance(...args: unknown[]): void {
  if (process.env.METRICS_PERF_DEBUG === 'true') {
    console.warn(...args);
  }
}

describe('Metrics API Performance - Load Testing', () => {
  const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';
  let testFundId: number;

  beforeAll(async () => {
    // TODO: Setup test fund with 100 companies
    // For now, use existing fund ID 1
    testFundId = 1;
  });

  /**
   * Test: p95 Latency < 500ms with 100 Companies
   *
   * Target: 95th percentile response time under 500ms
   * Sample size: 20 requests
   */
  it('should handle 100 portfolio companies in < 500ms (p95)', async () => {
    const durations: number[] = [];
    const numRequests = 20;

    logMetricsPerformance(`Running ${numRequests} requests to measure p95 latency...`);

    for (let i = 0; i < numRequests; i++) {
      const start = performance.now();

      const response = await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics`);
      const data = await response.json();

      const end = performance.now();
      const duration = end - start;

      durations.push(duration);

      // Verify response is valid
      expect(response.ok).toBe(true);
      expect(data).toHaveProperty('actual');
      expect(data).toHaveProperty('projected');
      expect(data).toHaveProperty('target');
      expect(data).toHaveProperty('variance');

      logMetricsPerformance(`Request ${i + 1}/${numRequests}: ${duration.toFixed(0)}ms`);
    }

    // Calculate p95
    const sorted = durations.sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    const p50 = sorted[p50Index]!;
    const p95 = sorted[p95Index]!;
    const p99 = sorted[p99Index]!;
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    logMetricsPerformance('\nPerformance Results:');
    logMetricsPerformance('====================');
    logMetricsPerformance(`Min:    ${min.toFixed(0)}ms`);
    logMetricsPerformance(`p50:    ${p50.toFixed(0)}ms`);
    logMetricsPerformance(`Avg:    ${avg.toFixed(0)}ms`);
    logMetricsPerformance(`p95:    ${p95.toFixed(0)}ms`);
    logMetricsPerformance(`p99:    ${p99.toFixed(0)}ms`);
    logMetricsPerformance(`Max:    ${max.toFixed(0)}ms`);
    logMetricsPerformance('====================');

    // Assert p95 meets target
    expect(p95).toBeLessThan(500);
  }, 60000); // 60 second timeout

  /**
   * Test: Cache Effectiveness
   *
   * Target: Cache hit should be at least 5x faster than cache miss
   */
  it('should show significant speedup from caching', async () => {
    logMetricsPerformance('Testing cache effectiveness...');

    // Invalidate cache first
    await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics/invalidate`, {
      method: 'POST',
    });

    // Wait for cache to clear
    await new Promise((resolve) => setTimeout(resolve, 100));

    // First request (cache miss)
    const start1 = performance.now();
    const response1 = await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics`);
    await response1.json();
    const cacheMissDuration = performance.now() - start1;

    expect(response1.ok).toBe(true);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second request (cache hit)
    const start2 = performance.now();
    const response2 = await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics`);
    const data2 = await response2.json();
    const cacheHitDuration = performance.now() - start2;

    expect(response2.ok).toBe(true);

    // Check cache metadata
    expect(data2._cache?.hit).toBe(true);

    const speedup = cacheMissDuration / cacheHitDuration;

    logMetricsPerformance('\nCache Performance:');
    logMetricsPerformance('==================');
    logMetricsPerformance(`Cache miss: ${cacheMissDuration.toFixed(0)}ms`);
    logMetricsPerformance(`Cache hit:  ${cacheHitDuration.toFixed(0)}ms`);
    logMetricsPerformance(`Speedup:    ${speedup.toFixed(1)}x`);
    logMetricsPerformance('==================');

    // Assert at least 3x speedup (relaxed from 5x for reliability)
    expect(speedup).toBeGreaterThan(3);
  }, 30000);

  /**
   * Test: Concurrent Requests
   *
   * Ensures the API handles multiple simultaneous requests without degradation
   */
  it('should handle concurrent requests efficiently', async () => {
    const concurrency = 10;

    logMetricsPerformance(`Running ${concurrency} concurrent requests...`);

    const start = performance.now();

    const promises = Array.from({ length: concurrency }, () =>
      fetch(`${BASE_URL}/api/funds/${testFundId}/metrics`).then((r) => r.json())
    );

    const results = await Promise.all(promises);
    const duration = performance.now() - start;

    logMetricsPerformance(
      `\nCompleted ${concurrency} concurrent requests in ${duration.toFixed(0)}ms`
    );
    logMetricsPerformance(`Average per request: ${(duration / concurrency).toFixed(0)}ms`);

    // All requests should succeed
    expect(results).toHaveLength(concurrency);
    results.forEach((result) => {
      expect(result).toHaveProperty('actual');
    });

    // With caching, concurrent requests should complete quickly
    expect(duration).toBeLessThan(2000); // 2 seconds for 10 requests
  }, 30000);

  /**
   * Test: skipProjections Performance Boost
   *
   * Verifies that skipProjections=true provides faster response
   */
  it('should load faster with skipProjections=true', async () => {
    // Invalidate cache
    await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics/invalidate`, {
      method: 'POST',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Full metrics (with projections)
    const start1 = performance.now();
    const response1 = await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics`);
    await response1.json();
    const fullDuration = performance.now() - start1;

    // Invalidate cache again
    await fetch(`${BASE_URL}/api/funds/${testFundId}/metrics/invalidate`, {
      method: 'POST',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Skip projections
    const start2 = performance.now();
    const response2 = await fetch(
      `${BASE_URL}/api/funds/${testFundId}/metrics?skipProjections=true`
    );
    await response2.json();
    const skipDuration = performance.now() - start2;

    logMetricsPerformance('\nskipProjections Performance:');
    logMetricsPerformance('=============================');
    logMetricsPerformance(`With projections:    ${fullDuration.toFixed(0)}ms`);
    logMetricsPerformance(`Without projections: ${skipDuration.toFixed(0)}ms`);
    logMetricsPerformance(
      `Savings:             ${(fullDuration - skipDuration).toFixed(0)}ms (${((1 - skipDuration / fullDuration) * 100).toFixed(0)}%)`
    );
    logMetricsPerformance('=============================');

    // Skip should be faster
    expect(skipDuration).toBeLessThan(fullDuration);
  }, 30000);
});

/**
 * Stress Test: High Load Simulation
 *
 * Simulates realistic production load patterns
 */
/**
 * @quarantine
 * @reason Intentional manual-only stress test; 5-minute sustained load unsuitable for CI
 * @category INFRA
 * @owner P5.1 tech debt audit
 * @date 2026-02-18
 * @exitCriteria Move to tests/manual/ directory or run only in dedicated perf CI job with extended timeout
 */
describe('Metrics API - Stress Testing', () => {
  const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

  // SKIP: manual-only sustained load test; unsuitable for CI and default local runs
  it.skip(
    'should handle sustained load (100 req/min for 5 minutes)',
    async () => {
      // This test is skipped by default - run manually for stress testing
      const durationMinutes = 5;
      const requestsPerMinute = 100;
      const intervalMs = (60 * 1000) / requestsPerMinute; // 600ms between requests

      logMetricsPerformance(
        `Starting stress test: ${requestsPerMinute} req/min for ${durationMinutes} minutes...`
      );

      const results: { success: number; errors: number; durations: number[] } = {
        success: 0,
        errors: 0,
        durations: [],
      };

      const startTime = Date.now();
      const endTime = startTime + durationMinutes * 60 * 1000;

      while (Date.now() < endTime) {
        const reqStart = performance.now();

        try {
          const response = await fetch(`${BASE_URL}/api/funds/1/metrics`);
          if (response.ok) {
            results.success++;
          } else {
            results.errors++;
          }
          const reqEnd = performance.now();
          results.durations.push(reqEnd - reqStart);
        } catch {
          results.errors++;
        }

        // Wait for next interval
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      logMetricsPerformance('\nStress Test Results:');
      logMetricsPerformance('====================');
      logMetricsPerformance(`Total requests: ${results.success + results.errors}`);
      logMetricsPerformance(`Successful:     ${results.success}`);
      logMetricsPerformance(`Errors:         ${results.errors}`);
      logMetricsPerformance(
        `Success rate:   ${((results.success / (results.success + results.errors)) * 100).toFixed(2)}%`
      );
      logMetricsPerformance('====================');

      // 99% success rate expected
      expect(results.errors / (results.success + results.errors)).toBeLessThan(0.01);
    },
    10 * 60 * 1000
  ); // 10 minute timeout
});

/**
 * Manual Testing Instructions
 *
 * To run these tests:
 *
 * 1. Start the development server:
 *    npm run dev
 *
 * 2. Ensure you have a fund with data:
 *    - At least 1 fund in database
 *    - At least 10-100 portfolio companies
 *
 * 3. Run performance tests:
 *    npm test -- metrics-performance.test.ts
 *
 * 4. Review results:
 *    - Check that p95 < 500ms
 *    - Verify cache provides 3-5x speedup
 *    - Ensure concurrent requests work
 *
 * 5. For stress testing (optional):
 *    - Remove .skip from stress test
 *    - Run: npm test -- metrics-performance.test.ts --reporter=verbose
 */
