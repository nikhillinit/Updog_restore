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
