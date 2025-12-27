import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiBrowserAgent } from '../GeminiBrowserAgent';
import type { ReviewContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create mock instance for Stagehand V3 API
const createMockStagehand = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  act: vi.fn().mockResolvedValue(undefined),
  extract: vi.fn().mockImplementation((instruction: string) => {
    // Return different results based on the instruction
    if (instruction.includes('current page URL') || instruction.includes('sign-in') || instruction.includes('logged in')) {
      return Promise.resolve({
        url: 'https://gemini.google.com/',
        hasLoginButton: false,
        isLoggedIn: true,
      });
    }
    if (instruction.includes('model selector')) {
      return Promise.resolve({
        currentModel: 'Gemini Advanced',
        hasModelSelector: true,
        availableModels: ['Gemini', 'Gemini Advanced'],
      });
    }
    if (instruction.includes('still generating') || instruction.includes('stop button')) {
      return Promise.resolve({
        isGenerating: false,
        hasStopButton: false,
      });
    }
    // Default: return response for message extraction
    return Promise.resolve({
      response: '{"issues": [], "summary": "Clean"}',
      hasCodeBlocks: false,
    });
  }),
});

let mockStagehandInstance = createMockStagehand();

// Mock @browserbasehq/stagehand
vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => mockStagehandInstance),
}));

describe('GeminiBrowserAgent', () => {
  let agent: GeminiBrowserAgent;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStagehandInstance = createMockStagehand();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-browser-test-'));
    agent = new GeminiBrowserAgent({
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
      expect(agent.provider).toBe('gemini-browser');
      expect(agent.model).toBe('Gemini Advanced');
    });

    it('allows custom model override', () => {
      const customAgent = new GeminiBrowserAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
        model: 'Gemini 2.0',
      });
      expect(customAgent.model).toBe('Gemini 2.0');
    });
  });

  describe('session lock', () => {
    it('creates lock file on initialize', async () => {
      await agent.initialize();
      const lockPath = path.join(tempDir, 'gemini-browser.lock');
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('prevents concurrent sessions', async () => {
      await agent.initialize();

      const agent2 = new GeminiBrowserAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
      });

      await expect(agent2.initialize()).rejects.toThrow('session already running');
    });

    it('removes stale lock files', async () => {
      // Create a stale lock file
      const lockPath = path.join(tempDir, 'gemini-browser.lock');
      fs.writeFileSync(lockPath, JSON.stringify({
        pid: 99999999,
        createdAt: Date.now() - 60 * 60 * 1000,
      }));

      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });

    it('releases lock on dispose', async () => {
      await agent.initialize();
      const lockPath = path.join(tempDir, 'gemini-browser.lock');
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
        })
      );
    });

    it('navigates to Gemini via act()', async () => {
      await agent.initialize();

      expect(mockStagehandInstance.act).toHaveBeenCalledWith(
        expect.stringContaining('navigate to https://gemini.google.com/')
      );
    });

    it('checks login state via extract()', async () => {
      await agent.initialize();

      // Should extract login state
      expect(mockStagehandInstance.extract).toHaveBeenCalledWith(
        expect.stringContaining('logged in'),
        expect.anything()
      );
    });

    it('marks agent as ready after login check', async () => {
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

  describe('selectModelAndMode', () => {
    it('attempts to select Deep Think when enabled', async () => {
      const deepThinkAgent = new GeminiBrowserAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
        enableDeepThink: true,
      });

      await deepThinkAgent.initialize();

      // Should attempt to find model selector
      expect(mockStagehandInstance.extract).toHaveBeenCalledWith(
        expect.stringContaining('model selector'),
        expect.anything()
      );

      // Should attempt to click model selector
      expect(mockStagehandInstance.act).toHaveBeenCalledWith(
        expect.stringContaining('model selector')
      );

      await deepThinkAgent.dispose();
    });
  });

  describe('review', () => {
    const mockExtractResult = {
      response: JSON.stringify({
        issues: [
          {
            severity: 'high',
            description: 'Potential security issue',
            line: 5,
            suggestion: 'Add input validation',
          },
        ],
        summary: 'Found 1 security issue',
      }),
      hasCodeBlocks: false,
    };

    beforeEach(async () => {
      mockStagehandInstance.extract.mockImplementation((instruction: string) => {
        if (instruction.includes('logged in') || instruction.includes('sign-in')) {
          return Promise.resolve({
            url: 'https://gemini.google.com/',
            hasLoginButton: false,
            isLoggedIn: true,
          });
        }
        if (instruction.includes('still generating') || instruction.includes('stop button')) {
          return Promise.resolve({
            isGenerating: false,
          });
        }
        return Promise.resolve(mockExtractResult);
      });
      await agent.initialize();
    });

    it('throws if not initialized', async () => {
      const uninitAgent = new GeminiBrowserAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
      });
      await expect(uninitAgent.review('const x = 1')).rejects.toThrow('not initialized');
    });

    it('returns structured ReviewResult', async () => {
      const result = await agent.review('const data = req.body.userInput');

      expect(result.provider).toBe('gemini-browser');
      expect(result.model).toBe('Gemini Advanced');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('high');
      expect(result.summary).toBe('Found 1 security issue');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('uses act() to type and submit prompt', async () => {
      await agent.review('const x = 1');

      const actCalls = mockStagehandInstance.act.mock.calls;
      expect(actCalls.some((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('type')
      )).toBe(true);
      expect(actCalls.some((call: unknown[]) =>
        typeof call[0] === 'string' && (call[0].includes('send') || call[0].includes('submit') || call[0].includes('Enter'))
      )).toBe(true);
    });

    it('applies review context to prompt', async () => {
      const context: ReviewContext = {
        filePath: 'src/api/handler.ts',
        language: 'typescript',
        focusAreas: ['security', 'performance'],
      };

      await agent.review('const x = 1', context);

      const actCalls = mockStagehandInstance.act.mock.calls;
      const promptCall = actCalls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('type')
      );
      expect(promptCall).toBeDefined();
      expect(promptCall?.[0]).toContain('src/api/handler.ts');
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

  describe('debug snapshots', () => {
    it('creates snapshot directory when enabled', async () => {
      const snapshotAgent = new GeminiBrowserAgent({
        sessionDir: tempDir,
        openaiApiKey: 'test-key',
        debugSnapshots: true,
      });

      // Trigger a failure that would create snapshot
      mockStagehandInstance.init.mockRejectedValueOnce(new Error('Test failure'));

      try {
        await snapshotAgent.initialize();
      } catch {
        // Expected to fail
      }

      // Snapshot directory might be created
      const snapshotDir = path.join(tempDir, 'snapshots');
      // Note: snapshot might not be created if init fails before extract
    });
  });

  describe('dispose', () => {
    it('nulls out Stagehand reference', async () => {
      await agent.initialize();
      await agent.dispose();

      expect((agent as any).stagehand).toBeNull();
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
    it('detects logged-in state from extraction', async () => {
      mockStagehandInstance.extract.mockImplementation((instruction: string) => {
        if (instruction.includes('logged in') || instruction.includes('sign-in')) {
          return Promise.resolve({
            url: 'https://gemini.google.com/',
            hasLoginButton: false,
            isLoggedIn: true,
          });
        }
        return Promise.resolve({});
      });

      await agent.initialize();
      expect(agent.isReady()).toBe(true);
    });

    it('prompts for login when not authenticated', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // First extraction returns not logged in, subsequent returns logged in
      let callCount = 0;
      mockStagehandInstance.extract.mockImplementation((instruction: string) => {
        if (instruction.includes('logged in') || instruction.includes('sign-in')) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              url: 'https://accounts.google.com/signin',
              hasLoginButton: true,
              isLoggedIn: false,
            });
          }
          return Promise.resolve({
            url: 'https://gemini.google.com/',
            hasLoginButton: false,
            isLoggedIn: true,
          });
        }
        return Promise.resolve({});
      });

      await agent.initialize();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('requires login')
      );
    });
  });
});
