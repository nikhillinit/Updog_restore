/**
 * Extended Thinking Utilities
 *
 * Provides helpers for using Claude's extended thinking feature in TypeScript/Node.
 * Compatible with all models that support extended thinking.
 *
 * @see https://docs.claude.com/en/docs/build-with-claude/extended-thinking
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ModelConfig {
  id: string;
  thinkingSupport: boolean;
  minThinkingTokens: number;
  maxThinkingTokens: number;
  contextWindow: number;
  description: string;
}

export interface ExtendedThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export interface ThinkingResult {
  thinking: string[];
  answer: string;
  thinkingChars: number;
  answerChars: number;
  rawResponse: Anthropic.Message;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface RedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type ContentBlock = ThinkingBlock | RedactedThinkingBlock | TextBlock;

// Model configurations
export const MODELS: Record<string, ModelConfig> = {
  'sonnet-4.5': {
    id: 'claude-sonnet-4-5',
    thinkingSupport: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 32000,
    contextWindow: 200000,
    description: 'Latest Sonnet with extended thinking',
  },
  'sonnet-3.7': {
    id: 'claude-3-7-sonnet-20250219',
    thinkingSupport: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 32000,
    contextWindow: 200000,
    description: 'Claude 3.7 Sonnet with extended thinking',
  },
  'opus-4': {
    id: 'claude-opus-4-20250514',
    thinkingSupport: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 32000,
    contextWindow: 200000,
    description: 'Opus 4 with extended thinking',
  },
};

/**
 * Extended Thinking Agent
 *
 * Wrapper class for Claude API with extended thinking support.
 *
 * @example
 * ```typescript
 * const agent = new ExtendedThinkingAgent('sonnet-4.5', {
 *   defaultThinkingBudget: 2000,
 *   maxTokens: 4000
 * });
 *
 * const result = await agent.think('Calculate IRR for an investment...');
 * console.log(result.answer);
 * console.log(`Thinking chars: ${result.thinkingChars}`);
 * ```
 */
export class ExtendedThinkingAgent {
  private client: Anthropic;
  private model: ModelConfig;
  private defaultThinkingBudget: number;
  private maxTokens: number;

  constructor(
    modelKey: string = 'sonnet-4.5',
    options: {
      apiKey?: string;
      defaultThinkingBudget?: number;
      maxTokens?: number;
    } = {}
  ) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    });

    const model = MODELS[modelKey];
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}. Available: ${Object.keys(MODELS).join(', ')}`);
    }

    if (!model.thinkingSupport) {
      throw new Error(`Model ${modelKey} does not support extended thinking`);
    }

    this.model = model;
    this.defaultThinkingBudget = options.defaultThinkingBudget || 2000;
    this.maxTokens = options.maxTokens || 4000;

    // Validate default budget
    if (this.defaultThinkingBudget < model.minThinkingTokens) {
      throw new Error(
        `Thinking budget ${this.defaultThinkingBudget} is below minimum ${model.minThinkingTokens}`
      );
    }
  }

  /**
   * Execute a thinking task and return structured result
   */
  async think(
    prompt: string,
    options: {
      thinkingBudget?: number;
      maxTokens?: number;
      systemPrompt?: string;
    } = {}
  ): Promise<ThinkingResult> {
    const thinkingBudget = options.thinkingBudget || this.defaultThinkingBudget;
    const maxTokens = options.maxTokens || this.maxTokens;

    // Validate thinking budget
    if (thinkingBudget < this.model.minThinkingTokens) {
      throw new Error(
        `Thinking budget ${thinkingBudget} is below minimum ${this.model.minThinkingTokens}`
      );
    }

    if (thinkingBudget > this.model.maxThinkingTokens) {
      throw new Error(
        `Thinking budget ${thinkingBudget} exceeds maximum ${this.model.maxThinkingTokens}`
      );
    }

    const messages: Anthropic.MessageCreateParams['messages'] = [{ role: 'user', content: prompt }];

    const params: Anthropic.MessageCreateParams = {
      model: this.model.id,
      max_tokens: maxTokens,
      messages,
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
    };

    if (options.systemPrompt) {
      params.system = options.systemPrompt;
    }

    const response = await this.client.messages.create(params);

    return this.parseResponse(response);
  }

  /**
   * Execute multi-step reasoning with extended thinking
   */
  async multiStepReasoning(steps: string[]): Promise<ThinkingResult[]> {
    const results: ThinkingResult[] = [];

    for (const step of steps) {
      const result = await this.think(step);
      results.push(result);
    }

    return results;
  }

  /**
   * Stream a thinking response
   */
  async *thinkStream(
    prompt: string,
    options: {
      thinkingBudget?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<{ type: 'thinking' | 'text'; content: string }, void, undefined> {
    const thinkingBudget = options.thinkingBudget || this.defaultThinkingBudget;
    const maxTokens = options.maxTokens || this.maxTokens;

    const stream = await this.client.messages.stream({
      model: this.model.id,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta.thinking };
        } else if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
      }
    }
  }

  /**
   * Count tokens for a given prompt
   */
  async countTokens(prompt: string): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: this.model.id,
      messages: [{ role: 'user', content: prompt }],
    });

    return result.input_tokens;
  }

  /**
   * Get model configuration
   */
  getModelConfig(): ModelConfig {
    return { ...this.model };
  }

  /**
   * Parse response into structured format
   */
  private parseResponse(response: Anthropic.Message): ThinkingResult {
    const thinkingBlocks: string[] = [];
    const textBlocks: string[] = [];

    for (const block of response.content) {
      if (block.type === 'thinking') {
        thinkingBlocks.push(block.thinking);
      } else if (block.type === 'text') {
        textBlocks.push(block.text);
      }
      // Redacted thinking blocks are preserved in rawResponse
    }

    const thinking = thinkingBlocks;
    const answer = textBlocks.join('\n');
    const thinkingChars = thinkingBlocks.reduce((sum, t) => sum + t.length, 0);
    const answerChars = answer.length;

    return {
      thinking,
      answer,
      thinkingChars,
      answerChars,
      rawResponse: response,
    };
  }
}

/**
 * Helper function to create a thinking agent
 */
export function createThinkingAgent(
  modelKey: string = 'sonnet-4.5',
  options?: Parameters<typeof ExtendedThinkingAgent.prototype.constructor>[1]
): ExtendedThinkingAgent {
  return new ExtendedThinkingAgent(modelKey, options);
}

/**
 * Quick helper for single thinking tasks
 */
export async function think(
  prompt: string,
  options: {
    modelKey?: string;
    thinkingBudget?: number;
    maxTokens?: number;
  } = {}
): Promise<ThinkingResult> {
  const agent = createThinkingAgent(options.modelKey || 'sonnet-4.5', {
    defaultThinkingBudget: options.thinkingBudget,
    maxTokens: options.maxTokens,
  });

  return agent.think(prompt);
}

/**
 * Validate thinking configuration
 */
export function validateThinkingConfig(
  modelKey: string,
  thinkingBudget: number
): { valid: boolean; error?: string } {
  const model = MODELS[modelKey];

  if (!model) {
    return {
      valid: false,
      error: `Unknown model: ${modelKey}`,
    };
  }

  if (!model.thinkingSupport) {
    return {
      valid: false,
      error: `Model ${modelKey} does not support extended thinking`,
    };
  }

  if (thinkingBudget < model.minThinkingTokens) {
    return {
      valid: false,
      error: `Thinking budget ${thinkingBudget} is below minimum ${model.minThinkingTokens}`,
    };
  }

  if (thinkingBudget > model.maxThinkingTokens) {
    return {
      valid: false,
      error: `Thinking budget ${thinkingBudget} exceeds maximum ${model.maxThinkingTokens}`,
    };
  }

  return { valid: true };
}

/**
 * Get all available models with thinking support
 */
export function getThinkingModels(): ModelConfig[] {
  return Object.values(MODELS).filter((m) => m.thinkingSupport);
}

// Export types
export type { Anthropic };
