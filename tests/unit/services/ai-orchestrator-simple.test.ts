/**
 * Integration tests for AI Orchestrator with OSS tools
 * Tests Vercel AI SDK + Cockatiel integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  callAIProvider,
  estimateCost,
  calculateCost,
  reserveBudget,
  settleBudget,
  voidBudget,
  getBudgetStatus,
  getCircuitBreakerStatus,
} from '../../../server/services/ai-orchestrator-simple';

// Mock environment variables
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.DEEPSEEK_API_KEY = 'test-key';

describe('AI Orchestrator - OSS Integration', () => {
  describe('Cost Estimation', () => {
    it('should estimate cost for premium tier', () => {
      const prompt = 'Test prompt with 100 characters that is long enough to estimate token count properly and accurately';
      const cost = estimateCost(prompt, 'premium');

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1); // Should be less than $1 for this prompt
    });

    it('should estimate cost for standard tier', () => {
      const prompt = 'Short prompt';
      const cost = estimateCost(prompt, 'standard');

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.01); // Should be very cheap for short prompt
    });

    it('should estimate cost for budget tier', () => {
      const prompt = 'Test prompt';
      const cost = estimateCost(prompt, 'budget');

      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.001); // Budget tier is cheapest
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate actual cost from usage metrics', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const config = {
        name: 'openai' as const,
        model: 'gpt-4o-mini',
        tier: 'standard' as const,
        inputPricePerMToken: 0.15,
        outputPricePerMToken: 0.6,
      };

      const cost = calculateCost(usage, config);

      // (1000/1M * 0.15) + (500/1M * 0.6) = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 6);
    });
  });

  describe('Budget Ledger - Reserve/Settle/Void Flow', () => {
    beforeEach(async () => {
      // Clear any existing ledger entries
      const entries = (await import('../../../server/services/ai-orchestrator-simple')).getLedgerEntries();
      entries.length = 0;
    });

    it('should reserve budget successfully', async () => {
      const ledgerKey = await reserveBudget('openai', 0.01, {
        test: 'reservation',
      });

      expect(ledgerKey).toBeDefined();
      expect(typeof ledgerKey).toBe('string');
      expect(ledgerKey).toContain('openai');
    });

    it('should settle budget after reservation', async () => {
      const ledgerKey = await reserveBudget('openai', 0.01);

      await settleBudget(ledgerKey, 0.008); // Actual cost lower than estimated

      const status = await getBudgetStatus();
      expect(status.spentTodayUsd).toBeCloseTo(0.008, 6);
    });

    it('should void budget on failure', async () => {
      const ledgerKey = await reserveBudget('openai', 0.01);

      await voidBudget(ledgerKey, 'Test failure');

      const status = await getBudgetStatus();
      expect(status.spentTodayUsd).toBe(0); // Voided entries don't count
      expect(status.reservedTodayUsd).toBe(0);
    });

    it('should throw error when budget exceeded', async () => {
      // Reserve almost all daily budget
      await reserveBudget('openai', 49.99);

      // Try to reserve more than available
      await expect(
        reserveBudget('openai', 1.00)
      ).rejects.toThrow('Insufficient budget');
    });

    it('should track budget status correctly', async () => {
      const ledgerKey1 = await reserveBudget('openai', 0.10);
      const ledgerKey2 = await reserveBudget('anthropic', 0.20);

      await settleBudget(ledgerKey1, 0.08);
      // ledgerKey2 still reserved

      const status = await getBudgetStatus();
      expect(status.dailyLimitUsd).toBe(50);
      expect(status.spentTodayUsd).toBeCloseTo(0.08, 6);
      expect(status.reservedTodayUsd).toBeCloseTo(0.20, 6);
      expect(status.availableBudgetUsd).toBeCloseTo(49.72, 6);
    });
  });

  describe('Circuit Breaker Status', () => {
    it('should return circuit breaker status for all providers', () => {
      const status = getCircuitBreakerStatus();

      expect(status).toHaveProperty('anthropic');
      expect(status).toHaveProperty('openai');
      expect(status).toHaveProperty('deepseek');

      expect(status.anthropic.status).toBe('closed');
      expect(status.anthropic.failureCount).toBe(0);
    });
  });

  describe('Provider Configuration', () => {
    it('should have deepseek-reasoner configured', async () => {
      const { PROVIDERS } = await import('../../../server/services/ai-orchestrator-simple');

      expect(PROVIDERS).toHaveProperty('deepseek-reasoner');
      expect(PROVIDERS['deepseek-reasoner'].tier).toBe('premium');
      expect(PROVIDERS['deepseek-reasoner'].model).toBe('deepseek-reasoner');
    });

    it('should have all required providers', async () => {
      const { PROVIDERS } = await import('../../../server/services/ai-orchestrator-simple');

      expect(PROVIDERS).toHaveProperty('claude-3-5-sonnet');
      expect(PROVIDERS).toHaveProperty('gpt-4o-mini');
      expect(PROVIDERS).toHaveProperty('deepseek-chat');
      expect(PROVIDERS).toHaveProperty('deepseek-reasoner');
    });
  });
});

describe('AI Provider Calls (Integration)', () => {
  it.skip('should call OpenAI successfully (requires real API key)', async () => {
    // This test requires a real API key and costs money
    // Run manually with: OPENAI_API_KEY=<key> npm test

    if (!process.env.OPENAI_API_KEY?.startsWith('sk-')) {
      return;
    }

    const result = await callAIProvider(
      'Say "Hello, World!" and nothing else.',
      'gpt-4o-mini'
    );

    expect(result.text).toContain('Hello');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.actualCostUsd).toBeGreaterThan(0);
    expect(result.ledgerKey).toBeDefined();
  });

  it.skip('should call Anthropic successfully (requires real API key)', async () => {
    if (!process.env.ANTHROPIC_API_KEY?.startsWith('sk-')) {
      return;
    }

    const result = await callAIProvider(
      'Say "Hello, World!" and nothing else.',
      'claude-3-5-sonnet'
    );

    expect(result.text).toContain('Hello');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.actualCostUsd).toBeGreaterThan(0);
  });

  it.skip('should call DeepSeek Reasoner successfully (requires real API key)', async () => {
    if (!process.env.DEEPSEEK_API_KEY) {
      return;
    }

    const result = await callAIProvider(
      'Solve: What is 2 + 2?',
      'deepseek-reasoner'
    );

    expect(result.text).toContain('4');
    expect(result.model).toBe('deepseek-reasoner');
    expect(result.provider).toBe('deepseek');
  });
});
