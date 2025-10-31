/**
 * Prompt Caching Demo
 *
 * Demonstrates the cost savings from using prompt caching in the
 * InterleavedThinkingClient for VC fund modeling scenarios.
 *
 * Run with: npx tsx server/examples/prompt-caching-demo.ts
 */

import { InterleavedThinkingClient } from '../utils/interleaved-thinking-client';

// ============================================================================
// Fund Context (Cached)
// ============================================================================

const FUND_CONTEXT = `
# Press On Ventures Fund II - Context

## Fund Structure
- Fund Size: $50M
- Management Fee: 2%
- Carry: 20% (with 8% hurdle)
- Waterfall Type: AMERICAN
- Investment Period: 4 years
- Fund Life: 10 years

## Portfolio Strategy
- Target Companies: 25-30
- Average Check Size: $2M
- Follow-on Reserve: 40% of committed capital
- Sector Focus: Enterprise SaaS, FinTech, HealthTech

## Current Portfolio (Year 2)
- Deployed Capital: $20M across 12 companies
- Average Ownership: 15%
- Companies with follow-on rounds: 4
- Reserves Deployed: $8M

## Key Metrics
- IRR Target: 25%+
- TVPI Target: 3.0x+
- DPI Minimum: 1.5x by Year 7
- Expected Exit Timeline: Years 5-8

## Financial Formulas Used
- IRR: Internal Rate of Return using XIRR
- TVPI: Total Value to Paid-In Capital
- DPI: Distributions to Paid-In Capital
- MOIC: Multiple on Invested Capital
- NPV: Net Present Value at 12% discount rate
`;

// ============================================================================
// System Prompt (Cached)
// ============================================================================

const SYSTEM_PROMPT = `
You are a financial analyst specializing in venture capital fund modeling.
You have deep expertise in:

1. Financial Calculations
   - IRR, NPV, TVPI, DPI, MOIC calculations
   - Waterfall distributions (American vs European)
   - Portfolio construction and pacing analysis
   - Reserve allocation strategies

2. Database Access
   - Query fund performance metrics
   - Analyze portfolio company data
   - Generate LP reporting insights

3. Tools Available
   - calculator: For financial computations
   - database_query: For querying PostgreSQL fund database

Always show your thinking process and use tools when calculations are needed.
Provide clear, actionable insights for GPs and LPs.
`;

// ============================================================================
// Demo Functions
// ============================================================================

async function demoWithoutCaching() {
  console.log('\n=== DEMO 1: WITHOUT Caching ===\n');

  const client = new InterleavedThinkingClient();

  const queries = [
    'Calculate the current TVPI for the fund',
    'What is our deployed capital percentage?',
    'Estimate the reserves needed for Series B follow-ons',
  ];

  let totalCost = 0;

  for (const query of queries) {
    console.log(`Query: ${query}`);

    const result = await client.query(query, {
      systemPrompt: SYSTEM_PROMPT,
      cacheSystemPrompt: false, // NO CACHING
    });

    console.log(`Answer: ${result.finalAnswer.substring(0, 100)}...`);
    console.log(`Cost: $${result.cost_usd.toFixed(4)}`);
    console.log(`Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out\n`);

    totalCost += result.cost_usd;
  }

  console.log(`TOTAL COST (without caching): $${totalCost.toFixed(4)}\n`);

  await client.close();
  return totalCost;
}

async function demoWithCaching() {
  console.log('\n=== DEMO 2: WITH Caching ===\n');

  const client = new InterleavedThinkingClient();

  const queries = [
    'Calculate the current TVPI for the fund',
    'What is our deployed capital percentage?',
    'Estimate the reserves needed for Series B follow-ons',
  ];

  let totalCost = 0;
  let totalSavings = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`Query ${i + 1}: ${query}`);

    const result = await client.query(query, {
      systemPrompt: SYSTEM_PROMPT,
      cacheSystemPrompt: true, // ENABLE CACHING
      fundContext: FUND_CONTEXT, // ALSO CACHED
    });

    console.log(`Answer: ${result.finalAnswer.substring(0, 100)}...`);
    console.log(`Cost: $${result.cost_usd.toFixed(4)}`);

    if (i === 0) {
      console.log(`Cache: WRITE (${result.usage.cache_creation_input_tokens} tokens)`);
    } else {
      console.log(`Cache: READ (${result.usage.cache_read_input_tokens} tokens)`);
      console.log(`Savings: $${result.cache_savings_usd?.toFixed(4)}`);
      totalSavings += result.cache_savings_usd || 0;
    }

    console.log(`Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out\n`);

    totalCost += result.cost_usd;
  }

  console.log(`TOTAL COST (with caching): $${totalCost.toFixed(4)}`);
  console.log(`TOTAL SAVINGS: $${totalSavings.toFixed(4)}\n`);

  await client.close();
  return { cost: totalCost, savings: totalSavings };
}

async function demoMonteCarloScenario() {
  console.log('\n=== DEMO 3: Monte Carlo Simulation (1000 iterations) ===\n');

  const iterations = 1000;

  console.log('Scenario: Running 1000 Monte Carlo iterations for fund outcome analysis');
  console.log('Each iteration uses the same fund context and system prompt\n');

  // Estimate without caching
  const avgTokensPerQuery = 2000; // system prompt + fund context
  const outputTokensPerQuery = 500;
  const costPerIterationNoCaching =
    (avgTokensPerQuery / 1_000_000) * 0.003 + (outputTokensPerQuery / 1_000_000) * 0.015;
  const totalCostNoCaching = costPerIterationNoCaching * iterations;

  console.log('WITHOUT Caching:');
  console.log(`  Cost per iteration: $${costPerIterationNoCaching.toFixed(6)}`);
  console.log(`  Total cost (${iterations} iterations): $${totalCostNoCaching.toFixed(2)}\n`);

  // Estimate with caching
  const cacheWriteCost = (avgTokensPerQuery / 1_000_000) * 0.00375; // First iteration
  const cacheReadCost = (avgTokensPerQuery / 1_000_000) * 0.0003; // Subsequent iterations
  const outputCostPerIteration = (outputTokensPerQuery / 1_000_000) * 0.015;

  const totalCostWithCaching =
    cacheWriteCost + // First iteration writes cache
    (iterations - 1) * (cacheReadCost + outputCostPerIteration); // Rest read from cache

  const savings = totalCostNoCaching - totalCostWithCaching;
  const savingsPercent = (savings / totalCostNoCaching) * 100;

  console.log('WITH Caching:');
  console.log(`  First iteration (cache write): $${cacheWriteCost.toFixed(6)}`);
  console.log(
    `  Subsequent iterations (cache read): $${(cacheReadCost + outputCostPerIteration).toFixed(6)} each`
  );
  console.log(`  Total cost (${iterations} iterations): $${totalCostWithCaching.toFixed(2)}\n`);

  console.log('SAVINGS:');
  console.log(`  Total saved: $${savings.toFixed(2)}`);
  console.log(`  Savings percentage: ${savingsPercent.toFixed(1)}%`);
  console.log(`  ROI: ${((savings / totalCostWithCaching) * 100).toFixed(0)}% return on caching\n`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     PROMPT CACHING DEMO - VC Fund Modeling                ║');
  console.log('║     Press On Ventures Fund II Analysis                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Demo 1: Without caching (baseline)
    const costNoCaching = await demoWithoutCaching();

    // Demo 2: With caching
    const { cost: costWithCaching, savings } = await demoWithCaching();

    // Demo 3: Monte Carlo scenario (estimated)
    await demoMonteCarloScenario();

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('SUMMARY - 3 Query Comparison');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Without Caching: $${costNoCaching.toFixed(4)}`);
    console.log(`With Caching:    $${costWithCaching.toFixed(4)}`);
    console.log(
      `Savings:         $${savings.toFixed(4)} (${((savings / costNoCaching) * 100).toFixed(1)}%)`
    );
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('✅ Demo complete! Prompt caching can save 80-90% on repeated queries.');
    console.log(
      '💡 Use caching for: Monte Carlo simulations, batch analyses, multi-turn workflows\n'
    );
  } catch (error) {
    console.error('Error running demo:', error);
    process.exit(1);
  }
}

// Run if executed directly (ESM-safe check)
// eslint-disable-next-line no-undef
const isMainModule =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
if (isMainModule) {
  void main();
}

export { demoWithoutCaching, demoWithCaching, demoMonteCarloScenario };
