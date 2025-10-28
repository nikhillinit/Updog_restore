/**
 * Anthropic (Claude) Prompt Caching Adapter
 *
 * Implements prompt caching for Claude models using the ephemeral cache control.
 * Reduces latency by ~85% and costs by ~90% for large context reuse.
 *
 * Reference: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */

import type { PromptCacheAdapter, CachedPromptResult, CacheableContent } from './types';

export class AnthropicAdapter implements PromptCacheAdapter {
  provider = 'anthropic' as const;
  supportsNativeCaching = true;

  private minCacheSize: number;
  private maxCacheSize: number;
  private cacheSystemPrompts: boolean;
  private cacheProjectContext: boolean;
  private cacheConversationHistory: boolean;

  constructor(config: {
    minCacheSize?: number;
    maxCacheSize?: number;
    cacheSystemPrompts?: boolean;
    cacheProjectContext?: boolean;
    cacheConversationHistory?: boolean;
  } = {}) {
    this.minCacheSize = config.minCacheSize ?? 1024;
    this.maxCacheSize = config.maxCacheSize ?? 100000;
    this.cacheSystemPrompts = config.cacheSystemPrompts ?? true;
    this.cacheProjectContext = config.cacheProjectContext ?? true;
    this.cacheConversationHistory = config.cacheConversationHistory ?? true;
  }

  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    const messages: any[] = [];
    let systemContent: CacheableContent[] | undefined;
    let cacheBreakpoints = 0;

    // 1. Add system prompt with cache control (if large enough)
    if (content.systemPrompt && this.cacheSystemPrompts) {
      systemContent = this.wrapWithCache(content.systemPrompt);
      if (this.hasCacheControl(systemContent)) {
        cacheBreakpoints++;
      }
    }

    // 2. Add project context as first user message (cached)
    if (content.projectContext && this.cacheProjectContext) {
      const cachedContext = this.wrapWithCache(content.projectContext);
      messages.push({
        role: 'user',
        content: cachedContext
      });
      if (this.hasCacheControl(cachedContext)) {
        cacheBreakpoints++;
      }
    }

    // 3. Add conversation history with cache on last turn
    if (content.conversationHistory && content.conversationHistory.length > 0) {
      content.conversationHistory.forEach((turn, index) => {
        const isLastTurn = index === content.conversationHistory!.length - 1;

        if (isLastTurn && this.cacheConversationHistory) {
          // Cache the last conversation turn
          const cachedTurn = this.wrapWithCache(turn.content);
          messages.push({
            role: turn.role,
            content: cachedTurn
          });
          if (this.hasCacheControl(cachedTurn)) {
            cacheBreakpoints++;
          }
        } else {
          messages.push({
            role: turn.role,
            content: [{ type: 'text', text: turn.content }]
          });
        }
      });
    }

    // 4. Add current user query (not cached)
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: content.userQuery }]
    });

    return {
      messages,
      system: systemContent,
      headers: this.getHeaders(),
      metadata: {
        provider: 'anthropic',
        cacheEnabled: true,
        cacheBreakpoints,
        estimatedTokens: this.estimateTokens(content)
      }
    };
  }

  getHeaders(): Record<string, string> {
    return {
      'anthropic-beta': 'prompt-caching-2024-07-31'
    };
  }

  estimateSavings(tokens: number): { latencyReduction: number; costReduction: number } {
    // Based on Anthropic's documentation and benchmarks
    return {
      latencyReduction: 85, // ~85% latency reduction
      costReduction: 90     // ~90% cost reduction
    };
  }

  /**
   * Wrap content with cache control if large enough
   */
  private wrapWithCache(text: string): CacheableContent[] {
    // Only cache if content is large enough for meaningful savings
    if (text.length < this.minCacheSize) {
      return [{ type: 'text', text }];
    }

    // Truncate if exceeds max cache size
    const cachedText = text.length > this.maxCacheSize
      ? text.substring(0, this.maxCacheSize)
      : text;

    return [{
      type: 'text',
      text: cachedText,
      cache_control: { type: 'ephemeral' }
    }];
  }

  /**
   * Check if content has cache control enabled
   */
  private hasCacheControl(content: CacheableContent[]): boolean {
    return content.some(item => item.cache_control !== undefined);
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): number {
    let totalChars = 0;

    if (content.systemPrompt) totalChars += content.systemPrompt.length;
    if (content.projectContext) totalChars += content.projectContext.length;
    if (content.conversationHistory) {
      totalChars += content.conversationHistory.reduce((sum, turn) => sum + turn.content.length, 0);
    }
    totalChars += content.userQuery.length;

    // Rough estimate: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }
}
