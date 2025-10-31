/**
 * Performance Micro-Benchmark: Stage Validator
 *
 * Measures p99 latency of parseStageDistribution() to ensure
 * boundary validation stays within 1ms budget.
 *
 * Baseline: Saved to tests/perf/baselines/validator.p99.json
 * Regression threshold: 3x baseline (even if still <1ms)
 */

import { describe, it, expect } from 'vitest';
import { parseStageDistribution } from '@shared/schemas/parse-stage-distribution';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Calculate p99 latency from nanosecond samples
 */
function p99(samples: bigint[]): number {
  const arr = samples.map(Number).sort((a, b) => a - b);
  const idx = Math.floor(0.99 * (arr.length - 1));
  return arr[idx] / 1_000_000; // Convert ns -> ms
}

/**
 * Load baseline from JSON file
 */
function loadBaseline(): { p99_ms: number; samples: number } | null {
  const baselinePath = path.join(__dirname, 'baselines', 'validator.p99.json');
  try {
    if (!fs.existsSync(baselinePath)) return null;
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Save baseline to JSON file
 */
function saveBaseline(p99_ms: number, samples: number): void {
  const baselinePath = path.join(__dirname, 'baselines', 'validator.p99.json');
  const baselineDir = path.dirname(baselinePath);
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ p99_ms, samples, created_at: new Date().toISOString() }, null, 2)
  );
}

describe('Stage Validator Performance', () => {
  it('p99 latency < 1ms budget (realistic inputs)', () => {
    const samples: bigint[] = [];
    const N = 10_000;

    // Realistic input patterns (mix of canonical and variants)
    const testInputs = [
      [{ stage: 'pre-seed', weight: 1.0 }],
      [{ stage: 'Pre-Seed', weight: 0.3 }, { stage: 'series-a', weight: 0.7 }],
      [{ stage: 'series-c+', weight: 0.5 }, { stage: 'seed', weight: 0.5 }],
      [{ stage: 'Series A', weight: 0.4 }, { stage: 'Series B', weight: 0.6 }],
      [
        { stage: 'pre-seed', weight: 0.2 },
        { stage: 'seed', weight: 0.3 },
        { stage: 'series-a', weight: 0.5 },
      ],
    ];

    // Benchmark each input pattern
    for (let i = 0; i < N; i++) {
      const input = testInputs[i % testInputs.length];
      const start = process.hrtime.bigint();
      parseStageDistribution(input);
      const end = process.hrtime.bigint();
      samples.push(end - start);
    }

    const p99_ms = p99(samples);

    // PRIMARY BUDGET: p99 < 1ms
    expect(p99_ms).toBeLessThan(1.0);

    console.log(`✅ Validator p99: ${p99_ms.toFixed(3)}ms (${N} samples)`);

    // REGRESSION GUARD: Compare against baseline
    const baseline = loadBaseline();
    if (baseline) {
      const threshold = baseline.p99_ms * 3; // 3x regression tolerance
      if (p99_ms >= threshold) {
        console.warn(
          `⚠️  Performance regression detected:\n` +
            `   Baseline: ${baseline.p99_ms.toFixed(3)}ms\n` +
            `   Current:  ${p99_ms.toFixed(3)}ms\n` +
            `   Threshold: ${threshold.toFixed(3)}ms (3x baseline)`
        );
        expect(p99_ms).toBeLessThan(threshold);
      } else {
        console.log(
          `✅ Within baseline tolerance (${baseline.p99_ms.toFixed(3)}ms → ${p99_ms.toFixed(3)}ms)`
        );
      }
    } else {
      console.log('📝 No baseline found, saving current measurement');
      saveBaseline(p99_ms, N);
    }
  });

  it('p50 latency well below budget (fast path)', () => {
    const samples: bigint[] = [];
    const N = 5_000;

    // Simplest possible input (fast path)
    const input = [{ stage: 'seed', weight: 1.0 }];

    for (let i = 0; i < N; i++) {
      const start = process.hrtime.bigint();
      parseStageDistribution(input);
      const end = process.hrtime.bigint();
      samples.push(end - start);
    }

    const arr = samples.map(Number).sort((a, b) => a - b);
    const p50_ms = arr[Math.floor(arr.length * 0.5)] / 1_000_000;

    // p50 should be significantly faster than p99 budget
    expect(p50_ms).toBeLessThan(0.5);

    console.log(`✅ Validator p50: ${p50_ms.toFixed(3)}ms (fast path)`);
  });

  it('handles unknown stages without significant slowdown', () => {
    const samples: bigint[] = [];
    const N = 2_000;

    // Input with unknown stages (triggers nearestStage suggestions)
    const input = [
      { stage: 'late-stage', weight: 0.5 }, // Unknown
      { stage: 'growth', weight: 0.5 }, // Unknown
    ];

    for (let i = 0; i < N; i++) {
      const start = process.hrtime.bigint();
      parseStageDistribution(input);
      const end = process.hrtime.bigint();
      samples.push(end - start);
    }

    const p99_ms = p99(samples);

    // Unknown stages may be slower due to Levenshtein distance calculation
    // but should still stay well under budget
    expect(p99_ms).toBeLessThan(2.0); // 2x budget tolerance for error path

    console.log(`✅ Validator p99 (unknown stages): ${p99_ms.toFixed(3)}ms`);
  });
});
