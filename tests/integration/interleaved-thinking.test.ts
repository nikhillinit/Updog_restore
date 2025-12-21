/**
 * Integration Tests: Interleaved Thinking API
 *
 * Tests the extended thinking endpoints with tool support for:
 * - Calculator (mathjs) for complex financial calculations
 * - Database queries for fund data access
 * - Extended reasoning for complex analysis
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk');

// Mock database pool
vi.mock('../../server/db/pool', () => ({
  pool: {
    query: vi.fn(),
    totalCount: 1,
  },
}));

// Import database mock helper
import { databaseMock } from '../helpers/database-mock';

// Mock server/db module to use databaseMock
vi.mock('../../server/db', () => ({
  db: databaseMock,
  pool: null,
}));

describe('Interleaved Thinking API', () => {
  let app: Application;
  let mockAnthropicCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set required environment variables
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-123';

    // Mock Anthropic client
    mockAnthropicCreate = vi.fn();
    (Anthropic as any).mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate,
      },
    }));

    // Import app after mocking
    const { makeApp } = await import('../../server/app');
    app = makeApp();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('POST /api/interleaved-thinking/query', () => {
    it('should execute a simple query without tools', async () => {
      // Mock response without tool use
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Let me analyze this question...',
          },
          {
            type: 'text',
            text: 'The answer is 42.',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'What is the meaning of life?',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        response: 'The answer is 42.',
        thinking: ['Let me analyze this question...'],
        toolUses: [],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      });

      expect(response.body.cost).toBeDefined();
      expect(response.body.cost.total_cost_usd).toBeGreaterThan(0);
    });

    it('should execute calculator tool', async () => {
      // First call: Claude requests calculator tool
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'I need to calculate 15% of $1,000,000...',
          },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'calculator',
            input: {
              expression: '0.15 * 1000000',
            },
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 150,
          output_tokens: 100,
        },
        stop_reason: 'tool_use',
      });

      // Second call: Claude receives tool result and responds
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'The calculator returned 150,000...',
          },
          {
            type: 'text',
            text: '15% of $1,000,000 is $150,000.',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 200,
          output_tokens: 80,
        },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Calculate 15% of $1,000,000',
          options: {
            maxTokens: 4096,
            temperature: 0.7,
          },
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        response: '15% of $1,000,000 is $150,000.',
        thinking: [
          'I need to calculate 15% of $1,000,000...',
          'The calculator returned 150,000...',
        ],
      });

      expect(response.body.toolUses).toHaveLength(1);
      expect(response.body.toolUses[0]).toMatchObject({
        name: 'calculator',
        input: {
          expression: '0.15 * 1000000',
        },
      });
      expect(response.body.toolUses[0].output).toContain('150000');
    });

    it('should validate query request schema', async () => {
      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: '', // Empty query - should fail validation
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should validate options schema', async () => {
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Test response',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
        stop_reason: 'end_turn',
      });

      // Valid options
      await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Test query',
          options: {
            maxTokens: 2048,
            temperature: 0.5,
            thinkingBudget: 1500,
          },
        })
        .expect(200);
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Test query',
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should handle missing API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      // Re-import to pick up env change
      const { makeApp } = await import('../../server/app');
      const testApp = makeApp();

      const response = await request(testApp)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Test query',
        })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('POST /api/interleaved-thinking/analyze', () => {
    it('should perform quick analysis', async () => {
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Analyzing portfolio concentration...',
          },
          {
            type: 'text',
            text: 'Portfolio concentration risk assessment: Moderate risk due to...',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 200,
          output_tokens: 150,
        },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/analyze')
        .send({
          topic: 'Portfolio concentration risk',
          depth: 'quick',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        response: expect.stringContaining('concentration risk'),
        analysis: {
          topic: 'Portfolio concentration risk',
          depth: 'quick',
          context: null,
        },
      });
    });

    it('should perform deep analysis with context', async () => {
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Performing comprehensive analysis...',
          },
          {
            type: 'text',
            text: 'Comprehensive portfolio analysis: Given 30 companies with avg check $500k...',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 500,
          output_tokens: 400,
        },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/analyze')
        .send({
          topic: 'Portfolio construction strategy',
          depth: 'deep',
          context: 'Seed fund with 30 companies, avg check $500k',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        analysis: {
          topic: 'Portfolio construction strategy',
          depth: 'deep',
          context: 'Seed fund with 30 companies, avg check $500k',
        },
      });

      // Deep analysis should use larger thinking budget
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          thinking: {
            type: 'enabled',
            budget_tokens: 8000, // Deep analysis budget
          },
        })
      );
    });

    it('should validate analyze request schema', async () => {
      const response = await request(app)
        .post('/api/interleaved-thinking/analyze')
        .send({
          topic: '', // Empty topic - should fail validation
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should default to quick depth', async () => {
      mockAnthropicCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Quick analysis result',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/analyze')
        .send({
          topic: 'Test topic',
        })
        .expect(200);

      expect(response.body.analysis.depth).toBe('quick');
    });
  });

  describe('GET /api/interleaved-thinking/usage', () => {
    it('should return available tools and pricing', async () => {
      const response = await request(app).get('/api/interleaved-thinking/usage').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        tools: [
          {
            name: 'calculator',
            description: expect.stringContaining('mathjs'),
            examples: expect.arrayContaining(['sqrt(144)']),
          },
          {
            name: 'query_database',
            description: expect.stringContaining('database'),
          },
        ],
        models: [
          {
            id: 'claude-opus-4-5-20251101',
            name: 'Claude Opus 4.5',
            thinkingSupport: true,
            minThinkingTokens: 1024,
            maxThinkingTokens: 32000,
          },
        ],
        pricing: {
          model: 'claude-opus-4-5-20251101',
          input_per_1m: 3.0,
          output_per_1m: 15.0,
          currency: 'USD',
        },
      });
    });
  });

  describe('GET /api/interleaved-thinking/health', () => {
    it('should return healthy status when API key and DB are configured', async () => {
      const response = await request(app).get('/api/interleaved-thinking/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
        checks: {
          anthropicApiKey: true,
          databaseConnection: true,
        },
      });
    });

    it('should return degraded status when API key is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const { makeApp } = await import('../../server/app');
      const testApp = makeApp();

      const response = await request(testApp).get('/api/interleaved-thinking/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'degraded',
        checks: {
          anthropicApiKey: false,
        },
      });
    });
  });

  describe('Database Query Tool', () => {
    it('should execute valid SELECT query', async () => {
      const { pool } = await import('../../server/db/pool');

      (pool.query as any).mockResolvedValue({
        rowCount: 2,
        rows: [
          { id: 1, name: 'Fund A' },
          { id: 2, name: 'Fund B' },
        ],
      });

      // Mock tool use flow
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'query_database',
            input: {
              query: 'SELECT * FROM funds LIMIT 2',
            },
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 150, output_tokens: 100 },
        stop_reason: 'tool_use',
      });

      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I found 2 funds in the database.',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 200, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'How many funds are in the database?',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.toolUses).toHaveLength(1);
      expect(response.body.toolUses[0].name).toBe('query_database');
    });

    it('should reject non-SELECT queries', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'query_database',
            input: {
              query: 'DELETE FROM funds WHERE id = 1',
            },
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 150, output_tokens: 100 },
        stop_reason: 'tool_use',
      });

      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I encountered an error executing the query.',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 200, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Delete a fund',
        })
        .expect(200);

      // Should still succeed but tool execution should fail
      expect(response.body.success).toBe(true);
      expect(response.body.toolUses[0].output).toContain('Error');
      expect(response.body.toolUses[0].output).toContain('forbidden');
    });
  });

  describe('Calculator Tool', () => {
    it('should handle complex mathematical expressions', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'calculator',
            input: {
              expression: 'sqrt(144) + mean([10, 20, 30])',
            },
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 150, output_tokens: 100 },
        stop_reason: 'tool_use',
      });

      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The result is 32 (12 + 20).',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 200, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Calculate sqrt(144) + mean([10, 20, 30])',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.toolUses[0].output).toContain('32');
    });

    it('should handle calculator errors gracefully', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'calculator',
            input: {
              expression: 'invalid_function(123)',
            },
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 150, output_tokens: 100 },
        stop_reason: 'tool_use',
      });

      mockAnthropicCreate.mockResolvedValueOnce({
        id: 'msg_124',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I encountered a calculation error.',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        usage: { input_tokens: 200, output_tokens: 50 },
        stop_reason: 'end_turn',
      });

      const response = await request(app)
        .post('/api/interleaved-thinking/query')
        .send({
          query: 'Calculate invalid_function(123)',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.toolUses[0].output).toContain('Error');
    });
  });
});
