/**
 * Tool Evaluation Framework for VC Fund Modeling Platform
 * Adapted from the general evaluation notebook to test domain-specific calculations
 */

import { z } from 'zod';
import { WaterfallPolicySchema } from '../../shared/schemas/waterfall-policy';
import { applyWaterfallChange } from '../../client/src/lib/waterfall';
import { WaterfallSchema, type Waterfall } from '../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

// Evaluation task schema
const EvaluationTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: z.enum(['waterfall', 'reserves', 'pacing', 'cohort', 'monte-carlo']),
  prompt: z.string(),
  expectedResponse: z.string(),
  tolerance: z.number().optional(), // For numerical comparisons
  metadata: z.record(z.any()).optional(),
});

type EvaluationTask = z.infer<typeof EvaluationTaskSchema>;

// Evaluation result schema
const EvaluationResultSchema = z.object({
  taskId: z.string(),
  category: z.string(),
  prompt: z.string(),
  expected: z.string(),
  actual: z.string().nullable(),
  passed: z.boolean(),
  duration: z.number(),
  toolCalls: z.array(
    z.object({
      tool: z.string(),
      input: z.any(),
      output: z.any(),
      duration: z.number(),
    })
  ),
  summary: z.string().optional(),
  feedback: z.string().optional(),
  error: z.string().optional(),
});

type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Tool definitions for the evaluation framework
 */
export const EVALUATION_TOOLS = {
  calculateWaterfall: {
    name: 'calculateWaterfall',
    description: 'Calculate carry distribution for a fund with specified parameters',
    parameters: {
      fundSize: 'number',
      carryPercent: 'number (0-1)',
      hurdle: 'number (0-1)',
      type: 'AMERICAN | EUROPEAN',
      catchUp: 'boolean',
      carryVesting: 'object',
    },
    execute: async (params: any) => {
      try {
        // For now, we'll work with AMERICAN waterfalls primarily
        // The shared/types.ts WaterfallSchema only supports AMERICAN type
        const waterfall: Waterfall = WaterfallSchema.parse({
          type: 'AMERICAN', // Force AMERICAN for now since that's what WaterfallSchema expects
          carryVesting: {
            schedule: 'LINEAR',
            cliffMonths: 12,
            vestingMonths: 48,
            immediateVest: 0.25,
          },
        });

        // Simulate waterfall calculation
        const carried = params.fundSize * params.carryPercent;
        const hurdleAmount = params.fundSize * params.hurdle;

        return {
          success: true,
          carried,
          hurdleAmount,
          waterfall,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  },

  applyWaterfallUpdate: {
    name: 'applyWaterfallUpdate',
    description: 'Apply a field update to an existing waterfall',
    parameters: {
      waterfall: 'Waterfall object',
      field: 'string',
      value: 'any',
    },
    execute: async (params: any) => {
      try {
        const updated = applyWaterfallChange(params.waterfall, params.field, params.value);
        return {
          success: true,
          updated,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  },

  calculateReserves: {
    name: 'calculateReserves',
    description: 'Calculate reserve allocations for portfolio',
    parameters: {
      totalFund: 'number',
      deployedCapital: 'number',
      targetReserveRatio: 'number',
      portfolioCompanies: 'number',
    },
    execute: async (params: any) => {
      // Simplified reserve calculation
      const availableReserves = params.totalFund - params.deployedCapital;
      const reservePerCompany = availableReserves / params.portfolioCompanies;
      const actualRatio = availableReserves / params.deployedCapital;

      return {
        success: true,
        availableReserves,
        reservePerCompany,
        actualRatio,
        meetsTarget: actualRatio >= params.targetReserveRatio,
      };
    },
  },

  calculatePacing: {
    name: 'calculatePacing',
    description: 'Calculate investment pacing metrics',
    parameters: {
      fundSize: 'number',
      fundLifeYears: 'number',
      deploymentPeriodYears: 'number',
      currentDeployed: 'number',
      yearsElapsed: 'number',
    },
    execute: async (params: any) => {
      const targetAnnualPace = params.fundSize / params.deploymentPeriodYears;
      const actualAnnualPace = params.currentDeployed / params.yearsElapsed;
      const paceRatio = actualAnnualPace / targetAnnualPace;
      const onTrack = paceRatio >= 0.8 && paceRatio <= 1.2;

      return {
        success: true,
        targetAnnualPace,
        actualAnnualPace,
        paceRatio,
        onTrack,
        remainingDeployment: params.fundSize - params.currentDeployed,
      };
    },
  },
};

/**
 * Parse evaluation tasks from XML file
 */
export async function parseEvaluationFile(filePath: string): Promise<EvaluationTask[]> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    const result = await parseXml(xmlContent);

    const tasks: EvaluationTask[] = [];
    const taskElements = result.evaluations?.task || [];

    for (const task of taskElements) {
      tasks.push({
        id: task.$.id || `task-${tasks.length + 1}`,
        description: task.description?.[0] || '',
        category: task.category?.[0] || 'waterfall',
        prompt: task.prompt?.[0] || '',
        expectedResponse: task.response?.[0] || '',
        tolerance: task.tolerance ? parseFloat(task.tolerance[0]) : undefined,
        metadata: task.metadata?.[0] || {},
      });
    }

    return tasks;
  } catch (error) {
    console.error(`Error parsing evaluation file ${filePath}:`, error);
    return [];
  }
}

/**
 * Execute a single evaluation task
 */
export async function executeTask(
  task: EvaluationTask,
  tools: typeof EVALUATION_TOOLS
): Promise<EvaluationResult> {
  const startTime = Date.now();
  const toolCalls: any[] = [];
  let actual: string | null = null;
  let error: string | undefined;

  try {
    // Parse the prompt to determine which tool to use
    const prompt = task.prompt.toLowerCase();

    if (prompt.includes('waterfall') || prompt.includes('carry')) {
      // Extract parameters from prompt (simplified parsing)
      const fundSizeMatch = prompt.match(/\$?([\d,]+)m?\s*(million)?/i);
      const carryMatch = prompt.match(/(\d+)%\s*carry/i);
      const hurdleMatch = prompt.match(/(\d+)%\s*hurdle/i);
      const typeMatch = prompt.match(/(american|european)/i);

      const params = {
        fundSize: fundSizeMatch
          ? parseFloat(fundSizeMatch[1].replace(/,/g, '')) * 1000000
          : 100000000,
        carryPercent: carryMatch ? parseFloat(carryMatch[1]) / 100 : 0.2,
        hurdle: hurdleMatch ? parseFloat(hurdleMatch[1]) / 100 : 0.08,
        type: typeMatch ? typeMatch[1].toUpperCase() : 'AMERICAN',
        catchUp: true,
      };

      const toolStart = Date.now();
      const result = await tools.calculateWaterfall.execute(params);
      const toolDuration = Date.now() - toolStart;

      toolCalls.push({
        tool: 'calculateWaterfall',
        input: params,
        output: result,
        duration: toolDuration,
      });

      if (result.success) {
        actual = JSON.stringify({
          carried: result.carried,
          hurdleAmount: result.hurdleAmount,
        });
      }
    } else if (prompt.includes('reserve')) {
      // Parse reserve calculation parameters
      const result = await tools.calculateReserves.execute({
        totalFund: 100000000,
        deployedCapital: 60000000,
        targetReserveRatio: 1.0,
        portfolioCompanies: 25,
      });

      if (result.success) {
        actual = JSON.stringify(result);
      }
    } else if (prompt.includes('pacing')) {
      // Parse pacing calculation parameters
      const result = await tools.calculatePacing.execute({
        fundSize: 100000000,
        fundLifeYears: 10,
        deploymentPeriodYears: 4,
        currentDeployed: 30000000,
        yearsElapsed: 1.5,
      });

      if (result.success) {
        actual = JSON.stringify(result);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  const duration = Date.now() - startTime;

  // Compare actual with expected (with tolerance for numerical values)
  let passed = false;
  if (actual && task.expectedResponse) {
    if (task.tolerance) {
      // Numerical comparison with tolerance
      const actualNum = parseFloat(actual);
      const expectedNum = parseFloat(task.expectedResponse);
      passed = Math.abs(actualNum - expectedNum) <= task.tolerance;
    } else {
      // Exact string comparison or structured comparison
      passed = actual === task.expectedResponse;
    }
  }

  return {
    taskId: task.id,
    category: task.category,
    prompt: task.prompt,
    expected: task.expectedResponse,
    actual,
    passed,
    duration,
    toolCalls,
    error,
  };
}

/**
 * Run full evaluation suite
 */
export async function runEvaluationSuite(
  evaluationFile: string,
  outputPath?: string
): Promise<{
  results: EvaluationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    accuracy: number;
    avgDuration: number;
    byCategory: Record<string, { total: number; passed: number }>;
  };
}> {
  console.log('🚀 Starting VC Fund Tool Evaluation');

  // Parse evaluation tasks
  const tasks = await parseEvaluationFile(evaluationFile);
  console.log(`📋 Loaded ${tasks.length} evaluation tasks`);

  // Execute all tasks
  const results: EvaluationResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    console.log(`Processing task ${i + 1}/${tasks.length}: ${tasks[i].description}`);
    const result = await executeTask(tasks[i], EVALUATION_TOOLS);
    results.push(result);
  }

  // Calculate summary statistics
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  // Group by category
  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const result of results) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = { total: 0, passed: 0 };
    }
    byCategory[result.category].total++;
    if (result.passed) {
      byCategory[result.category].passed++;
    }
  }

  const summary = {
    total: tasks.length,
    passed,
    failed,
    accuracy: (passed / tasks.length) * 100,
    avgDuration,
    byCategory,
  };

  // Save results if output path provided
  if (outputPath) {
    await fs.writeFile(outputPath, JSON.stringify({ results, summary }, null, 2));
    console.log(`📊 Results saved to ${outputPath}`);
  }

  // Print summary
  console.log('\n📊 Evaluation Summary:');
  console.log(`✅ Passed: ${passed}/${tasks.length} (${summary.accuracy.toFixed(1)}%)`);
  console.log(`⏱️ Avg Duration: ${avgDuration.toFixed(0)}ms`);
  console.log('\nBy Category:');
  for (const [category, stats] of Object.entries(byCategory)) {
    const catAccuracy = (stats.passed / stats.total) * 100;
    console.log(`  ${category}: ${stats.passed}/${stats.total} (${catAccuracy.toFixed(1)}%)`);
  }

  return { results, summary };
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(results: EvaluationResult[], summary: any): string {
  let report = `# VC Fund Tool Evaluation Report

## Summary

- **Total Tasks**: ${summary.total}
- **Passed**: ${summary.passed} (${summary.accuracy.toFixed(1)}%)
- **Failed**: ${summary.failed}
- **Average Duration**: ${summary.avgDuration.toFixed(0)}ms

### By Category
`;

  for (const [category, stats] of Object.entries(summary.byCategory)) {
    const catStats = stats as { total: number; passed: number };
    const accuracy = (catStats.passed / catStats.total) * 100;
    report += `- **${category}**: ${catStats.passed}/${catStats.total} (${accuracy.toFixed(1)}%)\n`;
  }

  report += '\n---\n\n## Detailed Results\n\n';

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    report += `### ${icon} Task: ${result.taskId}

**Category**: ${result.category}
**Prompt**: ${result.prompt}
**Expected**: \`${result.expected}\`
**Actual**: \`${result.actual || 'N/A'}\`
**Duration**: ${result.duration}ms
`;

    if (result.error) {
      report += `**Error**: ${result.error}\n`;
    }

    if (result.toolCalls.length > 0) {
      report += '\n**Tool Calls**:\n';
      for (const call of result.toolCalls) {
        report += `- ${call.tool} (${call.duration}ms)\n`;
      }
    }

    report += '\n---\n\n';
  }

  return report;
}
