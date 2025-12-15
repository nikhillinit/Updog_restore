import { describe, it, expect } from 'vitest';
import {
  ReviewIssueSchema,
  ReviewResultSchema,
  DEFAULT_CONSENSUS_CONFIG,
} from '../types';

describe('ReviewIssueSchema', () => {
  it('validates a complete issue', () => {
    const issue = {
      severity: 'high',
      description: 'Potential SQL injection vulnerability',
      line: 42,
      file: 'src/api/users.ts',
      suggestion: 'Use parameterized queries',
    };

    const result = ReviewIssueSchema.safeParse(issue);
    expect(result.success).toBe(true);
  });

  it('validates a minimal issue', () => {
    const issue = {
      severity: 'low',
      description: 'Consider using const instead of let',
    };

    const result = ReviewIssueSchema.safeParse(issue);
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const issue = {
      severity: 'super-critical',
      description: 'Some issue',
    };

    const result = ReviewIssueSchema.safeParse(issue);
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const issue = {
      severity: 'medium',
      description: '',
    };

    const result = ReviewIssueSchema.safeParse(issue);
    expect(result.success).toBe(false);
  });

  it('rejects negative line numbers', () => {
    const issue = {
      severity: 'medium',
      description: 'Some issue',
      line: -5,
    };

    const result = ReviewIssueSchema.safeParse(issue);
    expect(result.success).toBe(false);
  });
});

describe('ReviewResultSchema', () => {
  it('validates a complete result', () => {
    const result = {
      provider: 'gemini',
      model: 'gemini-2.5-pro-preview',
      issues: [
        { severity: 'high', description: 'Security issue' },
        { severity: 'low', description: 'Style issue' },
      ],
      summary: 'Found 2 issues',
      timestamp: Date.now(),
      tokenUsage: {
        input: 1000,
        output: 500,
        thinking: 2000,
      },
      raw: '{"original": "response"}',
    };

    const parsed = ReviewResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('validates a minimal result', () => {
    const result = {
      provider: 'chatgpt',
      model: 'gpt-5.2',
      issues: [],
      summary: 'No issues found',
      timestamp: Date.now(),
    };

    const parsed = ReviewResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('rejects missing provider', () => {
    const result = {
      model: 'gpt-5.2',
      issues: [],
      summary: 'No issues found',
      timestamp: Date.now(),
    };

    const parsed = ReviewResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });
});

describe('DEFAULT_CONSENSUS_CONFIG', () => {
  it('has reasonable defaults', () => {
    expect(DEFAULT_CONSENSUS_CONFIG.minAgreement).toBe(0.5);
    expect(DEFAULT_CONSENSUS_CONFIG.severityResolution).toBe('max');
    expect(DEFAULT_CONSENSUS_CONFIG.timeoutMs).toBe(120000);
  });
});
