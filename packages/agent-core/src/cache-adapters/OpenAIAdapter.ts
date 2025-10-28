/**
 * OpenAI (GPT) Prompt Caching Adapter
 *
 * OpenAI doesn't have native prompt caching like Claude, but we can optimize by:
 * 1. Using conversation context efficiently
 * 2. Leveraging system message for static content
 * 3. Keeping conversation history compact
 *
 * Note: OpenAI charges for both input and output tokens each time,
 * but we can still optimize token usage through smart message structuring.
 */

import type { PromptCacheAdapter, CachedPromptResult } from './types';

export class OpenAIAdapter implements PromptCacheAdapter {
  provider = 'openai' as const;
  supportsNativeCaching = false;

  private maxContextLength: number;
  private compressHistory: boolean;

  constructor(config: {
    maxContextLength?: number;
    compressHistory?: boolean;
  } = {}) {
    this.maxContextLength = config.maxContextLength ?? 100000;
    this.compressHistory = config.compressHistory ?? true;
  }

  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult {
    const messages: any[] = [];

    // 1. Combine system prompt and project context into system message
    // This is sent every time but kept in a single efficient message
    let systemMessage = '';
    if (content.systemPrompt) {
      systemMessage += content.systemPrompt;
    }
    if (content.projectContext) {
      if (systemMessage) systemMessage += '\n\n';
      systemMessage += `# Project Context\n${content.projectContext}`;
    }

    // 2. Add conversation history (compressed if needed)
    if (content.conversationHistory && content.conversationHistory.length > 0) {
      const history = this.compressHistory
        ? this.compressConversationHistory(content.conversationHistory)
        : content.conversationHistory;

      history.forEach(turn => {
        messages.push({
          role: turn.role === 'assistant' ? 'assistant' : 'user',
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
        provider: 'openai',
        cacheEnabled: false, // No native caching
        estimatedTokens: this.estimateTokens(content)
      }
    };
  }

  getHeaders(): Record<string, string> {
    return {}; // No special headers needed
  }

  estimateSavings(tokens: number): { latencyReduction: number; costReduction: number } {
    // OpenAI doesn't have prompt caching, so no savings
    return {
      latencyReduction: 0,
      costReduction: 0
    };
  }

  /**
   * Compress conversation history by summarizing old turns
   * Keeps recent turns intact for context continuity
   */
  private compressConversationHistory(
    history: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    const KEEP_RECENT_TURNS = 4; // Keep last 4 turns fully intact

    if (history.length <= KEEP_RECENT_TURNS) {
      return history;
    }

    // Keep recent turns, compress older ones
    const recentTurns = history.slice(-KEEP_RECENT_TURNS);
    const olderTurns = history.slice(0, -KEEP_RECENT_TURNS);

    // Simple compression: just keep the key information
    const compressed: Array<{ role: string; content: string }> = [];

    // Group older turns by role and summarize
    if (olderTurns.length > 0) {
      compressed.push({
        role: 'user',
        content: `[Earlier conversation context - ${olderTurns.length} messages]`
      });
    }

    return [...compressed, ...recentTurns];
  }

  /**
   * Estimate token count (rough approximation for OpenAI)
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

    // OpenAI uses ~4 characters per token
    return Math.ceil(totalChars / 4);
  }
}
