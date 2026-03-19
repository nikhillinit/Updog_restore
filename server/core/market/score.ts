/**
 * Market Score Computation v1
 * Explainable daily market sentiment score for reserve allocation
 */

export interface MarketIndicators {
  vix?: number;
  fedFundsRate?: number;
  ust10yYield?: number;
  ipoCount30d?: number;
  creditSpreadBaa?: number;
}

export interface Normalization {
  mean: Record<string, number>;
  std: Record<string, number>;
}

export interface MarketScoreResult {
  score: number; // 0-1 scale, higher = better conditions
  confidence: number; // 0-1, confidence in score
  components: MarketIndicators;
  weights: Record<string, number>;
  normalizedComponents: Record<string, number>;
  interpretation: string;
  riskLevel: 'low' | 'medium' | 'high';
}

type MarketIndicatorKey =
  | 'vix'
  | 'fedFundsRate'
  | 'ust10yYield'
  | 'ipoCount30d'
  | 'creditSpreadBaa';

type Contribution = {
  factor: string;
  contribution: number;
  direction: 'positive' | 'negative';
};

const MARKET_INDICATOR_KEYS: readonly MarketIndicatorKey[] = [
  'vix',
  'fedFundsRate',
  'ust10yYield',
  'ipoCount30d',
  'creditSpreadBaa',
] as const;

// Default normalization parameters (should be updated with rolling historical data)
const DEFAULT_NORMS: Normalization = {
  mean: {
    vix: 20.0,
    fedFundsRate: 2.5,
    ust10yYield: 3.0,
    ipoCount30d: 30,
    creditSpreadBaa: 1.8,
  },
  std: {
    vix: 8.0,
    fedFundsRate: 2.0,
    ust10yYield: 1.2,
    ipoCount30d: 15,
    creditSpreadBaa: 0.8,
  },
};

// Market score weights (tuned for VC investment timing)
const DEFAULT_WEIGHTS: Record<MarketIndicatorKey, number> = {
  vix: -0.35, // Higher volatility = worse conditions
  fedFundsRate: -0.15, // Higher rates = worse conditions
  ust10yYield: -0.1, // Higher yields = worse conditions (risk-off)
  ipoCount30d: 0.4, // More IPOs = better exit conditions
  creditSpreadBaa: -0.2, // Higher spreads = worse conditions
};

export class MarketScoreComputer {
  constructor(
    private weights: Record<MarketIndicatorKey, number> = DEFAULT_WEIGHTS,
    private norms = DEFAULT_NORMS
  ) {}

  /**
   * Compute market score from raw indicators
   */
  computeMarketScore(indicators: MarketIndicators): MarketScoreResult {
    // Normalize each indicator to z-score
    const normalizedComponents: Record<string, number> = {};
    let totalWeight = 0;
    let weightedSum = 0;
    let validComponents = 0;

    for (const key of MARKET_INDICATOR_KEYS) {
      const value = indicators[key];
      if (value == null) continue;

      const mean = this.norms.mean[key] ?? 0;
      const std = Math.max(1e-6, this.norms.std[key] ?? 1);
      const zScore = (value - mean) / std;
      const weight = this.weights[key];

      normalizedComponents[key] = zScore;
      weightedSum += weight * zScore;
      totalWeight += Math.abs(weight);
      validComponents++;
    }

    // Handle missing data
    if (validComponents === 0) {
      return {
        score: 0.5, // Neutral score when no data
        confidence: 0.0,
        components: indicators,
        weights: this.weights,
        normalizedComponents: {},
        interpretation: 'No market data available',
        riskLevel: 'medium',
      };
    }

    // Normalize by total absolute weight
    const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Apply sigmoid transformation to get 0-1 score
    const sigmoid = 1 / (1 + Math.exp(-normalizedScore));

    // Confidence based on data completeness
    const completeness = validComponents / MARKET_INDICATOR_KEYS.length;
    const confidence = Math.min(1.0, completeness * 1.2); // Slight boost for partial data

    // Risk level categorization
    const riskLevel = sigmoid < 0.3 ? 'high' : sigmoid < 0.7 ? 'medium' : 'low';

    // Generate human-readable interpretation
    const interpretation = this.generateInterpretation(sigmoid, indicators, riskLevel);

    return {
      score: Math.max(0, Math.min(1, sigmoid)),
      confidence,
      components: indicators,
      weights: this.weights,
      normalizedComponents,
      interpretation,
      riskLevel,
    };
  }

  /**
   * Update normalization parameters with new historical data
   */
  updateNormalization(historicalData: Array<{ date: string; indicators: MarketIndicators }>): void {
    const values: Record<MarketIndicatorKey, number[]> = {
      vix: [],
      fedFundsRate: [],
      ust10yYield: [],
      ipoCount30d: [],
      creditSpreadBaa: [],
    };

    historicalData.forEach((row) => {
      for (const key of MARKET_INDICATOR_KEYS) {
        const value = row.indicators[key];
        if (value != null) {
          values[key].push(value);
        }
      }
    });

    // Compute mean and standard deviation
    const newMean: Partial<Record<MarketIndicatorKey, number>> = {};
    const newStd: Partial<Record<MarketIndicatorKey, number>> = {};

    for (const key of MARKET_INDICATOR_KEYS) {
      const data = values[key];
      if (data.length > 0) {
        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        newMean[key] = mean;

        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
        newStd[key] = Math.sqrt(variance);
      }
    }

    // Update normalization with exponential smoothing
    const alpha = 0.1; // Smoothing factor
    for (const key of MARKET_INDICATOR_KEYS) {
      const meanValue = newMean[key];
      const stdValue = newStd[key];

      if (meanValue != null) {
        const currentMean = this.norms.mean[key];
        if (currentMean != null) {
          this.norms.mean[key] = alpha * meanValue + (1 - alpha) * currentMean;
        } else {
          this.norms.mean[key] = meanValue;
        }
      }

      if (stdValue != null) {
        const currentStd = this.norms.std[key];
        if (currentStd != null) {
          this.norms.std[key] = alpha * stdValue + (1 - alpha) * currentStd;
        } else {
          this.norms.std[key] = stdValue;
        }
      }
    }
  }

  private generateInterpretation(
    score: number,
    _indicators: MarketIndicators,
    _riskLevel: MarketScoreResult['riskLevel']
  ): string {
    if (score >= 0.75) {
      return 'Favorable market conditions for venture investments. Strong IPO activity and manageable volatility.';
    } else if (score >= 0.6) {
      return 'Moderately favorable conditions. Some positive signals but monitor key risk factors.';
    } else if (score >= 0.4) {
      return 'Mixed market signals. Proceed with caution and increased due diligence.';
    } else if (score >= 0.25) {
      return 'Challenging market conditions. Consider delaying non-essential follow-on investments.';
    } else {
      return 'Unfavorable conditions for new investments. Focus on supporting existing portfolio.';
    }
  }

  /**
   * Get factor contributions for explainability
   */
  explainScore(indicators: MarketIndicators): Contribution[] {
    const contributions: Contribution[] = [];

    for (const key of MARKET_INDICATOR_KEYS) {
      const value = indicators[key];
      if (value == null) continue;

      const mean = this.norms.mean[key] ?? 0;
      const std = Math.max(1e-6, this.norms.std[key] ?? 1);
      const zScore = (value - mean) / std;
      const contribution = this.weights[key] * zScore;

      contributions.push({
        factor: key,
        contribution: Math.abs(contribution),
        direction: contribution >= 0 ? 'positive' : 'negative',
      });
    }

    return contributions.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Export current configuration for persistence
   */
  exportConfig(this: MarketScoreComputer): {
    weights: typeof DEFAULT_WEIGHTS;
    norms: Normalization;
  } {
    return {
      weights: { ...this.weights },
      norms: {
        mean: { ...this.norms.mean },
        std: { ...this.norms.std },
      },
    };
  }

  /**
   * Import configuration from persistence
   */
  importConfig(
    this: MarketScoreComputer,
    config: { weights: typeof DEFAULT_WEIGHTS; norms: Normalization }
  ): void {
    this.weights = { ...config.weights };
    this.norms = {
      mean: { ...config.norms.mean },
      std: { ...config.norms.std },
    };
  }
}
