import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsensusOrchestrator } from '../ConsensusOrchestrator';
import type { ReviewModel, ReviewResult, ReviewIssue, ConsensusConfig } from '../types';

// Mock ReviewModel implementation
const createMockModel = (provider: string, model: string): ReviewModel => ({
  provider,
  model,
  initialize: vi.fn().mockResolvedValue(undefined),
  review: vi.fn().mockResolvedValue({
    provider,
    model,
    issues: [],
    summary: 'No issues found',
    timestamp: Date.now(),
  } as ReviewResult),
  isReady: vi.fn().mockReturnValue(true),
  dispose: vi.fn().mockResolvedValue(undefined),
});

describe('ConsensusOrchestrator', () => {
  let orchestrator: ConsensusOrchestrator;
  let mockGemini: ReviewModel;
  let mockChatGPT: ReviewModel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGemini = createMockModel('gemini', 'gemini-2.5-pro-preview');
    mockChatGPT = createMockModel('chatgpt', 'gpt-5.2');
    orchestrator = new ConsensusOrchestrator([mockGemini, mockChatGPT]);
  });

  describe('constructor', () => {
    it('stores providers', () => {
      expect(orchestrator.providers).toHaveLength(2);
    });

    it('accepts custom config', () => {
      const customConfig: ConsensusConfig = {
        minAgreement: 0.75,
        severityResolution: 'min',
        timeoutMs: 60000,
      };
      const custom = new ConsensusOrchestrator([mockGemini], customConfig);
      expect(custom.config.minAgreement).toBe(0.75);
    });
  });

  describe('initialize', () => {
    it('initializes all providers', async () => {
      await orchestrator.initialize();

      expect(mockGemini.initialize).toHaveBeenCalled();
      expect(mockChatGPT.initialize).toHaveBeenCalled();
    });

    it('is idempotent', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(mockGemini.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('review', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('calls all providers', async () => {
      await orchestrator.review('const x = 1');

      expect(mockGemini.review).toHaveBeenCalledWith('const x = 1', undefined);
      expect(mockChatGPT.review).toHaveBeenCalledWith('const x = 1', undefined);
    });

    it('returns consensus result with all provider results', async () => {
      const result = await orchestrator.review('const x = 1');

      expect(result.results).toHaveLength(2);
      expect(result.results[0].provider).toBe('gemini');
      expect(result.results[1].provider).toBe('chatgpt');
    });

    it('passes context to all providers', async () => {
      const context = { filePath: 'test.ts', language: 'typescript' };
      await orchestrator.review('const x = 1', context);

      expect(mockGemini.review).toHaveBeenCalledWith('const x = 1', context);
      expect(mockChatGPT.review).toHaveBeenCalledWith('const x = 1', context);
    });
  });

  describe('issue merging', () => {
    it('deduplicates identical issues', async () => {
      const sharedIssue: ReviewIssue = {
        severity: 'high',
        description: 'SQL injection vulnerability',
        line: 10,
      };

      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [sharedIssue],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [sharedIssue],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // Should merge into 1 issue, not 2
      expect(result.mergedIssues).toHaveLength(1);
      expect(result.mergedIssues[0].reportedBy).toContain('gemini');
      expect(result.mergedIssues[0].reportedBy).toContain('chatgpt');
      expect(result.mergedIssues[0].confidence).toBe(1); // 2/2 providers
    });

    it('keeps unique issues separate', async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [{ severity: 'high', description: 'Issue A' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [{ severity: 'medium', description: 'Issue B' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      expect(result.mergedIssues).toHaveLength(2);
    });

    it('merges similar issues by description (ignoring severity)', async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [{ severity: 'high', description: 'Memory leak detected' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [{ severity: 'medium', description: 'Memory leak detected' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // Should merge by description, not severity
      expect(result.mergedIssues).toHaveLength(1);
      expect(result.mergedIssues[0].originalSeverities).toEqual({
        gemini: 'high',
        chatgpt: 'medium',
      });
    });
  });

  describe('severity resolution', () => {
    const setupDifferentSeverities = async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [{ severity: 'critical', description: 'Same issue' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [{ severity: 'medium', description: 'Same issue' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });
    };

    it('uses max severity by default', async () => {
      await setupDifferentSeverities();
      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      expect(result.mergedIssues[0].severity).toBe('critical');
    });

    it('uses min severity when configured', async () => {
      orchestrator = new ConsensusOrchestrator([mockGemini, mockChatGPT], {
        minAgreement: 0.5,
        severityResolution: 'min',
        timeoutMs: 60000,
      });

      await setupDifferentSeverities();
      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      expect(result.mergedIssues[0].severity).toBe('medium');
    });
  });

  describe('severity counting', () => {
    it('initializes all severity counts to 0 (no NaN)', async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [{ severity: 'high', description: 'One issue' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [],
        summary: 'No issues',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // All counts should be numbers, not NaN or undefined
      expect(result.stats.severityCounts.critical).toBe(0);
      expect(result.stats.severityCounts.high).toBe(1);
      expect(result.stats.severityCounts.medium).toBe(0);
      expect(result.stats.severityCounts.low).toBe(0);

      // Verify none are NaN
      expect(Number.isNaN(result.stats.severityCounts.critical)).toBe(false);
      expect(Number.isNaN(result.stats.severityCounts.high)).toBe(false);
      expect(Number.isNaN(result.stats.severityCounts.medium)).toBe(false);
      expect(Number.isNaN(result.stats.severityCounts.low)).toBe(false);
    });

    it('counts merged issues correctly', async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [
          { severity: 'critical', description: 'Critical bug' },
          { severity: 'high', description: 'High issue' },
          { severity: 'low', description: 'Minor thing' },
        ],
        summary: '3 issues',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [
          { severity: 'critical', description: 'Critical bug' }, // Same as Gemini
          { severity: 'medium', description: 'Medium issue' },
        ],
        summary: '2 issues',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // 4 unique issues after merging
      expect(result.mergedIssues).toHaveLength(4);
      expect(result.stats.severityCounts.critical).toBe(1);
      expect(result.stats.severityCounts.high).toBe(1);
      expect(result.stats.severityCounts.medium).toBe(1);
      expect(result.stats.severityCounts.low).toBe(1);
    });
  });

  describe('agreement filtering', () => {
    it('filters issues below minAgreement threshold', async () => {
      // Add a third mock provider
      const mockClaude = createMockModel('claude', 'claude-3.5-sonnet');
      orchestrator = new ConsensusOrchestrator(
        [mockGemini, mockChatGPT, mockClaude],
        { minAgreement: 0.67, severityResolution: 'max', timeoutMs: 60000 }
      );

      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [
          { severity: 'high', description: 'Agreed issue' },
          { severity: 'low', description: 'Only Gemini sees this' },
        ],
        summary: '2 issues',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [{ severity: 'high', description: 'Agreed issue' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      (mockClaude.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'claude',
        model: 'claude-3.5-sonnet',
        issues: [{ severity: 'high', description: 'Agreed issue' }],
        summary: '1 issue',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // Only the agreed issue (3/3 = 100%) should remain
      // The "Only Gemini sees this" (1/3 = 33%) is below 67% threshold
      expect(result.mergedIssues).toHaveLength(1);
      expect(result.mergedIssues[0].description).toBe('Agreed issue');
    });
  });

  describe('stats calculation', () => {
    it('calculates agreement rate correctly', async () => {
      (mockGemini.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-2.5-pro-preview',
        issues: [
          { severity: 'high', description: 'Both see this' },
          { severity: 'low', description: 'Only Gemini' },
        ],
        summary: '2 issues',
        timestamp: Date.now(),
      });

      (mockChatGPT.review as ReturnType<typeof vi.fn>).mockResolvedValue({
        provider: 'chatgpt',
        model: 'gpt-5.2',
        issues: [
          { severity: 'high', description: 'Both see this' },
          { severity: 'medium', description: 'Only ChatGPT' },
        ],
        summary: '2 issues',
        timestamp: Date.now(),
      });

      await orchestrator.initialize();
      const result = await orchestrator.review('code');

      // 3 unique issues, 1 agreed by both = 33% agreement
      expect(result.stats.totalProviders).toBe(2);
      expect(result.stats.agreementRate).toBeCloseTo(0.33, 1);
    });
  });

  describe('dispose', () => {
    it('disposes all providers', async () => {
      await orchestrator.initialize();
      await orchestrator.dispose();

      expect(mockGemini.dispose).toHaveBeenCalled();
      expect(mockChatGPT.dispose).toHaveBeenCalled();
    });
  });
});
