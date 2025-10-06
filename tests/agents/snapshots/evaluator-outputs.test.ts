import { expect, test, describe } from 'vitest';
import { Evaluator } from '@/ai/eval/Evaluator';
import type { RunRecord } from '@/ai/eval/types';

describe('Evaluator - Snapshot Tests', () => {
  test('deterministic evaluation with positive deltas', () => {
    const run: RunRecord = {
      baseline: {
        irr: 0.12,
        tvpi: 1.8,
        dpi: 0.6,
        nav: 1.2,
      },
      candidate: {
        irr: 0.14,
        tvpi: 1.95,
        dpi: 0.62,
        nav: 1.24,
        exitMoicOnPlannedReserves: 3.2,
      },
      timings: {
        ttfbMs: 400,
        latencyMs: 1800,
      },
      cost: {
        usd: 0.12,
        tokens: 4000,
      },
      portfolioSize: 30,
      reservesAvailable: 5_000_000,
      reservesAllocated: 4_000_000,
    };

    const evaluation = Evaluator.evaluate(run);

    // Normalize non-deterministic fields
    const normalized = {
      ...evaluation,
      runId: 'SNAPSHOT',
      timestamp: 'SNAPSHOT',
    };

    expect(normalized).toMatchSnapshot();
  });

  test('deterministic evaluation with negative deltas', () => {
    const run: RunRecord = {
      baseline: {
        irr: 0.15,
        tvpi: 2.0,
        dpi: 0.8,
        nav: 1.5,
      },
      candidate: {
        irr: 0.12,
        tvpi: 1.8,
        dpi: 0.75,
        nav: 1.4,
        exitMoicOnPlannedReserves: 2.5,
      },
      timings: {
        ttfbMs: 350,
        latencyMs: 1600,
      },
      cost: {
        usd: 0.08,
        tokens: 3000,
      },
      portfolioSize: 25,
      reservesAvailable: 3_000_000,
      reservesAllocated: 2_500_000,
    };

    const evaluation = Evaluator.evaluate(run);

    const normalized = {
      ...evaluation,
      runId: 'SNAPSHOT',
      timestamp: 'SNAPSHOT',
    };

    expect(normalized).toMatchSnapshot();
  });

  test('deterministic evaluation with null metrics', () => {
    const run: RunRecord = {
      baseline: {
        irr: null,
        tvpi: null,
        dpi: null,
        nav: null,
      },
      candidate: {
        irr: 0.10,
        tvpi: 1.5,
        dpi: 0.4,
        nav: 1.1,
        exitMoicOnPlannedReserves: 2.0,
      },
      timings: {
        ttfbMs: 300,
        latencyMs: 1500,
      },
      cost: {
        usd: 0.05,
        tokens: 2000,
      },
      portfolioSize: 20,
      reservesAvailable: 2_000_000,
      reservesAllocated: 1_800_000,
    };

    const evaluation = Evaluator.evaluate(run);

    const normalized = {
      ...evaluation,
      runId: 'SNAPSHOT',
      timestamp: 'SNAPSHOT',
    };

    expect(normalized).toMatchSnapshot();
  });

  test('batch evaluation produces consistent summary', () => {
    const runs: RunRecord[] = [
      {
        baseline: { irr: 0.10, tvpi: 1.5, dpi: 0.5, nav: 1.0 },
        candidate: { irr: 0.12, tvpi: 1.7, dpi: 0.55, nav: 1.1, exitMoicOnPlannedReserves: 2.5 },
        timings: { ttfbMs: 400, latencyMs: 1800 },
        cost: { usd: 0.10 },
        portfolioSize: 20,
        reservesAvailable: 2_000_000,
        reservesAllocated: 1_500_000,
      },
      {
        baseline: { irr: 0.15, tvpi: 2.0, dpi: 0.7, nav: 1.3 },
        candidate: { irr: 0.18, tvpi: 2.3, dpi: 0.75, nav: 1.4, exitMoicOnPlannedReserves: 3.0 },
        timings: { ttfbMs: 450, latencyMs: 2000 },
        cost: { usd: 0.15 },
        portfolioSize: 25,
        reservesAvailable: 3_000_000,
        reservesAllocated: 2_500_000,
      },
    ];

    const { evaluations, summary } = Evaluator.evaluateBatch(runs);

    // Normalize timestamps/IDs
    const normalizedEvaluations = evaluations.map(e => ({
      ...e,
      runId: 'SNAPSHOT',
      timestamp: 'SNAPSHOT',
    }));

    expect({
      evaluations: normalizedEvaluations,
      summary,
    }).toMatchSnapshot();
  });
});
