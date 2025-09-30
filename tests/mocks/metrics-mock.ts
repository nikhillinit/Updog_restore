/**
 * Mock for @/metrics/reserves-metrics
 */
import { vi } from 'vitest';

export const metrics = {
  recordPerformanceMetric: vi.fn((name: string, value: number, unit: string) => {
    // No-op mock for testing
  }),
  incrementCounter: vi.fn(),
  recordHistogram: vi.fn(),
  recordGauge: vi.fn(),
};