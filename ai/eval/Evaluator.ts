import Decimal from 'decimal.js';
import { type Evaluation, type RunRecord, EvaluationSchema } from './types';
import { logger } from '@/lib/logger';

/**
 * Evaluator: Scores agent runs with venture-specific metrics
 *
 * Design principles:
 * 1. Deterministic: same inputs → same scores (no randomness)
 * 2. Domain-aligned: metrics match Construction vs Current flows
 * 3. Integration: uses DeterministicReserveEngine outputs
 */
export class Evaluator {
  /**
   * Evaluate a single run against baseline
   * Returns venture-specific metrics (IRR/TVPI/MOIC deltas)
   */
  static evaluate(run: RunRecord): Evaluation {
    const runId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Calculate deltas (Construction vs Current)
    const irrDelta = this.calculateDelta(run.candidate.irr, run.baseline.irr);
    const tvpiDelta = this.calculateDelta(run.candidate.tvpi, run.baseline.tvpi);
    const dpiDelta = this.calculateDelta(run.candidate.dpi, run.baseline.dpi);
    const navDelta = this.calculateDelta(run.candidate.nav, run.baseline.nav);

    // Reserve utilization
    const reserveUtilization = run.reservesAvailable > 0
      ? new Decimal(run.reservesAllocated).div(run.reservesAvailable).toNumber()
      : 0;

    // Portfolio concentration (simple Herfindahl index proxy)
    // TODO: Calculate from actual company allocations when available
    const diversificationScore = 1.0 - (1.0 / Math.max(run.portfolioSize, 1));

    const evaluation: Evaluation = {
      runId,
      timestamp,
      inputs: {
        scenarioType: 'construction', // TODO: Accept as param
        portfolioSize: run.portfolioSize,
        availableReserves: run.reservesAvailable,
      },
      metrics: {
        irrDelta,
        tvpiDelta,
        dpiDelta,
        navDelta,
        exitMoicOnPlannedReserves: run.candidate.exitMoicOnPlannedReserves,
        reserveUtilization,
        diversificationScore,
        tokenCostUsd: run.cost.usd,
        ttfbMs: run.timings.ttfbMs,
        latencyMs: run.timings.latencyMs,
        success: irrDelta !== null || tvpiDelta !== null,
      },
    };

    // Validate before returning
    const validated = EvaluationSchema.parse(evaluation);

    logger.debug('Evaluation completed', {
      runId,
      irrDelta: validated.metrics.irrDelta,
      tvpiDelta: validated.metrics.tvpiDelta,
      success: validated.metrics.success,
    });

    return validated;
  }

  /**
   * Calculate delta with null-safe handling
   */
  private static calculateDelta(
    candidateValue: number | null,
    baselineValue: number | null
  ): number | null {
    if (candidateValue === null || baselineValue === null) {
      return null;
    }
    return new Decimal(candidateValue).minus(baselineValue).toNumber();
  }

  /**
   * Batch evaluate multiple runs
   * Returns summary statistics
   */
  static evaluateBatch(runs: RunRecord[]): {
    evaluations: Evaluation[];
    summary: {
      avgIrrLift: number;
      avgTvpiLift: number;
      successRate: number;
      totalCostUsd: number;
    };
  } {
    const evaluations = runs.map(run => this.evaluate(run));

    const successful = evaluations.filter(e => e.metrics.success);
    const irrLifts = evaluations
      .map(e => e.metrics.irrDelta)
      .filter((d): d is number => d !== null);
    const tvpiLifts = evaluations
      .map(e => e.metrics.tvpiDelta)
      .filter((d): d is number => d !== null);

    const summary = {
      avgIrrLift: irrLifts.length > 0
        ? irrLifts.reduce((a, b) => a + b, 0) / irrLifts.length
        : 0,
      avgTvpiLift: tvpiLifts.length > 0
        ? tvpiLifts.reduce((a, b) => a + b, 0) / tvpiLifts.length
        : 0,
      successRate: evaluations.length > 0
        ? successful.length / evaluations.length
        : 0,
      totalCostUsd: evaluations.reduce((sum, e) => sum + e.metrics.tokenCostUsd, 0),
    };

    return { evaluations, summary };
  }
}
