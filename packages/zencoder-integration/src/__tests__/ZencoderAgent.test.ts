import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZencoderAgent } from '../ZencoderAgent';
import type { ZencoderInput } from '../ZencoderAgent';

describe('ZencoderAgent', () => {
  let agent: ZencoderAgent;

  beforeEach(() => {
    agent = new ZencoderAgent({
      name: 'test-zencoder-agent',
      maxRetries: 1,
      timeout: 10000,
    });
  });

  describe('instantiation', () => {
    it('should create an instance of ZencoderAgent', () => {
      expect(agent).toBeInstanceOf(ZencoderAgent);
    });

    it('should accept custom configuration', () => {
      const customAgent = new ZencoderAgent({
        name: 'custom-agent',
        maxRetries: 5,
        timeout: 60000,
        logLevel: 'debug',
      });
      expect(customAgent).toBeInstanceOf(ZencoderAgent);
    });
  });

  describe('execute method', () => {
    it('should execute with minimal input (dry-run)', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'typescript-fix',
        maxFixes: 0, // Don't actually fix anything
      };

      const result = await agent.execute(input);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.context.agent).toBe('test-zencoder-agent');
    });

    it('should handle test-fix task', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'test-fix',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data?.task).toBe('test-fix');
    });

    it('should handle eslint-fix task', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'eslint-fix',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data?.task).toBe('eslint-fix');
    });

    it('should handle dependency-update task', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'dependency-update',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data?.task).toBe('dependency-update');
    });

    it('should include execution metrics', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'typescript-fix',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.duration).toBeGreaterThan(0);
      expect(result.retries).toBeGreaterThanOrEqual(0);
      expect(result.context.runId).toBeDefined();
      expect(result.context.timestamp).toBeDefined();
    });

    it('should handle targetFiles parameter', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'eslint-fix',
        targetFiles: ['src/index.ts'],
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle context parameter', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'typescript-fix',
        maxFixes: 0,
        context: {
          branch: 'feature/test',
          pr: 123,
        },
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
    });
  });

  describe('result structure', () => {
    it('should return proper result structure', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'typescript-fix',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.data).toHaveProperty('task');
      expect(result.data).toHaveProperty('filesAnalyzed');
      expect(result.data).toHaveProperty('filesFixed');
      expect(result.data).toHaveProperty('fixes');
      expect(result.data).toHaveProperty('summary');
      expect(result.data).toHaveProperty('timeMs');

      expect(Array.isArray(result.data?.fixes)).toBe(true);
      expect(typeof result.data?.filesAnalyzed).toBe('number');
      expect(typeof result.data?.filesFixed).toBe('number');
      expect(typeof result.data?.summary).toBe('string');
      expect(typeof result.data?.timeMs).toBe('number');
    });

    it('should return empty fixes array when maxFixes is 0', async () => {
      const input: ZencoderInput = {
        projectRoot: process.cwd(),
        task: 'typescript-fix',
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.data?.fixes).toEqual([]);
      expect(result.data?.filesFixed).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid task type', async () => {
      const input = {
        projectRoot: process.cwd(),
        task: 'invalid-task' as any,
        maxFixes: 0,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should respect maxRetries configuration', async () => {
      const retryAgent = new ZencoderAgent({
        name: 'retry-test-agent',
        maxRetries: 0,
      });

      const input = {
        projectRoot: process.cwd(),
        task: 'invalid-task' as any,
        maxFixes: 0,
      };

      const result = await retryAgent.execute(input);

      expect(result.success).toBe(false);
      expect(result.retries).toBe(0);
    });
  });

  describe('API configuration', () => {
    it('should use environment variables for API configuration', () => {
      const originalApiKey = process.env['ZENCODER_API_KEY'];
      const originalEndpoint = process.env['ZENCODER_ENDPOINT'];

      process.env['ZENCODER_API_KEY'] = 'test-key';
      process.env['ZENCODER_ENDPOINT'] = 'https://test.api.com';

      const configuredAgent = new ZencoderAgent({
        name: 'configured-agent',
      });

      expect(configuredAgent).toBeInstanceOf(ZencoderAgent);

      // Restore original values
      if (originalApiKey) {
        process.env['ZENCODER_API_KEY'] = originalApiKey;
      } else {
        delete process.env['ZENCODER_API_KEY'];
      }
      if (originalEndpoint) {
        process.env['ZENCODER_ENDPOINT'] = originalEndpoint;
      } else {
        delete process.env['ZENCODER_ENDPOINT'];
      }
    });
  });
});
