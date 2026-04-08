import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { monitor, monteCarloTracker } from '../../../server/middleware/performance-monitor';

describe('MonteCarloPerformanceTracker.trackMemoryUsage', () => {
  const alertHandler = vi.fn();
  const metricHandler = vi.fn();

  beforeEach(() => {
    alertHandler.mockReset();
    metricHandler.mockReset();
    monitor.on('performance_alert', alertHandler);
    monitor.on('metric_recorded', metricHandler);
  });

  afterEach(() => {
    monitor.off('performance_alert', alertHandler);
    monitor.off('metric_recorded', metricHandler);
  });

  const sampleMemoryUsage: NodeJS.MemoryUsage = {
    heapUsed: 50_000_000,
    heapTotal: 60_000_000,
    external: 1_000_000,
    rss: 80_000_000,
    arrayBuffers: 0,
  };

  it('does not emit performance_alert for memory metrics regardless of heap size', () => {
    monteCarloTracker.trackMemoryUsage('simulation_complete', sampleMemoryUsage);
    expect(alertHandler).not.toHaveBeenCalled();
  });

  it('records the heap values in metadata, not in the duration field', () => {
    monteCarloTracker.trackMemoryUsage('simulation_complete', sampleMemoryUsage);

    const exported = monitor.exportMetrics();
    const memoryMetric = exported.recentMetrics.find(
      (m) => m.operation === 'memory_simulation_complete'
    );

    expect(memoryMetric).toBeDefined();
    expect(memoryMetric?.metadata?.['heapUsed']).toBe(50_000_000);
    expect(memoryMetric?.metadata?.['heapTotal']).toBe(60_000_000);
    expect(memoryMetric?.metadata?.['external']).toBe(1_000_000);
    expect(memoryMetric?.metadata?.['rss']).toBe(80_000_000);
  });

  it('records the memory metric with severity "normal"', () => {
    monteCarloTracker.trackMemoryUsage('simulation_complete', sampleMemoryUsage);

    const exported = monitor.exportMetrics();
    const memoryMetric = exported.recentMetrics.find(
      (m) => m.operation === 'memory_simulation_complete'
    );

    expect(memoryMetric?.severity).toBe('normal');
  });

  it('still emits metric_recorded for memory metrics', () => {
    monteCarloTracker.trackMemoryUsage('simulation_complete', sampleMemoryUsage);

    const memoryEmissions = metricHandler.mock.calls.filter(
      ([metric]) => (metric as { operation: string }).operation === 'memory_simulation_complete'
    );
    expect(memoryEmissions).toHaveLength(1);
  });
});
