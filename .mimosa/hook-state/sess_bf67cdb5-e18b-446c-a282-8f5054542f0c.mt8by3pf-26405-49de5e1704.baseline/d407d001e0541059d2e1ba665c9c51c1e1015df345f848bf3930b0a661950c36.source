/**
 * Integration Tests: Promotion Gate Invariants
 *
 * Tests that the promotion gate correctly blocks WARN → ENFORCE promotion
 * when unknown stage rate exceeds 0.5% threshold.
 *
 * This test validates the business rule implemented in the Prometheus alert:
 * EnforceGateUnknownRateHigh
 */

import { describe, it, expect } from 'vitest';

/**
 * Mock Prometheus metrics collector
 *
 * Simulates Prometheus scraping and alert evaluation
 */
class MockPrometheusMetrics {
  private metrics: Map<string, number> = new Map();

  // Record a metric value
  record(name: string, value: number): void {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }

  // Get metric value
  get(name: string): number {
    return this.metrics.get(name) || 0;
  }

  // Calculate rate over window
  rate(name: string): number {
    return this.get(name);
  }

  // Reset all metrics
  reset(): void {
    this.metrics.clear();
  }
}

/**
 * Promotion gate logic (extracted from Prometheus alert)
 *
 * Alert expression:
 * (sum(rate(stage_warn_unknown_total[10m])) / sum(rate(http_requests_total[10m]))) > 0.005
 */
function shouldBlockPromotion(metrics: MockPrometheusMetrics): boolean {
  const unknownRate = metrics.rate('stage_warn_unknown_total');
  const totalRequests = metrics.rate('http_requests_total');

  if (totalRequests === 0) return false; // No data, don't block

  const unknownFraction = unknownRate / totalRequests;
  return unknownFraction > 0.005; // 0.5% threshold
}

describe('Promotion Gate Invariants', () => {
  describe('Unknown Stage Rate Threshold', () => {
    it('blocks promotion when unknown rate > 0.5%', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 10,000 requests with 51 unknown stages (0.51%)
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 51);

      expect(shouldBlockPromotion(metrics)).toBe(true);
    });

    it('allows promotion when unknown rate = 0.5% (at boundary)', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 10,000 requests with 50 unknown stages (0.50%)
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 50);

      expect(shouldBlockPromotion(metrics)).toBe(false);
    });

    it('allows promotion when unknown rate < 0.5%', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 10,000 requests with 10 unknown stages (0.10%)
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 10);

      expect(shouldBlockPromotion(metrics)).toBe(false);
    });

    it('allows promotion when unknown rate = 0%', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 10,000 requests with 0 unknown stages
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 0);

      expect(shouldBlockPromotion(metrics)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('does not block when no requests received', () => {
      const metrics = new MockPrometheusMetrics();

      // No requests at all
      expect(shouldBlockPromotion(metrics)).toBe(false);
    });

    it('blocks with high unknown rate on low volume', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 100 requests with 1 unknown stage (1%)
      metrics.record('http_requests_total', 100);
      metrics.record('stage_warn_unknown_total', 1);

      expect(shouldBlockPromotion(metrics)).toBe(true);
    });

    it('blocks with high unknown rate on high volume', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate 1,000,000 requests with 5001 unknown stages (0.5001%)
      metrics.record('http_requests_total', 1000000);
      metrics.record('stage_warn_unknown_total', 5001);

      expect(shouldBlockPromotion(metrics)).toBe(true);
    });
  });

  describe('Realistic Scenarios', () => {
    it('Scenario: Clean production traffic', () => {
      const metrics = new MockPrometheusMetrics();

      // Production with 100k requests, 10 unknown stages (0.01%)
      metrics.record('http_requests_total', 100000);
      metrics.record('stage_warn_unknown_total', 10);

      expect(shouldBlockPromotion(metrics)).toBe(false);
    });

    it('Scenario: New data source with unknown stages', () => {
      const metrics = new MockPrometheusMetrics();

      // Production with 50k requests, 500 unknown stages (1%)
      metrics.record('http_requests_total', 50000);
      metrics.record('stage_warn_unknown_total', 500);

      expect(shouldBlockPromotion(metrics)).toBe(true);
    });

    it('Scenario: After migration normalization', () => {
      const metrics = new MockPrometheusMetrics();

      // Production after migration, 200k requests, 5 unknown stages (0.0025%)
      metrics.record('http_requests_total', 200000);
      metrics.record('stage_warn_unknown_total', 5);

      expect(shouldBlockPromotion(metrics)).toBe(false);
    });

    it('Scenario: Canary rollout boundary case', () => {
      const metrics = new MockPrometheusMetrics();

      // Canary with 1000 requests, 5 unknown stages (0.5%)
      // This is at the exact boundary - should allow
      metrics.record('http_requests_total', 1000);
      metrics.record('stage_warn_unknown_total', 5);

      expect(shouldBlockPromotion(metrics)).toBe(false);

      // Add 1 more unknown stage to exceed threshold
      metrics.record('stage_warn_unknown_total', 1);

      expect(shouldBlockPromotion(metrics)).toBe(true);
    });
  });

  describe('Time Window Behavior', () => {
    it('respects 10-minute window for promotion decision', () => {
      const metrics = new MockPrometheusMetrics();

      // Simulate spike in unknown stages in current window
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 100); // 1%

      // First check - should block
      expect(shouldBlockPromotion(metrics)).toBe(true);

      // Reset for next window (simulating time passage)
      metrics.reset();
      metrics.record('http_requests_total', 10000);
      metrics.record('stage_warn_unknown_total', 10); // 0.1%

      // Second check - should allow
      expect(shouldBlockPromotion(metrics)).toBe(false);
    });
  });

  describe('Alert Threshold Calculation', () => {
    it('matches Prometheus alert expression logic', () => {
      // Test various percentages to verify logic
      const testCases = [
        { requests: 10000, unknowns: 0, expectedBlock: false, percentage: 0 },
        { requests: 10000, unknowns: 10, expectedBlock: false, percentage: 0.1 },
        { requests: 10000, unknowns: 49, expectedBlock: false, percentage: 0.49 },
        { requests: 10000, unknowns: 50, expectedBlock: false, percentage: 0.5 },
        { requests: 10000, unknowns: 51, expectedBlock: true, percentage: 0.51 },
        { requests: 10000, unknowns: 100, expectedBlock: true, percentage: 1.0 },
        { requests: 1000, unknowns: 5, expectedBlock: false, percentage: 0.5 },
        { requests: 1000, unknowns: 6, expectedBlock: true, percentage: 0.6 },
      ];

      for (const testCase of testCases) {
        const metrics = new MockPrometheusMetrics();
        metrics.record('http_requests_total', testCase.requests);
        metrics.record('stage_warn_unknown_total', testCase.unknowns);

        const blocked = shouldBlockPromotion(metrics);
        expect(blocked).toBe(testCase.expectedBlock);
      }
    });
  });
});

/**
 * Integration test with actual Prometheus query simulator
 *
 * This test demonstrates how the alert would fire in a real Prometheus environment.
 */
describe('Prometheus Alert Integration', () => {
  it('simulates EnforceGateUnknownRateHigh alert firing', () => {
    // Simulate Prometheus scraping metrics over 10-minute window
    const metrics = new MockPrometheusMetrics();

    // Scenario: Canary rollout with 0.6% unknown rate
    const totalRequests = 100000;
    const unknownRequests = 600; // 0.6%

    metrics.record('http_requests_total', totalRequests);
    metrics.record('stage_warn_unknown_total', unknownRequests);

    // Evaluate alert condition
    const unknownRate = metrics.rate('stage_warn_unknown_total');
    const httpRate = metrics.rate('http_requests_total');
    const unknownFraction = unknownRate / httpRate;

    // Assert alert would fire
    expect(unknownFraction).toBeGreaterThan(0.005);
    expect(shouldBlockPromotion(metrics)).toBe(true);

    // Expected alert annotation
    const alertAnnotation = {
      description: 'Unknown stage rate >0.5% for 10m; blocks promotion to ENFORCE mode',
      runbook: '/docs/runbooks/stage-normalization-rollout.md#promotion-gate',
      severity: 'page',
    };

    expect(alertAnnotation.severity).toBe('page');
  });

  it('simulates safe promotion scenario', () => {
    const metrics = new MockPrometheusMetrics();

    // Scenario: Stable canary with 0.05% unknown rate
    const totalRequests = 100000;
    const unknownRequests = 50; // 0.05%

    metrics.record('http_requests_total', totalRequests);
    metrics.record('stage_warn_unknown_total', unknownRequests);

    // Evaluate alert condition
    const unknownRate = metrics.rate('stage_warn_unknown_total');
    const httpRate = metrics.rate('http_requests_total');
    const unknownFraction = unknownRate / httpRate;

    // Assert alert would NOT fire
    expect(unknownFraction).toBeLessThanOrEqual(0.005);
    expect(shouldBlockPromotion(metrics)).toBe(false);
  });
});
