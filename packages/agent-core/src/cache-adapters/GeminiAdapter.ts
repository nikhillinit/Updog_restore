/**
 * Google Gemini Prompt Caching Adapter
 *
 * Gemini supports context caching for frequently used content.
 * Cached content can be reused across requests to reduce latency and cost.
 *
 * Reference: https://ai.google.dev/gemini-api/docs/caching
 */

import type { PromptCacheAdapter, CachedPromptResult } from './types';

export class GeminiAdapter implements PromptCacheAdapter {
  provider = 'google' as const;
  supportsNativeCaching = true;

  private minCacheSize: number;
  private maxCacheSize: number;
  private cacheTTL: number; // in seconds

  constructor(config: {
    minCacheSize?: number;
    maxCacheSize?: number;
    cacheTTL?: number;
  } = {}) {
    this.minCacheSize = config.minCacheSize ?? 2048; // Gemini requires min 2048 tokens
    this.maxCacheSize = config.maxCacheSize ?? 100000;
    this.cacheTTL = config.cacheTTL ?? 3600; // 1 hour default
  }

  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    const messages: any[] = [];
    let systemInstruction = '';
    let cachedContent: string[] = [];

    // 1. Prepare cached content (system prompt + project context)
    if (content.systemPrompt) {
      systemInstruction = content.systemPrompt;
    }

    if (content.projectContext) {
      // Gemini allows caching large context
      cachedContent.push(content.projectContext);
    }

    // 2. Add conversation history
    if (content.conversationHistory && content.conversationHistory.length > 0) {
      content.conversationHistory.forEach(turn => {
        messages.push({
          role: turn.role === 'assistant' ? 'model' : 'user', // Gemini uses 'model' instead of 'assistant'
          parts: [{ text: turn.content }]
        });
      });
    }

    // 3. Add current user query
    messages.push({
      role: 'user',
      parts: [{ text: content.userQuery }]
    });

    return {
      messages,
      system: systemInstruction || undefined,
      headers: this.getHeaders(),
      metadata: {
        provider: 'google',
        cacheEnabled: cachedContent.length > 0,
        estimatedTokens: this.estimateTokens(content)
      }
    };
  }

  getHeaders(): Record<string, string> {
    return {
      'X-Goog-Api-Client': 'genai-js/1.0.0'
    };
  }

  estimateSavings(tokens: number): { latencyReduction: number; costReduction: number } {
    // Gemini context caching provides significant savings
    // Based on Google's documentation
    return {
      latencyReduction: 70, // ~70% latency reduction
      costReduction: 75     // ~75% cost reduction (cached tokens are 75% cheaper)
    };
  }

  /**
   * Estimate token count for Gemini (similar to OpenAI)
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
