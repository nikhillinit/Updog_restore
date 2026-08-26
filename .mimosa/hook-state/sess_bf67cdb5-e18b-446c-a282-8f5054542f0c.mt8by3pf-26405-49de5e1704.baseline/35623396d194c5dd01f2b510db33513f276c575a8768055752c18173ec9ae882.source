/**
 * Diagnostic script: Run truth cases through actual calculateAmericanWaterfall
 * and output actual results to compare with expected values
 */

import Decimal from 'decimal.js';
import { calculateAmericanWaterfall } from '../shared/schemas/waterfall-policy';
import { excelRound } from '../shared/lib/excelRound';
import truthCases from '../docs/waterfall.truth-cases.json';

console.log('🔍 Waterfall Truth Case Diagnostics\n');
console.log('Running actual calculateAmericanWaterfall() to see real outputs...\n');

for (const testCase of truthCases) {
  const { scenario, input, expected } = testCase;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`${'='.repeat(80)}`);

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

  // Calculate
  const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

  // Apply Excel rounding at reporting boundary
  const lpActual = excelRound(result.lpDistribution.toNumber(), 2);
  const gpActual = excelRound(result.gpDistribution.toNumber(), 2);
  const totalActual = excelRound(result.totalDistributed.toNumber(), 2);

  // Expected
  const lpExpected = parseFloat(expected.lpDistribution);
  const gpExpected = parseFloat(expected.gpDistribution);
  const totalExpected = parseFloat(expected.totalDistributed);

  // Compare
  const lpMatch = lpActual === lpExpected ? '✅' : '❌';
  const gpMatch = gpActual === gpExpected ? '✅' : '❌';
  const totalMatch = totalActual === totalExpected ? '✅' : '❌';

  console.log(`\nInput:`);
  console.log(`  Exit Proceeds: ${input.exitProceeds}`);
  console.log(`  Deal Cost:     ${input.dealCost}`);
  console.log(`  Hurdle Rate:   ${input.policy.preferredReturnRate}`);

  console.log(`\nExpected:`);
  console.log(`  LP:    ${lpExpected.toFixed(2)} ${lpMatch}`);
  console.log(`  GP:    ${gpExpected.toFixed(2)} ${gpMatch}`);
  console.log(`  Total: ${totalExpected.toFixed(2)} ${totalMatch}`);

  console.log(`\nActual (with excelRound):`);
  console.log(`  LP:    ${lpActual.toFixed(2)}`);
  console.log(`  GP:    ${gpActual.toFixed(2)}`);
  console.log(`  Total: ${totalActual.toFixed(2)}`);

  if (lpMatch === '❌' || gpMatch === '❌' || totalMatch === '❌') {
    console.log(`\n⚠️  MISMATCH - Update expected values to:`);
    console.log(`  "lpDistribution": "${lpActual.toFixed(2)}",`);
    console.log(`  "gpDistribution": "${gpActual.toFixed(2)}",`);
    console.log(`  "totalDistributed": "${totalActual.toFixed(2)}"`);
  }

  console.log(`\nBreakdown (${result.breakdown.length} tiers with allocations):`);
  result.breakdown.forEach((tier) => {
    const lpAmt = excelRound(tier.lpAmount.toNumber(), 2);
    const gpAmt = excelRound(tier.gpAmount.toNumber(), 2);
    console.log(
      `  ${tier.tier.padEnd(20)} LP: ${lpAmt.toFixed(2).padStart(12)}  GP: ${gpAmt.toFixed(2).padStart(12)}`
    );
  });
}

console.log(`\n${'='.repeat(80)}`);
console.log('✅ Diagnostic complete');
