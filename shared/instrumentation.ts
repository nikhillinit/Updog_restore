/**
 * Shared instrumentation interfaces for logging and performance monitoring
 * Provides a unified interface for engines and server code
 */

export interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export type Tags = Record<string, string | number | boolean>;

export interface PerfTimer {
  end: (extraTags?: Tags) => void;
}

export interface PerfMonitor {
  recordMetric: (name: string, value: number, unit?: string, tags?: Tags) => void;
  startTimer: (name: string, tags?: Tags) => PerfTimer;
  recordCalculationPerformance: (name: string, durationMs: number, meta?: Record<string, unknown>) => void;
}

// No-op implementations
const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

const noopPerf: PerfMonitor = {
  recordMetric() {},
  startTimer() {
    return { end() {} };
  },
  recordCalculationPerformance() {}
};

// Module-level instances
let _logger: Logger = noopLogger;
let _perf: PerfMonitor = noopPerf;

// Accessor functions
export const getLogger = (): Logger => _logger;
export const getPerf = (): PerfMonitor => _perf;

// Configuration function for runtime injection
export function configureInstrumentation(config: Partial<{
  logger: Logger;
  perf: PerfMonitor;
}>): void {
  if (config.logger) {
    _logger = config.logger;
  }
  if (config.perf) {
    _perf = config.perf;
  }
}

// Export no-op implementations for testing
export const noOpLogger = noopLogger;
export const noOpPerf = noopPerf;