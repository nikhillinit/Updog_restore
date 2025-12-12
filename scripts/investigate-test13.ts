/**
 * Investigate Test 13: Leap Year Handling
 * Expected: 4.2843 (428%), Actual: 5.1468 (515%), Delta: 8625 bps
 */

import { runScenario } from './debug-xirr';

console.log('PHASE 1.2 INVESTIGATION: Test 13 - Leap Year Handling');
console.log('='.repeat(80));

runScenario(
  '13-leap-year-handling',
  [
    { date: '2020-02-28', amount: -10000000 },
    { date: '2020-03-01', amount: 10100000 },
  ],
  {
    expectedIRR: 4.284325690000001,
    guess: 0.1,
  }
);

console.log('\nHYPOTHESIS TESTING:');
console.log('-'.repeat(80));

// Manual closed-form calculation
const invested = 10000000;
const returned = 10100000;
const multiple = returned / invested; // 1.01
const days = 2; // Feb 28 → Mar 1 (crosses Feb 29 leap day)

console.log(`\nInvestment: $${invested.toLocaleString()}`);
console.log(`Return: $${returned.toLocaleString()}`);
console.log(`Multiple: ${multiple}x`);
console.log(`Days: ${days} (crosses Feb 29 leap year boundary)`);

// Closed-form IRR calculation
const years365 = days / 365;
const years366 = days / 366;

const irr365 = Math.pow(multiple, 1 / years365) - 1;
const irr366 = Math.pow(multiple, 1 / years366) - 1;

console.log(`\nClosed-Form IRR Calculations:`);
console.log(`  Using 365 denominator: ${(irr365 * 100).toFixed(4)}% (${irr365.toFixed(8)})`);
console.log(`  Using 366 denominator: ${(irr366 * 100).toFixed(4)}% (${irr366.toFixed(8)})`);

console.log(`\nComparison:`);
console.log(`  Expected (test):   ${(4.284325690000001 * 100).toFixed(4)}%`);
console.log(`  IRR (365 days):    ${(irr365 * 100).toFixed(4)}%`);
console.log(`  IRR (366 days):    ${(irr366 * 100).toFixed(4)}%`);
console.log(`  Solver actual:     ~514.68%`);

const delta365 = Math.abs(irr365 - 4.284325690000001) * 10000;
const delta366 = Math.abs(irr366 - 4.284325690000001) * 10000;

console.log(`\nDeltas from expected:`);
console.log(`  IRR (365) delta: ${delta365.toFixed(1)} bps`);
console.log(`  IRR (366) delta: ${delta366.toFixed(1)} bps`);

console.log(`\n${'='.repeat(80)}`);
console.log('VERDICT:');
console.log('If closed-form 365-day IRR ≈ 515% (matching solver), then:');
console.log('  → Expected value 428% is WRONG');
console.log('  → Truth case needs correction');
console.log('  → Solver is CORRECT');
console.log('='.repeat(80));
