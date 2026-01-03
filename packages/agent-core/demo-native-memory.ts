/**
 * Demo: Native Memory Tool Integration with Pattern Learning
 *
 * This demo shows how to use Claude's native memory tool with cross-conversation
 * pattern learning in a multi-tenant environment.
 *
 * Run: npx ts-node packages/agent-core/demo-native-memory.ts
 */

import {
  TenantContextProvider,
  ToolHandler,
  PatternLearningEngine,
  TokenBudgetManager,
  createHybridMemoryManager,
  getEventBus,
} from './src/index.js';
import { InMemoryStorage } from './src/ConversationMemory.js';
import type { AgentResult, AgentExecutionContext } from './src/index.js';

// ============================================================================
// Demo Configuration
// ============================================================================

const DEMO_TENANT_ID = 'demoUser:demoProject';

// ============================================================================
// Demo 1: Tool Handler with Memory Tool
// ============================================================================

async function demoToolHandler() {
  console.log('\n='.repeat(60));
  console.log('DEMO 1: Tool Handler with Memory Tool');
  console.log('='.repeat(60));

  const handler = new ToolHandler({
    tenantId: DEMO_TENANT_ID,
    threadId: 'demo-thread-1',
  });

  // Simulate Claude API response with tool_use
  const mockResponse: { content: Array<{ type: string; text?: string; name?: string; input?: unknown }> } = {
    content: [
      {
        type: 'text',
        text: 'I found a race condition in the code.',
      },
      {
        type: 'tool_use',
        id: 'tool_123',
        name: 'memory',
        input: {
          command: 'create',
          path: '/memories/patterns/race-conditions.md',
          file_text: 'Pattern: Multiple threads accessing shared state without locks',
        },
      },
    ],
  };

  console.log('\n📝 Processing tool uses from Claude response...');
  const results = await handler.handleToolUses(mockResponse);

  console.log(`\n✅ Processed ${results.length} tool use(s)`);
  console.log('Tool Results:', JSON.stringify(results, null, 2));

  const metrics = handler.getMetrics();
  console.log('\n📊 Tool Execution Metrics:');
  console.log(`  Total executions: ${metrics.length}`);
  console.log(`  Average duration: ${metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length}ms`);
}

// ============================================================================
// Demo 2: Hybrid Memory Management
// ============================================================================

async function demoHybridMemory() {
  console.log('\n='.repeat(60));
  console.log('DEMO 2: Hybrid Memory Management');
  console.log('='.repeat(60));

  const storage = new InMemoryStorage() as ConversationStorage;
  const manager = createHybridMemoryManager(storage, false); // Native memory disabled for demo

  // Session memory (fast, temporary)
  console.log('\n💾 Storing session memory (Redis only, 1-hour TTL)...');
  await manager.store('current-review', 'Reviewing auth.ts for security issues', {
    tenantId: DEMO_TENANT_ID,
    scope: 'session',
  });

  // Project memory (both Redis + Native)
  console.log('\n💾 Storing project memory (Redis + Native)...');
  await manager.store('team-style-guide', 'Always use async/await instead of .then()', {
    tenantId: DEMO_TENANT_ID,
    scope: 'project',
    visibility: 'project',
  });

  // Retrieve memory
  console.log('\n📖 Retrieving session memory...');
  const sessionMem = await manager.retrieve('current-review', {
    tenantId: DEMO_TENANT_ID,
    scope: 'session',
  });
  console.log('Retrieved:', sessionMem);

  console.log('\n✅ Hybrid memory demo complete');
}

// ============================================================================
// Demo 3: Pattern Learning Engine
// ============================================================================

async function demoPatternLearning() {
  console.log('\n='.repeat(60));
  console.log('DEMO 3: Cross-Conversation Pattern Learning');
  console.log('='.repeat(60));

  const storage = new InMemoryStorage() as ConversationStorage;
  const engine = new PatternLearningEngine(storage, DEMO_TENANT_ID);

  // Simulate successful execution
  const successResult: AgentResult<unknown> = {
    success: true,
    data: { fixed: true },
    retries: 0,
    duration: 1500,
    context: {
      runId: 'run-1',
      timestamp: new Date().toISOString(),
      agent: 'code-reviewer',
      operation: 'code-review',
    },
    output: 'Fixed race condition by adding mutex locks',
  };

  const context: AgentExecutionContext = {
    runId: 'run-1',
    timestamp: new Date().toISOString(),
    agent: 'code-reviewer',
    operation: 'code-review',
    input: 'Review concurrency in file.ts',
    tags: ['concurrency', 'typescript'],
  };

  console.log('\n🧠 Recording pattern from successful execution...');
  await engine.recordPattern(successResult, context);

  console.log('\n📚 Retrieving relevant patterns...');
  const patterns = await engine.getRelevantPatterns({
    operation: 'code-review',
    fileTypes: ['.ts'],
    limit: 3,
  });

  console.log(`Found ${patterns.length} relevant pattern(s)`);

  console.log('\n📝 Building pattern context for prompt...');
  const patternContext = await engine.buildPatternContext('code-review', ['.ts']);

  if (patternContext) {
    console.log('Pattern Context:\n', patternContext);
  } else {
    console.log('No patterns available yet (storage needs Redis SCAN implementation)');
  }

  console.log('\n✅ Pattern learning demo complete');
}

// ============================================================================
// Demo 4: Multi-Tenant Context
// ============================================================================

async function demoTenantContext() {
  console.log('\n='.repeat(60));
  console.log('DEMO 4: Multi-Tenant Context Provider');
  console.log('='.repeat(60));

  // Run with tenant context
  await TenantContextProvider.run(
    {
      tenantId: DEMO_TENANT_ID,
      userId: 'demoUser',
      projectId: 'demoProject',
      permissions: {
        canAccessGlobalMemory: false,
        canAccessProjectMemory: true,
        canWriteMemory: true,
        canUsePatternLearning: true,
        canSharePatterns: true,
      },
    },
    async () => {
      console.log('\n🔐 Inside tenant context...');

      const ctx = TenantContextProvider.require();
      console.log('Tenant ID:', ctx.tenantId);
      console.log('User ID:', ctx.userId);
      console.log('Project ID:', ctx.projectId);
      console.log('Permissions:', ctx.permissions);

      // All operations here are automatically scoped to this tenant
      console.log('\n✅ Tenant context is active');
    }
  );

  console.log('\n✅ Tenant context demo complete');
}

// ============================================================================
// Demo 5: Token Budget Manager
// ============================================================================

async function demoTokenBudget() {
  console.log('\n='.repeat(60));
  console.log('DEMO 5: Token Budget Manager');
  console.log('='.repeat(60));

  const manager = new TokenBudgetManager(8192); // 8K tokens

  console.log('\n💰 Allocating token budget...');
  const budget = manager.allocate();

  console.log('Total tokens:', budget.total);
  console.log('Allocations:');
  console.log('  Conversation History:', budget.allocated.conversationHistory);
  console.log('  Memory Retrieval:', budget.allocated.memoryRetrieval);
  console.log('  Pattern Context:', budget.allocated.patternContext);
  console.log('  Response:', budget.allocated.response);
  console.log('  System Prompt:', budget.allocated.systemPrompt);
  console.log('  Buffer:', budget.buffer);

  // Track usage
  console.log('\n📊 Tracking token usage...');
  manager.trackUsage('conversationHistory', budget.allocated.conversationHistory, 2000);
  manager.trackUsage('memoryRetrieval', budget.allocated.memoryRetrieval, 1000);
  manager.trackUsage('response', budget.allocated.response, 3000);

  const stats = manager.getUsageStats();
  console.log('Usage Statistics:');
  console.log('  Total Estimated:', stats.totalEstimated);
  console.log('  Total Actual:', stats.totalActual);
  console.log('  Efficiency:', `${(stats.totalActual / stats.totalEstimated * 100).toFixed(1)  }%`);

  // Get reallocation suggestions
  console.log('\n💡 Reallocation suggestions:');
  const suggestions = manager.suggestReallocation();
  console.log(suggestions);

  console.log('\n✅ Token budget demo complete');
}

// ============================================================================
// Demo 6: Memory Event Bus
// ============================================================================

async function demoEventBus() {
  console.log('\n='.repeat(60));
  console.log('DEMO 6: Memory Event Bus');
  console.log('='.repeat(60));

  const bus = getEventBus();

  // Subscribe to events
  console.log('\n📡 Subscribing to memory events...');

  const unsubscribe1 = bus.on('memory_created', (event) => {
    console.log('✅ Memory created:', event.memoryId, '@', event.path);
  });

  const unsubscribe2 = bus.on('pattern_learned', (event) => {
    console.log('🧠 Pattern learned:', event.patternId, 'confidence:', event.confidence);
  });

  // Emit events
  console.log('\n📤 Emitting events...');

  await bus.emit({
    type: 'memory_created',
    memoryId: 'mem-123',
    tenantId: DEMO_TENANT_ID,
    path: '/memories/demo.md',
    visibility: 'user',
  });

  await bus.emit({
    type: 'pattern_learned',
    patternId: 'pat-456',
    tenantId: DEMO_TENANT_ID,
    operation: 'code-review',
    confidence: 0.85,
  });

  // Get statistics
  console.log('\n📊 Event bus statistics:');
  const stats = bus.getStats();
  console.log('Total listeners:', stats.totalListeners);
  console.log('History size:', stats.historySize);
  console.log('Events by type:', stats.eventsByType);

  // Cleanup
  unsubscribe1();
  unsubscribe2();

  console.log('\n✅ Event bus demo complete');
}

// ============================================================================
// Main Demo Runner
// ============================================================================

async function runAllDemos() {
  console.log(`\n${  '='.repeat(60)}`);
  console.log('🚀 NATIVE MEMORY TOOL INTEGRATION - DEMO SUITE');
  console.log('='.repeat(60));

  try {
    await demoToolHandler();
    await demoHybridMemory();
    await demoPatternLearning();
    await demoTenantContext();
    await demoTokenBudget();
    await demoEventBus();

    console.log(`\n${  '='.repeat(60)}`);
    console.log('✅ ALL DEMOS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
  } catch (error: unknown) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run all demos if executed directly
void runAllDemos();

export {
  demoToolHandler,
  demoHybridMemory,
  demoPatternLearning,
  demoTenantContext,
  demoTokenBudget,
  demoEventBus,
};
