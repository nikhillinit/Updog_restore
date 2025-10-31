/**
 * Phase 1 POC Demo: MemoryManager with test-repair-agent
 *
 * Demonstrates token reduction by using intelligent context retrieval
 * instead of sending full conversation history to LLM.
 */

import { MemoryManager } from '../src';

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
}

/**
 * Simulate a multi-turn conversation
 */
async function demonstratePhase1POC() {
  console.log('='.repeat(80));
  console.log('Phase 1 POC: MemoryManager Token Reduction Demo');
  console.log('='.repeat(80));
  console.log();

  const manager = new MemoryManager({
    userId: 'demo-user',
    agentId: 'test-repair',
  });

  // Simulate 10-turn conversation about test failures
  const conversation: ConversationTurn[] = [
    {
      role: 'user',
      content: 'The async timeout test in UserAuth.test.ts is failing',
      tokens: 15,
    },
    {
      role: 'assistant',
      content:
        'I analyzed the test. The issue is that waitFor() has a default 1s timeout but your API call takes 2s. I recommend increasing the timeout to 3000ms or mocking the API call.',
      tokens: 45,
    },
    {
      role: 'user',
      content: "Let's mock the API call. How do I do that?",
      tokens: 12,
    },
    {
      role: 'assistant',
      content:
        "Add this at the top of your test: vi.mock('@/api/auth', () => ({ loginUser: vi.fn().mockResolvedValue({ success: true }) }))",
      tokens: 38,
    },
    {
      role: 'user',
      content: 'Now I\'m getting "vi is not defined" error',
      tokens: 12,
    },
    {
      role: 'assistant',
      content: "You need to import it: import { vi } from 'vitest' at the top of your test file.",
      tokens: 25,
    },
    {
      role: 'user',
      content: 'Perfect, the async test passes now! But now the validation test is failing',
      tokens: 18,
    },
    {
      role: 'assistant',
      content: 'Great progress! For the validation test, what error message are you seeing?',
      tokens: 20,
    },
    {
      role: 'user',
      content: 'It says "Expected email validation to fail, but it passed"',
      tokens: 14,
    },
    {
      role: 'assistant',
      content:
        'Check if you\'re testing with a valid email format. For validation tests, use clearly invalid inputs like "not-an-email" or "missing@domain" without TLD.',
      tokens: 35,
    },
  ];

  console.log('📊 Scenario: 10-turn conversation about test failures\n');

  let totalTokensTraditional = 0;
  let totalTokensWithMemory = 0;

  // Add each turn to memory and calculate token usage
  for (let i = 0; i < conversation.length; i++) {
    const turn = conversation[i];

    await manager.add({
      userId: 'demo-user',
      agentId: 'test-repair',
      role: turn.role,
      content: turn.content,
    });

    // Calculate traditional approach: send ENTIRE history
    const traditionalTokens = conversation.slice(0, i + 1).reduce((sum, t) => sum + t.tokens, 0);

    // Calculate memory approach: send only relevant context (last 3 turns)
    const relevantContext = await manager.getContext(turn.content, 3);
    const memoryTokens =
      relevantContext.reduce((sum, m) => {
        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        return sum + Math.ceil(m.content.length / 4);
      }, 0) + turn.tokens;

    totalTokensTraditional += traditionalTokens;
    totalTokensWithMemory += memoryTokens;

    console.log(`Turn ${i + 1}:`);
    console.log(
      `  ${turn.role}: "${turn.content.substring(0, 60)}${turn.content.length > 60 ? '...' : ''}"`
    );
    console.log(`  Traditional (full history): ${traditionalTokens} tokens`);
    console.log(`  Memory-based (context only): ${memoryTokens} tokens`);
    console.log(`  Reduction: ${((1 - memoryTokens / traditionalTokens) * 100).toFixed(1)}%`);
    console.log();
  }

  // Final stats
  const stats = manager.getStats();
  console.log('='.repeat(80));
  console.log('📈 Final Results:');
  console.log('='.repeat(80));
  console.log(`Total tokens (traditional): ${totalTokensTraditional}`);
  console.log(`Total tokens (with memory): ${totalTokensWithMemory}`);
  console.log(
    `Overall reduction: ${((1 - totalTokensWithMemory / totalTokensTraditional) * 100).toFixed(1)}%`
  );
  console.log(`Total savings: ${totalTokensTraditional - totalTokensWithMemory} tokens`);
  console.log();
  console.log(`Memory stats:`);
  console.log(`  - Stored memories: ${stats.userMemories}`);
  console.log(`  - Total memories (all users): ${stats.totalMemories}`);
  console.log();

  // Demonstrate search
  console.log('='.repeat(80));
  console.log('🔍 Search Demonstration:');
  console.log('='.repeat(80));
  console.log('Query: "async timeout"');
  const searchResults = await manager.search('async timeout');
  console.log(`Found ${searchResults.length} relevant memories:`);
  searchResults.forEach((result, idx) => {
    console.log(`  ${idx + 1}. [${result.role}] ${result.content.substring(0, 80)}...`);
  });
  console.log();

  // Cost estimate
  console.log('='.repeat(80));
  console.log('💰 Cost Impact (GPT-4 pricing: $0.03 per 1k tokens):');
  console.log('='.repeat(80));
  const costTraditional = (totalTokensTraditional / 1000) * 0.03;
  const costWithMemory = (totalTokensWithMemory / 1000) * 0.03;
  console.log(`Cost (traditional): $${costTraditional.toFixed(4)}`);
  console.log(`Cost (with memory): $${costWithMemory.toFixed(4)}`);
  console.log(`Savings per conversation: $${(costTraditional - costWithMemory).toFixed(4)}`);
  console.log();
  console.log(`Projected monthly savings (10 users, 20 conversations each):`);
  console.log(`  $${((costTraditional - costWithMemory) * 10 * 20).toFixed(2)}/month`);
  console.log();

  console.log('='.repeat(80));
  console.log('✅ Phase 1 POC Complete!');
  console.log('='.repeat(80));
  console.log('Next steps:');
  console.log('  - Phase 2: Add PostgreSQL + pgvector for semantic search');
  console.log('  - Phase 2: Add Redis caching for faster retrieval');
  console.log('  - Phase 2: Integrate with all 5 agents');
  console.log();
}

// Run the demo
demonstratePhase1POC().catch(console.error);
