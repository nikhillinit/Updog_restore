/**
 * Strict TypeScript error interfaces for better type safety
 */

export interface RolloutMetrics {
  timestamp: number;
  errorRate: number;
  p99Latency: number;
  memoryUsage: number;
  cpuUsage: number;
  requestRate: number;
  successRate?: number;
}

export interface DeploymentError extends Error {
  stage?: string;
  metrics?: RolloutMetrics;
  rollbackTriggered?: boolean;
  deploymentId?: string;
  version?: string;
  confidence?: number;
}

export interface HealthCheckError extends Error {
  target: string;
  latency?: string;
  status?: number;
  checkType: 'connectivity' | 'endpoint' | 'metrics' | 'synthetic';
}

export interface DatabaseError extends Error {
  query?: string;
  queryParams?: any[];
  connectionId?: string;
  poolStats?: {
    total: number;
    idle: number;
    waiting: number;
  };
}

export interface IdempotencyError extends Error {
  key: string;
  requestHash: string;
  storedHash?: string;
  conflictType: 'different_request' | 'timeout' | 'storage_error';
  cacheHit?: boolean;
}

export interface RateLimitError extends Error {
  identifier: string;
  limit: number;
  windowMs: number;
  retryAfter: number;
  storeType: 'memory' | 'redis';
}

export interface ValidationError extends Error {
  field: string;
  value: any;
  constraint: string;
  validationRule: string;
}

// Error factory functions for type safety
export function createDeploymentError(
  message: string,
  options: Partial<DeploymentError> = {}
): DeploymentError {
  const error = new Error(message) as DeploymentError;
  Object.assign(error, options);
  error.name = 'DeploymentError';
  return error;
}

export function createHealthCheckError(
  message: string,
  target: string,
  checkType: HealthCheckError['checkType'],
  options: Partial<HealthCheckError> = {}
): HealthCheckError {
  const error = new Error(message) as HealthCheckError;
  error.target = target;
  error.checkType = checkType;
  Object.assign(error, options);
  error.name = 'HealthCheckError';
  return error;
}

export function createDatabaseError(
  message: string,
  options: Partial<DatabaseError> = {}
): DatabaseError {
  const error = new Error(message) as DatabaseError;
  Object.assign(error, options);
  error.name = 'DatabaseError';
  return error;
}

export function createIdempotencyError(
  message: string,
  key: string,
  requestHash: string,
  conflictType: IdempotencyError['conflictType'],
  options: Partial<IdempotencyError> = {}
): IdempotencyError {
  const error = new Error(message) as IdempotencyError;
  error.key = key;
  error.requestHash = requestHash;
  error.conflictType = conflictType;
  Object.assign(error, options);
  error.name = 'IdempotencyError';
  return error;
}

export function createRateLimitError(
  message: string,
  identifier: string,
  limit: number,
  windowMs: number,
  retryAfter: number,
  storeType: RateLimitError['storeType'],
  options: Partial<RateLimitError> = {}
): RateLimitError {
  const error = new Error(message) as RateLimitError;
  error.identifier = identifier;
  error.limit = limit;
  error.windowMs = windowMs;
  error.retryAfter = retryAfter;
  error.storeType = storeType;
  Object.assign(error, options);
  error.name = 'RateLimitError';
  return error;
}

export function createValidationError(
  message: string,
  field: string,
  value: any,
  constraint: string,
  validationRule: string,
  options: Partial<ValidationError> = {}
): ValidationError {
  const error = new Error(message) as ValidationError;
  error.field = field;
  error.value = value;
  error.constraint = constraint;
  error.validationRule = validationRule;
  Object.assign(error, options);
  error.name = 'ValidationError';
  return error;
}

// Type guards for error checking
export function isDeploymentError(error: Error): error is DeploymentError {
  return error.name === 'DeploymentError';
}

export function isHealthCheckError(error: Error): error is HealthCheckError {
  return error.name === 'HealthCheckError';
}

export function isDatabaseError(error: Error): error is DatabaseError {
  return error.name === 'DatabaseError';
}

export function isIdempotencyError(error: Error): error is IdempotencyError {
  return error.name === 'IdempotencyError';
}

export function isRateLimitError(error: Error): error is RateLimitError {
  return error.name === 'RateLimitError';
}

export function isValidationError(error: Error): error is ValidationError {
  return error.name === 'ValidationError';
}