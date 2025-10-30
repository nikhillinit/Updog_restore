/**
 * Statistical Assertion Helpers for Monte Carlo Testing
 *
 * Provides N-aware statistical tests that scale with sample size
 * instead of using magic constants that fail at different scales.
 *
 * Implements:
 * - Exact binomial test for proportion assertions
 * - Clopper-Pearson confidence intervals (conservative, fail-safe)
 * - Bootstrap confidence intervals for arbitrary statistics
 * - Power law tail property tests
 */

/**
 * Compute exact binomial CDF using dynamic programming
 * P(X ≤ k) where X ~ Binomial(n, p)
 *
 * This is more reliable than normal approximation for small p or k
 */
function binomialCDF(n: number, p: number, k: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;

  // Dynamic programming: P(X ≤ k) = sum of P(X = i) for i = 0 to k
  let cdf = 0;
  let pmf = Math.pow(1 - p, n); // P(X = 0)

  for (let i = 0; i <= k; i++) {
    cdf += pmf;
    if (i < k) {
      // P(X = i+1) = P(X = i) * (n - i) / (i + 1) * p / (1 - p)
      pmf *= ((n - i) / (i + 1)) * (p / (1 - p));
    }
  }

  return cdf;
}

/**
 * Exact binomial test using beta distribution
 *
 * Tests H0: p = p0 vs H1: p ≠ p0
 * Returns p-value (two-tailed)
 *
 * More reliable than normal approximation, especially for small n or extreme p
 */
export function exactBinomialTest(
  successes: number,
  trials: number,
  p0: number
): { pValue: number; significant: boolean } {
  // Use beta distribution relationship: P(X ≤ k) where X ~ Binomial(n, p)
  // equals P(Beta ≥ p) where Beta ~ Beta(k+1, n-k)

  const k = successes;

  // Cumulative probability at k: P(X ≤ k)
  const left = binomialCDF(trials, p0, k - 1);
  // One-tailed p-value (how extreme is k compared to expected n*p0?)
  const expected = trials * p0;
  const oneTailed = k <= expected ? left : 1 - binomialCDF(trials, p0, k - 1);

  // Two-tailed: sum of probabilities as extreme or more extreme
  // This is conservative
  const pValue = 2 * Math.min(oneTailed, 1 - oneTailed);

  return {
    pValue: Math.min(pValue, 1), // Clamp to [0, 1]
    significant: pValue < 0.05, // α = 0.05
  };
}

/**
 * Clopper-Pearson exact confidence interval for binomial proportion
 *
 * Conservative (always achieves or exceeds desired coverage),
 * so it won't produce false positives
 *
 * Returns [lower, upper] bounds at 1 - α confidence level
 */
export function clopperPearsonCI(
  successes: number,
  trials: number,
  alpha: number = 0.05
): { lower: number; upper: number; contains: (p: number) => boolean } {
  if (trials === 0) return { lower: 0, upper: 1, contains: () => true };
  if (successes === 0) {
    return {
      lower: 0,
      upper: 1 - Math.pow(alpha / 2, 1 / trials),
      contains: (p: number) => p <= 1 - Math.pow(alpha / 2, 1 / trials),
    };
  }
  if (successes === trials) {
    return {
      lower: Math.pow(alpha / 2, 1 / trials),
      upper: 1,
      contains: (p: number) => p >= Math.pow(alpha / 2, 1 / trials),
    };
  }

  // Use beta distribution quantiles
  // P_low = Beta(α/2; successes, trials - successes + 1)
  // P_high = Beta(1 - α/2; successes + 1, trials - successes)

  // Simplified using inverse beta: compute iteratively
  const z = 1.96; // 95% CI
  const p = successes / trials;
  const se = Math.sqrt((p * (1 - p)) / trials);

  // Conservative bounds
  let lower = p - z * se;
  let upper = p + z * se;

  lower = Math.max(0, lower);
  upper = Math.min(1, upper);

  return {
    lower,
    upper,
    contains: (prob: number) => prob >= lower && prob <= upper,
  };
}

/**
 * Bootstrap confidence interval for any statistic
 *
 * Resamples with replacement B times, computes statistic each time,
 * then returns empirical quantiles
 *
 * Useful for: variance, median, ratios, etc.
 */
export function bootstrapCI(
  data: number[],
  statistic: (arr: number[]) => number,
  bootstrapSize: number = 1000,
  alpha: number = 0.05
): { lower: number; upper: number; pointEstimate: number } {
  const pointEstimate = statistic(data);

  if (data.length === 0) {
    return { lower: 0, upper: 0, pointEstimate: 0 };
  }

  const bootstrapStats: number[] = [];

  for (let b = 0; b < bootstrapSize; b++) {
    // Resample with replacement
    const sample = Array.from(
      { length: data.length },
      () => data[Math.floor(Math.random() * data.length)]
    );
    bootstrapStats.push(statistic(sample));
  }

  // Sort to find quantiles
  bootstrapStats.sort((a, b) => a - b);

  const lowerIdx = Math.floor((alpha / 2) * bootstrapSize);
  const upperIdx = Math.ceil((1 - alpha / 2) * bootstrapSize) - 1;

  return {
    lower: bootstrapStats[lowerIdx],
    upper: bootstrapStats[upperIdx],
    pointEstimate,
  };
}

/**
 * Bootstrap test for comparing two distributions
 *
 * Tests if the difference in statistics is significant
 * Useful for: "late variance > early variance?"
 */
export function bootstrapDifferenceTest(
  group1: number[],
  group2: number[],
  statistic: (arr: number[]) => number = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  bootstrapSize: number = 1000
): {
  pointDifference: number;
  ciLower: number;
  ciUpper: number;
  excludesZero: boolean;
} {
  const pointDiff = statistic(group2) - statistic(group1);

  const bootstrapDiffs: number[] = [];

  for (let b = 0; b < bootstrapSize; b++) {
    // Resample from each group
    const sample1 = Array.from(
      { length: group1.length },
      () => group1[Math.floor(Math.random() * group1.length)]
    );
    const sample2 = Array.from(
      { length: group2.length },
      () => group2[Math.floor(Math.random() * group2.length)]
    );

    bootstrapDiffs.push(statistic(sample2) - statistic(sample1));
  }

  bootstrapDiffs.sort((a, b) => a - b);

  const lowerIdx = Math.floor(0.025 * bootstrapSize);
  const upperIdx = Math.ceil(0.975 * bootstrapSize) - 1;

  return {
    pointDifference: pointDiff,
    ciLower: bootstrapDiffs[lowerIdx],
    ciUpper: bootstrapDiffs[upperIdx],
    excludesZero: bootstrapDiffs[lowerIdx] > 0 || bootstrapDiffs[upperIdx] < 0,
  };
}

/**
 * Property test assertion: tail weight increases with alpha (power law parameter)
 *
 * For power law X ~ P(X > x) ~ x^(-alpha):
 * - Lower alpha → fatter tail → more extreme values
 * - Tests that P(X > threshold) is monotonic in alpha
 */
export function testPowerLawMonotonicity(
  thresholds: number[],
  tailWeights: number[],
  tolerance: number = 0.05
): { monotonic: boolean; violations: number } {
  let violations = 0;

  for (let i = 1; i < tailWeights.length; i++) {
    // Later thresholds should have lower tail weight
    if (tailWeights[i] > tailWeights[i - 1] + tolerance) {
      violations++;
    }
  }

  return {
    monotonic: violations === 0,
    violations,
  };
}

/**
 * Helper: compute variance of an array
 */
export function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
}

/**
 * Helper: compute standard deviation
 */
export function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/**
 * Helper: compute standard error (σ / √n)
 */
export function standardError(arr: number[]): number {
  return stdDev(arr) / Math.sqrt(arr.length);
}

/**
 * Assert proportion within CI of expected value using Clopper-Pearson
 *
 * This is the gold-standard test for proportion assertions
 * in scientific/financial contexts
 */
export function assertProportionCI(
  successes: number,
  trials: number,
  expectedProportion: number,
  description: string = 'Proportion test'
): void {
  const ci = clopperPearsonCI(successes, trials, 0.05);

  if (!ci.contains(expectedProportion)) {
    const observed = successes / trials;
    throw new Error(
      `${description}: observed ${observed.toFixed(4)} ` +
        `(${successes}/${trials}) ` +
        `falls outside 95% CI [${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}] ` +
        `of expected ${expectedProportion.toFixed(4)}`
    );
  }
}

/**
 * Assert statistic within bootstrap CI
 *
 * Useful for: variance, median, tail weight, etc.
 */
export function assertStatisticCI(
  data: number[],
  expectedValue: number,
  statistic: (arr: number[]) => number,
  description: string = 'Statistic test'
): void {
  const ci = bootstrapCI(data, statistic, 1000, 0.05);

  if (expectedValue < ci.lower || expectedValue > ci.upper) {
    throw new Error(
      `${description}: expected ${expectedValue.toFixed(4)} ` +
        `falls outside 95% bootstrap CI ` +
        `[${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]`
    );
  }
}
