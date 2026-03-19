/**
 * Characterization tests for toFundCreationPayload / toEngineGraduationRates
 *
 * Safety harness for ESLint Wave 0.5: captures current behavior so refactoring
 * in later waves does not silently change output shapes or clamping semantics.
 */
import { describe, it, expect } from 'vitest';
import {
  toFundCreationPayload,
  toEngineGraduationRates,
} from '../../../client/src/core/reserves/adapter/toEngineGraduationRates';

describe('toFundCreationPayload (characterization)', () => {
  it('clamps graduate and exit to [0, 100]', () => {
    const result = toFundCreationPayload({
      stages: [{ id: 's1', name: 'Seed', graduate: 150, exit: -10, months: 18 }],
    });

    const stage = result.strategy.stages[0];
    expect(stage).toBeDefined();
    expect(stage!.graduate).toBe(100);
    expect(stage!.exit).toBe(0);
  });

  it('clamps months to [1, 120]', () => {
    const result = toFundCreationPayload({
      stages: [
        { id: 's1', name: 'A', graduate: 30, exit: 20, months: 0 },
        { id: 's2', name: 'B', graduate: 30, exit: 20, months: 999 },
      ],
    });

    expect(result.strategy.stages[0]!.months).toBe(1);
    expect(result.strategy.stages[1]!.months).toBe(120);
  });

  it('handles NaN inputs gracefully', () => {
    const result = toFundCreationPayload({
      stages: [{ id: 's1', name: 'Seed', graduate: 'not-a-number', exit: undefined, months: null }],
    });

    const stage = result.strategy.stages[0];
    expect(stage).toBeDefined();
    expect(stage!.graduate).toBe(0);
    expect(stage!.exit).toBe(0);
    expect(stage!.months).toBe(1); // clampInt(NaN, 1, 120) => 1
  });

  it('reads stages from input.strategy.stages fallback', () => {
    const result = toFundCreationPayload({
      strategy: {
        stages: [{ id: 's1', name: 'A', graduate: 50, exit: 10, months: 24 }],
      },
    });

    expect(result.strategy.stages).toHaveLength(1);
    expect(result.strategy.stages[0]!.graduate).toBe(50);
  });

  it('returns empty stages for missing input', () => {
    const result = toFundCreationPayload({});
    expect(result.strategy.stages).toEqual([]);
  });

  it('preserves basics when provided', () => {
    const basics = { name: 'Test Fund', size: 100_000_000, modelVersion: 'reserves-ev1' as const };
    const result = toFundCreationPayload({ basics, stages: [] });
    expect(result.basics).toBe(basics);
  });

  it('generates default basics when not provided', () => {
    const result = toFundCreationPayload({ stages: [] });
    expect(result.basics).toBeDefined();
    expect(result.basics.size).toBe(50_000_000);
    expect(result.basics.modelVersion).toBe('reserves-ev1');
  });

  it('toEngineGraduationRates is an alias for toFundCreationPayload', () => {
    expect(toEngineGraduationRates).toBe(toFundCreationPayload);
  });
});
