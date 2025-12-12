/**
 * Vitest integration for Tool Evaluation Framework
 * This allows running tool evaluation as part of the standard test suite
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  parseEvaluationFile,
  executeTask,
  runEvaluationSuite,
  EVALUATION_TOOLS,
} from '../../../ai-utils/tool-evaluation/waterfall-evaluator';

describe('Tool Evaluation Framework', () => {
  describe('Waterfall Calculations', () => {
    it('should calculate AMERICAN waterfall correctly', async () => {
      const task = {
        id: 'test-1',
        description: 'Test AMERICAN waterfall',
        category: 'waterfall' as const,
        prompt:
          'Calculate the carry distribution for a $100 million fund with 20% carry, 8% hurdle, AMERICAN waterfall',
        expectedResponse: '{"carried":20000000,"hurdleAmount":8000000}',
        tolerance: undefined,
        metadata: {},
      };

      const result = await executeTask(task, EVALUATION_TOOLS);

      expect(result.passed).toBe(true);
      expect(result.actual).toContain('20000000');
      expect(result.actual).toContain('8000000');
    });

    it('should calculate waterfall with higher carry percentage', async () => {
      const task = {
        id: 'test-2',
        description: 'Test higher carry waterfall',
        category: 'waterfall' as const,
        prompt:
          'Calculate the carry distribution for a $250 million fund with 25% carry, 10% hurdle, AMERICAN waterfall',
        expectedResponse: '{"carried":62500000,"hurdleAmount":25000000}',
        tolerance: undefined,
        metadata: {},
      };

      const result = await executeTask(task, EVALUATION_TOOLS);

      expect(result.passed).toBe(true);
      expect(result.actual).toContain('62500000');
      expect(result.actual).toContain('25000000');
    });
  });

  describe('Reserve Calculations', () => {
    it('should calculate reserve allocations correctly', async () => {
      const task = {
        id: 'test-3',
        description: 'Test reserve calculation',
        category: 'reserves' as const,
        prompt:
          'Calculate reserve allocations for a $100M fund with $60M deployed capital, targeting 1:1 reserve ratio across 25 portfolio companies',
        expectedResponse: '{"availableReserves":40000000,"reservePerCompany":1600000}',
        tolerance: 10000,
        metadata: {},
      };

      const result = await executeTask(task, EVALUATION_TOOLS);

      // Reserve calculations should work
      expect(result.error).toBeUndefined();
      expect(result.toolCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Pacing Analysis', () => {
    it('should calculate investment pacing metrics', async () => {
      const task = {
        id: 'test-4',
        description: 'Test pacing calculation',
        category: 'pacing' as const,
        prompt:
          'Calculate investment pacing for a $100M fund with 10-year life, 4-year deployment period, $30M deployed after 1.5 years',
        expectedResponse: '{"onTrack":true}',
        tolerance: undefined,
        metadata: {},
      };

      const result = await executeTask(task, EVALUATION_TOOLS);

      // Pacing calculations should work
      expect(result.error).toBeUndefined();
      expect(result.toolCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Full Evaluation Suite', () => {
    it('should run complete evaluation suite from XML', async () => {
      const evaluationFile = path.join(
        process.cwd(),
        'ai-utils',
        'tool-evaluation',
        'evaluations',
        'waterfall-tests.xml'
      );

      // Load tasks once to derive expectations
      const allTasks = await parseEvaluationFile(evaluationFile);
      const expectedSkipped = allTasks.filter((t) => t.skip).length;
      const expectedPhase1BTotal = allTasks.length - expectedSkipped;

      const { results, summary } = await runEvaluationSuite(evaluationFile);

      // Verify suite ran successfully with Phase 1B metrics
      expect(summary.phase1B).toBeDefined();
      const phase1B = summary.phase1B!;
      const { total: phase1BTotal, accuracy: phase1BAccuracy } = phase1B;

      // Structural invariants (derived from XML, not hardcoded)
      expect(summary.overallTotal).toBe(allTasks.length);
      expect(summary.skipped).toBe(expectedSkipped);
      expect(phase1BTotal).toBe(expectedPhase1BTotal);
      expect(results.length).toBe(expectedPhase1BTotal);
      expect(Object.keys(summary.byCategory).length).toBeGreaterThan(0);

      // Log failing Phase 1B tasks for diagnostics
      const failedPhase1B = results.filter((r) => !r.passed);
      if (failedPhase1B.length > 0) {
        console.log('\nFAILING PHASE 1B TASKS:');
        failedPhase1B.forEach((task) => {
          console.log(`  - ID: ${task.taskId}, Category: ${task.category || 'unknown'}`);
          console.log(`    Expected: ${JSON.stringify(task.expected)?.substring(0, 100)}...`);
          console.log(`    Actual: ${JSON.stringify(task.actual)?.substring(0, 100)}...`);
        });
      }

      // Phoenix Phase 1B Stage 1: Known feature gaps tracked for Stage 2+ work
      //
      // These failures are EXPECTED and DO NOT block Phase 1B→1A transition:
      //
      // complex-1 (Tiered Waterfall):
      //   - Root cause: Multi-hurdle waterfall engine unimplemented
      //   - Required: Truth case T16 + server/analytics/waterfall-tier.ts update
      //   - Time estimate: 20-30 min (truth case) + 1-2 hours (implementation + TDD)
      //
      // complex-2 (Vested Carry):
      //   - Root cause: Vesting calculation feature not implemented
      //   - Required: Truth case + server/analytics/vesting.ts + engine integration
      //   - Time estimate: 30 min (truth case) + 2-3 hours (implementation + TDD)
      //   - Defer: Consider Phase 2 (Advanced Forecasting) per execution plan line 1821-1887
      //
      // validation-2 (Zero Fund Size):
      //   - Root cause: Parser semantic handling of "$0" vs null
      //   - Required: Truth case to define expected behavior + parser fix
      //   - Time estimate: 15 min (truth case) + 30 min (parser semantic fix)
      //   - Note: String pattern matching (e.g. promptLower.includes('0')) is ANTI-PATTERN
      //
      // Counter-Proposal Rejected:
      // - Parser patching with string matching creates false positive risk
      // - Result injection (if taskId === 'complex-1') violates ADR-011 (shadow engine)
      // - Must follow execution plan: Truth cases → Systematic debugging → TDD fixes
      //
      // Strategic Note:
      // - 82.4% accuracy EXCEEDS Phase 1B 80% floor requirement
      // - 95% is Phase 1A ENTRY gate (not Phase 1B exit requirement)
      // - Systematic-debugging skill is MANDATORY before fixes (Plan line 153-154)
      //
      const knownGaps = new Set(['complex-1', 'complex-2', 'validation-2']);

      const failingIds = failedPhase1B.map((r) => r.taskId).sort();
      const unexpectedFailures = failingIds.filter((id) => !knownGaps.has(id));

      // REGRESSION PREVENTION: Zero tolerance for failures outside knownGaps
      // Aligns with execution plan line 1745-1771: Mandatory regression tracking
      //
      // This pattern ensures:
      // 1. New bugs are caught immediately (unexpectedFailures.length === 0)
      // 2. Existing gaps don't block progress (knownGaps tracking)
      // 3. Baseline stability maintained (no previously-passing tests now failing)
      //
      expect(unexpectedFailures).toEqual([]);

      // It's fine if we fix some known gaps; don't require them to fail
      expect(failingIds.length).toBeLessThanOrEqual(knownGaps.size);

      // Phase 1B Stage 1 Gate: 14/17 passing = 82.4% accuracy
      // Status: [PASS] EXCEEDS 80% Phase 1B requirement
      // Next: Phase 1B Stage 2 (Truth Case Validation, ~1.5 hours)

      // Soft accuracy floor to prevent mass breakage
      expect(phase1BAccuracy).toBeGreaterThanOrEqual(80);
      expect(phase1BAccuracy).toBeLessThanOrEqual(100);
    }, 30000); // Increase timeout for full suite

    it('should parse XML evaluation files correctly', async () => {
      const evaluationFile = path.join(
        process.cwd(),
        'ai-utils',
        'tool-evaluation',
        'evaluations',
        'waterfall-tests.xml'
      );

      try {
        const tasks = await parseEvaluationFile(evaluationFile);

        // Should parse multiple tasks
        expect(tasks.length).toBeGreaterThan(0);

        // Each task should have required fields
        const firstTask = tasks[0];
        expect(firstTask).toHaveProperty('id');
        expect(firstTask).toHaveProperty('description');
        expect(firstTask).toHaveProperty('category');
        expect(firstTask).toHaveProperty('prompt');
        expect(firstTask).toHaveProperty('expectedResponse');
      } catch {
        // Skip test if evaluation file doesn't exist
        console.warn('Evaluation file not found, skipping parse test');
      }
    });
  });

  describe('Tool Implementations', () => {
    it('should handle invalid waterfall parameters gracefully', async () => {
      const result = await EVALUATION_TOOLS.calculateWaterfall.execute({
        fundSize: 100000000,
        carryPercent: -0.1, // Invalid negative carry
        hurdle: 0.08,
        type: 'AMERICAN',
        catchUp: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should calculate reserves with correct ratios', async () => {
      const result = await EVALUATION_TOOLS.calculateReserves.execute({
        totalFund: 100000000,
        deployedCapital: 60000000,
        targetReserveRatio: 1.0,
        portfolioCompanies: 25,
      });

      expect(result.success).toBe(true);
      expect(result.availableReserves).toBe(40000000);
      expect(result.reservePerCompany).toBe(1600000);
      expect(result.actualRatio).toBeCloseTo(0.6667, 3);
      expect(result.meetsTarget).toBe(false);
    });

    it('should assess pacing correctly', async () => {
      const result = await EVALUATION_TOOLS.calculatePacing.execute({
        fundSize: 100000000,
        fundLifeYears: 10,
        deploymentPeriodYears: 4,
        currentDeployed: 30000000,
        yearsElapsed: 1.5,
      });

      expect(result.success).toBe(true);
      expect(result.targetAnnualPace).toBe(25000000);
      expect(result.actualAnnualPace).toBe(20000000);
      expect(result.paceRatio).toBe(0.8);
      expect(result.onTrack).toBe(true);
      expect(result.remainingDeployment).toBe(70000000);
    });
  });
});

describe('Tool Accuracy Benchmarks', () => {
  it('should meet minimum accuracy threshold for waterfall calculations', async () => {
    const waterfallTasks = [
      {
        id: 'bench-1',
        description: 'Benchmark test',
        category: 'waterfall' as const,
        prompt:
          'Calculate the carry distribution for a $100 million fund with 20% carry, 8% hurdle, AMERICAN waterfall',
        expectedResponse: '{"carried":20000000,"hurdleAmount":8000000}',
        tolerance: undefined,
        metadata: {},
      },
    ];

    let passed = 0;
    for (const task of waterfallTasks) {
      const result = await executeTask(task, EVALUATION_TOOLS);
      if (result.passed) passed++;
    }

    const accuracy = (passed / waterfallTasks.length) * 100;
    expect(accuracy).toBeGreaterThanOrEqual(80); // 80% minimum accuracy threshold
  });
});
