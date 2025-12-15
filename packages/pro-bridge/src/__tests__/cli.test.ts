import { describe, it, expect } from 'vitest';
import { parseArgs, loadConfig, detectLanguage, formatJson, formatText } from '../cli';
import type { ConsensusResult, MergedIssue } from '../types';

describe('CLI', () => {
  describe('parseArgs', () => {
    it('parses file arguments', () => {
      const result = parseArgs(['file1.ts', 'file2.ts']);
      expect(result.files).toEqual(['file1.ts', 'file2.ts']);
      expect(result.help).toBe(false);
    });

    it('parses --help flag', () => {
      const result = parseArgs(['--help']);
      expect(result.help).toBe(true);
    });

    it('parses -h flag', () => {
      const result = parseArgs(['-h']);
      expect(result.help).toBe(true);
    });

    it('parses --output option', () => {
      const result = parseArgs(['--output', 'json', 'file.ts']);
      expect(result.options.output).toBe('json');
      expect(result.files).toEqual(['file.ts']);
    });

    it('parses -o shorthand', () => {
      const result = parseArgs(['-o', 'text', 'file.ts']);
      expect(result.options.output).toBe('text');
    });

    it('parses --providers option', () => {
      const result = parseArgs(['--providers', 'gemini,chatgpt', 'file.ts']);
      expect(result.options.providers).toEqual(['gemini', 'chatgpt']);
    });

    it('parses --min-agreement option', () => {
      const result = parseArgs(['--min-agreement', '0.75', 'file.ts']);
      expect(result.options.minAgreement).toBe(0.75);
    });

    it('parses --severity-resolution option', () => {
      const result = parseArgs(['--severity-resolution', 'min', 'file.ts']);
      expect(result.options.severityResolution).toBe('min');
    });

    it('parses --session-dir option', () => {
      const result = parseArgs(['--session-dir', '/tmp/sessions', 'file.ts']);
      expect(result.options.sessionDir).toBe('/tmp/sessions');
    });

    it('handles mixed options and files', () => {
      const result = parseArgs([
        '-o', 'json',
        'file1.ts',
        '--providers', 'gemini',
        'file2.ts',
      ]);
      expect(result.options.output).toBe('json');
      expect(result.options.providers).toEqual(['gemini']);
      expect(result.files).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('loads defaults', () => {
      const config = loadConfig({});
      expect(config.providers).toEqual(['gemini', 'chatgpt']);
      expect(config.output).toBe('text');
      expect(config.minAgreement).toBe(0.5);
      expect(config.severityResolution).toBe('max');
    });

    it('respects CLI options over defaults', () => {
      const config = loadConfig({
        providers: ['gemini'],
        output: 'json',
        minAgreement: 0.8,
      });
      expect(config.providers).toEqual(['gemini']);
      expect(config.output).toBe('json');
      expect(config.minAgreement).toBe(0.8);
    });

    it('loads API keys from environment', () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const config = loadConfig({});
      expect(config.geminiApiKey).toBe('test-gemini-key');
      expect(config.openaiApiKey).toBe('test-openai-key');
    });

    it('loads session dir from environment', () => {
      process.env.PRO_BRIDGE_SESSION_DIR = '/custom/sessions';

      const config = loadConfig({});
      expect(config.sessionDir).toBe('/custom/sessions');
    });

    it('CLI session-dir overrides environment', () => {
      process.env.PRO_BRIDGE_SESSION_DIR = '/env/sessions';

      const config = loadConfig({ sessionDir: '/cli/sessions' });
      expect(config.sessionDir).toBe('/cli/sessions');
    });
  });

  describe('detectLanguage', () => {
    it('detects TypeScript', () => {
      expect(detectLanguage('file.ts')).toBe('typescript');
      expect(detectLanguage('file.tsx')).toBe('typescript');
    });

    it('detects JavaScript', () => {
      expect(detectLanguage('file.js')).toBe('javascript');
      expect(detectLanguage('file.jsx')).toBe('javascript');
    });

    it('detects Python', () => {
      expect(detectLanguage('file.py')).toBe('python');
    });

    it('detects Go', () => {
      expect(detectLanguage('file.go')).toBe('go');
    });

    it('detects Rust', () => {
      expect(detectLanguage('file.rs')).toBe('rust');
    });

    it('returns unknown for unrecognized extensions', () => {
      expect(detectLanguage('file.xyz')).toBe('unknown');
    });

    it('handles paths with directories', () => {
      expect(detectLanguage('src/components/Button.tsx')).toBe('typescript');
    });
  });

  describe('formatJson', () => {
    it('formats result as JSON', () => {
      const result: ConsensusResult = {
        results: [],
        mergedIssues: [],
        stats: {
          totalProviders: 2,
          agreementRate: 1,
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        },
        summary: 'No issues found.',
        timestamp: 1234567890,
      };

      const json = formatJson(result);
      const parsed = JSON.parse(json);
      expect(parsed.summary).toBe('No issues found.');
      expect(parsed.stats.totalProviders).toBe(2);
    });

    it('includes all issue details', () => {
      const issue: MergedIssue = {
        severity: 'high',
        description: 'Test issue',
        line: 10,
        reportedBy: ['gemini', 'chatgpt'],
        confidence: 1,
        originalSeverities: { gemini: 'high', chatgpt: 'high' },
      };

      const result: ConsensusResult = {
        results: [],
        mergedIssues: [issue],
        stats: {
          totalProviders: 2,
          agreementRate: 1,
          severityCounts: { critical: 0, high: 1, medium: 0, low: 0 },
        },
        summary: '1 issue',
        timestamp: 1234567890,
      };

      const json = formatJson(result);
      const parsed = JSON.parse(json);
      expect(parsed.mergedIssues[0].severity).toBe('high');
      expect(parsed.mergedIssues[0].reportedBy).toEqual(['gemini', 'chatgpt']);
    });
  });

  describe('formatText', () => {
    it('formats empty result', () => {
      const result: ConsensusResult = {
        results: [],
        mergedIssues: [],
        stats: {
          totalProviders: 2,
          agreementRate: 0,
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        },
        summary: 'No issues found by consensus.',
        timestamp: 1234567890,
      };

      const text = formatText(result);
      expect(text).toContain('CODE REVIEW CONSENSUS');
      expect(text).toContain('No issues found.');
      expect(text).toContain('Providers: 2');
    });

    it('formats issues with severity badges', () => {
      const result: ConsensusResult = {
        results: [
          {
            provider: 'gemini',
            model: 'gemini-2.5-pro',
            issues: [{ severity: 'high', description: 'Test' }],
            summary: '1 issue',
            timestamp: 1234567890,
          },
        ],
        mergedIssues: [
          {
            severity: 'high',
            description: 'SQL injection vulnerability',
            line: 42,
            suggestion: 'Use parameterized queries',
            reportedBy: ['gemini'],
            confidence: 0.5,
            originalSeverities: { gemini: 'high' },
          },
        ],
        stats: {
          totalProviders: 2,
          agreementRate: 0,
          severityCounts: { critical: 0, high: 1, medium: 0, low: 0 },
        },
        summary: '1 high severity issue',
        timestamp: 1234567890,
      };

      const text = formatText(result);
      expect(text).toContain('[HIGH]');
      expect(text).toContain('SQL injection vulnerability');
      expect(text).toContain('Line: 42');
      expect(text).toContain('Suggestion: Use parameterized queries');
      expect(text).toContain('50% confidence');
    });

    it('shows provider details', () => {
      const result: ConsensusResult = {
        results: [
          {
            provider: 'gemini',
            model: 'gemini-2.5-pro-preview',
            issues: [{ severity: 'high', description: 'Issue 1' }],
            summary: '1 issue',
            timestamp: 1234567890,
          },
          {
            provider: 'chatgpt',
            model: 'gpt-5.2',
            issues: [],
            summary: 'No issues',
            timestamp: 1234567890,
          },
        ],
        mergedIssues: [],
        stats: {
          totalProviders: 2,
          agreementRate: 0,
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        },
        summary: 'Summary',
        timestamp: 1234567890,
      };

      const text = formatText(result);
      expect(text).toContain('gemini (gemini-2.5-pro-preview): 1 issues');
      expect(text).toContain('chatgpt (gpt-5.2): 0 issues');
    });
  });
});
