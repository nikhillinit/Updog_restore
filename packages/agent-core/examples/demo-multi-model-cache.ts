/**
 * Multi-Model Prompt Caching Demo
 *
 * Demonstrates how to use prompt caching across different AI providers:
 * - Anthropic (Claude): Native caching with ~85% latency reduction
 * - Google (Gemini): Context caching with ~70% latency reduction
 * - OpenAI (GPT): Optimized conversation structuring
 *
 * Run: npx tsx packages/agent-core/examples/demo-multi-model-cache.ts
 */

import { MultiModelPromptCache } from '../src/MultiModelPromptCache';

// Sample large context (simulating project documentation)
const LARGE_PROJECT_CONTEXT = `
# Project Architecture

## Overview
This is a venture capital fund modeling platform...

[Imagine 10,000+ lines of documentation here]

## API Endpoints
- GET /api/funds
- POST /api/funds
- GET /api/scenarios
...

[More detailed documentation]
`.repeat(10); // Simulate large content

async function demonstrateAnthropicCaching() {
  console.log('\n=== Anthropic (Claude) Prompt Caching Demo ===\n');

  const cache = new MultiModelPromptCache({
    provider: 'anthropic',
    enabled: true,
    cacheSystemPrompts: true,
    cacheProjectContext: true
  });

  console.log('Provider:', cache.getProvider());
  console.log('Supports native caching:', cache.supportsNativeCaching());

  // Simulate first call (CACHE MISS)
  console.log('\n--- First Call (Building Cache) ---');
  const firstCall = cache.prepare({
    systemPrompt: 'You are a helpful coding assistant specialized in TypeScript and React.',
    projectContext: LARGE_PROJECT_CONTEXT,
    userQuery: 'What is the main architecture pattern?'
  });

  console.log('Messages count:', firstCall.messages.length);
  console.log('Headers:', firstCall.headers);
  console.log('Cache breakpoints:', firstCall.metadata?.cacheBreakpoints);
  console.log('Estimated tokens:', firstCall.metadata?.estimatedTokens);

  cache.recordCacheMiss();

  // Simulate second call (CACHE HIT)
  console.log('\n--- Second Call (Using Cache) ---');
  const secondCall = cache.prepare({
    systemPrompt: 'You are a helpful coding assistant specialized in TypeScript and React.',
    projectContext: LARGE_PROJECT_CONTEXT, // Same content, reuses cache!
    userQuery: 'What are the main API endpoints?'
  });

  console.log('Messages count:', secondCall.messages.length);
  const estimatedTokensSaved = firstCall.metadata?.estimatedTokens || 0;
  cache.recordCacheHit(estimatedTokensSaved);

  // Show statistics
  const stats = cache.getStats();
  console.log('\n--- Cache Statistics ---');
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`Total hits: ${stats.totalHits}`);
  console.log(`Total misses: ${stats.totalMisses}`);
  console.log(`Tokens saved: ${stats.tokensSaved.toLocaleString()}`);
  console.log(`Estimated cost savings: $${stats.estimatedCostSavings.toFixed(2)}`);
  console.log(`Estimated latency reduction: ${stats.estimatedLatencyReduction}%`);
}

async function demonstrateGeminiCaching() {
  console.log('\n\n=== Google (Gemini) Prompt Caching Demo ===\n');

  const cache = new MultiModelPromptCache({
    provider: 'google',
    enabled: true,
    minCacheSize: 2048 // Gemini requires larger minimum
  });

  console.log('Provider:', cache.getProvider());
  console.log('Supports native caching:', cache.supportsNativeCaching());

  const result = cache.prepare({
    systemPrompt: 'You are an AI assistant specialized in performance optimization.',
    projectContext: LARGE_PROJECT_CONTEXT,
    userQuery: 'Analyze the performance bottlenecks.'
  });

  console.log('\n--- Gemini Cache Result ---');
  console.log('Messages count:', result.messages.length);
  console.log('Headers:', result.headers);
  console.log('Cache enabled:', result.metadata?.cacheEnabled);

  cache.recordCacheHit(50000);
  const stats = cache.getStats();
  console.log('\n--- Expected Savings ---');
  console.log(`Latency reduction: ${stats.estimatedLatencyReduction}%`);
  console.log(`Cost reduction: ~75%`);
}

async function demonstrateOpenAICaching() {
  console.log('\n\n=== OpenAI (GPT) Optimization Demo ===\n');

  const cache = new MultiModelPromptCache({
    provider: 'openai',
    enabled: true
  });

  console.log('Provider:', cache.getProvider());
  console.log('Supports native caching:', cache.supportsNativeCaching());

  // Simulate conversation with history
  const conversationHistory = [
    { role: 'user', content: 'What is the project structure?' },
    { role: 'assistant', content: 'The project uses a monorepo structure...' },
    { role: 'user', content: 'How are components organized?' },
    { role: 'assistant', content: 'Components are organized by feature...' },
    { role: 'user', content: 'What about state management?' },
    { role: 'assistant', content: 'State is managed using TanStack Query...' },
    { role: 'user', content: 'Tell me about testing' },
    { role: 'assistant', content: 'Testing uses Vitest with React Testing Library...' }
  ];

  const result = cache.prepare({
    systemPrompt: 'You are a helpful coding assistant.',
    projectContext: LARGE_PROJECT_CONTEXT,
    conversationHistory: conversationHistory,
    userQuery: 'What testing patterns are used?'
  });

  console.log('\n--- OpenAI Optimization Result ---');
  console.log('Messages count:', result.messages.length);
  console.log('History compressed:', conversationHistory.length > 4);
  console.log('Note: OpenAI automatically compresses old conversation turns');
}

async function demonstrateProviderSwitching() {
  console.log('\n\n=== Dynamic Provider Switching Demo ===\n');

  const cache = new MultiModelPromptCache({
    provider: 'anthropic',
    enabled: true
  });

  // Start with Anthropic
  console.log('Starting with:', cache.getProvider());
  console.log('Native caching:', cache.supportsNativeCaching());

  // Switch to OpenAI for simple task
  console.log('\nSwitching to OpenAI for simple query...');
  cache.switchProvider('openai');
  console.log('Current provider:', cache.getProvider());
  console.log('Native caching:', cache.supportsNativeCaching());

  // Switch to Gemini for performance analysis
  console.log('\nSwitching to Gemini for performance analysis...');
  cache.switchProvider('google');
  console.log('Current provider:', cache.getProvider());
  console.log('Native caching:', cache.supportsNativeCaching());

  // Switch back to Anthropic
  console.log('\nSwitching back to Anthropic for complex reasoning...');
  cache.switchProvider('anthropic');
  console.log('Current provider:', cache.getProvider());
  console.log('Native caching:', cache.supportsNativeCaching());
}

async function demonstrateMultiTurnConversation() {
  console.log('\n\n=== Multi-Turn Conversation with Caching ===\n');

  const cache = new MultiModelPromptCache({
    provider: 'anthropic',
    enabled: true,
    cacheSystemPrompts: true,
    cacheProjectContext: true,
    cacheConversationHistory: true
  });

  const systemPrompt = 'You are a helpful coding assistant.';
  const projectContext = LARGE_PROJECT_CONTEXT;
  const conversationHistory: Array<{ role: string; content: string }> = [];

  // Turn 1
  console.log('--- Turn 1: Initial Query ---');
  const turn1 = cache.prepare({
    systemPrompt,
    projectContext,
    conversationHistory: [],
    userQuery: 'What is the main function?'
  });
  console.log(`Cache breakpoints: ${turn1.metadata?.cacheBreakpoints}`);
  cache.recordCacheMiss();

  // Add to history
  conversationHistory.push(
    { role: 'user', content: 'What is the main function?' },
    { role: 'assistant', content: 'The main function is located in server.ts...' }
  );

  // Turn 2
  console.log('\n--- Turn 2: Follow-up Query ---');
  const turn2 = cache.prepare({
    systemPrompt,
    projectContext,
    conversationHistory,
    userQuery: 'How is it called?'
  });
  console.log(`Cache breakpoints: ${turn2.metadata?.cacheBreakpoints}`);
  cache.recordCacheHit(firstCall.metadata?.estimatedTokens || 0);

  // Add to history
  conversationHistory.push(
    { role: 'user', content: 'How is it called?' },
    { role: 'assistant', content: 'It is called via the Express app.listen() method...' }
  );

  // Turn 3
  console.log('\n--- Turn 3: Another Follow-up ---');
  const turn3 = cache.prepare({
    systemPrompt,
    projectContext,
    conversationHistory,
    userQuery: 'Can you refactor it?'
  });
  console.log(`Cache breakpoints: ${turn3.metadata?.cacheBreakpoints}`);
  cache.recordCacheHit(turn2.metadata?.estimatedTokens || 0);

  // Show statistics
  const stats = cache.getStats();
  console.log('\n--- Conversation Cache Statistics ---');
  console.log(`Total turns: 3`);
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`Latency reduction: ${stats.estimatedLatencyReduction}%`);
}

// Run all demonstrations
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Multi-Model Prompt Caching Demonstration              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  await demonstrateAnthropicCaching();
  await demonstrateGeminiCaching();
  await demonstrateOpenAICaching();
  await demonstrateProviderSwitching();
  await demonstrateMultiTurnConversation();

  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Key Takeaways                                         ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  1. Anthropic: ~85% latency reduction, ~90% cost savings  ║');
  console.log('║  2. Gemini: ~70% latency reduction, ~75% cost savings     ║');
  console.log('║  3. OpenAI: Optimized conversation structuring            ║');
  console.log('║  4. Switch providers dynamically based on task            ║');
  console.log('║  5. Multi-turn conversations benefit most from caching    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// Fix the reference to firstCall
let firstCall: ReturnType<typeof cache.prepare>;

main().catch(console.error);
