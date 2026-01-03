/**
 * Tool Handler for Anthropic's Native Tools
 *
 * Handles tool_use blocks from Claude's API responses, including:
 * - memory_20250818 (Native memory tool)
 * - Future tools as they become available
 *
 * @example
 * ```typescript
 * const handler = new ToolHandler({ tenantId: 'user123:project456' });
 * const results = await handler.handleToolUses(response, context);
 * ```
 */

import type Anthropic from '@anthropic-ai/sdk';
import { logger } from './Logger.js';

/**
 * Tool use block from Claude's API response
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result block to send back to Claude
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Context for tool execution
 */
export interface ToolExecutionContext {
  tenantId: string;
  threadId?: string;
  userId?: string;
  projectId?: string;
}

/**
 * Tool execution metrics
 */
export interface ToolExecutionMetrics {
  toolName: string;
  toolUseId: string;
  duration: number;
  success: boolean;
  error?: string;
  tenantId: string;
}

/**
 * Handler for processing tool uses from Claude's API
 */
export class ToolHandler {
  private readonly context: ToolExecutionContext;
  private readonly metrics: ToolExecutionMetrics[] = [];

  constructor(context: ToolExecutionContext) {
    this.context = context;
  }

  /**
   * Process all tool_use blocks from a Claude API response
   *
   * @param response - The response from Claude's API
   * @returns Array of tool result blocks to send back to Claude
   */
  async handleToolUses(
    response: Anthropic.Message
  ): Promise<ToolResultBlock[]> {
    const toolUses = this.extractToolUses(response);

    if (toolUses.length === 0) {
      return [];
    }

    logger.info('Processing tool uses', {
      count: toolUses.length,
      tools: toolUses.map(t => t.name),
      tenantId: this.context.tenantId,
    });

    // Execute all tool uses in parallel
    const results = await Promise.all(
      toolUses.map(use => this.executeToolUse(use))
    );

    // Log metrics
    this.logMetrics();

    return results;
  }

  /**
   * Extract tool_use blocks from API response
   */
  private extractToolUses(response: Anthropic.Message): ToolUseBlock[] {
    return response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );
  }

  /**
   * Execute a single tool use
   *
   * Note: For native tools like memory_20250818, Claude handles execution
   * server-side. We primarily intercept for logging, metrics, and potential
   * client-side augmentation.
   */
  private async executeToolUse(use: ToolUseBlock): Promise<ToolResultBlock> {
    const startTime = Date.now();

    try {
      logger.debug('Executing tool use', {
        toolName: use.name,
        toolUseId: use.id,
        tenantId: this.context.tenantId,
        input: use.input,
      });

      // Route to appropriate handler based on tool name
      let result: string;
      switch (use.name) {
        case 'memory':
          result = await this.handleMemoryTool(use);
          break;
        default:
          result = await this.handleUnknownTool(use);
      }

      const duration = Date.now() - startTime;
      this.recordMetric({
        toolName: use.name,
        toolUseId: use.id,
        duration,
        success: true,
        tenantId: this.context.tenantId,
      });

      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: result,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Tool execution failed', {
        toolName: use.name,
        toolUseId: use.id,
        tenantId: this.context.tenantId,
        error: errorMessage,
        duration,
      });

      this.recordMetric({
        toolName: use.name,
        toolUseId: use.id,
        duration,
        success: false,
        error: errorMessage,
        tenantId: this.context.tenantId,
      });

      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify({ error: errorMessage }),
        is_error: true,
      };
    }
  }

  /**
   * Handle memory tool (memory_20250818)
   *
   * Note: This is a server-side tool - Claude handles execution.
   * We intercept for logging and potential tenant-scoped validation.
   */
  private async handleMemoryTool(use: ToolUseBlock): Promise<string> {
    const { command, path } = use.input;

    logger.info('Memory tool operation', {
      command,
      path,
      tenantId: this.context.tenantId,
      threadId: this.context.threadId,
    });

    // Memory tool is handled server-side by Claude
    // Return acknowledgment for logging purposes
    return JSON.stringify({
      success: true,
      command,
      path,
      tenantId: this.context.tenantId,
    });
  }

  /**
   * Handle unknown tools
   *
   * Logs a warning and returns a generic success response.
   * Future tools can be added as new cases in executeToolUse().
   */
  private async handleUnknownTool(use: ToolUseBlock): Promise<string> {
    logger.warn('Unknown tool called', {
      toolName: use.name,
      toolUseId: use.id,
      tenantId: this.context.tenantId,
    });

    return JSON.stringify({
      success: true,
      message: `Tool ${use.name} processed (handler not implemented)`,
    });
  }

  /**
   * Record execution metrics
   */
  private recordMetric(metric: ToolExecutionMetrics): void {
    this.metrics.push(metric);
  }

  /**
   * Log accumulated metrics
   */
  private logMetrics(): void {
    if (this.metrics.length === 0) return;

    const summary = {
      totalExecutions: this.metrics.length,
      successful: this.metrics.filter(m => m.success).length,
      failed: this.metrics.filter(m => !m.success).length,
      avgDuration: this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length,
      byTool: this.groupMetricsByTool(),
    };

    logger.info('Tool execution metrics', {
      ...summary,
      tenantId: this.context.tenantId,
    });
  }

  /**
   * Group metrics by tool name
   */
  private groupMetricsByTool(): Record<string, { count: number; avgDuration: number; successRate: number }> {
    const grouped: Record<string, ToolExecutionMetrics[]> = {};

    for (const metric of this.metrics) {
      if (!grouped[metric.toolName]) {
        grouped[metric.toolName] = [];
      }
      grouped[metric.toolName].push(metric);
    }

    const result: Record<string, { count: number; avgDuration: number; successRate: number }> = {};
    for (const [toolName, metrics] of Object.entries(grouped)) {
      result[toolName] = {
        count: metrics.length,
        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
        successRate: metrics.filter(m => m.success).length / metrics.length,
      };
    }

    return result;
  }

  /**
   * Get collected metrics
   */
  getMetrics(): ToolExecutionMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear collected metrics
   */
  clearMetrics(): void {
    this.metrics.length = 0;
  }
}

/**
 * Utility: Check if a response contains tool uses
 */
export function hasToolUses(response: Anthropic.Message): boolean {
  return response.content.some(block => block.type === 'tool_use');
}

/**
 * Utility: Extract text content from response
 */
export function extractTextContent(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}
