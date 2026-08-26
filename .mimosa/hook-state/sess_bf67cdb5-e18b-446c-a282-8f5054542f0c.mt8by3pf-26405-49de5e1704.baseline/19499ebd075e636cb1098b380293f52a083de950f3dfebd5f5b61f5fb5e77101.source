/**
 * Historical Scenario Data
 *
 * Predefined market scenarios for Monte Carlo backtesting.
 * Based on historical market conditions and VC performance patterns.
 *
 * Each scenario captures:
 * - Date range of the market condition
 * - Exit multiplier characteristics
 * - Failure rates observed during the period
 * - Follow-on investment behavior
 * - Typical hold period adjustments
 *
 * @author Claude Code
 * @version 1.0
 */

import type {
  HistoricalScenario,
  HistoricalScenarioName,
  MarketParameters,
} from '@shared/types/backtesting';

// =============================================================================
// DEFAULT MARKET PARAMETERS (Neutral/Baseline)
// =============================================================================

const DEFAULT_MARKET_PARAMS: MarketParameters = {
  exitMultiplierMean: 2.5,
  exitMultiplierVolatility: 0.8,
  failureRate: 0.25,
  followOnProbability: 0.6,
  holdPeriodYears: 5.5,
};

// =============================================================================
// HISTORICAL SCENARIO DEFINITIONS
// =============================================================================

/**
 * Historical scenarios with calibrated market parameters.
 * Parameters derived from VC performance data during each period.
 */
export const HISTORICAL_SCENARIOS: Record<
  Exclude<HistoricalScenarioName, 'custom'>,
  HistoricalScenario
> = {
  /**
   * 2008-2009 Global Financial Crisis
   *
   * Characteristics:
   * - Severe credit contraction limiting exit opportunities
   * - Sharp decline in valuations (40-60% drops common)
   * - Extended hold periods as exits delayed
   * - High portfolio company failure rates
   * - Reduced follow-on investment as funds preserved capital
   */
  financial_crisis_2008: {
    name: 'financial_crisis_2008',
    startDate: '2008-01-01',
    endDate: '2009-12-31',
    description:
      'Global financial crisis with severe credit contraction, market volatility, and reduced exit opportunities. IPO market essentially closed, M&A activity dropped 50%+.',
    marketParameters: {
      exitMultiplierMean: 1.2,
      exitMultiplierVolatility: 1.5,
      failureRate: 0.45,
      followOnProbability: 0.3,
      holdPeriodYears: 8.0,
    },
  },

  /**
   * 2000-2002 Dot-Com Bust
   *
   * Characteristics:
   * - Tech sector collapse following massive overvaluation
   * - Many high-profile company failures (Pets.com, Webvan)
   * - Longest recovery period for VC in modern history
   * - Funding winter lasting 3+ years
   * - Permanent valuation resets in tech sector
   */
  dotcom_bust_2000: {
    name: 'dotcom_bust_2000',
    startDate: '2000-03-01',
    endDate: '2002-12-31',
    description:
      'Dot-com bubble burst with tech sector collapse. NASDAQ lost 78% from peak. Extended recovery period with fundamentally changed valuations.',
    marketParameters: {
      exitMultiplierMean: 0.8,
      exitMultiplierVolatility: 2.0,
      failureRate: 0.55,
      followOnProbability: 0.2,
      holdPeriodYears: 9.0,
    },
  },

  /**
   * 2020 COVID-19 Pandemic
   *
   * Characteristics:
   * - Initial sharp market shock (March 2020)
   * - Rapid tech-driven recovery
   * - Accelerated digital transformation benefiting many portfolio companies
   * - Sector divergence: travel/retail hurt, tech/health accelerated
   * - V-shaped recovery in valuations
   */
  covid_2020: {
    name: 'covid_2020',
    startDate: '2020-02-01',
    endDate: '2020-12-31',
    description:
      'COVID-19 pandemic with initial market shock followed by rapid tech-driven recovery. Accelerated digital transformation created winners and losers.',
    marketParameters: {
      exitMultiplierMean: 1.8,
      exitMultiplierVolatility: 1.2,
      failureRate: 0.3,
      followOnProbability: 0.5,
      holdPeriodYears: 5.0,
    },
  },

  /**
   * 2021 Bull Market
   *
   * Characteristics:
   * - Record valuations across all stages
   * - SPAC boom providing alternative exit path
   * - Abundant liquidity and low interest rates
   * - Compressed fundraising timelines (companies raising every 6-12 months)
   * - Historic low failure rates as companies raised freely
   */
  bull_market_2021: {
    name: 'bull_market_2021',
    startDate: '2021-01-01',
    endDate: '2021-12-31',
    description:
      'Exceptional bull market with record valuations, SPAC activity, and abundant liquidity. Fastest exit timelines in VC history.',
    marketParameters: {
      exitMultiplierMean: 4.0,
      exitMultiplierVolatility: 0.6,
      failureRate: 0.15,
      followOnProbability: 0.8,
      holdPeriodYears: 3.5,
    },
  },

  /**
   * 2022 Rising Rates Environment
   *
   * Characteristics:
   * - Aggressive Federal Reserve rate hikes
   * - Valuation compression across growth assets
   * - IPO window essentially closed
   * - Down rounds becoming common
   * - Shift from growth-at-all-costs to profitability focus
   */
  rate_hikes_2022: {
    name: 'rate_hikes_2022',
    startDate: '2022-01-01',
    endDate: '2022-12-31',
    description:
      'Rising interest rate environment with valuation compression and reduced exit activity. Shift from growth focus to profitability.',
    marketParameters: {
      exitMultiplierMean: 1.5,
      exitMultiplierVolatility: 1.0,
      failureRate: 0.35,
      followOnProbability: 0.4,
      holdPeriodYears: 6.5,
    },
  },
};

// =============================================================================
// ACCESSOR FUNCTIONS
// =============================================================================

/**
 * Get a historical scenario by name
 * @param name - Scenario name
 * @returns Scenario data or null if custom/not found
 */
export function getScenarioByName(name: HistoricalScenarioName): HistoricalScenario | null {
  if (name === 'custom') {
    return null; // Custom scenarios must be provided explicitly
  }
  return HISTORICAL_SCENARIOS[name] || null;
}

/**
 * Get market parameters for a scenario
 * Falls back to default parameters if scenario not found
 * @param name - Scenario name
 * @returns Market parameters
 */
export function getScenarioMarketParameters(name: HistoricalScenarioName): MarketParameters {
  if (name === 'custom') {
    return { ...DEFAULT_MARKET_PARAMS };
  }

  const scenario = HISTORICAL_SCENARIOS[name];
  return scenario?.marketParameters || { ...DEFAULT_MARKET_PARAMS };
}

/**
 * Get all available scenario names (excluding 'custom')
 * @returns Array of scenario names
 */
export function getAvailableScenarios(): Exclude<HistoricalScenarioName, 'custom'>[] {
  return Object.keys(HISTORICAL_SCENARIOS) as Exclude<HistoricalScenarioName, 'custom'>[];
}

/**
 * Get default market parameters (neutral scenario)
 * @returns Default market parameters
 */
export function getDefaultMarketParameters(): MarketParameters {
  return { ...DEFAULT_MARKET_PARAMS };
}

/**
 * Validate that a scenario name is a valid predefined scenario
 * @param name - Scenario name to validate
 * @returns True if valid predefined scenario
 */
export function isValidScenario(name: string): name is HistoricalScenarioName {
  return name === 'custom' || name in HISTORICAL_SCENARIOS;
}

/**
 * Get scenario summary for display
 * @param name - Scenario name
 * @returns Summary object or null
 */
export function getScenarioSummary(name: HistoricalScenarioName): {
  name: string;
  period: string;
  description: string;
  severity: 'crisis' | 'downturn' | 'neutral' | 'growth' | 'boom';
} | null {
  if (name === 'custom') return null;

  const scenario = HISTORICAL_SCENARIOS[name];
  if (!scenario) return null;

  // Determine severity based on failure rate and exit multiples
  const params = scenario.marketParameters;
  let severity: 'crisis' | 'downturn' | 'neutral' | 'growth' | 'boom';

  if (!params) {
    severity = 'neutral';
  } else if (params.failureRate >= 0.45) {
    severity = 'crisis';
  } else if (params.failureRate >= 0.3 || params.exitMultiplierMean < 1.5) {
    severity = 'downturn';
  } else if (params.exitMultiplierMean >= 3.0) {
    severity = 'boom';
  } else if (params.exitMultiplierMean >= 2.0) {
    severity = 'growth';
  } else {
    severity = 'neutral';
  }

  return {
    name: scenario.name,
    period: `${scenario.startDate} to ${scenario.endDate}`,
    description: scenario.description || '',
    severity,
  };
}

/**
 * Compare two scenarios' market parameters
 * @param scenario1 - First scenario name
 * @param scenario2 - Second scenario name
 * @returns Comparison metrics
 */
export function compareScenarios(
  scenario1: HistoricalScenarioName,
  scenario2: HistoricalScenarioName
): {
  exitMultiplierDelta: number;
  failureRateDelta: number;
  holdPeriodDelta: number;
} {
  const params1 = getScenarioMarketParameters(scenario1);
  const params2 = getScenarioMarketParameters(scenario2);

  return {
    exitMultiplierDelta: params2.exitMultiplierMean - params1.exitMultiplierMean,
    failureRateDelta: params2.failureRate - params1.failureRate,
    holdPeriodDelta: params2.holdPeriodYears - params1.holdPeriodYears,
  };
}
