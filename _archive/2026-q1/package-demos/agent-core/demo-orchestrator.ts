#!/usr/bin/env node
/**
 * Demo: Orchestrator-Workers Pattern (Claude Cookbook)
 *
 * Shows dynamic task delegation to specialized worker agents
 */

import type { WorkerResult, Subtask } from './src/Orchestrator';
import { Orchestrator } from './src/Orchestrator';

async function demo() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Orchestrator-Workers Demo (Claude Cookbook)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const orchestrator = new Orchestrator({
    maxParallelWorkers: 3,
    enableDynamicDecomposition: true,
    useRouter: true,
  });

  // Simulate worker function (in practice, calls actual AI APIs)
  const mockWorkerFunction = async (subtask: Subtask): Promise<WorkerResult> => {
    const startTime = Date.now();

    console.log(`   🔨 Worker ${subtask.assignedWorker} starting: ${subtask.description}`);

    // Simulate AI work (different models have different speeds)
    const workTime =
      subtask.assignedWorker === 'claude-haiku' || subtask.assignedWorker === 'gemini'
        ? 1000 // Fast models
        : subtask.assignedWorker === 'claude-opus'
          ? 3000 // Slow but powerful
          : 2000; // Medium speed

    await new Promise((resolve) => setTimeout(resolve, workTime));

    const duration = Date.now() - startTime;
    console.log(`   ✅ Worker ${subtask.assignedWorker} completed (${duration}ms)\n`);

    return {
      subtaskId: subtask.id,
      success: true,
      data: `Completed: ${subtask.description}`,
      duration,
    };
  };

  console.log('📋 Task: Fix all failing tests in repository\n');
  console.log('🧠 Orchestrator decomposing task...\n');

  const result = await orchestrator.execute({
    taskDescription: 'Fix all failing tests in repository',
    context: { projectRoot: '/path/to/project' },
    workerFunction: mockWorkerFunction,
  });

  console.log('─'.repeat(60));
  console.log('📊 Execution Summary\n');
  console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   Total Subtasks: ${result.subtasks.length}`);
  console.log(`   Total Duration: ${(result.totalDuration / 1000).toFixed(1)}s`);
  console.log(
    `   Parallel Efficiency: ${((result.subtasks.length * 2000) / result.totalDuration).toFixed(1)}x\n`
  );

  console.log('   Subtask Breakdown:');
  result.subtasks.forEach((subtask, index) => {
    const statusIcon =
      subtask.status === 'completed' ? '✅' : subtask.status === 'failed' ? '❌' : '⏳';
    console.log(
      `      ${index + 1}. ${statusIcon} [${subtask.assignedWorker}] ${subtask.description}`
    );
    if (subtask.dependencies && subtask.dependencies.length > 0) {
      console.log(`         Dependencies: ${subtask.dependencies.join(', ')}`);
    }
  });

  console.log('\n─'.repeat(60));
  console.log('🔀 Dependency Graph Execution\n');
  console.log('   Wave 1 (Parallel): Subtask 0 (analysis)');
  console.log('   Wave 2 (Parallel): Subtasks 1, 2, 3 (specific repairs)');
  console.log('   Wave 3 (Sequential): Subtask 4 (validation)');
  console.log('   → Total: ~6s instead of ~10s sequential\n');

  const stats = orchestrator.getStats();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Orchestrator Statistics:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total Executions: ${stats.totalExecutions}`);
  console.log(`  Avg Subtasks per Execution: ${stats.averageSubtasksPerExecution.toFixed(1)}`);
  console.log(`  Avg Duration: ${(stats.averageDuration / 1000).toFixed(1)}s`);
  console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(0)}%`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('💡 Real-World Example:');
  console.log('\n   const orchestrator = new Orchestrator();');
  console.log('   const result = await orchestrator.execute({');
  console.log('     taskDescription: "Fix failing tests",');
  console.log('     workerFunction: async (subtask) => {');
  console.log('       // Route to appropriate AI via MCP');
  console.log('       return await mcp[`ask_${subtask.assignedWorker}`](');
  console.log('         subtask.description');
  console.log('       );');
  console.log('     }');
  console.log('   });\n');

  console.log('🎯 Benefits:');
  console.log('   ✓ Automatic task decomposition');
  console.log('   ✓ Intelligent worker assignment (via Router)');
  console.log('   ✓ Parallel execution (3x faster)');
  console.log('   ✓ Dependency management');
  console.log('   ✓ Automatic retry logic');
  console.log('   ✓ Comprehensive tracking & metrics\n');
}

demo().catch(console.error);
