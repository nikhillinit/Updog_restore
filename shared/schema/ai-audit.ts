/**
 * AI Audit Trail Schema
 *
 * Tracks all AI proposal requests and responses for:
 * - Security monitoring and incident response
 * - Cost tracking and budget management
 * - Performance analysis and optimization
 * - Compliance and audit requirements
 *
 * SECURITY NOTES:
 * - Prompts truncated to 1000 chars (reduce exposure of sensitive data)
 * - Responses truncated to 1000 chars
 * - Fields marked for future redaction (Month 5-6)
 * - 7-year retention for compliance
 *
 * @see docs/security/training-opt-out.md for data protection policies
 */

import { pgTable, uuid, integer, text, jsonb, timestamp, index, varchar, decimal } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { users } from '../schema.js';

/**
 * AI Proposal Audit Log
 *
 * Comprehensive audit trail for all AI proposal generation requests.
 * Stores truncated prompts and responses to balance auditability with security.
 */
export const aiProposalAudit = pgTable('ai_proposal_audit', {
  id: uuid('id').primaryKey().defaultRandom(),

  // User context
  userId: integer('user_id').references(() => users.id),
  sessionId: varchar('session_id', { length: 64 }),
  correlationId: varchar('correlation_id', { length: 36 }),

  // Request metadata
  requestId: varchar('request_id', { length: 36 }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // Provider information
  providerName: varchar('provider_name', { length: 50 }).notNull(), // 'openai', 'anthropic', 'deepseek', 'gemini'
  modelName: varchar('model_name', { length: 100 }).notNull(), // Actual model used
  providerVersion: varchar('provider_version', { length: 50 }), // API version if applicable

  // Request content (TRUNCATED for security)
  // NOTE: Fields marked with [REDACT] will have PII/sensitive data removed in Month 5-6
  promptTruncated: text('prompt_truncated').notNull(), // [REDACT] First 1000 chars of prompt
  promptHash: varchar('prompt_hash', { length: 64 }).notNull(), // SHA-256 hash of full prompt
  promptLength: integer('prompt_length').notNull(), // Full prompt length in chars
  promptTokens: integer('prompt_tokens'), // Token count if available

  // Response content (TRUNCATED for security)
  responseTruncated: text('response_truncated'), // [REDACT] First 1000 chars of response
  responseHash: varchar('response_hash', { length: 64 }), // SHA-256 hash of full response
  responseLength: integer('response_length'), // Full response length in chars
  responseTokens: integer('response_tokens'), // Token count if available

  // Proposal context
  proposalType: varchar('proposal_type', { length: 50 }).notNull(), // 'fund_strategy', 'reserve_allocation', 'portfolio_scenario', 'optimization'
  fundId: integer('fund_id'), // Fund this proposal relates to (if applicable)
  scenarioId: uuid('scenario_id'), // Scenario this proposal relates to (if applicable)

  // Request parameters
  requestParams: jsonb('request_params'), // Additional request parameters (temperature, max_tokens, etc.)
  tags: text('tags').array().default([]), // User-defined tags for categorization

  // Performance metrics
  latencyMs: integer('latency_ms'), // Total request latency
  providerLatencyMs: integer('provider_latency_ms'), // Provider-specific latency
  processingTimeMs: integer('processing_time_ms'), // Our processing time

  // Cost tracking
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }), // Cost in USD
  inputCostUsd: decimal('input_cost_usd', { precision: 10, scale: 6 }), // Input token cost
  outputCostUsd: decimal('output_cost_usd', { precision: 10, scale: 6 }), // Output token cost

  // Status and error tracking
  status: varchar('status', { length: 20 }).notNull().default('success'), // 'success', 'error', 'timeout', 'rate_limited', 'invalid'
  errorMessage: text('error_message'), // Error message if failed
  errorCode: varchar('error_code', { length: 50 }), // Error code if failed
  retryCount: integer('retry_count').default(0), // Number of retries attempted

  // Rate limiting info
  rateLimitRemaining: integer('rate_limit_remaining'), // Remaining requests in window
  rateLimitReset: timestamp('rate_limit_reset', { withTimezone: true }), // When rate limit resets

  // Compliance and audit
  retentionUntil: timestamp('retention_until', { withTimezone: true }), // When to delete (7 years)
  dataClassification: varchar('data_classification', { length: 20 }).default('internal'), // 'public', 'internal', 'confidential', 'restricted'
  complianceFlags: jsonb('compliance_flags'), // Compliance-related flags

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Indexes for common queries
  userIdx: index('idx_ai_proposal_audit_user').on(table.userId, table.createdAt.desc()),
  providerIdx: index('idx_ai_proposal_audit_provider').on(table.providerName, table.createdAt.desc()),
  statusIdx: index('idx_ai_proposal_audit_status').on(table.status, table.createdAt.desc()),
  fundIdx: index('idx_ai_proposal_audit_fund').on(table.fundId, table.createdAt.desc()),
  typeIdx: index('idx_ai_proposal_audit_type').on(table.proposalType, table.createdAt.desc()),
  correlationIdx: index('idx_ai_proposal_audit_correlation').on(table.correlationId),
  requestIdx: index('idx_ai_proposal_audit_request').on(table.requestId),
  retentionIdx: index('idx_ai_proposal_audit_retention').on(table.retentionUntil),
  tagsGinIdx: index('idx_ai_proposal_audit_tags_gin').using('gin', table.tags),
}));

/**
 * AI Provider Usage Summary
 *
 * Aggregated statistics for monitoring AI provider usage and costs.
 * Updated via materialized view or periodic aggregation.
 */
export const aiProviderUsage = pgTable('ai_provider_usage', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Provider identification
  providerName: varchar('provider_name', { length: 50 }).notNull(),
  modelName: varchar('model_name', { length: 100 }),

  // Time period
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  periodType: varchar('period_type', { length: 20 }).notNull(), // 'hourly', 'daily', 'weekly', 'monthly'

  // Usage statistics
  totalRequests: integer('total_requests').notNull().default(0),
  successfulRequests: integer('successful_requests').notNull().default(0),
  failedRequests: integer('failed_requests').notNull().default(0),
  rateLimitedRequests: integer('rate_limited_requests').notNull().default(0),

  // Token usage
  totalPromptTokens: integer('total_prompt_tokens').default(0),
  totalResponseTokens: integer('total_response_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),

  // Cost tracking
  totalCostUsd: decimal('total_cost_usd', { precision: 12, scale: 6 }).default('0'),
  avgCostPerRequest: decimal('avg_cost_per_request', { precision: 10, scale: 6 }),

  // Performance metrics
  avgLatencyMs: integer('avg_latency_ms'),
  p50LatencyMs: integer('p50_latency_ms'),
  p95LatencyMs: integer('p95_latency_ms'),
  p99LatencyMs: integer('p99_latency_ms'),

  // Usage by type
  proposalTypeCounts: jsonb('proposal_type_counts'), // Count by proposal type

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  providerPeriodIdx: index('idx_ai_provider_usage_provider_period').on(
    table.providerName,
    table.periodType,
    table.periodStart.desc()
  ),
  periodIdx: index('idx_ai_provider_usage_period').on(table.periodStart, table.periodEnd),
  uniquePeriod: index('idx_ai_provider_usage_unique').on(
    table.providerName,
    table.modelName,
    table.periodStart,
    table.periodEnd
  ),
}));

// Insert schemas
export const insertAiProposalAuditSchema = createInsertSchema(aiProposalAudit).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiProviderUsageSchema = createInsertSchema(aiProviderUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type exports
export type AiProposalAudit = typeof aiProposalAudit.$inferSelect;
export type InsertAiProposalAudit = typeof aiProposalAudit.$inferInsert;
export type AiProviderUsage = typeof aiProviderUsage.$inferSelect;
export type InsertAiProviderUsage = typeof aiProviderUsage.$inferInsert;
