/**
 * XIRR Debug Harness
 *
 * Utility for debugging XIRR calculations during Phase 1.2 investigation.
 * Provides helpers to run scenarios, compute NPV at arbitrary rates,
 * and compare solver output to Excel validation.
 */

import { xirrNewtonBisection } from '../shared/lib/finance/xirr';

type Cashflow = { date: Date; amount: number };
type CashflowInput = { date: string; amount: number };

/**
 * Compute NPV at a specific rate for debugging purposes
 */
export function debugNPV(cashflows: Cashflow[], rate: number): number {
  if (cashflows.length === 0) return 0;

  // Sort by date
  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

  let npv = 0;
  for (const cf of sorted) {
    const years = (cf.date.getTime() - t0) / YEAR_MS;
    const discountFactor = Math.pow(1 + rate, -years);
    npv += cf.amount * discountFactor;
  }

  return npv;
}

/**
 * Compute NPV derivative at a specific rate
 */
export function debugNPVDerivative(cashflows: Cashflow[], rate: number): number {
  if (cashflows.length === 0) return 0;

  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

  let dNPV = 0;
  for (const cf of sorted) {
    const years = (cf.date.getTime() - t0) / YEAR_MS;
    const discountFactor = Math.pow(1 + rate, -years);
    dNPV += (cf.amount * -years * discountFactor) / (1 + rate);
  }

  return dNPV;
}

/**
 * Calculate year fractions for each cashflow
 */
export function debugYearFractions(
  cashflows: Cashflow[]
): Array<{ date: Date; amount: number; years: number }> {
  if (cashflows.length === 0) return [];

  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

  return sorted.map((cf) => ({
    date: cf.date,
    amount: cf.amount,
    years: (cf.date.getTime() - t0) / YEAR_MS,
  }));
}

/**
 * Run a scenario and print detailed debug information
 */
export function runScenario(
  id: string,
  flows: CashflowInput[],
  options?: {
    expectedIRR?: number;
    excelIRR?: number;
    guess?: number;
  }
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCENARIO: ${id}`);
  console.log('='.repeat(60));

  // Parse dates
  const parsed = flows.map((cf) => ({
    ...cf,
    date: new Date(cf.date),
  }));

  console.log('\nCashflows:');
  parsed.forEach((cf, i) => {
    console.log(
      `  ${i + 1}. ${cf.date.toISOString().split('T')[0]}: $${cf.amount.toLocaleString()}`
    );
  });

  // Compute year fractions
  console.log('\nYear Fractions:');
  const fractions = debugYearFractions(parsed);
  fractions.forEach((item, i) => {
    console.log(
      `  ${i + 1}. ${item.date.toISOString().split('T')[0]}: ${item.years.toFixed(6)} years`
    );
  });

  // Run solver
  const guess = options?.guess ?? 0.1;
  console.log(`\nRunning solver with guess = ${guess}...`);

  const result = xirrNewtonBisection(
    parsed,
    guess,
    1e-8, // tolerance
    200, // maxIterations
    'hybrid' // strategy
  );

  console.log('\nSolver Result:');
  if (result.irr !== null && result.irr !== undefined) {
    console.log(`  IRR: ${(result.irr * 100).toFixed(4)}% (${result.irr.toFixed(8)})`);
  } else {
    console.log(`  IRR: NULL (solver failed to converge or returned null)`);
  }
  console.log(`  Converged: ${result.converged}`);
  console.log(`  Method: ${result.method ?? 'N/A'}`);
  console.log(`  Iterations: ${result.iterations ?? 'N/A'}`);

  // NPV checks
  if (result.irr !== null && result.irr !== undefined && result.converged) {
    const npv = debugNPV(parsed, result.irr);
    console.log(`  NPV at solver IRR: ${npv.toExponential(6)}`);
  }

  if (options?.expectedIRR !== undefined) {
    const npvExpected = debugNPV(parsed, options.expectedIRR);
    console.log(`\nComparison to Expected (${(options.expectedIRR * 100).toFixed(4)}%):`);
    if (result.irr !== null && result.irr !== undefined) {
      const deltaExpected = Math.abs(result.irr - options.expectedIRR) * 10000;
      console.log(`  Delta: ${deltaExpected.toFixed(1)} bps`);
    }
    console.log(`  NPV at expected: ${npvExpected.toExponential(6)}`);
  }

  if (options?.excelIRR !== undefined) {
    const npvExcel = debugNPV(parsed, options.excelIRR);
    console.log(`\nComparison to Excel (${(options.excelIRR * 100).toFixed(4)}%):`);
    if (result.irr !== null && result.irr !== undefined) {
      const deltaExcel = Math.abs(result.irr - options.excelIRR) * 10000;
      console.log(`  Delta: ${deltaExcel.toFixed(1)} bps`);
    }
    console.log(`  NPV at Excel: ${npvExcel.toExponential(6)}`);
  }

  // Closed-form check for 2-flow scenarios
  if (flows.length === 2) {
    const [flow1, flow2] = parsed;
    const days = (flow2.date.getTime() - flow1.date.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365;
    const multiple = -flow2.amount / flow1.amount;
    const closedFormIRR = Math.pow(multiple, 1 / years) - 1;

    console.log(`\nClosed-Form Check (2-flow scenario):`);
    console.log(`  Days: ${days}`);
    console.log(`  Years: ${years.toFixed(6)}`);
    console.log(`  Multiple: ${multiple.toFixed(2)}x`);
    console.log(
      `  Closed-form IRR: ${(closedFormIRR * 100).toFixed(4)}% (${closedFormIRR.toFixed(8)})`
    );
    if (result.irr !== null && result.irr !== undefined) {
      console.log(`  Delta from solver: ${Math.abs(closedFormIRR - result.irr) * 10000} bps`);
    }
  }

  console.log('='.repeat(60) + '\n');

  return result;
}

/**
 * Quick helper for NPV-only checks
 */
export function checkNPV(flows: CashflowInput[], rate: number): void {
  const parsed = flows.map((cf) => ({ ...cf, date: new Date(cf.date) }));
  const npv = debugNPV(parsed, rate);
  const dNPV = debugNPVDerivative(parsed, rate);

  console.log(`NPV at rate ${(rate * 100).toFixed(4)}%: ${npv.toExponential(6)}`);
  console.log(`dNPV at rate ${(rate * 100).toFixed(4)}%: ${dNPV.toExponential(6)}`);
}

// Example usage (commented out for library mode)
/*
(async () => {
  // Test 13: Leap year handling
  runScenario('13-leap-year-handling', [
    { date: '2020-02-28', amount: -10000000 },
    { date: '2020-03-01', amount: 10100000 }
  ], {
    expectedIRR: 4.284325690000001,
    guess: 0.1
  });

  // Golden Case 2: Rapid 3x
  runScenario('golden-02-rapid-3x', [
    { date: '2020-01-01', amount: -100000 },
    { date: '2023-01-01', amount: 300000 }
  ], {
    expectedIRR: 0.2987638262,
    guess: 0.1
  });
})();
*/
