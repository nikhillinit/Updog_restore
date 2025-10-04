#!/usr/bin/env node
/**
 * Demo: AI Router Pattern (Claude Cookbook)
 *
 * Shows intelligent model selection based on task type and complexity
 */

import { AIRouter, createTask } from './src/Router';

async function demo() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AI Router Demo (Claude Cookbook)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const router = new AIRouter({
    costSensitive: true,
    preferFastModels: false
  });

  // Test cases showing different routing decisions
  const testCases = [
    createTask(
      'typescript-error',
      'Type mismatch in ReserveEngine calculateDeployment method',
      { complexity: 6 }
    ),
    createTask(
      'react-component',
      'Create a new dashboard card component with responsive design',
      { complexity: 7 }
    ),
    createTask(
      'performance',
      'Optimize bundle size - currently 2.5MB, target 1.5MB',
      { complexity: 8, urgency: 'high' }
    ),
    createTask(
      'test-failure',
      'Fix 15 failing unit tests in client/src/components',
      { complexity: 4 }
    ),
    createTask(
      'architecture',
      'Design new microservices architecture for portfolio analytics',
      { complexity: 10, budget: 'unlimited' }
    ),
    createTask(
      'debugging',
      'Memory leak in BullMQ worker process',
      { complexity: 9, urgency: 'high' }
    ),
  ];

  console.log('🎯 Routing Decisions\n');

  testCases.forEach((task, index) => {
    const decision = router.route(task);

    console.log(`${index + 1}. ${task.type.toUpperCase()}`);
    console.log(`   Description: ${task.description}`);
    console.log(`   Complexity: ${'█'.repeat(task.complexity)}${'░'.repeat(10 - task.complexity)} (${task.complexity}/10)`);
    console.log(`   → Model: ${decision.model.toUpperCase()}`);
    console.log(`   → Reason: ${decision.reason}`);
    console.log(`   → Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    console.log(`   → Est. Cost: ${'$'.repeat(decision.estimatedCost || 0)} (${decision.estimatedCost}/10)`);
    console.log(`   → Est. Time: ${decision.estimatedTime}s`);
    console.log(`   → Alternatives: ${decision.alternativeModels?.join(', ')}\n`);
  });

  console.log('─'.repeat(60));
  console.log('📊 Routing Statistics\n');

  const stats = router.getStats();
  console.log(`   Total Routes: ${stats.totalRoutes}`);
  console.log(`   Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`   Total Estimated Cost: ${stats.totalEstimatedCost}/60\n`);

  console.log('   Model Distribution:');
  Object.entries(stats.modelDistribution)
    .filter(([_, count]) => count > 0)
    .forEach(([model, count]) => {
      const bar = '█'.repeat(count);
      console.log(`      ${model.padEnd(15)} ${bar} (${count})`);
    });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Routing Strategy Examples:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TypeScript Errors    → DeepSeek (code-focused)');
  console.log('  React Components     → GPT-4 (frontend expertise)');
  console.log('  Performance Issues   → Gemini (optimization)');
  console.log('  Complex Architecture → Claude Opus (reasoning)');
  console.log('  System Debugging     → Grok (systems thinking)');
  console.log('  Simple Tasks         → Claude Haiku (fast & cheap)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('💡 Integration with Multi-AI MCP:');
  console.log('   const decision = router.route(task);');
  console.log('   await mcp[`ask_${decision.model}`](task.description);\n');
}

demo().catch(console.error);
