import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProAgent } from '../GeminiProAgent';
import type { ReviewContext } from '../types';

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
    },
  })),
}));

describe('GeminiProAgent', () => {
  let agent: GeminiProAgent;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new GeminiProAgent({ apiKey: mockApiKey });
  });

  afterEach(async () => {
    await agent.dispose();
  });

  describe('constructor', () => {
    it('sets provider and model correctly', () => {
      expect(agent.provider).toBe('gemini');
      expect(agent.model).toBe('gemini-2.0-flash');
    });

    it('allows custom model override', () => {
      const customAgent = new GeminiProAgent({
        apiKey: mockApiKey,
        model: 'gemini-2.5-pro-preview',
      });
      expect(customAgent.model).toBe('gemini-2.5-pro-preview');
    });
  });

  describe('initialize', () => {
    it('marks agent as ready', async () => {
      expect(agent.isReady()).toBe(false);
      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });

    it('is idempotent', async () => {
      await agent.initialize();
      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });
  });

  describe('review', () => {
    const mockResponse = {
      text: JSON.stringify({
        issues: [
          {
            severity: 'high',
            description: 'SQL injection vulnerability',
            line: 15,
            suggestion: 'Use parameterized queries',
          },
        ],
        summary: 'Found 1 critical security issue',
      }),
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 200,
      },
    };

    beforeEach(async () => {
      const { GoogleGenAI } = await import('@google/genai');
      const mockInstance = new GoogleGenAI(mockApiKey);
      (mockInstance.models.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      // Replace the agent's client with our mock
      (agent as any).client = mockInstance;
      await agent.initialize();
    });

    it('throws if not initialized', async () => {
      const uninitAgent = new GeminiProAgent({ apiKey: mockApiKey });
      await expect(uninitAgent.review('const x = 1')).rejects.toThrow('not initialized');
    });

    it('returns structured ReviewResult', async () => {
      const result = await agent.review('const query = "SELECT * FROM users WHERE id = " + userId');

      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('high');
      expect(result.summary).toBe('Found 1 critical security issue');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('includes token usage when available', async () => {
      const result = await agent.review('const x = 1');

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.input).toBe(100);
      expect(result.tokenUsage?.output).toBe(50);
      expect(result.tokenUsage?.thinking).toBe(200);
    });

    it('applies review context to prompt', async () => {
      const { GoogleGenAI } = await import('@google/genai');
      const mockInstance = (agent as any).client as InstanceType<typeof GoogleGenAI>;
      const generateContent = mockInstance.models.generateContent as ReturnType<typeof vi.fn>;

      const context: ReviewContext = {
        filePath: 'src/api/users.ts',
        language: 'typescript',
        focusAreas: ['security', 'performance'],
      };

      await agent.review('const x = 1', context);

      expect(generateContent).toHaveBeenCalled();
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.contents).toContain('src/api/users.ts');
      expect(callArgs.contents).toContain('typescript');
      expect(callArgs.contents).toContain('security');
      expect(callArgs.contents).toContain('performance');
    });
  });

  describe('parseResponse', () => {
    it('extracts JSON from markdown code blocks', () => {
      const response = '```json\n{"issues": [], "summary": "Clean"}\n```';
      const parsed = (agent as any).parseResponse(response);
      expect(parsed.issues).toEqual([]);
      expect(parsed.summary).toBe('Clean');
    });

    it('extracts JSON without code blocks', () => {
      const response = '{"issues": [{"severity": "low", "description": "Test"}], "summary": "1 issue"}';
      const parsed = (agent as any).parseResponse(response);
      expect(parsed.issues).toHaveLength(1);
    });

    it('handles nested braces correctly (balanced extraction)', () => {
      const response = `Here's my analysis:
        {"issues": [{"severity": "high", "description": "Object with { nested } braces"}], "summary": "Done"}
        Some trailing text`;
      const parsed = (agent as any).parseResponse(response);
      expect(parsed.issues[0].description).toBe('Object with { nested } braces');
    });

    it('throws on invalid JSON', () => {
      const response = 'This is not JSON at all';
      expect(() => (agent as any).parseResponse(response)).toThrow();
    });

    it('validates parsed structure', () => {
      const response = '{"notIssues": [], "summary": "Missing issues array"}';
      expect(() => (agent as any).parseResponse(response)).toThrow();
    });
  });

  describe('thinking config', () => {
    it('uses thinkingBudget when configured', async () => {
      const thinkingAgent = new GeminiProAgent({
        apiKey: mockApiKey,
        thinkingBudget: 1024,
        includeThoughts: true,
      });

      const { GoogleGenAI } = await import('@google/genai');
      const mockInstance = new GoogleGenAI(mockApiKey);
      (mockInstance.models.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: '{"issues": [], "summary": "Clean"}',
        usageMetadata: {},
      });

      (thinkingAgent as any).client = mockInstance;
      await thinkingAgent.initialize();
      await thinkingAgent.review('const x = 1');

      const generateContent = mockInstance.models.generateContent as ReturnType<typeof vi.fn>;
      const callArgs = generateContent.mock.calls[0][0];
      expect(callArgs.config.thinkingConfig.thinkingBudget).toBe(1024);
      expect(callArgs.config.thinkingConfig.includeThoughts).toBe(true);
    });
  });

  describe('dispose', () => {
    it('marks agent as not ready', async () => {
      await agent.initialize();
      expect(agent.isReady()).toBe(true);

      await agent.dispose();
      expect(agent.isReady()).toBe(false);
    });

    it('is idempotent', async () => {
      await agent.initialize();
      await agent.dispose();
      await agent.dispose();
      expect(agent.isReady()).toBe(false);
    });
  });
});
