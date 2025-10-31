/**
 * Interleaved Thinking Client
 *
 * Provides Anthropic API integration with interleaved thinking support,
 * calculator tools, and database query capabilities for VC fund modeling.
 *
 * Features:
 * - Interleaved thinking with configurable budget
 * - Calculator tool for financial calculations
 * - Database query tool for PostgreSQL
 * - Structured response parsing
 * - Usage tracking and cost estimation
 *
 * @see https://docs.anthropic.ai/en/docs/build-with-claude/tool-use
 */

import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { evaluate } from 'mathjs';

// ============================================================================
// Types
// ============================================================================

export interface InterleavedThinkingConfig {
  type: 'enabled';
  budget_tokens: number;
}

export interface CalculatorToolInput {
  expression: string;
}

export interface DatabaseQueryToolInput {
  query: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: CalculatorToolInput | DatabaseQueryToolInput;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

export interface InterleavedThinkingResponse {
  thinking: string[];
  toolCalls: Array<{
    id: string;
    name: string;
    input: unknown;
    result: unknown;
  }>;
  finalAnswer: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd: number;
  cache_savings_usd?: number;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const CALCULATOR_TOOL: Anthropic.Tool = {
  name: 'calculator',
  description:
    'Perform mathematical calculations including IRR, NPV, compound returns, and other financial formulas. Supports standard mathematical expressions.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          'Mathematical expression to evaluate (e.g., "150 * 50", "sqrt(100)", "log(1000)")',
      },
    },
    required: ['expression'],
  },
};

const DATABASE_QUERY_TOOL: Anthropic.Tool = {
  name: 'database_query',
  description:
    'Query the PostgreSQL database for fund data, portfolio metrics, investment records, and financial analytics. Use standard SQL syntax.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to execute (SELECT statements only for safety)',
      },
    },
    required: ['query'],
  },
};

// ============================================================================
// Pricing
// ============================================================================

const PRICING = {
  'claude-sonnet-4-5': {
    input: 0.003, // $3 per million tokens
    output: 0.015, // $15 per million tokens
    cacheWrite: 0.00375, // $3.75 per million tokens (25% premium)
    cacheRead: 0.0003, // $0.30 per million tokens (90% discount)
  },
  'claude-3-5-sonnet-latest': {
    input: 0.003,
    output: 0.015,
    cacheWrite: 0.00375,
    cacheRead: 0.0003,
  },
} as const;

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const rates = PRICING[model as keyof typeof PRICING] || PRICING['claude-sonnet-4-5'];

  // Calculate standard input tokens (excluding cache operations)
  const standardInputTokens = inputTokens - cacheCreationTokens - cacheReadTokens;

  const baseCost = (standardInputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) * rates.cacheWrite;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * rates.cacheRead;

  return baseCost + outputCost + cacheWriteCost + cacheReadCost;
}

function calculateCacheSavings(model: string, cacheReadTokens: number): number {
  const rates = PRICING[model as keyof typeof PRICING] || PRICING['claude-sonnet-4-5'];

  // Savings = (what would have paid at full price) - (what paid at cache price)
  const fullPrice = (cacheReadTokens / 1_000_000) * rates.input;
  const cachePrice = (cacheReadTokens / 1_000_000) * rates.cacheRead;

  return fullPrice - cachePrice;
}

// ============================================================================
// Tool Execution
// ============================================================================

class ToolExecutor {
  private dbPool: Pool | null = null;

  constructor(databaseUrl?: string) {
    if (databaseUrl) {
      this.dbPool = new Pool({ connectionString: databaseUrl });
    }
  }

  /**
   * Execute calculator tool
   */
  async executeCalculator(input: CalculatorToolInput): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = evaluate(input.expression);
      return JSON.stringify({
        expression: input.expression,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        result: result,
        formatted:
          typeof result === 'number'
            ? result.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : String(result),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown calculation error';
      return JSON.stringify({
        error: `Calculation error: ${message}`,
        expression: input.expression,
      });
    }
  }

  /**
   * Execute database query tool
   */
  async executeDatabaseQuery(input: DatabaseQueryToolInput): Promise<string> {
    if (!this.dbPool) {
      return JSON.stringify({
        error: 'Database connection not configured. Set DATABASE_URL environment variable.',
      });
    }

    // Security: Only allow SELECT statements
    const trimmedQuery = input.query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select')) {
      return JSON.stringify({
        error: 'Only SELECT queries are allowed for safety reasons.',
      });
    }

    try {
      const result = await this.dbPool.query(input.query);
      return JSON.stringify({
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      return JSON.stringify({
        error: `Database query error: ${message}`,
        query: input.query,
      });
    }
  }

  /**
   * Execute tool by name
   */
  async executeTool(name: string, input: unknown): Promise<string> {
    switch (name) {
      case 'calculator':
        return this.executeCalculator(input as CalculatorToolInput);
      case 'database_query':
        return this.executeDatabaseQuery(input as DatabaseQueryToolInput);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.dbPool) {
      await this.dbPool.end();
    }
  }
}

// ============================================================================
// Interleaved Thinking Client
// ============================================================================

export class InterleavedThinkingClient {
  private client: Anthropic;
  private toolExecutor: ToolExecutor;
  private model: string;

  constructor(
    options: {
      apiKey?: string;
      model?: string;
      databaseUrl?: string;
    } = {}
  ) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    });

    this.model = options.model || 'claude-sonnet-4-5';
    this.toolExecutor = new ToolExecutor(options.databaseUrl || process.env.DATABASE_URL);
  }

  /**
   * Execute a query with interleaved thinking and tools
   */
  async query(
    prompt: string,
    options: {
      thinkingBudget?: number;
      maxTokens?: number;
      systemPrompt?: string;
      cacheSystemPrompt?: boolean;
      fundContext?: string;
    } = {}
  ): Promise<InterleavedThinkingResponse> {
    const thinkingBudget = options.thinkingBudget || 10000;
    const maxTokens = options.maxTokens || 16000;
    const cacheSystemPrompt = options.cacheSystemPrompt !== false; // Default true

    // Build user message with optional cached context
    const userContent: Array<Anthropic.TextBlockParam> = [];

    // Add cached fund context if provided
    if (options.fundContext) {
      userContent.push({
        type: 'text',
        text: options.fundContext,
        cache_control: { type: 'ephemeral' },
      });
    }

    // Add the actual prompt (not cached, as it changes per request)
    userContent.push({
      type: 'text',
      text: prompt,
    });

    // Initial request with thinking and tools
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }];

    const thinkingBlocks: string[] = [];
    const toolCalls: InterleavedThinkingResponse['toolCalls'] = [];
    let finalAnswer = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;

    // Agentic loop: Claude can use tools multiple times
    let continueLoop = true;
    let iteration = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      const requestParams: Anthropic.MessageCreateParams = {
        model: this.model,
        max_tokens: maxTokens,
        messages,
        tools: [CALCULATOR_TOOL, DATABASE_QUERY_TOOL],
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        },
      };

      // Add system prompt with optional caching
      if (options.systemPrompt) {
        if (cacheSystemPrompt) {
          requestParams.system = [
            {
              type: 'text',
              text: options.systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ];
        } else {
          requestParams.system = options.systemPrompt;
        }
      }

      const response = await this.client.messages.create(requestParams);

      // Track usage including cache metrics
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.usage.cache_creation_input_tokens) {
        totalCacheCreationTokens += response.usage.cache_creation_input_tokens;
      }

      if (response.usage.cache_read_input_tokens) {
        totalCacheReadTokens += response.usage.cache_read_input_tokens;
      }

      // Process response content
      const toolUseBlocks: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'thinking') {
          thinkingBlocks.push(block.thinking);
        } else if (block.type === 'text') {
          finalAnswer += block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block as ToolUseBlock);
        }
      }

      // If no tool use, we're done
      if (toolUseBlocks.length === 0) {
        continueLoop = false;
        break;
      }

      // Execute tools and prepare tool results
      const toolResults: Anthropic.MessageParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await this.toolExecutor.executeTool(toolUse.name, toolUse.input);

        toolCalls.push({
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          result: JSON.parse(result),
        });

        toolResults.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result,
            },
          ],
        });
      }

      // Add assistant message and tool results to conversation
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      messages.push(...toolResults);
    }

    // Calculate costs including cache savings
    const cost = estimateCost(
      this.model,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens
    );

    const savings =
      totalCacheReadTokens > 0
        ? calculateCacheSavings(this.model, totalCacheReadTokens)
        : undefined;

    // Build usage object with proper optional properties
    const usage: InterleavedThinkingResponse['usage'] = {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
    };

    if (totalCacheCreationTokens > 0) {
      usage.cache_creation_input_tokens = totalCacheCreationTokens;
    }

    if (totalCacheReadTokens > 0) {
      usage.cache_read_input_tokens = totalCacheReadTokens;
    }

    const result: InterleavedThinkingResponse = {
      thinking: thinkingBlocks,
      toolCalls,
      finalAnswer,
      usage,
      cost_usd: cost,
    };

    if (savings !== undefined) {
      result.cache_savings_usd = savings;
    }

    return result;
  }

  /**
   * Close resources
   */
  async close(): Promise<void> {
    await this.toolExecutor.close();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick helper for single queries with interleaved thinking
 */
export async function queryWithThinking(
  prompt: string,
  options: {
    thinkingBudget?: number;
    maxTokens?: number;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    cacheSystemPrompt?: boolean;
    fundContext?: string;
  } = {}
): Promise<InterleavedThinkingResponse> {
  const client = new InterleavedThinkingClient({
    apiKey: options.apiKey,
    model: options.model,
  });

  try {
    return await client.query(prompt, {
      thinkingBudget: options.thinkingBudget,
      maxTokens: options.maxTokens,
      systemPrompt: options.systemPrompt,
      cacheSystemPrompt: options.cacheSystemPrompt,
      fundContext: options.fundContext,
    });
  } finally {
    await client.close();
  }
}

/**
 * Create a client instance
 */
export function createInterleavedThinkingClient(options?: {
  apiKey?: string;
  model?: string;
  databaseUrl?: string;
}): InterleavedThinkingClient {
  return new InterleavedThinkingClient(options);
}
