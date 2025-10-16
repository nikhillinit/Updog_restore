/**
 * AI Orchestrator with Ledger-Based Budget Tracking
 *
 * Implements reserve→settle→void ledger flow for AI provider calls:
 * 1. Reserve budget BEFORE making the call (prevents overspend)
 * 2. Settle with actual cost after success (accurate tracking)
 * 3. Void reservation on failure (don't inflate spend)
 *
 * Features:
 * - AbortController for timeout cancellation (not Promise.race)
 * - Circuit breaker pattern per provider
 * - Custom error classes with metadata
 * - Cost estimation before reservation
 * - Proper error propagation with retry hints
 */

// Vercel AI SDK - Multi-provider orchestration
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createOpenAI } from '@ai-sdk/openai';

// Cockatiel - Circuit breaker and resilience
import { ConsecutiveBreaker, ExponentialBackoff, retry, wrap, type Policy } from 'cockatiel';

import {
  AIServiceError,
  BudgetExceededError,
  TimeoutError,
  CircuitBreakerOpenError,
  ProviderError,
  RateLimitError,
  LedgerError,
  isRetryableError,
} from '../errors/ai-errors';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  timeout: parseInt(process.env['AI_TIMEOUT_MS'] ?? '90000', 10), // 90s default
  maxRetries: 2,
  dailyBudgetUsd: parseFloat(process.env['AI_DAILY_BUDGET_USD'] ?? '50.00'),
  circuitBreaker: {
    failureThreshold: 5, // Open circuit after 5 consecutive failures
    resetTimeoutMs: 60000, // Wait 60s before trying half-open
    halfOpenMaxAttempts: 3, // Try 3 calls in half-open state
  },
} as const;

// Initialize AI model providers (Vercel AI SDK)
// DeepSeek using OpenAI-compatible API
const deepseekProvider = process.env['DEEPSEEK_API_KEY']
  ? createOpenAI({
      apiKey: process.env['DEEPSEEK_API_KEY'],
      baseURL: 'https://api.deepseek.com',
    })
  : null;

// ============================================================================
// Types
// ============================================================================

export type ModelTier = 'premium' | 'standard' | 'budget';
export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek';

export interface ProviderConfig {
  name: ProviderName;
  model: string;
  tier: ModelTier;
  inputPricePerMToken: number; // Price per million tokens
  outputPricePerMToken: number;
}

export interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AICallResult {
  provider: ProviderName;
  model: string;
  text: string;
  usage: UsageMetrics;
  actualCostUsd: number;
  elapsedMs: number;
  ledgerKey: string;
}

export interface BudgetLedgerEntry {
  ledgerKey: string;
  provider: ProviderName;
  timestamp: Date;
  status: 'reserved' | 'settled' | 'voided';
  estimatedCostUsd: number;
  actualCostUsd?: number;
  metadata?: Record<string, unknown>;
}

// Circuit breaker state per provider (for monitoring)
interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
  halfOpenAttempts: number;
}

// Cockatiel policies per provider
const providerPolicies = new Map<ProviderName, Policy>();

// ============================================================================
// Provider Configurations
// ============================================================================

// Provider configuration with Vercel AI SDK model instances
interface ProviderConfigWithModel extends ProviderConfig {
  getModel: () => any; // AI SDK model instance
}

const PROVIDERS: Record<string, ProviderConfigWithModel> = {
  'claude-3-5-sonnet': {
    name: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    tier: 'premium',
    inputPricePerMToken: 3.0, // $3 per million input tokens
    outputPricePerMToken: 15.0, // $15 per million output tokens
    getModel: () => anthropic('claude-3-5-sonnet-latest'),
  },
  'gpt-4o-mini': {
    name: 'openai',
    model: 'gpt-4o-mini',
    tier: 'standard',
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    getModel: () => openai('gpt-4o-mini'),
  },
  'deepseek-chat': {
    name: 'deepseek',
    model: 'deepseek-chat',
    tier: 'budget',
    inputPricePerMToken: 0.14,
    outputPricePerMToken: 0.28,
    getModel: () => deepseekProvider ? deepseekProvider('deepseek-chat') : null,
  },
  'deepseek-reasoner': {
    name: 'deepseek',
    model: 'deepseek-reasoner',
    tier: 'premium',
    inputPricePerMToken: 0.55, // DeepSeek R1 pricing
    outputPricePerMToken: 2.19,
    getModel: () => deepseekProvider ? deepseekProvider('deepseek-reasoner') : null,
  },
};

// ============================================================================
// In-Memory State (Stream A will replace with database)
// ============================================================================

// Budget ledger (will be replaced with database table)
const budgetLedger = new Map<string, BudgetLedgerEntry>();

// Initialize Cockatiel policies for each provider
function getProviderPolicy(provider: ProviderName): Policy {
  if (!providerPolicies.has(provider)) {
    const policy = retry(wrap(new ExponentialBackoff()), {
      maxAttempts: CONFIG.maxRetries + 1, // +1 for initial attempt
      handleResultFilter: (result) => result instanceof Error && isRetryableError(result),
    }).compose(
      ConsecutiveBreaker.default({
        threshold: CONFIG.circuitBreaker.failureThreshold,
        halfOpenAfter: CONFIG.circuitBreaker.resetTimeoutMs,
      })
    );

    providerPolicies.set(provider, policy);
  }

  return providerPolicies.get(provider)!;
}

// Circuit breaker state tracking for monitoring (legacy interface)
const circuitBreakers = new Map<ProviderName, CircuitBreakerState>();

// Initialize circuit breaker state tracking
for (const provider of ['anthropic', 'openai', 'deepseek'] as ProviderName[]) {
  circuitBreakers.set(provider, {
    status: 'closed',
    failureCount: 0,
    halfOpenAttempts: 0,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate cost before making the call
 * Uses token count estimation based on prompt length
 */
export function estimateCost(prompt: string, tier: ModelTier): number {
  // Get a representative provider config for the tier
  const providerKey = tier === 'premium'
    ? 'claude-3-5-sonnet'
    : tier === 'standard'
    ? 'gpt-4o-mini'
    : 'gemini-1.5-flash';

  const config = PROVIDERS[providerKey];
  if (!config) {
    throw new AIServiceError('Invalid provider configuration', {
      errorCode: 'INVALID_CONFIG',
      metadata: { tier, providerKey },
    });
  }

  // Rough estimation: 1 token ≈ 4 characters
  const estimatedPromptTokens = Math.ceil(prompt.length / 4);
  // Assume response is roughly 50% of prompt length
  const estimatedCompletionTokens = Math.ceil(estimatedPromptTokens * 0.5);

  const inputCost = (estimatedPromptTokens / 1_000_000) * config.inputPricePerMToken;
  const outputCost = (estimatedCompletionTokens / 1_000_000) * config.outputPricePerMToken;

  return inputCost + outputCost;
}

/**
 * Calculate actual cost from usage metrics
 */
export function calculateCost(usage: UsageMetrics, provider: ProviderConfig): number {
  const inputCost = (usage.promptTokens / 1_000_000) * provider.inputPricePerMToken;
  const outputCost = (usage.completionTokens / 1_000_000) * provider.outputPricePerMToken;
  return inputCost + outputCost;
}

/**
 * Reserve budget in the ledger BEFORE making the call
 * Prevents overspending by checking available budget first
 */
export async function reserveBudget(
  provider: ProviderName,
  estimatedCostUsd: number,
  metadata?: Record<string, unknown>
): Promise<string> {
  try {
    // Check current day's spend
    const today = new Date().toISOString().split('T')[0];
    const todaysEntries = Array.from(budgetLedger.values()).filter(
      entry => entry.timestamp.toISOString().startsWith(today ?? '') &&
               entry.status !== 'voided'
    );

    const currentSpend = todaysEntries.reduce((sum, entry) => {
      return sum + (entry.actualCostUsd ?? entry.estimatedCostUsd);
    }, 0);

    const availableBudget = CONFIG.dailyBudgetUsd - currentSpend;

    if (estimatedCostUsd > availableBudget) {
      throw new BudgetExceededError(
        `Insufficient budget: need $${estimatedCostUsd.toFixed(4)}, have $${availableBudget.toFixed(4)}`,
        {
          currentSpend,
          limit: CONFIG.dailyBudgetUsd,
          budgetType: 'daily',
          metadata: { availableBudget, estimatedCostUsd },
        }
      );
    }

    // Create reservation
    const ledgerKey = `${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry: BudgetLedgerEntry = {
      ledgerKey,
      provider,
      timestamp: new Date(),
      status: 'reserved',
      estimatedCostUsd,
      metadata,
    };

    budgetLedger.set(ledgerKey, entry);
    return ledgerKey;
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      throw error;
    }
    throw new LedgerError('Failed to reserve budget', {
      operation: 'reserve',
      ledgerKey: 'unknown',
      metadata: { provider, estimatedCostUsd },
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Settle the budget reservation with actual cost after successful call
 */
export async function settleBudget(
  ledgerKey: string,
  actualCostUsd: number
): Promise<void> {
  try {
    const entry = budgetLedger.get(ledgerKey);
    if (!entry) {
      throw new LedgerError('Ledger entry not found for settlement', {
        operation: 'settle',
        ledgerKey,
        metadata: { actualCostUsd },
      });
    }

    if (entry.status !== 'reserved') {
      throw new LedgerError(`Cannot settle entry with status: ${entry.status}`, {
        operation: 'settle',
        ledgerKey,
        metadata: { currentStatus: entry.status, actualCostUsd },
      });
    }

    entry.status = 'settled';
    entry.actualCostUsd = actualCostUsd;
    budgetLedger.set(ledgerKey, entry);
  } catch (error) {
    if (error instanceof LedgerError) {
      throw error;
    }
    throw new LedgerError('Failed to settle budget', {
      operation: 'settle',
      ledgerKey,
      metadata: { actualCostUsd },
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Void the budget reservation on failure
 * Prevents inflating spend metrics with failed calls
 */
export async function voidBudget(ledgerKey: string, reason?: string): Promise<void> {
  try {
    const entry = budgetLedger.get(ledgerKey);
    if (!entry) {
      // Silent fail - ledger key might not exist if reservation failed
      return;
    }

    if (entry.status !== 'reserved') {
      // Already settled or voided, no action needed
      return;
    }

    entry.status = 'voided';
    entry.metadata = { ...entry.metadata, voidReason: reason };
    budgetLedger.set(ledgerKey, entry);
  } catch (error) {
    // Log but don't throw - voiding is a cleanup operation
    console.error('Failed to void budget:', error);
  }
}

/**
 * Get current budget status
 */
export async function getBudgetStatus(): Promise<{
  dailyLimitUsd: number;
  spentTodayUsd: number;
  reservedTodayUsd: number;
  availableBudgetUsd: number;
}> {
  const today = new Date().toISOString().split('T')[0];
  const todaysEntries = Array.from(budgetLedger.values()).filter(
    entry => entry.timestamp.toISOString().startsWith(today ?? '')
  );

  const spentTodayUsd = todaysEntries
    .filter(e => e.status === 'settled')
    .reduce((sum, e) => sum + (e.actualCostUsd ?? 0), 0);

  const reservedTodayUsd = todaysEntries
    .filter(e => e.status === 'reserved')
    .reduce((sum, e) => sum + e.estimatedCostUsd, 0);

  const availableBudgetUsd = CONFIG.dailyBudgetUsd - spentTodayUsd - reservedTodayUsd;

  return {
    dailyLimitUsd: CONFIG.dailyBudgetUsd,
    spentTodayUsd,
    reservedTodayUsd,
    availableBudgetUsd,
  };
}

// ============================================================================
// Simplified Provider Call with Vercel AI SDK
// ============================================================================

/**
 * Call AI provider using Vercel AI SDK with AbortController timeout
 * This replaces all the custom provider implementations
 */
async function callAIModel(
  prompt: string,
  config: ProviderConfigWithModel,
  abortSignal: AbortSignal
): Promise<{ text: string; usage: UsageMetrics }> {
  const modelInstance = config.getModel();

  if (!modelInstance) {
    throw new ProviderError(`${config.name} client not configured`, {
      provider: config.name,
      statusCode: 503,
      isRetryable: false,
    });
  }

  try {
    const response = await generateText({
      model: modelInstance,
      prompt,
      maxTokens: 8192,
      abortSignal, // Vercel AI SDK native abort support
    });

    const usage: UsageMetrics = {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    };

    return { text: response.text, usage };
  } catch (error: any) {
    // Handle provider-specific errors
    if (error.name === 'AbortError') {
      throw new TimeoutError(
        `Provider call timed out`,
        {
          timeoutMs: CONFIG.timeout,
          provider: config.name,
        }
      );
    }

    if (error.statusCode === 401 || error.message?.includes('API key')) {
      throw new ProviderError(`Invalid ${config.name} API key`, {
        provider: config.name,
        statusCode: 401,
        isRetryable: false,
        cause: error,
      });
    }

    if (error.statusCode === 429) {
      throw new RateLimitError(`${config.name} rate limit exceeded`, {
        provider: config.name,
        retryAfter: error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined,
      });
    }

    throw new ProviderError(error.message ?? `${config.name} API error`, {
      provider: config.name,
      providerErrorCode: error.code,
      statusCode: error.statusCode,
      isRetryable: error.statusCode >= 500,
      cause: error,
    });
  }
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Call AI provider with Cockatiel policy (circuit breaker + retry + timeout)
 * and ledger flow
 *
 * Flow:
 * 1. Estimate cost
 * 2. Reserve budget (ledger)
 * 3. Execute with Cockatiel policy (handles circuit breaker, retry, timeout)
 * 4. Settle budget with actual cost
 * 5. On failure: void budget reservation
 */
export async function callAIProvider(
  prompt: string,
  providerKey: keyof typeof PROVIDERS,
  metadata?: Record<string, unknown>
): Promise<AICallResult> {
  const startTime = Date.now();
  const config = PROVIDERS[providerKey];
  if (!config) {
    throw new AIServiceError('Invalid provider key', {
      errorCode: 'INVALID_PROVIDER',
      metadata: { providerKey },
    });
  }

  let ledgerKey: string | undefined;

  try {
    // Step 1: Estimate cost
    const estimatedCost = estimateCost(prompt, config.tier);

    // Step 2: Reserve budget
    ledgerKey = await reserveBudget(config.name, estimatedCost, {
      ...metadata,
      providerKey,
      model: config.model,
    });

    // Step 3: Get Cockatiel policy for this provider
    const policy = getProviderPolicy(config.name);

    // Step 4: Execute with policy (handles circuit breaker, retry, timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

    try {
      const result = await policy.execute(async () =>
        callAIModel(prompt, config, controller.signal)
      );

      clearTimeout(timeoutId);

      // Step 5: Calculate actual cost and settle
      const actualCost = calculateCost(result.usage, config);
      await settleBudget(ledgerKey!, actualCost);

      return {
        provider: config.name,
        model: config.model,
        text: result.text,
        usage: result.usage,
        actualCostUsd: actualCost,
        elapsedMs: Date.now() - startTime,
        ledgerKey: ledgerKey!,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Void the budget reservation on any failure
    if (ledgerKey) {
      await voidBudget(ledgerKey, error instanceof Error ? error.message : String(error));
    }

    throw error;
  }
}

/**
 * Alias for callAIProvider with retry (Cockatiel handles this now)
 * @deprecated Use callAIProvider directly - retry is built into the policy
 */
export async function callAIProviderWithRetry(
  prompt: string,
  providerKey: keyof typeof PROVIDERS,
  metadata?: Record<string, unknown>
): Promise<AICallResult> {
  return callAIProvider(prompt, providerKey, metadata);
}

// ============================================================================
// Exports for Testing and Monitoring
// ============================================================================

export { PROVIDERS, CONFIG };

/**
 * Get circuit breaker status for monitoring
 */
export function getCircuitBreakerStatus(): Record<ProviderName, CircuitBreakerState> {
  const status: Record<string, CircuitBreakerState> = {};
  for (const [provider, state] of circuitBreakers.entries()) {
    status[provider] = { ...state };
  }
  return status as Record<ProviderName, CircuitBreakerState>;
}

/**
 * Reset circuit breaker (for testing/admin)
 */
export function resetCircuitBreaker(provider: ProviderName): void {
  circuitBreakers.set(provider, {
    status: 'closed',
    failureCount: 0,
    halfOpenAttempts: 0,
  });
}

/**
 * Get ledger entries for debugging
 */
export function getLedgerEntries(filters?: {
  provider?: ProviderName;
  status?: BudgetLedgerEntry['status'];
  since?: Date;
}): BudgetLedgerEntry[] {
  let entries = Array.from(budgetLedger.values());

  if (filters?.provider) {
    entries = entries.filter(e => e.provider === filters.provider);
  }
  if (filters?.status) {
    entries = entries.filter(e => e.status === filters.status);
  }
  if (filters?.since) {
    entries = entries.filter(e => e.timestamp >= filters.since!);
  }

  return entries;
}
