/**
 * Generic Prompt Cache Adapter
 *
 * Fallback adapter for AI providers that don't support native prompt caching.
 * Provides basic message structuring and optimization strategies.
 */

import type { PromptCacheAdapter, CachedPromptResult } from './types';

export class GenericAdapter implements PromptCacheAdapter {
  provider = 'generic' as const;
  supportsNativeCaching = false;

  private maxContextLength: number;

  constructor(config: {
    maxContextLength?: number;
  } = {}) {
    this.maxContextLength = config.maxContextLength ?? 100000;
  }

  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    const messages: any[] = [];

    // 1. Combine system prompt and project context
    let systemMessage = '';
    if (content.systemPrompt) {
      systemMessage += content.systemPrompt;
    }
    if (content.projectContext) {
      if (systemMessage) systemMessage += '\n\n';
      systemMessage += `# Project Context\n${content.projectContext}`;
    }

    // 2. Add conversation history
    if (content.conversationHistory && content.conversationHistory.length > 0) {
      content.conversationHistory.forEach(turn => {
        messages.push({
          role: turn.role,
          content: turn.content
        });
      });
    }

    // 3. Add current user query
    messages.push({
      role: 'user',
      content: content.userQuery
    });

    return {
      messages,
      system: systemMessage || undefined,
      headers: this.getHeaders(),
      metadata: {
        provider: 'generic',
        cacheEnabled: false,
        estimatedTokens: this.estimateTokens(content)
      }
    };
  }

  getHeaders(): Record<string, string> {
    return {};
  }

  estimateSavings(tokens: number): { latencyReduction: number; costReduction: number } {
    // No native caching support
    return {
      latencyReduction: 0,
      costReduction: 0
    };
  }

  /**
   * Estimate token count
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
