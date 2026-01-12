/**
 * Manual XIRR Golden Set Validation
 * Bypasses vitest dependency issues by running tests directly
 */

import { xirrNewtonBisection } from './shared/lib/finance/xirr.ts';

const EXCEL_TOLERANCE = 1e-7;
let passed = 0;
let failed = 0;
const results = [];

function test(name, flows, expectedIRR, options = {}) {
  const result = xirrNewtonBisection(flows);
  const pass = result.converged &&
               result.irr !== null &&
               Math.abs(result.irr - expectedIRR) < EXCEL_TOLERANCE;

  if (pass) {
    passed++;
    console.log(`✅ ${name}`);
    console.log(`   Expected: ${(expectedIRR * 100).toFixed(4)}% | Got: ${(result.irr * 100).toFixed(4)}%`);
  } else {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Expected: ${(expectedIRR * 100).toFixed(4)}%`);
    console.log(`   Got: ${result.irr ? (result.irr * 100).toFixed(4) : 'null'}%`);
    console.log(`   Converged: ${result.converged}`);
  }

  results.push({ name, pass, expected: expectedIRR, actual: result.irr });
  console.log('');
}

console.log('='.repeat(80));
console.log('XIRR GOLDEN SET VALIDATION - Excel Parity Tests');
console.log('='.repeat(80));
console.log('');

// Test #1: Simple 2-flow baseline (+20.10%)
test('Test #1: Simple 2-flow baseline (+20.10%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2025-01-01'), amount: 25000000 }
  ],
  0.2010340779
);

// Test #2: Multi-round + partial distribution (+30.89%)
test('Test #2: Multi-round + partial distribution (+30.89%)',
  [
    { date: new Date('2020-01-01'), amount: -5000000 },
    { date: new Date('2021-01-01'), amount: -10000000 },
    { date: new Date('2023-01-01'), amount: 5000000 },
    { date: new Date('2025-01-01'), amount: 40000000 }
  ],
  0.3088902613
);

// Test #3: Negative IRR (-36.89%)
test('Test #3: Negative IRR - loss scenario (-36.89%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2025-01-01'), amount: 1000000 }
  ],
  -0.3689233640
);

// Test #4: Near-zero IRR (+0.10%)
test('Test #4: Near-zero IRR - tiny gain (+0.10%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2025-01-01'), amount: 10050000 }
  ],
  0.0009975961
);

// Test #5: Monthly flows (+8.78%)
const monthlyFlows = [
  { date: new Date('2020-01-01'), amount: -10000000 }
];
for (let i = 0; i < 12; i++) {
  monthlyFlows.push({
    date: new Date(2020, i, 15),
    amount: 100000
  });
}
monthlyFlows.push({ date: new Date('2021-06-15'), amount: 10000000 });

test('Test #5: Monthly flows + irregular spacing (+8.78%)',
  monthlyFlows,
  0.0877660553
);

// Test #6: Quarterly flows + large exit (+80.63%)
test('Test #6: Quarterly flows + large exit spike (+80.63%)',
  [
    { date: new Date('2020-01-01'), amount: -20000000 },
    { date: new Date('2020-04-01'), amount: -2000000 },
    { date: new Date('2020-07-01'), amount: -2000000 },
    { date: new Date('2020-10-01'), amount: -2000000 },
    { date: new Date('2022-01-01'), amount: 80000000 }
  ],
  0.8063164822
);

// Test #7: Early distribution then follow-on (+21.81%)
test('Test #7: Early distribution then follow-on calls (+21.81%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2020-07-01'), amount: 8000000 },
    { date: new Date('2021-01-01'), amount: -5000000 },
    { date: new Date('2021-07-01'), amount: -3000000 },
    { date: new Date('2024-01-01'), amount: 20000000 }
  ],
  0.2180906137
);

// Test #8: Very high return (+115.41%)
test('Test #8: Very high return - 10x unicorn exit (+115.41%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2023-01-01'), amount: 100000000 }
  ],
  1.1540575356
);

// Test #13: J-curve (+24.56%)
test('Test #13: J-curve scenario - early loss then recovery (+24.56%)',
  [
    { date: new Date('2020-01-01'), amount: -20000000 },
    { date: new Date('2025-01-01'), amount: 60000000 }
  ],
  0.2456185821
);

// Test #14: Extreme negative IRR (-98.99%)
test('Test #14: Extreme negative IRR - 99% loss (-98.99%)',
  [
    { date: new Date('2020-01-01'), amount: -100000000 },
    { date: new Date('2021-01-01'), amount: 1000000 }
  ],
  -0.9899051851
);

// Test #15: Sub-year timing (+69.30%)
test('Test #15: Sub-year timing - 6 month exit (+69.30%)',
  [
    { date: new Date('2020-01-01'), amount: -10000000 },
    { date: new Date('2020-07-01'), amount: 13000000 }
  ],
  0.6930480449
);

// Summary
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${passed + failed}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);
console.log('');

const passRate = (passed / (passed + failed)) * 100;
if (passRate >= 95) {
  console.log('🎉 GATE #1 PASSED: ≥95% pass rate achieved!');
  console.log('   Excel parity confirmed. XIRR algorithm validated.');
  process.exit(0);
} else {
  console.log('❌ GATE #1 FAILED: < 95% pass rate');
  console.log(`   Need: ≥95% (${Math.ceil((passed + failed) * 0.95)} tests)`);
  console.log(`   Got: ${passRate.toFixed(2)}% (${passed} tests)`);
  process.exit(1);
}
