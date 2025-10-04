/**
 * Prompt Caching System (Claude Cookbook Pattern)
 *
 * Reduces latency by ~85% and costs by ~90% by caching large context.
 *
 * Reference: https://github.com/anthropics/claude-cookbooks/blob/main/misc/prompt_caching.ipynb
 */

export interface CacheableContent {
  type: 'text' | 'image';
  text?: string;
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface PromptCacheConfig {
  enabled: boolean;
  cacheSystemPrompts?: boolean;
  cacheProjectContext?: boolean;
  maxCacheSize?: number; // in characters
}

export interface CachedPrompt {
  systemPrompt?: CacheableContent[];
  projectContext?: CacheableContent[];
  headers: Record<string, string>;
}

/**
 * PromptCache: Manages prompt caching for AI interactions
 *
 * Usage:
 * ```typescript
 * const cache = new PromptCache({ enabled: true });
 *
 * // Cache large project context
 * const cachedPrompt = cache.prepare({
 *   systemPrompt: 'You are a test repair agent...',
 *   projectContext: [claudeMdContent, decisionsContent, schemaFiles].join('\n')
 * });
 *
 * // Send to AI with cache headers
 * const response = await anthropic.messages.create({
 *   messages: [{ role: 'user', content: cachedPrompt.systemPrompt }],
 *   ...cachedPrompt.headers
 * });
 * ```
 */
export class PromptCache {
  private config: Required<PromptCacheConfig>;
  private cacheStats: {
    hits: number;
    misses: number;
    totalTokensSaved: number;
  };

  constructor(config: PromptCacheConfig = { enabled: true }) {
    this.config = {
      enabled: config.enabled ?? true,
      cacheSystemPrompts: config.cacheSystemPrompts ?? true,
      cacheProjectContext: config.cacheProjectContext ?? true,
      maxCacheSize: config.maxCacheSize ?? 100000, // 100k chars
    };

    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalTokensSaved: 0,
    };
  }

  /**
   * Prepare a prompt with caching enabled
   */
  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    userQuery?: string;
  }): CachedPrompt {
    if (!this.config.enabled) {
      return {
        systemPrompt: content.systemPrompt ? [{ type: 'text', text: content.systemPrompt }] : undefined,
        projectContext: content.projectContext ? [{ type: 'text', text: content.projectContext }] : undefined,
        headers: {}
      };
    }

    const cachedPrompt: CachedPrompt = {
      headers: {
        'anthropic-beta': 'prompt-caching-2024-07-31'
      }
    };

    // Cache system prompt if enabled and large enough
    if (content.systemPrompt && this.config.cacheSystemPrompts) {
      cachedPrompt.systemPrompt = this.wrapWithCache(content.systemPrompt);
    }

    // Cache project context if enabled and large enough
    if (content.projectContext && this.config.cacheProjectContext) {
      cachedPrompt.projectContext = this.wrapWithCache(content.projectContext);
    }

    return cachedPrompt;
  }

  /**
   * Wrap content with cache control
   */
  private wrapWithCache(text: string): CacheableContent[] {
    // Only cache if content is large enough (> 1000 chars for meaningful savings)
    if (text.length < 1000) {
      return [{ type: 'text', text }];
    }

    // Truncate if exceeds max cache size
    const cachedText = text.length > this.config.maxCacheSize
      ? text.substring(0, this.config.maxCacheSize)
      : text;

    return [{
      type: 'text',
      text: cachedText,
      cache_control: { type: 'ephemeral' }
    }];
  }

  /**
   * Build cached messages for Anthropic API
   */
  buildCachedMessages(content: {
    systemPrompt?: string;
    projectContext?: string;
    userQuery: string;
  }): { messages: any[]; system?: CacheableContent[]; headers: Record<string, string> } {
    const cached = this.prepare(content);

    const messages: any[] = [];

    // Add project context as first message (cached)
    if (cached.projectContext) {
      messages.push({
        role: 'user',
        content: cached.projectContext
      });
    }

    // Add user query (not cached)
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: content.userQuery }]
    });

    return {
      messages,
      system: cached.systemPrompt,
      headers: cached.headers
    };
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
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    tokensSaved: number;
    estimatedCostSavings: number; // in USD
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? this.cacheStats.hits / total : 0;

    // Estimate cost savings (Claude pricing: ~$0.003 per 1k tokens)
    const estimatedCostSavings = (this.cacheStats.totalTokensSaved / 1000) * 0.003 * 0.9; // 90% cost reduction

    return {
      hitRate,
      totalHits: this.cacheStats.hits,
      totalMisses: this.cacheStats.misses,
      tokensSaved: this.cacheStats.totalTokensSaved,
      estimatedCostSavings
    };
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
}

/**
 * Singleton instance for global cache management
 */
let globalCache: PromptCache | null = null;

export function getGlobalPromptCache(config?: PromptCacheConfig): PromptCache {
  if (!globalCache) {
    globalCache = new PromptCache(config);
  }
  return globalCache;
}

export function resetGlobalPromptCache(): void {
  globalCache = null;
}
