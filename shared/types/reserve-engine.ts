/**
 * Reserve Engine TypeScript Types
 *
 * Type definitions for the deterministic capital reserve allocation engine.
 * These types are shared between client and server for type safety.
 *
 * Based on the binary search capital allocation solver algorithm.
 */

// ============================================================================
// Request Types
// ============================================================================

export interface StageData {
  name: string;
  roundSize: number;
  graduationRate: number;
}

export interface FollowOnStrategy {
  stage: string;
  checkSize: number;
  participationRate: number;
  strategy?: 'maintain_ownership' | 'fixed_amount' | 'pro_rata';
}

export interface ReserveCalculationRequest {
  fundId: string;
  totalAllocatedCapital: number;
  initialCheckSize: number;
  entryStage: 'Pre-Seed' | 'Seed' | 'Series A' | 'Series B' | 'Series C' | 'Series D';
  stages: StageData[];
  followOnStrategy: FollowOnStrategy[];
  metadata?: Record<string, unknown>;
}

export interface OptimizationConstraints {
  minInitialCheckSize?: number;
  maxInitialCheckSize?: number;
  allowedEntryStages?: string[];
  maxFollowOnRatio?: number;
}

export type OptimizationGoal =
  | 'maximize_deals'
  | 'maximize_ownership'
  | 'minimize_risk'
  | 'maximize_returns';

export interface OptimizationRequest {
  fundId: string;
  totalAllocatedCapital: number;
  constraints: OptimizationConstraints;
  optimizationGoals: OptimizationGoal[];
  scenarios?: ReserveCalculationRequest[];
}

// ============================================================================
// Response Types
// ============================================================================

export interface StageBreakdown {
  stageName: string;
  dealsEntering: number;
  graduationRate: number;
  dealsGraduating: number;
  followOnCheckSize: number;
  participationRate: number;
  followOnInvestments: number;
  capitalDeployed: number;
}

export interface AllocationResult {
  initialDeals: number;
  initialCapital: number;
  followOnCapital: number;
  totalCapitalDeployed: number;
  stageBreakdown: StageBreakdown[];
}

export interface ResponseMetadata {
  correlationId: string;
  processingTime: number;
  timestamp: string;
  version?: string;
}

export interface ReserveCalculationResponse {
  success: true;
  data: AllocationResult;
  metadata: ResponseMetadata;
}

export interface ScenarioResult {
  scenarioId: string;
  score: number;
  result: AllocationResult;
}

export interface OptimizationResponse {
  success: true;
  optimalScenario: AllocationResult;
  allScenarios: ScenarioResult[];
  metadata: ResponseMetadata;
}

export interface ScenarioResponse {
  scenarioId: string;
  fundId: string;
  result: AllocationResult;
  input: ReserveCalculationRequest;
  metadata: ResponseMetadata;
  createdAt: string;
  expiresAt: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ErrorDetail {
  field: string;
  message: string;
  code: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: ErrorDetail[];
  correlationId: string;
  timestamp: string;
}

export interface ValidationError {
  field: string;
  constraint: string;
  value: string;
  message: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  validationErrors: ValidationError[];
}

export interface RateLimitResponse extends ErrorResponse {
  retryAfter: number;
  limit: number;
  remaining: number;
}

// ============================================================================
// API Response Union Type
// ============================================================================

export type ApiResponse<T> =
  | ({ success: true } & T)
  | ErrorResponse
  | ValidationErrorResponse
  | RateLimitResponse;

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface ReserveEngineClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  onError?: (error: ErrorResponse) => void;
  onRateLimit?: (response: RateLimitResponse) => void;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  headers?: Record<string, string>;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  version: string;
  service: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === false &&
    'error' in response &&
    'code' in response &&
    'correlationId' in response
  );
}

export function isValidationErrorResponse(response: unknown): response is ValidationErrorResponse {
  return (
    isErrorResponse(response) &&
    'validationErrors' in response &&
    Array.isArray((response as ValidationErrorResponse).validationErrors)
  );
}

export function isRateLimitResponse(response: unknown): response is RateLimitResponse {
  return (
    isErrorResponse(response) &&
    'retryAfter' in response &&
    'limit' in response &&
    'remaining' in response
  );
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is { success: true } & T {
  return response.success === true;
}

export function assertSuccessResponse<T>(
  response: ApiResponse<T>
): asserts response is { success: true } & T {
  if (!isSuccessResponse(response)) {
    throw new Error(`API request failed: ${response.error}`);
  }
}

// ============================================================================
// Constants
// ============================================================================

export const VALID_ENTRY_STAGES = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
] as const;

export const VALID_STRATEGIES = [
  'maintain_ownership',
  'fixed_amount',
  'pro_rata',
] as const;

export const VALID_OPTIMIZATION_GOALS = [
  'maximize_deals',
  'maximize_ownership',
  'minimize_risk',
  'maximize_returns',
] as const;

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

export function validateStageData(data: unknown): data is StageData {
  if (typeof data !== 'object' || data === null) return false;

  const stage = data as Record<string, unknown>;

  return (
    typeof stage['name'] === 'string' &&
    typeof stage['roundSize'] === 'number' &&
    stage['roundSize'] >= 0 &&
    typeof stage['graduationRate'] === 'number' &&
    stage['graduationRate'] >= 0 &&
    stage['graduationRate'] <= 100
  );
}

export function validateFollowOnStrategy(data: unknown): data is FollowOnStrategy {
  if (typeof data !== 'object' || data === null) return false;

  const strategy = data as Record<string, unknown>;

  return (
    typeof strategy['stage'] === 'string' &&
    typeof strategy['checkSize'] === 'number' &&
    strategy['checkSize'] >= 0 &&
    typeof strategy['participationRate'] === 'number' &&
    strategy['participationRate'] >= 0 &&
    strategy['participationRate'] <= 100 &&
    (!strategy['strategy'] || VALID_STRATEGIES.includes(strategy['strategy'] as any))
  );
}

export function validateReserveCalculationRequest(
  data: unknown
): data is ReserveCalculationRequest {
  if (typeof data !== 'object' || data === null) return false;

  const request = data as Record<string, unknown>;

  return (
    typeof request['fundId'] === 'string' &&
    typeof request['totalAllocatedCapital'] === 'number' &&
    request['totalAllocatedCapital'] >= 0 &&
    typeof request['initialCheckSize'] === 'number' &&
    request['initialCheckSize'] >= 0 &&
    typeof request['entryStage'] === 'string' &&
    VALID_ENTRY_STAGES.includes(request['entryStage'] as any) &&
    Array.isArray(request['stages']) &&
    request['stages'].every(validateStageData) &&
    Array.isArray(request['followOnStrategy']) &&
    request['followOnStrategy'].every(validateFollowOnStrategy)
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
