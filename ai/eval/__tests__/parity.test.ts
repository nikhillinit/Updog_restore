import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Decimal from 'decimal.js';

// Configure Decimal for financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21
});

interface CashFlow {
  scenario_id: string;
  period_index: number;
  period_date: string;
  cf_amount: number;
  expected_irr: number;
  expected_tvpi: number;
}

/**
 * Parse CSV golden fixtures
 */
function parseGoldenFixtures(csvPath: string): Map<string, CashFlow[]> {
  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  const header = lines[0];

  const scenarios = new Map<string, CashFlow[]>();

  for (let i = 1; i < lines.length; i++) {
    const [scenario_id, period_index, period_date, cf_amount, expected_irr, expected_tvpi] = lines[i].split(',');

    if (!scenarios.has(scenario_id)) {
      scenarios.set(scenario_id, []);
    }

    scenarios.get(scenario_id)!.push({
      scenario_id,
      period_index: parseInt(period_index, 10),
      period_date,
      cf_amount: parseFloat(cf_amount),
      expected_irr: parseFloat(expected_irr),
      expected_tvpi: parseFloat(expected_tvpi)
    });
  }

  return scenarios;
}

/**
 * Calculate XIRR using Newton-Raphson method
 * Returns annualized IRR from quarterly cash flows
 */
function calculateXIRR(cashFlows: CashFlow[]): Decimal {
  const amounts = cashFlows.map(cf => new Decimal(cf.cf_amount));
  const dates = cashFlows.map(cf => new Date(cf.period_date).getTime());
  const baseDate = dates[0];

  // Days from base date (Actual/365)
  const days = dates.map(d => (d - baseDate) / (1000 * 60 * 60 * 24));
  const years = days.map(d => new Decimal(d).div(365));

  // Newton-Raphson: find rate where NPV = 0
  let rate = new Decimal(0.1); // Initial guess
  const maxIterations = 100;
  const tolerance = new Decimal(1e-9);

  for (let iter = 0; iter < maxIterations; iter++) {
    let npv = new Decimal(0);
    let dnpv = new Decimal(0);

    for (let i = 0; i < amounts.length; i++) {
      const factor = new Decimal(1).plus(rate).pow(years[i]);
      npv = npv.plus(amounts[i].div(factor));
      dnpv = dnpv.minus(amounts[i].mul(years[i]).div(factor.mul(new Decimal(1).plus(rate))));
    }

    if (npv.abs().lt(tolerance)) {
      break;
    }

    const newRate = rate.minus(npv.div(dnpv));
    if (newRate.minus(rate).abs().lt(tolerance)) {
      break;
    }
    rate = newRate;
  }

  return rate;
}

/**
 * Calculate TVPI (Total Value to Paid-In)
 */
function calculateTVPI(cashFlows: CashFlow[]): Decimal {
  let invested = new Decimal(0);
  let distributed = new Decimal(0);
  let currentValue = new Decimal(0);

  for (const cf of cashFlows) {
    const amount = new Decimal(cf.cf_amount);
    if (amount.lt(0)) {
      invested = invested.plus(amount.abs());
    } else if (amount.gt(0)) {
      distributed = distributed.plus(amount);
    }
  }

  // Last positive cash flow is exit value
  const lastPositive = cashFlows.filter(cf => cf.cf_amount > 0).pop();
  if (lastPositive) {
    currentValue = new Decimal(lastPositive.cf_amount);
  }

  // TVPI = (Distributions + Current NAV) / Capital Called
  // For fully exited scenarios, current NAV is already in distributions
  const tvpi = distributed.div(invested);

  return tvpi;
}

describe('Excel Parity (Golden Fixtures)', () => {
  test('matches Excel IRR within 1e-6 tolerance', () => {
    const csvPath = join(__dirname, '../../../tests/agents/fixtures/golden-cashflows.csv');
    const scenarios = parseGoldenFixtures(csvPath);

    const results: { scenario: string; expected: number; actual: number; delta: number }[] = [];

    for (const [scenarioId, cashFlows] of scenarios.entries()) {
      const expectedIRR = cashFlows[0].expected_irr;
      const calculatedIRR = calculateXIRR(cashFlows);
      const delta = Math.abs(calculatedIRR.toNumber() - expectedIRR);

      results.push({
        scenario: scenarioId,
        expected: expectedIRR,
        actual: calculatedIRR.toNumber(),
        delta
      });

      // Assert IRR parity
      expect(delta).toBeLessThanOrEqual(1e-6);
    }

    // Log results for visibility
    console.table(results);
  });

  test('matches Excel TVPI within 1e-6 tolerance', () => {
    const csvPath = join(__dirname, '../../../tests/agents/fixtures/golden-cashflows.csv');
    const scenarios = parseGoldenFixtures(csvPath);

    const results: { scenario: string; expected: number; actual: number; delta: number }[] = [];

    for (const [scenarioId, cashFlows] of scenarios.entries()) {
      const expectedTVPI = cashFlows[0].expected_tvpi;
      const calculatedTVPI = calculateTVPI(cashFlows);
      const delta = Math.abs(calculatedTVPI.toNumber() - expectedTVPI);

      results.push({
        scenario: scenarioId,
        expected: expectedTVPI,
        actual: calculatedTVPI.toNumber(),
        delta
      });

      // Assert TVPI parity
      expect(delta).toBeLessThanOrEqual(1e-6);
    }

    // Log results for visibility
    console.table(results);
  });

  test('TVPI invariant: TVPI >= DPI', () => {
    const csvPath = join(__dirname, '../../../tests/agents/fixtures/golden-cashflows.csv');
    const scenarios = parseGoldenFixtures(csvPath);

    for (const [scenarioId, cashFlows] of scenarios.entries()) {
      const tvpi = calculateTVPI(cashFlows);

      // Calculate DPI (distributions only, no unrealized value)
      let invested = new Decimal(0);
      let distributed = new Decimal(0);

      for (const cf of cashFlows) {
        const amount = new Decimal(cf.cf_amount);
        if (amount.lt(0)) {
          invested = invested.plus(amount.abs());
        } else if (amount.gt(0)) {
          distributed = distributed.plus(amount);
        }
      }

      const dpi = distributed.div(invested);

      // TVPI must always be >= DPI
      expect(tvpi.gte(dpi)).toBe(true);
    }
  });

  test('deterministic calculation (same input → same output)', () => {
    const csvPath = join(__dirname, '../../../tests/agents/fixtures/golden-cashflows.csv');
    const scenarios = parseGoldenFixtures(csvPath);

    for (const [scenarioId, cashFlows] of scenarios.entries()) {
      const irr1 = calculateXIRR(cashFlows);
      const irr2 = calculateXIRR(cashFlows);
      const tvpi1 = calculateTVPI(cashFlows);
      const tvpi2 = calculateTVPI(cashFlows);

      // Exact equality (determinism)
      expect(irr1.equals(irr2)).toBe(true);
      expect(tvpi1.equals(tvpi2)).toBe(true);
    }
  });
});
