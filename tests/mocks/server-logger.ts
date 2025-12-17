/**
 * Mock server logger for test environment
 * Prevents winston initialization and log file creation during tests
 */
import { vi } from 'vitest';

const noop = vi.fn();

// Mock logger instance
const mockLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  log: noop,
  child: () => mockLogger,
};

// Specialized loggers
export const securityLogger = mockLogger;
export const auditLogger = mockLogger;
export const performanceLogger = mockLogger;

// Log context helpers
export const logContext = {
  addRequestContext: () => ({}),
  addUserContext: () => ({}),
  addPerformanceContext: () => ({}),
  addSecurityContext: () => ({}),
  addAuditContext: () => ({}),
};

// Utility functions
export const logSecurity = noop;
export const logAudit = noop;
export const logPerformance = noop;
export const logMonteCarloOperation = noop;
export const logMonteCarloError = noop;
export const logFinancialOperation = noop;
export const logValidationError = noop;
export const logRateLimit = noop;

// Performance monitor class
export class PerformanceMonitor {
  constructor(_operation: string, _context?: Record<string, unknown>) {}
  end(_additionalContext?: Record<string, unknown>) {
    return 0;
  }
}

// Express middleware
export const requestLogger = (_req: unknown, _res: unknown, next: () => void) => next();
export const errorLogger = (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next();

export default mockLogger;
