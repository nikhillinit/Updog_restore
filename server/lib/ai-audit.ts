/**
 * AI Audit Trail Utilities
 *
 * Helper functions for recording AI proposal requests and responses in the audit trail.
 * Implements automatic truncation and hashing for security.
 *
 * SECURITY FEATURES:
 * - Automatic truncation to 1000 chars (configurable)
 * - SHA-256 hashing of full content
 * - 7-year retention for compliance
 * - No PII in truncated content
 *
 * @see shared/schema/ai-audit.ts for schema
 * @see docs/security/training-opt-out.md for security policies
 */

import { createHash } from 'crypto';
import type { InsertAiProposalAudit } from '@shared/schema/ai-audit';
import type { ProviderName } from '@/config/ai-providers';

const TRUNCATE_LENGTH = 1000; // Default truncation length
const RETENTION_DAYS = 2555; // 7 years for compliance

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number = TRUNCATE_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * Generate SHA-256 hash of text
 */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Calculate retention date (7 years from now)
 */
function calculateRetentionDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + RETENTION_DAYS);
  return date;
}

/**
 * Create audit log entry for AI proposal request
 *
 * @param params - Audit log parameters
 * @returns Audit log entry ready for insertion
 */
export function createAuditEntry(params: {
  // Required fields
  requestId: string;
  providerName: ProviderName;
  modelName: string;
  prompt: string;
  proposalType: string;

  // Optional fields
  userId?: number;
  sessionId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  response?: string;
  fundId?: number;
  scenarioId?: string;
  requestParams?: Record<string, unknown>;
  tags?: string[];
  latencyMs?: number;
  providerLatencyMs?: number;
  costUsd?: number;
  inputCostUsd?: number;
  outputCostUsd?: number;
  promptTokens?: number;
  responseTokens?: number;
  status?: 'success' | 'error' | 'timeout' | 'rate_limited' | 'invalid';
  errorMessage?: string;
  errorCode?: string;
  retryCount?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
}): InsertAiProposalAudit {
  const {
    requestId,
    providerName,
    modelName,
    prompt,
    response,
    proposalType,
    userId,
    sessionId,
    correlationId,
    ipAddress,
    userAgent,
    fundId,
    scenarioId,
    requestParams,
    tags,
    latencyMs,
    providerLatencyMs,
    costUsd,
    inputCostUsd,
    outputCostUsd,
    promptTokens,
    responseTokens,
    status = 'success',
    errorMessage,
    errorCode,
    retryCount,
    rateLimitRemaining,
    rateLimitReset,
    dataClassification = 'internal'
  } = params;

  // Truncate and hash prompt
  const promptTruncated = truncateText(prompt);
  const promptHash = hashText(prompt);
  const promptLength = prompt.length;

  // Truncate and hash response if provided
  const responseTruncated = response ? truncateText(response) : undefined;
  const responseHash = response ? hashText(response) : undefined;
  const responseLength = response?.length;

  // Calculate processing time if we have both latencies
  const processingTimeMs = latencyMs && providerLatencyMs
    ? Math.max(0, latencyMs - providerLatencyMs)
    : undefined;

  return {
    requestId,
    providerName,
    modelName,
    promptTruncated,
    promptHash,
    promptLength,
    promptTokens,
    responseTruncated,
    responseHash,
    responseLength,
    responseTokens,
    proposalType,
    userId,
    sessionId,
    correlationId,
    ipAddress,
    userAgent,
    fundId,
    scenarioId,
    requestParams: requestParams ? JSON.stringify(requestParams) : undefined,
    tags,
    latencyMs,
    providerLatencyMs,
    processingTimeMs,
    costUsd: costUsd?.toString(),
    inputCostUsd: inputCostUsd?.toString(),
    outputCostUsd: outputCostUsd?.toString(),
    status,
    errorMessage,
    errorCode,
    retryCount,
    rateLimitRemaining,
    rateLimitReset,
    retentionUntil: calculateRetentionDate(),
    dataClassification
  };
}

/**
 * Sanitize error message (remove potential sensitive data)
 */
export function sanitizeErrorMessage(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;

  // Remove potential API keys or tokens
  let sanitized = message
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[API_KEY_REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9-_.]+/g, 'Bearer [TOKEN_REDACTED]')
    .replace(/api[-_]?key[s]?[:\s=]+[a-zA-Z0-9-_.]+/gi, 'api_key=[REDACTED]');

  // Truncate if still too long
  return truncateText(sanitized, 500);
}

/**
 * Extract error code from error object
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  // Try common error code properties
  const errorObj = error as any;
  return errorObj.code || errorObj.error?.code || errorObj.type || undefined;
}

/**
 * Create audit entry for failed request
 */
export function createFailureAuditEntry(params: {
  requestId: string;
  providerName: ProviderName;
  modelName: string;
  prompt: string;
  proposalType: string;
  error: Error | string;
  userId?: number;
  sessionId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  fundId?: number;
  scenarioId?: string;
  requestParams?: Record<string, unknown>;
  tags?: string[];
  latencyMs?: number;
  retryCount?: number;
}): InsertAiProposalAudit {
  const error = typeof params.error === 'string' ? new Error(params.error) : params.error;
  const errorCode = extractErrorCode(error);
  const errorMessage = sanitizeErrorMessage(error);

  // Determine status based on error
  let status: 'error' | 'timeout' | 'rate_limited' | 'invalid' = 'error';
  if (errorMessage.toLowerCase().includes('timeout')) {
    status = 'timeout';
  } else if (errorMessage.toLowerCase().includes('rate limit')) {
    status = 'rate_limited';
  } else if (errorMessage.toLowerCase().includes('invalid')) {
    status = 'invalid';
  }

  return createAuditEntry({
    ...params,
    status,
    errorCode,
    errorMessage
  });
}

/**
 * Batch audit entry creation (for bulk operations)
 */
export function createBatchAuditEntries(
  entries: Array<Parameters<typeof createAuditEntry>[0]>
): InsertAiProposalAudit[] {
  return entries.map(entry => createAuditEntry(entry));
}

/**
 * Validate audit entry before insertion
 */
export function validateAuditEntry(entry: InsertAiProposalAudit): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!entry.requestId) errors.push('requestId is required');
  if (!entry.providerName) errors.push('providerName is required');
  if (!entry.modelName) errors.push('modelName is required');
  if (!entry.promptTruncated) errors.push('promptTruncated is required');
  if (!entry.promptHash) errors.push('promptHash is required');
  if (entry.promptLength === undefined) errors.push('promptLength is required');
  if (!entry.proposalType) errors.push('proposalType is required');

  // Field length validation
  if (entry.promptTruncated && entry.promptTruncated.length > TRUNCATE_LENGTH + 3) {
    errors.push(`promptTruncated exceeds max length (${TRUNCATE_LENGTH + 3})`);
  }
  if (entry.responseTruncated && entry.responseTruncated.length > TRUNCATE_LENGTH + 3) {
    errors.push(`responseTruncated exceeds max length (${TRUNCATE_LENGTH + 3})`);
  }

  // Hash format validation (SHA-256 = 64 hex chars)
  if (entry.promptHash && !/^[a-f0-9]{64}$/.test(entry.promptHash)) {
    errors.push('promptHash must be valid SHA-256 hash');
  }
  if (entry.responseHash && !/^[a-f0-9]{64}$/.test(entry.responseHash)) {
    errors.push('responseHash must be valid SHA-256 hash');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate usage statistics from audit entries (for aggregation)
 */
export function calculateUsageStats(entries: InsertAiProposalAudit[]): {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalResponseTokens: number;
} {
  const stats = {
    totalRequests: entries.length,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    totalCostUsd: 0,
    avgLatencyMs: 0,
    totalPromptTokens: 0,
    totalResponseTokens: 0
  };

  let totalLatency = 0;
  let latencyCount = 0;

  for (const entry of entries) {
    // Status counts
    if (entry.status === 'success') stats.successfulRequests++;
    if (entry.status === 'error' || entry.status === 'timeout' || entry.status === 'invalid') {
      stats.failedRequests++;
    }
    if (entry.status === 'rate_limited') stats.rateLimitedRequests++;

    // Cost accumulation
    if (entry.costUsd) {
      stats.totalCostUsd += parseFloat(entry.costUsd);
    }

    // Latency averaging
    if (entry.latencyMs) {
      totalLatency += entry.latencyMs;
      latencyCount++;
    }

    // Token counts
    if (entry.promptTokens) stats.totalPromptTokens += entry.promptTokens;
    if (entry.responseTokens) stats.totalResponseTokens += entry.responseTokens;
  }

  if (latencyCount > 0) {
    stats.avgLatencyMs = Math.round(totalLatency / latencyCount);
  }

  return stats;
}
