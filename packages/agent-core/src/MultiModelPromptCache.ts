/**
 * Multi-Model Prompt Caching System
 *
 * Unified interface for prompt caching across different AI providers.
 * Automatically selects the appropriate adapter based on the provider.
 *
 * Supported providers:
 * - Anthropic (Claude): Native prompt caching (~85% latency reduction, ~90% cost reduction)
 * - OpenAI (GPT): Optimized conversation context (no native caching)
 * - Google (Gemini): Context caching (~70% latency reduction, ~75% cost reduction)
 * - Generic: Fallback for other providers
 *
 * Usage:
 * ```typescript
 * const cache = new MultiModelPromptCache({ provider: 'anthropic' });
 *
 * const result = cache.prepare({
 *   systemPrompt: 'You are a helpful agent...',
 *   projectContext: largeContextString,
 *   userQuery: 'What is the main function?'
 * });
 *
 * // Use result.messages, result.system, and result.headers in your API call
 * ```
 */

import {
  AnthropicAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  GenericAdapter,
  type AIProvider,
  type PromptCacheAdapter,
  type CachedPromptResult,
  type MultiModelCacheConfig
} from './cache-adapters';

export class MultiModelPromptCache {
  private adapter: PromptCacheAdapter;
  private config: Required<MultiModelCacheConfig>;
  private cacheStats: {
    hits: number;
    misses: number;
    totalTokensSaved: number;
  };

  constructor(config: Partial<MultiModelCacheConfig> = {}) {
    this.config = {
      provider: config.provider ?? 'anthropic',
      enabled: config.enabled ?? true,
      cacheSystemPrompts: config.cacheSystemPrompts ?? true,
      cacheProjectContext: config.cacheProjectContext ?? true,
      cacheConversationHistory: config.cacheConversationHistory ?? true,
      maxCacheSize: config.maxCacheSize ?? 100000,
      minCacheSize: config.minCacheSize ?? 1024
    };

    this.adapter = this.createAdapter(this.config.provider);

    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalTokensSaved: 0
    };
  }

  /**
   * Create the appropriate adapter for the provider
   */
  private createAdapter(provider: AIProvider): PromptCacheAdapter {
    switch (provider) {
      case 'anthropic':
        return new AnthropicAdapter({
          minCacheSize: this.config.minCacheSize,
          maxCacheSize: this.config.maxCacheSize,
          cacheSystemPrompts: this.config.cacheSystemPrompts,
          cacheProjectContext: this.config.cacheProjectContext,
          cacheConversationHistory: this.config.cacheConversationHistory
        });

      case 'openai':
        return new OpenAIAdapter({
          maxContextLength: this.config.maxCacheSize,
          compressHistory: true
        });

      case 'google':
        return new GeminiAdapter({
          minCacheSize: this.config.minCacheSize,
          maxCacheSize: this.config.maxCacheSize
        });

      case 'generic':
      default:
        return new GenericAdapter({
          maxContextLength: this.config.maxCacheSize
        });
    }
  }

  /**
   * Prepare messages with caching enabled
   */
  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    if (!this.config.enabled) {
      return this.prepareWithoutCache(content);
    }

    return this.adapter.prepare(content);
  }

  /**
   * Prepare messages without caching (fallback)
   */
  private prepareWithoutCache(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    const messages: any[] = [];

    // Add conversation history
    if (content.conversationHistory) {
      content.conversationHistory.forEach(turn => {
        messages.push({
          role: turn.role,
          content: turn.content
        });
      });
    }

    // Add current query
    messages.push({
      role: 'user',
      content: content.userQuery
    });

    // Combine system prompt and project context
    let systemMessage = '';
    if (content.systemPrompt) systemMessage += content.systemPrompt;
    if (content.projectContext) {
      if (systemMessage) systemMessage += '\n\n';
      systemMessage += content.projectContext;
    }

    return {
      messages,
      system: systemMessage || undefined,
      headers: {},
      metadata: {
        provider: this.config.provider,
        cacheEnabled: false
      }
    };
  }

  /**
   * Get the current provider
   */
  getProvider(): AIProvider {
    return this.config.provider;
  }

  /**
   * Check if the current provider supports native caching
   */
  supportsNativeCaching(): boolean {
    return this.adapter.supportsNativeCaching;
  }

  /**
   * Switch to a different provider
   */
  switchProvider(provider: AIProvider): void {
    this.config.provider = provider;
    this.adapter = this.createAdapter(provider);
  }

  /**
   * Record cache hit/miss for metrics
   */
  recordCacheHit(tokensSaved: number = 0): void {
    this.cacheStats.hits++;
    this.cacheStats.totalTokensSaved += tokensSaved;
  }

  recordCacheMiss(): void {
    this.cacheStats.misses++;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    provider: AIProvider;
    supportsNativeCaching: boolean;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    tokensSaved: number;
    estimatedCostSavings: number;
    estimatedLatencyReduction: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? this.cacheStats.hits / total : 0;

    const savings = this.adapter.estimateSavings(this.cacheStats.totalTokensSaved);

    // Estimate cost savings based on provider
    const estimatedCostSavings = this.calculateCostSavings(
      this.cacheStats.totalTokensSaved,
      savings.costReduction
    );

    return {
      provider: this.config.provider,
      supportsNativeCaching: this.adapter.supportsNativeCaching,
      hitRate,
      totalHits: this.cacheStats.hits,
      totalMisses: this.cacheStats.misses,
      tokensSaved: this.cacheStats.totalTokensSaved,
      estimatedCostSavings,
      estimatedLatencyReduction: savings.latencyReduction
    };
  }

  /**
   * Calculate cost savings based on tokens and reduction percentage
   */
  private calculateCostSavings(tokens: number, reductionPercentage: number): number {
    // Average cost per 1K tokens across providers: ~$0.003
    const baseCost = (tokens / 1000) * 0.003;
    return baseCost * (reductionPercentage / 100);
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalTokensSaved: 0
    };
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable caching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get the underlying adapter (for advanced usage)
   */
  getAdapter(): PromptCacheAdapter {
    return this.adapter;
  }
}

/**
 * Singleton instance for global cache management
 */
let globalCache: MultiModelPromptCache | null = null;

export function getGlobalMultiModelCache(config?: Partial<MultiModelCacheConfig>): MultiModelPromptCache {
  if (!globalCache) {
    globalCache = new MultiModelPromptCache(config);
  }
  return globalCache;
}

export function resetGlobalMultiModelCache(): void {
  globalCache = null;
}

// Re-export types for convenience
export type { AIProvider, CachedPromptResult, MultiModelCacheConfig } from './cache-adapters';
