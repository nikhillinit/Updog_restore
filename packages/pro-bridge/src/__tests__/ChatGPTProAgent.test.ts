import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatGPTProAgent } from '../ChatGPTProAgent';
import type { ReviewContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create mock instance that will be reused
const createMockStagehand = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  page: {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://chatgpt.com/'),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(false), // Not generating
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
    },
  },
  act: vi.fn().mockResolvedValue(undefined),
  extract: vi.fn().mockResolvedValue({
    response: '{"issues": [], "summary": "Clean"}',
    hasCode: false,
  }),
  close: vi.fn().mockResolvedValue(undefined),
});

let mockStagehandInstance = createMockStagehand();

// Mock @browserbasehq/stagehand
vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => mockStagehandInstance),
}));

describe('ChatGPTProAgent', () => {
  let agent: ChatGPTProAgent;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStagehandInstance = createMockStagehand();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
    agent = new ChatGPTProAgent({
      sessionDir: tempDir,
      openaiApiKey: 'test-openai-key',
    });
  });

  afterEach(async () => {
    await agent.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('sets provider and model correctly', () => {
      expect(agent.provider).toBe('chatgpt');
      expect(agent.model).toBe('gpt-5.2');
    });

    it('allows custom model override', () => {
      const customAgent = new ChatGPTProAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
        model: 'gpt-4-turbo',
      });
      expect(customAgent.model).toBe('gpt-4-turbo');
    });
  });

  describe('session lock', () => {
    it('creates lock file on initialize', async () => {
      await agent.initialize();
      const lockPath = path.join(tempDir, 'bridge.lock');
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('prevents concurrent sessions', async () => {
      await agent.initialize();

      const agent2 = new ChatGPTProAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
      });

      await expect(agent2.initialize()).rejects.toThrow('session already running');
    });

    it('removes stale lock files', async () => {
      // Create a stale lock file (old timestamp, non-existent PID)
      const lockPath = path.join(tempDir, 'bridge.lock');
      fs.writeFileSync(lockPath, JSON.stringify({
        pid: 99999999, // Non-existent PID
        createdAt: Date.now() - 60 * 60 * 1000, // 1 hour old
      }));

      // Should be able to initialize despite stale lock
      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });

    it('releases lock on dispose', async () => {
      await agent.initialize();
      const lockPath = path.join(tempDir, 'bridge.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      await agent.dispose();
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('initialize', () => {
    it('initializes Stagehand browser', async () => {
      const { Stagehand } = await import('@browserbasehq/stagehand');
      await agent.initialize();

      expect(Stagehand).toHaveBeenCalledWith(
        expect.objectContaining({
          env: 'LOCAL',
          modelName: 'gpt-4o',
          modelApiKey: 'test-openai-key',
        })
      );
    });

    it('marks agent as ready after auth check', async () => {
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
    const mockExtractResult = {
      response: JSON.stringify({
        issues: [
          {
            severity: 'high',
            description: 'Potential XSS vulnerability',
            line: 10,
            suggestion: 'Sanitize user input',
          },
        ],
        summary: 'Found 1 security issue',
      }),
      hasCode: false,
    };

    beforeEach(async () => {
      mockStagehandInstance.extract.mockResolvedValue(mockExtractResult);
      await agent.initialize();
    });

    it('throws if not initialized', async () => {
      const uninitAgent = new ChatGPTProAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
      });
      await expect(uninitAgent.review('const x = 1')).rejects.toThrow('not initialized');
    });

    it('returns structured ReviewResult', async () => {
      const result = await agent.review('const html = "<div>" + userInput + "</div>"');

      expect(result.provider).toBe('chatgpt');
      expect(result.model).toBe('gpt-5.2');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('high');
      expect(result.summary).toBe('Found 1 security issue');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('navigates to ChatGPT and submits prompt', async () => {
      await agent.review('const x = 1');

      expect(mockStagehandInstance.page.goto).toHaveBeenCalled();
      expect(mockStagehandInstance.act).toHaveBeenCalled();
    });

    it('applies review context to prompt', async () => {
      const context: ReviewContext = {
        filePath: 'src/components/Form.tsx',
        language: 'typescript',
        focusAreas: ['security', 'bugs'],
      };

      await agent.review('const x = 1', context);

      // Verify the prompt was built with context
      const actCalls = mockStagehandInstance.act.mock.calls;
      const promptCall = actCalls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('type')
      );
      expect(promptCall).toBeDefined();
    });
  });

  describe('parseResponse', () => {
    it('extracts JSON from markdown code blocks', () => {
      const response = '```json\n{"issues": [], "summary": "Clean"}\n```';
      const parsed = (agent as any).parseResponse(response);
      expect(parsed.issues).toEqual([]);
      expect(parsed.summary).toBe('Clean');
    });

    it('handles nested braces correctly', () => {
      const response = `{"issues": [{"severity": "high", "description": "Object with { nested } braces"}], "summary": "Done"}`;
      const parsed = (agent as any).parseResponse(response);
      expect(parsed.issues[0].description).toBe('Object with { nested } braces');
    });

    it('throws on invalid response', () => {
      const response = 'This is not JSON';
      expect(() => (agent as any).parseResponse(response)).toThrow();
    });
  });

  describe('dispose', () => {
    it('closes Stagehand browser', async () => {
      await agent.initialize();
      await agent.dispose();

      expect(mockStagehandInstance.close).toHaveBeenCalled();
    });

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

  describe('authentication', () => {
    it('detects logged-in state from URL', async () => {
      mockStagehandInstance.page.url.mockReturnValue('https://chatgpt.com/');
      await agent.initialize();

      expect(agent.isReady()).toBe(true);
    });

    it('handles login redirect', async () => {
      // Simulate login page redirect
      mockStagehandInstance.page.url.mockReturnValue('https://auth0.openai.com/login');

      // Should still initialize but may need manual login
      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });
  });
});
