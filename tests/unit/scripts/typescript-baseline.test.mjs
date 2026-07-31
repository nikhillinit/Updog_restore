/* global console */
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const {
  checkBaseline,
  collectCurrentTypeScriptState,
} = require('../../../scripts/typescript-baseline.cjs');
describe('TypeScript baseline collection', () => {
  it('parses baseline data and detailed errors from one compiler collection', () => {
    const runCompiler = vi.fn(
      () =>
        'server/example.ts(1,7): error TS2322: Type string is not assignable to number.\n'
    );
    const state = collectCurrentTypeScriptState(runCompiler);
    expect(runCompiler).toHaveBeenCalledTimes(1);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toMatchObject({
      code: '2322',
      line: 1,
      col: 7,
    });
    expect(state.baseline.totalErrors).toBe(1);
  });
  it('checks a supplied baseline with one current-state collection', () => {
    const collectState = vi.fn(() => ({
      baseline: {
        version: '2.0.0',
        projects: {
          client: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
          server: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
          shared: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
        },
        totalErrors: 0,
        timestamp: '2026-07-30T00:00:00.000Z',
        buildMode: 'per-project',
        elapsedMs: 1,
      },
      errors: [],
    }));
    const baseline = collectState().baseline;
    collectState.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(checkBaseline({ baseline, collectState })).toBe(0);
    expect(collectState).toHaveBeenCalledTimes(1);
  });
});
