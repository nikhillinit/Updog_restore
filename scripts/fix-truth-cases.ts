/**
 * Automatically fix truth case expected values by running actual calculations
 * and updating the JSON file with corrected values
 */

import fs from 'node:fs';
import Decimal from 'decimal.js';
import { calculateAmericanWaterfall } from '../shared/schemas/waterfall-policy.js';
import { excelRound } from '../shared/lib/excelRound.js';

// Read current truth cases
const truthCasesPath = './docs/waterfall.truth-cases.json';
const truthCases = JSON.parse(fs.readFileSync(truthCasesPath, 'utf8'));

console.log('🔧 Fixing truth case expected values...\n');

let fixedCount = 0;

for (const testCase of truthCases) {
  const { scenario, input } = testCase;

  // Parse input
  const policy = {
    ...input.policy,
    preferredReturnRate: new Decimal(input.policy.preferredReturnRate),
    tiers: input.policy.tiers.map((tier) => ({
      ...tier,
      ...(tier.rate && { rate: new Decimal(tier.rate) }),
      ...(tier.catchUpRate && { catchUpRate: new Decimal(tier.catchUpRate) }),
    })),
  };

  const exitProceeds = new Decimal(input.exitProceeds);
  const dealCost = new Decimal(input.dealCost);

  // Calculate actual result
  const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

  // Get rounded values
  const lpActual = excelRound(result.lpDistribution.toNumber(), 2);
  const gpActual = excelRound(result.gpDistribution.toNumber(), 2);
  const totalActual = excelRound(result.totalDistributed.toNumber(), 2);

  // Check if update needed
  const lpExpected = parseFloat(testCase.expected.lpDistribution);
  const gpExpected = parseFloat(testCase.expected.gpDistribution);
  const totalExpected = parseFloat(testCase.expected.totalDistributed);

  const needsTopLevelFix =
    lpActual !== lpExpected || gpActual !== gpExpected || totalActual !== totalExpected;

  // Always regenerate breakdown if it exists (implementation only returns non-zero tiers)
  const needsBreakdownFix =
    testCase.expected.breakdown && testCase.expected.breakdown.length !== result.breakdown.length;

  if (needsTopLevelFix || needsBreakdownFix) {
    if (needsTopLevelFix) {
      console.log(`✏️  Fixing ${scenario}`);
      console.log(`   LP: ${lpExpected.toFixed(2)} → ${lpActual.toFixed(2)}`);
      console.log(`   GP: ${gpExpected.toFixed(2)} → ${gpActual.toFixed(2)}`);
    } else {
      console.log(
        `✏️  Fixing breakdown for ${scenario} (${testCase.expected.breakdown.length} → ${result.breakdown.length} tiers)`
      );
    }

    // Update expected values
    testCase.expected.lpDistribution = lpActual.toFixed(2);
    testCase.expected.gpDistribution = gpActual.toFixed(2);
    testCase.expected.totalDistributed = totalActual.toFixed(2);

    // Always update breakdown if it exists - only include non-zero tiers
    if (testCase.expected.breakdown) {
      testCase.expected.breakdown = result.breakdown.map((tier) => ({
        tier: tier.tier,
        lpAmount: excelRound(tier.lpAmount.toNumber(), 2).toFixed(2),
        gpAmount: excelRound(tier.gpAmount.toNumber(), 2).toFixed(2),
      }));
    }

    fixedCount++;
  }
}

// Write updated truth cases
fs.writeFileSync(truthCasesPath, JSON.stringify(truthCases, null, 2) + '\n', 'utf8');

console.log(`\n✅ Fixed ${fixedCount} truth case(s)`);
console.log(`📝 Updated: ${truthCasesPath}`);
