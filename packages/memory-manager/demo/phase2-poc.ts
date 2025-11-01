/**
 * Phase 2 POC Demo: PostgreSQL + pgvector Semantic Search
 *
 * Demonstrates the enhanced memory system with:
 * - PostgreSQL persistence
 * - pgvector semantic similarity search
 * - OpenAI embeddings (or mock fallback)
 * - Token reduction measurement
 *
 * Run: npm run tsx packages/memory-manager/demo/phase2-poc.ts
 */

import { MemoryManager } from '../src';
import { randomUUID } from 'crypto';

// Generate demo user UUID
const DEMO_USER_ID = randomUUID();

// Simulate a conversation about test repair
const testRepairConversation = [
  { role: 'user' as const, content: 'Fix async timeout in UserAuth test' },
  {
    role: 'assistant' as const,
    content: 'Increased waitFor timeout to 3000ms in UserAuth.test.tsx',
  },
  { role: 'user' as const, content: 'The API mock is still timing out' },
  {
    role: 'assistant' as const,
    content: 'Added jest.setTimeout(5000) to extend test timeout globally',
  },
  { role: 'user' as const, content: 'Payment validation test is failing' },
  {
    role: 'assistant' as const,
    content: 'Fixed payment validation regex to allow decimal amounts',
  },
  { role: 'user' as const, content: 'Database connection test fails intermittently' },
  {
    role: 'assistant' as const,
    content: 'Added retry logic with exponential backoff for DB connections',
  },
  { role: 'user' as const, content: 'Navigation test clicking wrong button' },
  {
    role: 'assistant' as const,
    content: 'Updated selector to use data-testid instead of text content',
  },
];

async function runPhase2Demo() {
  console.log('🚀 Phase 2 POC: PostgreSQL + Semantic Search\n');
  console.log('='.repeat(60));

  // Initialize MemoryManager with database
  const manager = new MemoryManager(
    {
      userId: DEMO_USER_ID,
      agentId: 'test-repair-agent',
    },
    {
      useDatabase: true,
      useMockEmbeddings: !process.env.OPENAI_API_KEY, // Use real embeddings if API key available
    }
  );

  console.log(`Demo User ID: ${DEMO_USER_ID}`);

  try {
    // Test database connection
    console.log('\n📊 Testing database connection...');
    const connected = await manager.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    console.log('✅ Connected to PostgreSQL!');

    // Clear any existing memories for clean demo
    console.log('\n🧹 Clearing previous demo data...');
    await manager.clearSession();

    // Add conversation to memory
    console.log('\n📝 Adding conversation to memory...');
    for (const message of testRepairConversation) {
      await manager.add({
        userId: DEMO_USER_ID,
        agentId: 'test-repair-agent',
        role: message.role,
        content: message.content,
      });
    }
    console.log(`✅ Added ${testRepairConversation.length} messages`);

    // Get statistics
    const stats = await manager.getStats();
    console.log(`\n📊 Memory Statistics:`);
    console.log(`   Total memories in system: ${stats.totalMemories}`);
    console.log(`   Memories for this agent: ${stats.userMemories}`);

    // Test semantic search
    console.log('\n\n🔍 SEMANTIC SEARCH DEMO');
    console.log('='.repeat(60));

    const queries = [
      'timeout issues',
      'database problems',
      'test selector issues',
      'payment validation',
    ];

    for (const query of queries) {
      console.log(`\nQuery: "${query}"`);
      console.log('-'.repeat(40));

      const results = await manager.search(query, 3);

      if (results.length === 0) {
        console.log('  No results found');
      } else {
        results.forEach((result, idx) => {
          console.log(`  ${idx + 1}. [${result.role}] ${result.content}`);
          console.log(`     Similarity: ${(result.similarity! * 100).toFixed(1)}%`);
        });
      }
    }

    // Test context retrieval
    console.log('\n\n💬 CONTEXT RETRIEVAL DEMO');
    console.log('='.repeat(60));

    const newQuery = 'Why is my test timing out?';
    console.log(`\nUser asks: "${newQuery}"`);
    console.log('-'.repeat(40));

    const context = await manager.getContext(newQuery, 3);

    console.log('\nRelevant context retrieved:');
    context.forEach((memory, idx) => {
      console.log(`  ${idx + 1}. [${memory.role}] ${memory.content}`);
      console.log(`     Similarity: ${(memory.similarity! * 100).toFixed(1)}%`);
    });

    // Token reduction calculation
    console.log('\n\n📈 TOKEN REDUCTION ANALYSIS');
    console.log('='.repeat(60));

    const fullConversationTokens = testRepairConversation
      .map((m) => m.content.split(' ').length * 1.3) // Rough estimate: 1.3 tokens per word
      .reduce((sum, tokens) => sum + tokens, 0);

    const contextTokens = context
      .map((m) => m.content.split(' ').length * 1.3)
      .reduce((sum, tokens) => sum + tokens, 0);

    const reduction = ((fullConversationTokens - contextTokens) / fullConversationTokens) * 100;

    console.log(`\nTraditional approach (full conversation):`);
    console.log(`  Messages: ${testRepairConversation.length}`);
    console.log(`  Estimated tokens: ${Math.round(fullConversationTokens)}`);

    console.log(`\nMemory approach (semantic context):`);
    console.log(`  Relevant messages: ${context.length}`);
    console.log(`  Estimated tokens: ${Math.round(contextTokens)}`);

    console.log(`\n✨ Token Reduction: ${reduction.toFixed(1)}%`);
    console.log(`✨ Space saved: ${Math.round(fullConversationTokens - contextTokens)} tokens`);

    // Cost savings (assuming GPT-4 pricing)
    const inputCostPer1kTokens = 0.01; // $0.01 per 1K tokens (GPT-4 input)
    const savingsPerQuery =
      ((fullConversationTokens - contextTokens) / 1000) * inputCostPer1kTokens;
    const monthlyQueries = 10 * 20 * 40; // 10 users × 20 conversations × 40 queries
    const monthlySavings = savingsPerQuery * monthlyQueries;

    console.log(`\n💰 Cost Savings (GPT-4 pricing):`);
    console.log(`  Per query: $${savingsPerQuery.toFixed(6)}`);
    console.log(`  Monthly (10 users, 20 convos, 40 queries): $${monthlySavings.toFixed(2)}`);

    console.log('\n\n✅ Phase 2 POC Complete!');
    console.log('='.repeat(60));

    if (process.env.OPENAI_API_KEY) {
      console.log('\n✨ Using real OpenAI embeddings');
    } else {
      console.log('\n⚠️  Using mock embeddings (set OPENAI_API_KEY for real embeddings)');
    }
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    throw error;
  } finally {
    // Cleanup
    await manager.close();
    console.log('\n🔌 Database connections closed');
  }
}

// Run the demo
runPhase2Demo().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
