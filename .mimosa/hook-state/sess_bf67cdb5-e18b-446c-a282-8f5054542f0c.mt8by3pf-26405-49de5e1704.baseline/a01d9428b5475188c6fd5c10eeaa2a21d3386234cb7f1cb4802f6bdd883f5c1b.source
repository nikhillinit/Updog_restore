/**
 * Historical Scenarios Unit Tests
 *
 * Tests for predefined market scenario data and accessor functions.
 */

import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_SCENARIOS,
  getScenarioByName,
  getScenarioMarketParameters,
  getAvailableScenarios,
  getDefaultMarketParameters,
  isValidScenario,
  getScenarioSummary,
  compareScenarios,
} from '../../../server/data/historical-scenarios';

describe('HISTORICAL_SCENARIOS', () => {
  it('includes all expected predefined scenarios', () => {
    const expectedScenarios = [
      'financial_crisis_2008',
      'dotcom_bust_2000',
      'covid_2020',
      'bull_market_2021',
      'rate_hikes_2022',
    ];

    expectedScenarios.forEach((name) => {
      expect(HISTORICAL_SCENARIOS[name as keyof typeof HISTORICAL_SCENARIOS]).toBeDefined();
    });
  });

  it('has valid date ranges for all scenarios', () => {
    Object.values(HISTORICAL_SCENARIOS).forEach((scenario) => {
      const start = new Date(scenario.startDate);
      const end = new Date(scenario.endDate);

      expect(start.getTime()).toBeLessThan(end.getTime());
      expect(scenario.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(scenario.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('has valid market parameters for all scenarios', () => {
    Object.values(HISTORICAL_SCENARIOS).forEach((scenario) => {
      const params = scenario.marketParameters;
      expect(params).toBeDefined();

      if (params) {
        expect(params.exitMultiplierMean).toBeGreaterThan(0);
        expect(params.exitMultiplierMean).toBeLessThanOrEqual(10);
        expect(params.exitMultiplierVolatility).toBeGreaterThan(0);
        expect(params.failureRate).toBeGreaterThanOrEqual(0);
        expect(params.failureRate).toBeLessThanOrEqual(1);
        expect(params.followOnProbability).toBeGreaterThanOrEqual(0);
        expect(params.followOnProbability).toBeLessThanOrEqual(1);
        expect(params.holdPeriodYears).toBeGreaterThan(0);
      }
    });
  });

  it('has descriptions for all scenarios', () => {
    Object.values(HISTORICAL_SCENARIOS).forEach((scenario) => {
      expect(scenario.description).toBeDefined();
      expect(scenario.description!.length).toBeGreaterThan(20);
    });
  });
});

describe('getScenarioByName', () => {
  it('returns scenario for valid name', () => {
    const scenario = getScenarioByName('financial_crisis_2008');

    expect(scenario).not.toBeNull();
    expect(scenario?.name).toBe('financial_crisis_2008');
    expect(scenario?.startDate).toBe('2008-01-01');
    expect(scenario?.endDate).toBe('2009-12-31');
    expect(scenario?.marketParameters).toBeDefined();
  });

  it('returns null for custom scenario', () => {
    const scenario = getScenarioByName('custom');
    expect(scenario).toBeNull();
  });

  it('returns correct data for covid_2020', () => {
    const scenario = getScenarioByName('covid_2020');

    expect(scenario).not.toBeNull();
    expect(scenario?.startDate).toBe('2020-02-01');
    expect(scenario?.marketParameters?.failureRate).toBe(0.3);
  });

  it('returns correct data for bull_market_2021', () => {
    const scenario = getScenarioByName('bull_market_2021');

    expect(scenario).not.toBeNull();
    expect(scenario?.marketParameters?.exitMultiplierMean).toBe(4.0);
    expect(scenario?.marketParameters?.failureRate).toBe(0.15);
  });
});

describe('getScenarioMarketParameters', () => {
  it('returns market parameters for valid scenario', () => {
    const params = getScenarioMarketParameters('financial_crisis_2008');

    expect(params.exitMultiplierMean).toBe(1.2);
    expect(params.exitMultiplierVolatility).toBe(1.5);
    expect(params.failureRate).toBe(0.45);
    expect(params.followOnProbability).toBe(0.3);
    expect(params.holdPeriodYears).toBe(8.0);
  });

  it('returns default parameters for custom scenario', () => {
    const params = getScenarioMarketParameters('custom');

    expect(params.exitMultiplierMean).toBe(2.5);
    expect(params.failureRate).toBe(0.25);
  });

  it('returns different parameters for crisis vs boom', () => {
    const crisis = getScenarioMarketParameters('financial_crisis_2008');
    const boom = getScenarioMarketParameters('bull_market_2021');

    expect(crisis.exitMultiplierMean).toBeLessThan(boom.exitMultiplierMean);
    expect(crisis.failureRate).toBeGreaterThan(boom.failureRate);
    expect(crisis.holdPeriodYears).toBeGreaterThan(boom.holdPeriodYears);
  });
});

describe('getAvailableScenarios', () => {
  it('returns all predefined scenario names', () => {
    const scenarios = getAvailableScenarios();

    expect(scenarios.length).toBe(5);
    expect(scenarios).toContain('financial_crisis_2008');
    expect(scenarios).toContain('dotcom_bust_2000');
    expect(scenarios).toContain('covid_2020');
    expect(scenarios).toContain('bull_market_2021');
    expect(scenarios).toContain('rate_hikes_2022');
  });

  it('does not include custom in available scenarios', () => {
    const scenarios = getAvailableScenarios();
    expect(scenarios).not.toContain('custom');
  });
});

describe('getDefaultMarketParameters', () => {
  it('returns default neutral parameters', () => {
    const defaults = getDefaultMarketParameters();

    expect(defaults.exitMultiplierMean).toBe(2.5);
    expect(defaults.exitMultiplierVolatility).toBe(0.8);
    expect(defaults.failureRate).toBe(0.25);
    expect(defaults.followOnProbability).toBe(0.6);
    expect(defaults.holdPeriodYears).toBe(5.5);
  });

  it('returns a copy (not reference)', () => {
    const defaults1 = getDefaultMarketParameters();
    const defaults2 = getDefaultMarketParameters();

    defaults1.failureRate = 0.99;

    expect(defaults2.failureRate).toBe(0.25); // Unchanged
  });
});

describe('isValidScenario', () => {
  it('returns true for valid scenarios', () => {
    expect(isValidScenario('financial_crisis_2008')).toBe(true);
    expect(isValidScenario('covid_2020')).toBe(true);
    expect(isValidScenario('custom')).toBe(true);
  });

  it('returns false for invalid scenarios', () => {
    expect(isValidScenario('unknown_scenario')).toBe(false);
    expect(isValidScenario('')).toBe(false);
    expect(isValidScenario('FINANCIAL_CRISIS_2008')).toBe(false); // Case sensitive
  });
});

describe('getScenarioSummary', () => {
  it('returns summary for valid scenario', () => {
    const summary = getScenarioSummary('financial_crisis_2008');

    expect(summary).not.toBeNull();
    expect(summary?.name).toBe('financial_crisis_2008');
    expect(summary?.period).toBe('2008-01-01 to 2009-12-31');
    expect(summary?.severity).toBe('crisis');
  });

  it('returns null for custom scenario', () => {
    expect(getScenarioSummary('custom')).toBeNull();
  });

  it('classifies bull market as boom', () => {
    const summary = getScenarioSummary('bull_market_2021');
    expect(summary?.severity).toBe('boom');
  });

  it('classifies dotcom bust as crisis', () => {
    const summary = getScenarioSummary('dotcom_bust_2000');
    expect(summary?.severity).toBe('crisis');
  });

  it('classifies rate hikes as downturn', () => {
    const summary = getScenarioSummary('rate_hikes_2022');
    expect(summary?.severity).toBe('downturn');
  });
});

describe('compareScenarios', () => {
  it('compares crisis to boom correctly', () => {
    const comparison = compareScenarios('financial_crisis_2008', 'bull_market_2021');

    // Boom has higher exit multiples than crisis
    expect(comparison.exitMultiplierDelta).toBeGreaterThan(0);

    // Boom has lower failure rate than crisis
    expect(comparison.failureRateDelta).toBeLessThan(0);

    // Boom has shorter hold periods than crisis
    expect(comparison.holdPeriodDelta).toBeLessThan(0);
  });

  it('returns zero deltas when comparing same scenario', () => {
    const comparison = compareScenarios('covid_2020', 'covid_2020');

    expect(comparison.exitMultiplierDelta).toBe(0);
    expect(comparison.failureRateDelta).toBe(0);
    expect(comparison.holdPeriodDelta).toBe(0);
  });

  it('compares custom to predefined correctly', () => {
    const comparison = compareScenarios('custom', 'bull_market_2021');

    // Bull market has higher exit multiples than default
    expect(comparison.exitMultiplierDelta).toBeGreaterThan(0);
  });
});

describe('Scenario data integrity', () => {
  it('dotcom bust has highest failure rate', () => {
    const scenarios = getAvailableScenarios();
    const failureRates = scenarios.map((s) => ({
      name: s,
      rate: getScenarioMarketParameters(s).failureRate,
    }));

    const highest = failureRates.reduce((max, curr) => (curr.rate > max.rate ? curr : max));

    expect(highest.name).toBe('dotcom_bust_2000');
    expect(highest.rate).toBe(0.55);
  });

  it('bull market has highest exit multiples', () => {
    const scenarios = getAvailableScenarios();
    const multiples = scenarios.map((s) => ({
      name: s,
      multiple: getScenarioMarketParameters(s).exitMultiplierMean,
    }));

    const highest = multiples.reduce((max, curr) => (curr.multiple > max.multiple ? curr : max));

    expect(highest.name).toBe('bull_market_2021');
    expect(highest.multiple).toBe(4.0);
  });

  it('bull market has shortest hold period', () => {
    const scenarios = getAvailableScenarios();
    const holdPeriods = scenarios.map((s) => ({
      name: s,
      years: getScenarioMarketParameters(s).holdPeriodYears,
    }));

    const shortest = holdPeriods.reduce((min, curr) => (curr.years < min.years ? curr : min));

    expect(shortest.name).toBe('bull_market_2021');
    expect(shortest.years).toBe(3.5);
  });
});
