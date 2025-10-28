/**
 * Multi-Model Prompt Caching Types
 *
 * Defines interfaces for caching prompts across different AI providers.
 * Each provider has different caching mechanisms and requirements.
 */

export type AIProvider =
  | 'anthropic'   // Claude with prompt caching
  | 'openai'      // GPT with conversation context
  | 'google'      // Gemini with context caching
  | 'generic';    // Fallback for other providers

export interface CacheableContent {
  type: 'text' | 'image';
  text?: string;
  image_url?: string;
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface CachedPromptResult {
  messages: any[];
  system?: CacheableContent[] | string;
  headers: Record<string, string>;
  metadata?: {
    provider: AIProvider;
    cacheEnabled: boolean;
    estimatedTokens?: number;
    cacheBreakpoints?: number;
  };
}

export interface PromptCacheAdapter {
  /**
   * The AI provider this adapter supports
   */
  provider: AIProvider;

  /**
   * Whether this adapter supports native prompt caching
   */
  supportsNativeCaching: boolean;

  /**
   * Prepare messages with caching enabled
   */
  prepare(content: {
    systemPrompt?: string;
    projectContext?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    userQuery: string;
  }): CachedPromptResult;

  /**
   * Get cache-specific headers for API requests
   */
  getHeaders(): Record<string, string>;

  /**
   * Estimate cost savings from caching
   */
  estimateSavings(tokens: number): {
    latencyReduction: number; // percentage
    costReduction: number;    // percentage
  };
}

export interface MultiModelCacheConfig {
  provider: AIProvider;
  enabled: boolean;
  cacheSystemPrompts?: boolean;
  cacheProjectContext?: boolean;
  cacheConversationHistory?: boolean;
  maxCacheSize?: number; // in characters
  minCacheSize?: number; // minimum size to enable caching
}
