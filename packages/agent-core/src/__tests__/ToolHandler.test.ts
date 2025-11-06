/**
 * Unit tests for ToolHandler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolHandler, hasToolUses, extractTextContent } from '../ToolHandler';
import type Anthropic from '@anthropic-ai/sdk';

describe('ToolHandler', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    handler = new ToolHandler({
      tenantId: 'test-tenant',
      threadId: 'test-thread',
    });
  });

  describe('handleToolUses', () => {
    it('should process memory tool use', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Processing...',
          },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'memory',
            input: {
              command: 'create',
              path: '/memories/test.md',
              file_text: 'Test content',
            },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      const results = await handler.handleToolUses(mockResponse);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('tool_result');
      expect(results[0].tool_use_id).toBe('tool_123');
      expect(results[0].is_error).toBeUndefined();
    });

    it('should return empty array for response without tool uses', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Just text, no tools',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 50,
          output_tokens: 20,
        },
      };

      const results = await handler.handleToolUses(mockResponse);

      expect(results).toHaveLength(0);
    });

    it('should track execution metrics', async () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_125',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_125',
            name: 'memory',
            input: { command: 'view', path: '/memories' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      await handler.handleToolUses(mockResponse);

      const metrics = handler.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].toolName).toBe('memory');
      expect(metrics[0].success).toBe(true);
      expect(metrics[0].duration).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Mock a tool that will throw
      const mockResponse: Anthropic.Message = {
        id: 'msg_126',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_126',
            name: 'unknown_tool',
            input: {},
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      const results = await handler.handleToolUses(mockResponse);

      expect(results).toHaveLength(1);
      // Should not throw, but return success for unknown tools
      expect(results[0].is_error).toBeUndefined();
    });
  });

  describe('hasToolUses', () => {
    it('should detect tool uses in response', () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_127',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Text' },
          { type: 'tool_use', id: 'tool_127', name: 'memory', input: {} },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      expect(hasToolUses(mockResponse)).toBe(true);
    });

    it('should return false for response without tool uses', () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_128',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Just text' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 20 },
      };

      expect(hasToolUses(mockResponse)).toBe(false);
    });
  });

  describe('extractTextContent', () => {
    it('should extract text from response', () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_129',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'tool_use', id: 'tool_129', name: 'memory', input: {} },
          { type: 'text', text: 'Second part' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const text = extractTextContent(mockResponse);

      expect(text).toBe('First part\nSecond part');
    });

    it('should return empty string for no text content', () => {
      const mockResponse: Anthropic.Message = {
        id: 'msg_130',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool_130', name: 'memory', input: {} }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const text = extractTextContent(mockResponse);

      expect(text).toBe('');
    });
  });
});
