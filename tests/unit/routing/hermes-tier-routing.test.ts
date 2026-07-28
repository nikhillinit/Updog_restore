import { describe, expect, test } from 'vitest';

import { parseArgs } from '../../../orchestrate.js';

describe('model roster expansion', () => {
  test.each([
    ['--sol', 'sol'],
    ['--luna', 'luna'],
    ['--terra', 'terra'],
    ['--qwen', 'qwen'],
  ])('%s sets manualModel %s', (flag, model) => {
    const options = parseArgs([flag, '--task', 'demo task']);
    expect(options.manualModel).toBe(model);
  });

  test('--model accepts the new names', () => {
    const options = parseArgs(['--model', 'terra', '--task', 'demo task']);
    expect(options.manualModel).toBe('terra');
  });

  test('--model rejects unknown names', () => {
    expect(() => parseArgs(['--model', 'gpt6', '--task', 'demo task'])).toThrow(/Unknown model/);
  });
});

import { classifyTier } from '../../../orchestrate.js';

const tierRouting = {
  tiers: {
    T0: {
      label: 'trivial',
      keywords: [
        { phrase: 'fix typo', weight: 3 },
        { phrase: 'rename', weight: 3 },
        { phrase: 'reformat', weight: 3 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'qwen',
        production: 'qwen',
        distribution: 'qwen',
      },
      review: 'none',
    },
    T2: {
      label: 'complex',
      keywords: [
        { phrase: 'multi-module', weight: 4 },
        { phrase: 'architecture', weight: 3 },
        { phrase: 'race condition', weight: 4 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa',
    },
    T3: {
      label: 'critical',
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa-strict',
    },
  },
};

describe('classifyTier', () => {
  test('explicit tier flag wins over keywords', () => {
    const result = classifyTier('fix typo in README', tierRouting, 'T2');
    expect(result).toEqual({ tier: 'T2', source: 'flag', matched: [] });
  });

  test('keyword match selects T0', () => {
    const result = classifyTier('fix typo in the settings page', tierRouting, null);
    expect(result.tier).toBe('T0');
    expect(result.source).toBe('keyword');
    expect(result.matched).toContain('fix typo');
  });

  test('keyword match selects T2', () => {
    const result = classifyTier('untangle race condition in queue worker', tierRouting, null);
    expect(result.tier).toBe('T2');
  });

  test('higher tier wins when both match', () => {
    const result = classifyTier('reformat the multi-module architecture docs', tierRouting, null);
    expect(result.tier).toBe('T2');
  });

  test('no match defaults to T1', () => {
    const result = classifyTier('add pagination to funds endpoint', tierRouting, null);
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });

  test('T3 is never keyword-assigned (no keywords configured)', () => {
    const result = classifyTier('critical urgent important', tierRouting, null);
    expect(result.tier).toBe('T1');
  });

  test('invalid explicit tier throws', () => {
    expect(() => classifyTier('demo', tierRouting, 'T9')).toThrow(/Unknown tier/);
  });

  test('missing tiers config defaults to T1', () => {
    const result = classifyTier('anything at all', {}, null);
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });
});

describe('parseArgs --tier', () => {
  test('accepts valid tier', () => {
    const options = parseArgs(['--tier', 'T2', '--task', 'demo task']);
    expect(options.tier).toBe('T2');
  });

  test('rejects invalid tier', () => {
    expect(() => parseArgs(['--tier', 'T5', '--task', 'demo task'])).toThrow(/Unknown tier/);
  });

  test('defaults to null', () => {
    const options = parseArgs(['--task', 'demo task']);
    expect(options.tier).toBeNull();
  });
});
