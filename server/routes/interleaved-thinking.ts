/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */

/**
 * Interleaved Thinking API
 *
 * Provides Claude extended thinking endpoints with tool support for:
 * - Calculator (mathjs) for complex financial calculations
 * - Database queries for fund data access
 * - Extended reasoning for complex analysis
 *
 * @see ai-utils/extended-thinking/index.ts for core utility
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { evaluate } from 'mathjs';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const QueryRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  options: z
    .object({
      maxTokens: z.number().int().min(512).max(8192).optional(),
      temperature: z.number().min(0).max(1).optional(),
      thinkingBudget: z.number().int().min(1024).max(32000).optional(),
    })
    .optional(),
});

const AnalyzeRequestSchema = z.object({
  topic: z.string().min(1).max(5000),
  depth: z.enum(['quick', 'deep']).optional().default('quick'),
  context: z.string().max(5000).optional(),
});

// ============================================================================
// Types
// ============================================================================

interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}


interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface QueryResponse {
  success: boolean;
  response?: string;
  thinking?: string[];
  toolUses?: Array<{ name: string; input: any; output: any }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  cost?: {
    input_cost_usd: number;
    output_cost_usd: number;
    total_cost_usd: number;
  };
  error?: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const CALCULATOR_TOOL: Anthropic.Tool = {
  name: 'calculator',
  description:
    'Performs mathematical calculations using mathjs. Supports arithmetic, algebra, calculus, statistics, and financial functions like IRR and NPV. Use this for any numerical computation.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          'Mathematical expression to evaluate (e.g., "sqrt(144)", "15% * 1000000", "mean([10, 20, 30])")',
      },
    },
    required: ['expression'],
  },
};

const DATABASE_QUERY_TOOL: Anthropic.Tool = {
  name: 'query_database',
  description:
    'Executes read-only SQL queries against the PostgreSQL fund database. Use for accessing fund data, portfolio companies, investments, and performance metrics. Only SELECT queries are allowed.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL SELECT query to execute (read-only)',
      },
      params: {
        type: 'array',
        description: 'Query parameters for parameterized queries',
        items: {
          type: 'string',
        },
      },
    },
    required: ['query'],
  },
};

// ============================================================================
// Tool Execution Functions
// ============================================================================

async function executeCalculator(input: { expression: string }): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = evaluate(input.expression);
    return `Result: ${JSON.stringify(result, null, 2)}`;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Calculator error: ${err.message}`);
  }
}

async function executeDatabaseQuery(input: {
  query: string;
  params?: string[];
}): Promise<string> {
  // Validate read-only query
  const normalizedQuery = input.query.trim().toLowerCase();
  if (
    !normalizedQuery.startsWith('select') &&
    !normalizedQuery.startsWith('with')
  ) {
    throw new Error('Only SELECT and WITH queries are allowed');
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'insert',
    'update',
    'delete',
    'drop',
    'truncate',
    'alter',
    'create',
  ];
  if (dangerousKeywords.some((keyword) => normalizedQuery.includes(keyword))) {
    throw new Error('Query contains forbidden keywords');
  }

  try {
    const result = await pool.query(input.query, input.params || []);
    return JSON.stringify(
      {
        rowCount: result.rowCount,
        rows: result.rows,
      },
      null,
      2
    );
  } catch (error) {
    const err = error as Error;
    throw new Error(`Database query error: ${err.message}`);
  }
}

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case 'calculator':
      return executeCalculator(input as { expression: string });
    case 'query_database':
      return executeDatabaseQuery(
        input as { query: string; params?: string[] }
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// Cost Calculation
// ============================================================================

const PRICING = {
  // Claude Sonnet 4.5 pricing per 1M tokens (as of Jan 2025)
  input: 3.0, // $3 per 1M input tokens
  output: 15.0, // $15 per 1M output tokens
} as const;

function calculateCost(usage: {
  input_tokens: number;
  output_tokens: number;
}): {
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
} {
  const input_cost_usd = (usage.input_tokens / 1_000_000) * PRICING.input;
  const output_cost_usd = (usage.output_tokens / 1_000_000) * PRICING.output;
  const total_cost_usd = input_cost_usd + output_cost_usd;

  return {
    input_cost_usd: parseFloat(input_cost_usd.toFixed(6)),
    output_cost_usd: parseFloat(output_cost_usd.toFixed(6)),
    total_cost_usd: parseFloat(total_cost_usd.toFixed(6)),
  };
}

// ============================================================================
// Main Query Handler with Agentic Loop
// ============================================================================

async function handleThinkingQuery(
  query: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    thinkingBudget?: number;
  } = {}
): Promise<QueryResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return {
      success: false,
      error: 'ANTHROPIC_API_KEY not configured',
    };
  }

  const client = new Anthropic({ apiKey });

  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature || 0.7;
  const thinkingBudget = options.thinkingBudget || 2000;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: query,
    },
  ];

  const thinkingBlocks: string[] = [];
  const toolExecutions: Array<{ name: string; input: any; output: any }> = [];
  let totalUsage = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };

  // Agentic loop - allow up to 5 tool use iterations
  for (let iteration = 0; iteration < 5; iteration++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      temperature,
      messages,
      tools: [CALCULATOR_TOOL, DATABASE_QUERY_TOOL],
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
    });

    // Accumulate usage
    totalUsage.input_tokens += response.usage.input_tokens;
    totalUsage.output_tokens += response.usage.output_tokens;
    totalUsage.total_tokens =
      totalUsage.input_tokens + totalUsage.output_tokens;

    // Extract thinking blocks
    for (const block of response.content) {
      if (block.type === 'thinking') {
        thinkingBlocks.push(block.thinking);
      }
    }

    // Check if we need to execute tools
    const toolUses = response.content.filter(
      (block): block is ToolUse => block.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      // No more tools to execute, extract final response
      const textBlocks = response.content.filter(
        (block) => block.type === 'text'
      );
      const finalResponse = textBlocks
        .map((b) => {
          if ('text' in b) {
            return b.text;
          }
          return '';
        })
        .join('\n');

      return {
        success: true,
        response: finalResponse,
        thinking: thinkingBlocks,
        toolUses: toolExecutions,
        usage: totalUsage,
        cost: calculateCost(totalUsage),
      };
    }

    // Execute tools and prepare tool results
    const toolResults: ToolResult[] = [];

    for (const toolUse of toolUses) {
      let toolOutput: string;
      let isError = false;

      try {
        toolOutput = await executeTool(toolUse.name, toolUse.input);
        toolExecutions.push({
          name: toolUse.name,
          input: toolUse.input,
          output: toolOutput,
        });
      } catch (error) {
        const err = error as Error;
        toolOutput = `Error: ${err.message}`;
        isError = true;
        toolExecutions.push({
          name: toolUse.name,
          input: toolUse.input,
          output: toolOutput,
        });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: toolOutput,
        is_error: isError,
      });
    }

    // Add assistant response and tool results to conversation
    messages.push({
      role: 'assistant',
      content: response.content,
    });

    messages.push({
      role: 'user',
      content: toolResults,
    });
  }

  // If we exhausted iterations, return what we have
  return {
    success: false,
    error: 'Maximum tool use iterations reached',
    thinking: thinkingBlocks,
    toolUses: toolExecutions,
    usage: totalUsage,
    cost: calculateCost(totalUsage),
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/interleaved-thinking/query
 *
 * Execute a thinking query with tool support
 *
 * Body:
 * {
 *   "query": "Calculate 15% of $1,000,000 and explain the reasoning",
 *   "options": {
 *     "maxTokens": 4096,
 *     "temperature": 0.7,
 *     "thinkingBudget": 2000
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "response": "The answer is...",
 *   "thinking": ["First, I need to...", "..."],
 *   "toolUses": [{ "name": "calculator", "input": {...}, "output": {...} }],
 *   "usage": { "input_tokens": 100, "output_tokens": 200, "total_tokens": 300 },
 *   "cost": { "input_cost_usd": 0.0003, "output_cost_usd": 0.003, "total_cost_usd": 0.0033 }
 * }
 */
router.post(
  '/query',
  asyncHandler(async (req: Request, res: Response) => {
    const { query, options } = QueryRequestSchema.parse(req.body);

    const queryOpts: {
      maxTokens?: number;
      temperature?: number;
      thinkingBudget?: number;
    } = {};

    if (options) {
      if (options.maxTokens !== undefined) queryOpts.maxTokens = options.maxTokens;
      if (options.temperature !== undefined) queryOpts.temperature = options.temperature;
      if (options.thinkingBudget !== undefined) queryOpts.thinkingBudget = options.thinkingBudget;
    }

    const result = await handleThinkingQuery(query, queryOpts);

    res['json'](result);
  })
);

/**
 * POST /api/interleaved-thinking/analyze
 *
 * Deep analysis of a topic with extended reasoning
 *
 * Body:
 * {
 *   "topic": "Portfolio concentration risk in our seed fund",
 *   "depth": "deep",
 *   "context": "We have 30 companies, avg check $500k"
 * }
 */
router.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const { topic, depth, context } = AnalyzeRequestSchema.parse(req.body);

    let query = `Analyze the following topic:\n\n${topic}`;
    if (context) {
      query += `\n\nContext:\n${context}`;
    }

    query += `\n\nProvide ${
      depth === 'deep'
        ? 'a detailed analysis covering multiple perspectives, risks, opportunities, and recommendations'
        : 'a focused summary with key insights and actionable recommendations'
    }.`;

    const queryOptions: {
      thinkingBudget: number;
      maxTokens: number;
      temperature?: number;
    } = {
      thinkingBudget: depth === 'deep' ? 8000 : 2000,
      maxTokens: depth === 'deep' ? 8192 : 4096,
    };

    const result = await handleThinkingQuery(query, queryOptions);

    res['json']({
      ...result,
      analysis: {
        topic,
        depth,
        context: context || null,
      },
    });
  })
);

/**
 * GET /api/interleaved-thinking/usage
 *
 * Get usage statistics and available tools
 */
router.get(
  '/usage',
  asyncHandler(async (_req: Request, res: Response) => {
    res['json']({
      success: true,
      tools: [
        {
          name: 'calculator',
          description: 'Mathematical calculations using mathjs',
          examples: [
            'sqrt(144)',
            '15% * 1000000',
            'mean([10, 20, 30])',
            'IRR calculation',
          ],
        },
        {
          name: 'query_database',
          description: 'Read-only database queries',
          examples: [
            'SELECT * FROM funds LIMIT 5',
            'SELECT COUNT(*) FROM portfolio_companies',
          ],
        },
      ],
      models: [
        {
          id: 'claude-sonnet-4-5-20250929',
          name: 'Claude Sonnet 4.5',
          thinkingSupport: true,
          minThinkingTokens: 1024,
          maxThinkingTokens: 32000,
        },
      ],
      pricing: {
        model: 'claude-sonnet-4-5-20250929',
        input_per_1m: PRICING.input,
        output_per_1m: PRICING.output,
        currency: 'USD',
      },
    });
  })
);

/**
 * GET /api/interleaved-thinking/health
 *
 * Health check endpoint
 */
router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    const hasApiKey = !!process.env['ANTHROPIC_API_KEY'];
    const hasDbConnection = pool.totalCount > 0;

    res['json']({
      success: true,
      status: hasApiKey && hasDbConnection ? 'healthy' : 'degraded',
      checks: {
        anthropicApiKey: hasApiKey,
        databaseConnection: hasDbConnection,
      },
    });
  })
);

export default router;
