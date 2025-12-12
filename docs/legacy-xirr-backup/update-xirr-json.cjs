/**
 * Update xirr.truth-cases.json with correct Excel IRR values
 * Based on Excel XIRR() results from comparison table
 */

const fs = require('fs');
const path = require('path');

// Excel IRR values from the comparison table (column 4)
const excelValues = {
  '01-simple-positive-return': 0.2008834994,
  '02-negative-return-loss': -0.3687244948,
  '03-multi-round-partial-distributions': 0.3086491291,
  '04-quarterly-flows': 0.8055855854,
  '05-zero-return-breakeven': 0.0000000000,
  '06-newton-success-smooth': 0.2008834994,
  '07-newton-failure-bisection-fallback': null, // Cannot bracket
  '08-bisection-only-mode': 0.2008834994,
  '09-convergence-tolerance-boundary': 0.2008834994,
  '10-maximum-iterations-reached': 0.2008834994,
  '11-excel-actual365-date-convention': 0.2008834994,
  '12-same-day-cashflow-aggregation': 0.2008834994,
  '13-leap-year-handling': 5.1468231090,
  '14-date-ordering-unsorted': 0.2008834994,
  '15-timezone-independent': 0.2008834994,
  '16-no-sign-change-all-positive': null,
  '17-no-sign-change-all-negative': null,
  '18-insufficient-cashflows-single': null,
  '19-out-of-bounds-extreme-rate': null, // Cannot bracket
  '20-floating-point-precision-tiny-amounts': 0.2008834994,
  '21-typical-vc-fund-10year': 0.1642126342,
  '22-early-exit-high-irr': 1.1529264684,
  '23-late-exit-lower-irr': 0.1744636993,
  '24-quarterly-recycling': 0.5569576357,
  '25-nav-heavy-terminal-value': 0.2555345226,
  'Golden Case 15: Biannual Distributions': 0.1103798003,
  'Golden Case 16: Waterfall Exit': 0.0615371041,
  'Golden Case 17: Bridge Financing': 0.1848354498,
  'Golden Case 18: Down Round': -0.0615345924,
  'Golden Case 19: Dividend Recapitalization': 0.1880471591,
  'Golden Case 20: Penny Stock Volatility': 2.7213339602,
  'Golden Case 21: Leap Year Edge': 0.1495609411,
  'Golden Case 22: Long Hold Moderate Return': 0.0799314924,
  'Golden Case 23: Turnaround Story': 0.2220949186,
  'Golden Case 24: Quarterly Dividends + Exit': 0.0532053665,
  'Golden Case 25: Shallow Negative': -0.0199784989,
  'Golden Case 1: Standard 2-flow': 0.1485240459,
  'Golden Case 2: Rapid 3x': 0.4417677551,
  'Golden Case 3: Multi-stage exit': 0.1418598534,
  'Golden Case 4: Explosive growth': 0.7775788910,
  'Golden Case 5: Modest hold': 0.0799314924,
  'Golden Case 6: Partial loss': -0.1293173151,
  'Golden Case 7: Near-zero': 0.0019898648,
  'Golden Case 8: Multiple follow-ons': 0.1685408789,
  'Golden Case 9: Extreme unicorn': 1.1529264684,
  'Golden Case 10: Alternating signs': 0.0716179977,
  'Golden Case 11: Leap year precision': 0.1697256401,
  'Golden Case 12: Annual dividends': 0.0451316954,
  'Golden Case 13: Shallow loss spread': -0.0104721798,
  'Golden Case 14: Quick flip': 0.4983391779,
};

// Read the JSON file
const jsonPath = path.join(__dirname, 'docs', 'xirr.truth-cases.json');
const truthCases = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

let updateCount = 0;
let nullCount = 0;

// Update each scenario
truthCases.forEach((testCase) => {
  // Try both scenario and id fields (Golden Cases use different format)
  const scenarioKey = testCase.scenario || testCase.id;

  if (excelValues.hasOwnProperty(scenarioKey)) {
    const excelValue = excelValues[scenarioKey];
    const oldValue = testCase.expected.irr;

    // Update expected IRR
    testCase.expected.irr = excelValue;
    testCase.expectedIRR = excelValue;

    // Update converged flag
    testCase.expected.converged = excelValue !== null;

    // Update excelParity flag (all values from Excel)
    testCase.expected.excelParity = excelValue !== null;

    if (excelValue === null) {
      nullCount++;
      console.log(`Updated ${scenarioKey}: ${oldValue} → null (unsolvable)`);
    } else if (oldValue !== excelValue) {
      const diff = Math.abs(oldValue - excelValue);
      console.log(`Updated ${scenarioKey}: ${oldValue} → ${excelValue} (diff: ${diff.toFixed(6)})`);
    }

    updateCount++;
  } else {
    console.warn(`WARNING: No Excel value for scenario: ${scenarioKey}`);
  }
});

// Write back to file
fs.writeFileSync(jsonPath, JSON.stringify(truthCases, null, 2), 'utf-8');

console.log(`\n✅ Updated ${updateCount} scenarios`);
console.log(`   - ${nullCount} scenarios marked as unsolvable (null)`);
console.log(`   - ${updateCount - nullCount} scenarios with numeric values`);
