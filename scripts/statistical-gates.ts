/**
 * Authoritative Statistical Gates for Canary Deployments
 * Implements rigorous statistical testing with minimum sample sizes
 */

export interface StatisticalArm {
  successes: number;
  total: number;
  latencySamples: number[];
  errorRate: number;
  p99Latency: number;
}

export interface StatisticalResult {
  decision: 'PASS' | 'FAIL' | 'EXTEND';
  reason: string;
  details: {
    errorTest?: TwoProportionResult;
    latencyTest?: BootstrapResult;
    sampleSizes: { canary: number; baseline: number };
    requiresSamples: { errors: number; latency: number };
  };
}

export interface TwoProportionResult {
  significant: boolean;
  pValue: number;
  effect: 'positive' | 'negative' | 'neutral';
  confidenceInterval: { lower: number; upper: number };
}

export interface BootstrapResult {
  deltaCi: { lower: number; upper: number };
  allowedDegradation: number;
  withinBounds: boolean;
}

export class StatisticalGates {
  private readonly config = {
    // Minimum sample sizes for statistical power
    minErrorSamples: 20000,     // Per arm for error rate testing
    minLatencySamples: 50000,   // Per arm for latency testing
    
    // Statistical thresholds
    errorAlpha: 0.05,           // 95% confidence for error tests
    latencyAlpha: 0.05,         // 95% confidence for latency tests
    
    // Allowed degradation thresholds
    maxLatencyDegradationPct: 15,  // Max 15% p99 degradation
    maxLatencyDegradationMs: 100,  // Max 100ms absolute degradation
    
    // Bootstrap parameters
    bootstrapResamples: 10000,
    
    // SLO thresholds (absolute guardrails)
    sloErrorRate: 0.01,         // 1% max error rate
    sloP99Latency: 1000,        // 1000ms max p99 latency
  };

  /**
   * Authoritative gate check: PASS/FAIL/EXTEND decision
   */
  evaluateCanary(canary: StatisticalArm, baseline: StatisticalArm): StatisticalResult {
    // 1. Check absolute SLO guardrails first
    if (canary.errorRate > this.config.sloErrorRate) {
      return {
        decision: 'FAIL',
        reason: `Canary error rate ${(canary.errorRate * 100).toFixed(2)}% exceeds SLO ${(this.config.sloErrorRate * 100).toFixed(2)}%`,
        details: { sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples: this.getRequiredSamples(baseline) }
      };
    }

    if (canary.p99Latency > this.config.sloP99Latency) {
      return {
        decision: 'FAIL',
        reason: `Canary p99 latency ${canary.p99Latency}ms exceeds SLO ${this.config.sloP99Latency}ms`,
        details: { sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples: this.getRequiredSamples(baseline) }
      };
    }

    // 2. Check minimum sample sizes
    const requiredSamples = this.getRequiredSamples(baseline);
    
    if (canary.total < requiredSamples.errors || baseline.total < requiredSamples.errors) {
      return {
        decision: 'EXTEND',
        reason: `Insufficient samples for error testing: canary=${canary.total}, baseline=${baseline.total}, required=${requiredSamples.errors} each`,
        details: { sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples }
      };
    }

    if (canary.latencySamples.length < requiredSamples.latency || baseline.latencySamples.length < requiredSamples.latency) {
      return {
        decision: 'EXTEND',
        reason: `Insufficient samples for latency testing: canary=${canary.latencySamples.length}, baseline=${baseline.latencySamples.length}, required=${requiredSamples.latency} each`,
        details: { sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples }
      };
    }

    // 3. Relative statistical tests
    const errorTest = this.twoProportionZTest(
      canary.successes, canary.total,
      baseline.successes, baseline.total,
      this.config.errorAlpha
    );

    // Fail if error rate is significantly worse
    if (errorTest.significant && errorTest.effect === 'negative') {
      return {
        decision: 'FAIL',
        reason: `Canary error rate significantly worse (p=${errorTest.pValue.toFixed(4)})`,
        details: { errorTest, sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples }
      };
    }

    // 4. Bootstrap latency test
    const latencyTest = this.bootstrapQuantileDelta(
      canary.latencySamples, 
      baseline.latencySamples, 
      0.99, 
      this.config.bootstrapResamples
    );

    const allowedDegradationMs = Math.min(
      this.config.maxLatencyDegradationMs,
      baseline.p99Latency * (this.config.maxLatencyDegradationPct / 100)
    );

    if (latencyTest.deltaCi.upper > allowedDegradationMs) {
      return {
        decision: 'FAIL',
        reason: `Canary p99 latency degradation CI upper bound ${latencyTest.deltaCi.upper.toFixed(1)}ms exceeds limit ${allowedDegradationMs.toFixed(1)}ms`,
        details: { errorTest, latencyTest: { ...latencyTest, allowedDegradation: allowedDegradationMs, withinBounds: false }, sampleSizes: { canary: canary.total, baseline: baseline.total }, requiresSamples }
      };
    }

    // All gates passed
    return {
      decision: 'PASS',
      reason: 'All statistical gates passed',
      details: { 
        errorTest, 
        latencyTest: { ...latencyTest, allowedDegradation: allowedDegradationMs, withinBounds: true }, 
        sampleSizes: { canary: canary.total, baseline: baseline.total }, 
        requiresSamples 
      }
    };
  }

  /**
   * Calculate required sample sizes based on baseline metrics
   */
  private getRequiredSamples(baseline: StatisticalArm): { errors: number; latency: number } {
    // Error detection: detect 40% relative increase (e.g., 0.5% -> 0.7%)
    const p = baseline.errorRate;
    const delta = Math.max(0.0002, p * 0.4); // Minimum 0.02% absolute delta or 40% relative
    const errorSamples = Math.max(
      this.config.minErrorSamples,
      Math.ceil(16 * p * (1 - p) / (delta * delta))
    );

    return {
      errors: errorSamples,
      latency: this.config.minLatencySamples
    };
  }

  /**
   * Two-proportion z-test with confidence interval
   */
  private twoProportionZTest(
    successes1: number, total1: number,
    successes2: number, total2: number,
    alpha: number = 0.05
  ): TwoProportionResult {
    if (total1 === 0 || total2 === 0) {
      return { significant: false, pValue: 1.0, effect: 'neutral', confidenceInterval: { lower: 0, upper: 0 } };
    }

    const p1 = successes1 / total1;
    const p2 = successes2 / total2;
    const pooledP = (successes1 + successes2) / (total1 + total2);

    if (pooledP === 0 || pooledP === 1) {
      return { significant: false, pValue: 1.0, effect: 'neutral', confidenceInterval: { lower: 0, upper: 0 } };
    }

    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/total1 + 1/total2));
    const z = (p1 - p2) / se;

    // Two-tailed p-value
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Confidence interval for difference
    const seDiff = Math.sqrt(p1 * (1 - p1) / total1 + p2 * (1 - p2) / total2);
    const criticalValue = 1.96; // 95% CI
    const diff = p1 - p2;
    const margin = criticalValue * seDiff;

    const effect = p1 > p2 ? 'positive' : p1 < p2 ? 'negative' : 'neutral';

    return {
      significant: pValue < alpha,
      pValue,
      effect,
      confidenceInterval: {
        lower: diff - margin,
        upper: diff + margin
      }
    };
  }

  /**
   * Bootstrap confidence interval for quantile differences
   */
  private bootstrapQuantileDelta(
    canary: number[], 
    baseline: number[], 
    quantile: number = 0.99, 
    resamples: number = 10000
  ): BootstrapResult {
    const deltas: number[] = [];

    for (let i = 0; i < resamples; i++) {
      // Resample with replacement
      const canaryResampled = this.resample(canary);
      const baselineResampled = this.resample(baseline);

      // Calculate quantile difference
      const canaryQ = this.quantile(canaryResampled, quantile);
      const baselineQ = this.quantile(baselineResampled, quantile);
      deltas.push(canaryQ - baselineQ);
    }

    deltas.sort((a, b) => a - b);

    // 95% confidence interval
    const lowerIndex = Math.floor(0.025 * resamples);
    const upperIndex = Math.floor(0.975 * resamples);

    return {
      deltaCi: {
        lower: deltas[lowerIndex],
        upper: deltas[upperIndex]
      },
      allowedDegradation: 0, // Will be set by caller
      withinBounds: false     // Will be set by caller
    };
  }

  private resample(data: number[]): number[] {
    return Array.from({ length: data.length }, () => 
      data[Math.floor(Math.random() * data.length)]
    );
  }

  private quantile(data: number[], q: number): number {
    const sorted = [...data].sort((a, b) => a - b);
    const index = Math.floor((sorted.length - 1) * q);
    return sorted[index];
  }

  private normalCDF(x: number): number {
    // Approximation of standard normal CDF
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }
}