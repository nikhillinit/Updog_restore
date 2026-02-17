/**
 * Mock for @/metrics/reserves-metrics
 */
import { vi } from 'vitest';

export const metrics = {
  startTimer: vi.fn(() => ({ end: vi.fn() })),
  recordDuration: vi.fn(),
  recordCompanyCount: vi.fn(),
  recordCapPolicy: vi.fn(),
  recordWarning: vi.fn(),
  recordDivergence: vi.fn(),
  recordRecovery: vi.fn(),
  recordPerformanceMetric: vi.fn((name: string, value: number, unit: string) => {
    // No-op mock for testing
  }),
  recordCacheHit: vi.fn(),
  recordCacheMiss: vi.fn(),
  recordBatchProcessing: vi.fn(),
  recordRolloutStage: vi.fn(),
  recordRollback: vi.fn(),
  recordError: vi.fn(),
  flush: vi.fn(),
  incrementCounter: vi.fn(),
  recordHistogram: vi.fn(),
  recordGauge: vi.fn(),
};

export const auditLog = {
  record: vi.fn(),
  getEntries: vi.fn(() => []),
  clear: vi.fn(),
};
