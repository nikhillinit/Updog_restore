/**
 * Quick XIRR Validation Script
 *
 * Validates the golden set test cases against expected Excel values
 * Run: node scripts/validate-xirr.js
 */

// Simple XIRR implementation for validation
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function npvAt(rate, flows, t0) {
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

function dNpvAt(rate, flows, t0) {
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0.getTime()) / YEAR_MS;
    return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

function xirrNewton(flows, guess = 0.1, tolerance = 1e-7, maxIter = 100) {
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < 2) return null;

  const t0 = sorted[0].date;
  const hasNeg = sorted.some(cf => cf.amount < 0);
  const hasPos = sorted.some(cf => cf.amount > 0);
  if (!hasNeg || !hasPos) return null;

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const f = npvAt(rate, sorted, t0);
    if (Math.abs(f) < tolerance) {
      return rate;
    }
    const df = dNpvAt(rate, sorted, t0);
    if (Math.abs(df) < 1e-12) break;

    const next = rate - f / df;
    if (!Number.isFinite(next) || Math.abs(next - rate) > 100) break;

    rate = Math.min(1000, Math.max(-0.999999, next));
  }

  return null;
}

// Test cases
const tests = [
  {
    name: 'Test #1: Simple 2-flow baseline',
    flows: [
      { date: new Date('2020-01-01'), amount: -10000000 },
      { date: new Date('2025-01-01'), amount: 25000000 }
    ],
    expected: 0.2010340779
  },
  {
    name: 'Test #2: Multi-round + partial distribution',
    flows: [
      { date: new Date('2020-01-01'), amount: -5000000 },
      { date: new Date('2021-01-01'), amount: -10000000 },
      { date: new Date('2023-01-01'), amount: 5000000 },
      { date: new Date('2025-01-01'), amount: 40000000 }
    ],
    expected: 0.3088902613
  },
  {
    name: 'Test #3: Negative IRR',
    flows: [
      { date: new Date('2020-01-01'), amount: -10000000 },
      { date: new Date('2025-01-01'), amount: 1000000 }
    ],
    expected: -0.3689233640
  },
  {
    name: 'Test #4: Near-zero IRR',
    flows: [
      { date: new Date('2020-01-01'), amount: -10000000 },
      { date: new Date('2025-01-01'), amount: 10050000 }
    ],
    expected: 0.0009975961
  },
  {
    name: 'Test #8: Very high return (10x)',
    flows: [
      { date: new Date('2020-01-01'), amount: -10000000 },
      { date: new Date('2023-01-01'), amount: 100000000 }
    ],
    expected: 1.1540575356
  }
];

console.log('XIRR Golden Set Validation\n');
console.log('┌─────┬─────────────────────────────────────┬──────────────┬──────────────┬───────────┬────────┐');
console.log('│ #   │ Test Case                           │ Expected     │ Actual       │ Error     │ Status │');
console.log('├─────┼─────────────────────────────────────┼──────────────┼──────────────┼───────────┼────────┤');

let passed = 0;
let failed = 0;

tests.forEach((test, i) => {
  const result = xirrNewton(test.flows);
  const error = result !== null ? Math.abs(result - test.expected) : Infinity;
  const status = error < 1e-7 ? '✓ PASS' : '✗ FAIL';

  if (status === '✓ PASS') passed++;
  else failed++;

  const actual = result !== null ? result.toFixed(8) : 'null';
  const expected = test.expected.toFixed(8);
  const errorStr = error !== Infinity ? error.toExponential(2) : 'N/A';

  const name = test.name.padEnd(35).substring(0, 35);
  console.log(`│ ${(i+1).toString().padEnd(3)} │ ${name} │ ${expected} │ ${actual} │ ${errorStr.padEnd(9)} │ ${status}  │`);
});

console.log('└─────┴─────────────────────────────────────┴──────────────┴──────────────┴───────────┴────────┘');
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
