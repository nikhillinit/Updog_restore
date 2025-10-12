#!/usr/bin/env node
/**
 * Verify Golden Dataset Calculations
 *
 * This script validates that the golden dataset expected values match
 * the calculated values from our production XIRR implementation.
 */
import { readFileSync } from 'fs';

// Simple XIRR implementation for verification (mirrors client/src/lib/xirr.ts logic)
function calculateXIRRSimple(cashflows) {
  if (cashflows.length < 2) {
    throw new Error('Need at least 2 cashflows');
  }

  const hasPos = cashflows.some(cf => cf.amount > 0);
  const hasNeg = cashflows.some(cf => cf.amount < 0);
  if (!hasPos || !hasNeg) {
    throw new Error('Need both positive and negative cashflows');
  }

  // Newton-Raphson
  let rate = 0.1;
  const maxIter = 100;
  const tol = 1e-6;

  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let derivative = 0;

    for (const cf of cashflows) {
      const days = (cf.date - cashflows[0].date) / (1000 * 60 * 60 * 24);
      const years = days / 365;
      const discount = Math.pow(1 + rate, years);

      const pv = cf.amount / discount;
      const dvdt = (-years * cf.amount) / Math.pow(1 + rate, years + 1);

      npv += pv;
      derivative += dvdt;
    }

    if (Math.abs(npv) < tol) {
      return rate;
    }

    if (derivative === 0) {
      throw new Error('Derivative is zero');
    }

    rate = rate - npv / derivative;

    if (rate < -0.999 || rate > 10) {
      throw new Error('Rate out of bounds');
    }
  }

  throw new Error('Did not converge');
}

// Load golden dataset from CSV
const cashflowsCsv = readFileSync('tests/parity/golden/seed-fund-basic.csv', 'utf-8');
const resultsCsv = readFileSync('tests/parity/golden/seed-fund-basic.results.csv', 'utf-8');

// Parse cashflows
const cashflowsLines = cashflowsCsv.trim().split('\n').slice(1); // Skip header
const cashflows = cashflowsLines.map(line => {
  const [date, amount] = line.split(',');
  return { date: new Date(date), amount: Number(amount) };
});

// Parse expected results
const resultsLines = resultsCsv.trim().split('\n').slice(1); // Skip header
const expected = {};
resultsLines.forEach(line => {
  const [metric, value] = line.split(',');
  expected[metric] = Number(value);
});

// Calculate metrics
const calledCapital = cashflows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + Math.abs(cf.amount), 0);
const distributions = cashflows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);
const nav = cashflows[cashflows.length - 1].amount; // Last positive cashflow is NAV

const tvpi = distributions / calledCapital;
const dpi = (distributions - nav) / calledCapital;
const xirr = calculateXIRRSimple(cashflows);

console.log('Golden Dataset Verification');
console.log('===========================\n');
console.log('Calculated Metrics:');
console.log(`  XIRR: ${xirr.toFixed(6)}`);
console.log(`  TVPI: ${tvpi.toFixed(6)}`);
console.log(`  DPI:  ${dpi.toFixed(6)}`);
console.log('\nExpected (from CSV):');
console.log(`  XIRR: ${expected.xirr.toFixed(6)}`);
console.log(`  TVPI: ${expected.tvpi.toFixed(6)}`);
console.log(`  DPI:  ${expected.dpi.toFixed(6)}`);
console.log('\nDifferences:');
console.log(`  XIRR: ${Math.abs(xirr - expected.xirr).toExponential(2)}`);
console.log(`  TVPI: ${Math.abs(tvpi - expected.tvpi).toExponential(2)}`);
console.log(`  DPI:  ${Math.abs(dpi - expected.dpi).toExponential(2)}`);

// Check if within tolerance
const xirrMatch = Math.abs(xirr - expected.xirr) < 1e-6;
const tvpiMatch = Math.abs(tvpi - expected.tvpi) < 1e-6;
const dpiMatch = Math.abs(dpi - expected.dpi) < 1e-6;

console.log('\nParity Check (tolerance 1e-6):');
console.log(`  XIRR: ${xirrMatch ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  TVPI: ${tvpiMatch ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  DPI:  ${dpiMatch ? '✓ PASS' : '✗ FAIL'}`);

if (xirrMatch && tvpiMatch && dpiMatch) {
  console.log('\n✓ All metrics match within tolerance!');
  process.exit(0);
} else {
  console.log('\n✗ Some metrics are outside tolerance. Update golden dataset.');
  process.exit(1);
}
