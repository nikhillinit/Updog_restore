#!/usr/bin/env tsx

/**
 * Demonstrates the Agent Router with existing memory and evaluator capabilities
 */

import { AgentRouter, routeWithExtendedThinking } from './router';

async function demonstrateRouting() {
  const router = new AgentRouter();

  console.log('🚀 Agent Router Demonstration\n');
  console.log('='.repeat(60));

  // Example 1: Simple waterfall query (uses memory)
  console.log('\n📌 Example 1: Waterfall Analysis');
  const query1 = 'Calculate carry distribution for our new $100M fund with 20% carry';
  const result1 = await routeWithExtendedThinking(query1);
  console.log(result1);

  // Example 2: Complex testing request (parallel execution)
  console.log('\n📌 Example 2: Comprehensive Testing');
  const query2 = 'Test the new waterfall implementation and check coverage';
  const routing2 = await router.route(query2);
  console.log('Routing:', routing2);

  // Example 3: Iterative optimization (evaluator-optimizer loop)
  console.log('\n📌 Example 3: Reserve Strategy Optimization');
  const query3 = 'Optimize our reserve allocation strategy for Fund V';

  console.log('Starting evaluator-optimizer loop...');
  const optimized = await router.executeEvaluatorOptimizerLoop(
    query3,
    'legacy-modernizer', // Proposer (could be any strategy agent)
    'test-automator', // Evaluator
    3 // Max iterations
  );
  console.log('Optimized result:', optimized);

  console.log('\n' + '='.repeat(60));
}

/**
 * Demonstrate how existing agents can work together
 */
async function demonstrateAgentCollaboration() {
  console.log('\n🤝 Agent Collaboration Example\n');
  console.log('='.repeat(60));

  // Simulate a complex scenario that requires multiple agents
  const scenario = `
    We're evaluating a potential $5M Series A investment in a B2B SaaS company.
    Need to:
    1. Model the impact on our fund's IRR
    2. Check if this violates any concentration limits
    3. Review the proposed term sheet
    4. Generate a recommendation memo
  `;

  const router = new AgentRouter();

  // This would orchestrate multiple agents
  const agents = [
    'waterfall-specialist', // For IRR impact
    'test-automator', // For concentration limit testing
    'code-reviewer', // For term sheet review
    'docs-architect', // For memo generation
  ];

  console.log('Scenario:', scenario);
  console.log('\nAgent execution plan:');

  for (const [idx, agent] of agents.entries()) {
    console.log(`${idx + 1}. ${agent}`);
  }

  // Show how we leverage existing memory
  console.log('\n📚 Memory Context:');
  console.log('- Loading from CLAUDE.md: Fund architecture and policies');
  console.log('- Loading from CHANGELOG.md: Recent investment decisions');
  console.log('- Loading from DECISIONS.md: Investment criteria and limits');
}

/**
 * Demonstrate extended thinking pattern
 */
function demonstrateExtendedThinking() {
  console.log('\n🧠 Extended Thinking Example\n');
  console.log('='.repeat(60));

  const userQuery = 'Should we increase our reserve ratio from 1:1 to 1.5:1?';

  const extendedResponse = `
<thinking>
The user is asking about reserve ratio optimization. This is a strategic decision
that affects:
1. Follow-on capacity for existing portfolio
2. Ability to make new investments
3. Fund deployment pacing
4. Ultimate fund returns

Current context from memory:
- Fund V has $100M total capital
- Currently deployed: $40M (40%)
- Current reserve ratio: 1:1
- Portfolio companies: 15
- Top performers needing follow-on: 5

Key considerations:
- Higher reserves (1.5:1) = More follow-on capacity but fewer initial investments
- Lower reserves (1:1) = More diversification but risk of missing follow-ons
- Market conditions: Current environment favors supporting winners

Need to model both scenarios...
</thinking>

Based on my analysis using the ReserveEngine and Monte Carlo simulations:

**Current Strategy (1:1 ratio)**
- Available for new investments: $20M
- Reserve per company: $2.67M
- Expected portfolio size: ~25 companies
- Modeled IRR: 24.5%

**Proposed Strategy (1.5:1 ratio)**
- Available for new investments: $12M
- Reserve per company: $4M
- Expected portfolio size: ~20 companies
- Modeled IRR: 26.8% (if we pick winners correctly)

**Recommendation**: Yes, increase to 1.5:1 because:
1. Your top 5 companies show strong traction and will need significant follow-on
2. The concentrated approach aligns with your "conviction investing" strategy
3. Monte Carlo simulations show higher expected returns despite increased risk

<evidence>
- Historical data shows 80% of returns from top 20% of investments
- Current portfolio has 3 potential unicorns requiring substantial follow-on
- Market analysis suggests lengthening time to exit, requiring more reserves
</evidence>
`;

  console.log('Query:', userQuery);
  console.log(extendedResponse);
}

// Run all demonstrations
async function main() {
  try {
    await demonstrateRouting();
    await demonstrateAgentCollaboration();
    demonstrateExtendedThinking();

    console.log('\n✅ All demonstrations completed successfully');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
