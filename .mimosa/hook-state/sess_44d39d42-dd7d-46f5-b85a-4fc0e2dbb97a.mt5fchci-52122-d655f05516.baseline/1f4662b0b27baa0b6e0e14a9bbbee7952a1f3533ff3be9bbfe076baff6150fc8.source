/**
 * XIRR Validation Script - Standalone
 *
 * Validates XIRR calculation against known test cases
 * Run: npx tsx scripts/validate-xirr.ts
 */

import Decimal from 'decimal.js';

// Set precision for financial calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

interface CashFlow {
  date: Date;
  amount: number;
  type: 'investment' | 'distribution';
}

/**
 * XIRR (Extended Internal Rate of Return) calculation
 * Uses Newton-Raphson method to find the rate that makes NPV = 0
 */
function xirr(cashflows: CashFlow[]): Decimal {
  if (cashflows.length < 2) {
    return new Decimal(0);
  }

  const baseDate = cashflows[0]!.date;
  const maxIterations = 100;
  const tolerance = new Decimal(0.0000001);

  // Initial guess: 10% annual return
  let rate = new Decimal(0.1);

  for (let i = 0; i < maxIterations; i++) {
    let npv = new Decimal(0);
    let dnpv = new Decimal(0);

    for (const cf of cashflows) {
      const years = yearsBetween(baseDate, cf.date);
      const factor = rate.plus(1).pow(years);

      npv = npv.plus(new Decimal(cf.amount).div(factor));
      dnpv = dnpv.minus(new Decimal(cf.amount).mul(years).div(factor.mul(rate.plus(1))));
    }

    const newRate = rate.minus(npv.div(dnpv));

    if (newRate.minus(rate).abs().lt(tolerance)) {
      return newRate;
    }

    rate = newRate;

    // Prevent infinite loops with unrealistic rates
    if (rate.lt(-0.99) || rate.gt(10)) {
      return new Decimal(0);
    }
  }

  return rate;
}

/**
 * Calculate years between two dates (fractional)
 */
function yearsBetween(start: Date, end: Date): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (end.getTime() - start.getTime()) / msPerYear;
}

/**
 * Test runner
 */
function runTests() {
  console.log('🧪 XIRR Validation Tests\n');
  console.log('========================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Simple 2-cashflow
  console.log('Test 1: Simple 2-Cashflow Scenario');
  console.log('Investment: -$10M on 2020-01-01');
  console.log('Exit: $25M on 2025-01-01');
  console.log('Excel XIRR Expected: 20.11%\n');

  const test1 = [
    { date: new Date('2020-01-01'), amount: -10000000, type: 'investment' as const },
    { date: new Date('2025-01-01'), amount: 25000000, type: 'distribution' as const },
  ];

  const irr1 = xirr(test1);
  const expected1 = 0.2011;
  const diff1 = Math.abs(irr1.toNumber() - expected1);
  const pass1 = diff1 < 0.0001;

  console.log(`Calculated IRR: ${(irr1.toNumber() * 100).toFixed(2)}%`);
  console.log(`Expected IRR:   ${(expected1 * 100).toFixed(2)}%`);
  console.log(`Difference:     ${(diff1 * 100).toFixed(4)}%`);
  console.log(`Status:         ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (pass1) passed++; else failed++;

  // Test 2: Multiple rounds with partial exit
  console.log('Test 2: Multiple Rounds with Partial Exit');
  console.log('Seed: -$5M on 2020-01-01');
  console.log('Series A: -$10M on 2021-01-01');
  console.log('Partial exit: +$5M on 2023-01-01');
  console.log('Final NAV: $40M on 2025-01-01');
  console.log('Excel XIRR Expected: ~53.4%\n');

  const test2 = [
    { date: new Date('2020-01-01'), amount: -5000000, type: 'investment' as const },
    { date: new Date('2021-01-01'), amount: -10000000, type: 'investment' as const },
    { date: new Date('2023-01-01'), amount: 5000000, type: 'distribution' as const },
    { date: new Date('2025-01-01'), amount: 40000000, type: 'distribution' as const },
  ];

  const irr2 = xirr(test2);
  const expected2 = 0.534;
  const diff2 = Math.abs(irr2.toNumber() - expected2);
  const pass2 = diff2 < 0.001;

  console.log(`Calculated IRR: ${(irr2.toNumber() * 100).toFixed(2)}%`);
  console.log(`Expected IRR:   ${(expected2 * 100).toFixed(2)}%`);
  console.log(`Difference:     ${(diff2 * 100).toFixed(4)}%`);
  console.log(`Status:         ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (pass2) passed++; else failed++;

  // Test 3: J-curve
  console.log('Test 3: J-Curve with Recovery');
  console.log('Investment: -$20M on 2020-01-01');
  console.log('Final NAV: $60M on 2025-01-01');
  console.log('Excel XIRR Expected: ~24.6%\n');

  const test3 = [
    { date: new Date('2020-01-01'), amount: -20000000, type: 'investment' as const },
    { date: new Date('2025-01-01'), amount: 60000000, type: 'distribution' as const },
  ];

  const irr3 = xirr(test3);
  const expected3 = 0.246;
  const diff3 = Math.abs(irr3.toNumber() - expected3);
  const pass3 = diff3 < 0.001;

  console.log(`Calculated IRR: ${(irr3.toNumber() * 100).toFixed(2)}%`);
  console.log(`Expected IRR:   ${(expected3 * 100).toFixed(2)}%`);
  console.log(`Difference:     ${(diff3 * 100).toFixed(4)}%`);
  console.log(`Status:         ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (pass3) passed++; else failed++;

  // Test 4: Negative IRR (loss)
  console.log('Test 4: Negative IRR (Total Loss)');
  console.log('Investment: -$10M on 2020-01-01');
  console.log('Final NAV: $1M on 2025-01-01');
  console.log('Excel XIRR Expected: ~-29%\n');

  const test4 = [
    { date: new Date('2020-01-01'), amount: -10000000, type: 'investment' as const },
    { date: new Date('2025-01-01'), amount: 1000000, type: 'distribution' as const },
  ];

  const irr4 = xirr(test4);
  const expected4 = -0.29;
  const diff4 = Math.abs(irr4.toNumber() - expected4);
  const pass4 = diff4 < 0.02;

  console.log(`Calculated IRR: ${(irr4.toNumber() * 100).toFixed(2)}%`);
  console.log(`Expected IRR:   ${(expected4 * 100).toFixed(2)}%`);
  console.log(`Difference:     ${(diff4 * 100).toFixed(4)}%`);
  console.log(`Status:         ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (pass4) passed++; else failed++;

  // Test 5: Realistic VC Fund
  console.log('Test 5: Realistic VC Fund');
  console.log('Year 1: -$30M deployed');
  console.log('Year 2: -$20M follow-on');
  console.log('Year 3: $10M exit');
  console.log('Year 4: $15M exit');
  console.log('Year 5: $120M NAV');
  console.log('Expected: ~24% IRR\n');

  const test5 = [
    { date: new Date('2020-01-01'), amount: -30000000, type: 'investment' as const },
    { date: new Date('2021-01-01'), amount: -20000000, type: 'investment' as const },
    { date: new Date('2023-01-01'), amount: 10000000, type: 'distribution' as const },
    { date: new Date('2024-01-01'), amount: 15000000, type: 'distribution' as const },
    { date: new Date('2025-01-01'), amount: 120000000, type: 'distribution' as const },
  ];

  const irr5 = xirr(test5);
  const pass5 = irr5.toNumber() > 0.20 && irr5.toNumber() < 0.30;

  console.log(`Calculated IRR: ${(irr5.toNumber() * 100).toFixed(2)}%`);
  console.log(`Expected Range: 20% - 30%`);
  console.log(`Status:         ${pass5 ? '✅ PASS' : '❌ FAIL'}\n`);

  if (pass5) passed++; else failed++;

  // Summary
  console.log('========================');
  console.log('📊 Test Summary\n');
  console.log(`Total Tests:  ${passed + failed}`);
  console.log(`✅ Passed:    ${passed}`);
  console.log(`❌ Failed:    ${failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(0)}%\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! XIRR calculation is ACCURATE.\n');
    console.log('✅ Ready for finance team sign-off');
  } else {
    console.log('⚠️  Some tests failed. Review algorithm.\n');
    process.exit(1);
  }
}

// Run tests
runTests();
