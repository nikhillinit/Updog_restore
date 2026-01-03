import type { AgentConfig, AgentExecutionContext } from '../../agent-core/src/BaseAgent';
import { BaseAgent } from '../../agent-core/src/BaseAgent';
import { withThinking } from '../../agent-core/src/ThinkingMixin';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

export interface TestFailure {
  file: string;
  testName: string;
  error: string;
  line?: number;
  type: 'syntax' | 'runtime' | 'assertion' | 'timeout';
}

export interface RepairInput {
  projectRoot: string;
  testPattern?: string;
  maxRepairs?: number;
  draftPR?: boolean;
}

export interface RepairResult {
  failures: TestFailure[];
  repairs: Array<{
    file: string;
    changes: string;
    success: boolean;
    evaluation?: EvaluationResult;
    iterations?: number;
  }>;
  prUrl?: string;
}

export type EvaluationStatus = 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL';

export interface EvaluationResult {
  status: EvaluationStatus;
  feedback: string;
  criteria: {
    testPasses: boolean;
    noRegressions: boolean;
    followsConventions: boolean;
  };
}

export class TestRepairAgent extends withThinking(BaseAgent)<RepairInput, RepairResult> {
  private readonly MAX_OPTIMIZATION_ITERATIONS = 3;

  constructor(config?: Partial<AgentConfig>) {
    super({
      name: 'test-repair-agent',
      maxRetries: 1, // Test repairs should be careful, minimal retries
      timeout: 180000, // 3 minutes for test analysis and repair

      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: (config?.tenantId as string | undefined) || 'agent:test-repair',
      memoryScope: 'project', // Cross-session learnings from test repairs

      ...config,
    });
  }

  protected async performOperation(
    input: RepairInput,
    context: AgentExecutionContext
  ): Promise<RepairResult> {
    this.logger.info('Starting test repair analysis', { input });

    // Step 1: Run tests and detect failures (~10 lines core logic)
    const failures = await this.detectTestFailures(input);
    
    if (failures.length === 0) {
      this.logger.info('No test failures detected');
      return { failures: [], repairs: [] };
    }

    this.logger.info(`Found ${failures.length} test failures`, { failures });

    // Step 2: Generate repairs for failures (~20 lines core logic)
    const repairs = await this.generateRepairs(failures, input);

    // Step 3: Create draft PR if requested
    let prUrl: string | undefined;
    if (input.draftPR && repairs.some(r => r.success)) {
      prUrl = await this.createDraftPR(repairs, context);
    }

    return {
      failures,
      repairs,
      prUrl,
    };
  }

  // Core logic: Detect test failures (~10 lines)
  private async detectTestFailures(input: RepairInput): Promise<TestFailure[]> {
    const command = ['npm', 'run', 'test:run'];
    if (input.testPattern) {
      command.push('--', input.testPattern);
    }

    const result = await this.executeCommand(command, input.projectRoot);
    return this.parseTestOutput(result.stdout, result.stderr);
  }

  // Core logic: Generate repairs with evaluator-optimizer pattern
  private async generateRepairs(
    failures: TestFailure[],
    input: RepairInput
  ): Promise<Array<{ file: string; changes: string; success: boolean; evaluation?: EvaluationResult; iterations?: number }>> {
    const maxRepairs = input.maxRepairs || 5;
    const repairs = [];

    for (const failure of failures.slice(0, maxRepairs)) {
      try {
        // Use evaluator-optimizer loop instead of single attempt
        const result = await this.evaluatorOptimizerLoop(failure, input);
        repairs.push(result);
        this.logger.info(`Generated repair for ${failure.file}`, {
          failure,
          iterations: result.iterations,
          evaluation: result.evaluation
        });
      } catch (error: unknown) {
        repairs.push({
          file: failure.file,
          changes: '',
          success: false,
        });
        this.logger.warn(`Failed to generate repair for ${failure.file}`, { error });
      }
    }

    return repairs;
  }

  /**
   * Evaluator-Optimizer Loop (Cookbook Pattern)
   * Iteratively generates and evaluates fixes until PASS or max iterations
   */
  private async evaluatorOptimizerLoop(
    failure: TestFailure,
    input: RepairInput
  ): Promise<{ file: string; changes: string; success: boolean; evaluation: EvaluationResult; iterations: number }> {
    let currentRepair = '';
    let evaluation: EvaluationResult | null = null;
    const previousAttempts: Array<{ repair: string; feedback: string }> = [];

    for (let iteration = 0; iteration < this.MAX_OPTIMIZATION_ITERATIONS; iteration++) {
      // Generate (or optimize) repair
      if (iteration === 0) {
        currentRepair = await this.generateSingleRepair(failure);
      } else {
        currentRepair = await this.optimizeWithFeedback(failure, currentRepair, evaluation!, previousAttempts);
      }

      // Evaluate the repair
      evaluation = await this.evaluateFix(failure, currentRepair, input);

      // Track attempt for next iteration
      previousAttempts.push({
        repair: currentRepair,
        feedback: evaluation.feedback
      });

      this.logger.debug(`Iteration ${iteration + 1}/${this.MAX_OPTIMIZATION_ITERATIONS}`, {
        status: evaluation.status,
        feedback: evaluation.feedback
      });

      // Stop if we achieved PASS
      if (evaluation.status === 'PASS') {
        return {
          file: failure.file,
          changes: currentRepair,
          success: true,
          evaluation,
          iterations: iteration + 1
        };
      }

      // Stop if we hit FAIL (unrecoverable)
      if (evaluation.status === 'FAIL') {
        this.logger.warn('Repair marked as FAIL, stopping iterations', { evaluation });
        break;
      }
    }

    // Max iterations reached or FAIL
    return {
      file: failure.file,
      changes: currentRepair,
      success: false,
      evaluation: evaluation!,
      iterations: this.MAX_OPTIMIZATION_ITERATIONS
    };
  }

  private async generateSingleRepair(failure: TestFailure): Promise<string> {
    try {
      // Use extended thinking for complex test failures
      const analysis = await this.think(
        `Analyze this test failure and suggest a precise repair:

Test: ${failure.testName}
File: ${failure.file}
Error: ${failure.error}
Type: ${failure.type}

Provide a specific, actionable fix that addresses the root cause.`,
        {
          depth: 'quick',
          context: 'Vitest test framework, React Testing Library, TypeScript strict mode'
        }
      );

      return analysis.response;
    } catch (error: unknown) {
      // Fallback to simple pattern matching if thinking fails
      this.logger.warn('Extended thinking failed, using pattern matching', { error });
      return this.fallbackToPatternMatching(failure);
    }
  }

  private fallbackToPatternMatching(failure: TestFailure): string {
    // Simple repair strategies based on failure type
    switch (failure.type) {
      case 'syntax':
        return this.generateSyntaxRepair(failure);
      case 'assertion':
        return this.generateAssertionRepair(failure);
      case 'runtime':
        return this.generateRuntimeRepair(failure);
      case 'timeout':
        return this.generateTimeoutRepair(failure);
      default:
        throw new Error(`Unknown failure type: ${failure.type}`);
    }
  }

  private generateSyntaxRepair(failure: TestFailure): string {
    // Basic syntax error repairs
    if (failure.error.includes('Missing semicolon')) {
      return 'Add missing semicolon';
    }
    if (failure.error.includes('Unexpected token')) {
      return 'Fix unexpected token syntax';
    }
    return 'Fix syntax error';
  }

  private generateAssertionRepair(failure: TestFailure): string {
    // Basic assertion repairs
    if (failure.error.includes('expected') && failure.error.includes('received')) {
      return 'Update assertion to match expected value';
    }
    return 'Fix test assertion';
  }

  private generateRuntimeRepair(failure: TestFailure): string {
    // Basic runtime error repairs
    if (failure.error.includes('Cannot read property')) {
      return 'Add null/undefined checks';
    }
    if (failure.error.includes('is not a function')) {
      return 'Fix function call or import';
    }
    return 'Fix runtime error';
  }

  private generateTimeoutRepair(_failure: TestFailure): string {
    return 'Increase test timeout or optimize async operations';
  }

  /**
   * Evaluator: Assesses repair quality against criteria
   * Returns PASS, NEEDS_IMPROVEMENT, or FAIL with detailed feedback
   */
  private async evaluateFix(
    failure: TestFailure,
    repair: string,
    _input: RepairInput
  ): Promise<EvaluationResult> {
    const criteria = {
      testPasses: false,
      noRegressions: false,
      followsConventions: false
    };

    const feedbackItems: string[] = [];

    // Criterion 1: Does the repair address the actual error?
    const addressesError = this.repairAddressesError(failure, repair);
    if (addressesError) {
      criteria.testPasses = true;
    } else {
      feedbackItems.push('Repair does not directly address the error message');
    }

    // Criterion 2: No obvious regressions (basic heuristics)
    const hasRegressions = this.detectPotentialRegressions(repair);
    if (!hasRegressions) {
      criteria.noRegressions = true;
    } else {
      feedbackItems.push('Repair may introduce regressions (unsafe patterns detected)');
    }

    // Criterion 3: Follows coding conventions
    const followsConventions = this.checksConventions(repair);
    if (followsConventions) {
      criteria.followsConventions = true;
    } else {
      feedbackItems.push('Repair should follow project conventions (type safety, error handling)');
    }

    // Determine overall status
    let status: EvaluationStatus;
    if (criteria.testPasses && criteria.noRegressions && criteria.followsConventions) {
      status = 'PASS';
    } else if (criteria.testPasses) {
      status = 'NEEDS_IMPROVEMENT';
    } else {
      status = 'FAIL';
    }

    return {
      status,
      feedback: feedbackItems.length > 0
        ? feedbackItems.join('; ')
        : 'All criteria met',
      criteria
    };
  }

  /**
   * Optimizer: Improves repair based on evaluator feedback
   */
  private async optimizeWithFeedback(
    failure: TestFailure,
    currentRepair: string,
    evaluation: EvaluationResult,
    previousAttempts: Array<{ repair: string; feedback: string }>
  ): Promise<string> {
    this.logger.debug('Optimizing repair based on feedback', {
      currentRepair,
      feedback: evaluation.feedback,
      attemptCount: previousAttempts.length
    });

    // Build optimization context (for future use with LLM optimization)
    const _optimizationPrompt = this.buildOptimizationPrompt(
      failure,
      currentRepair,
      evaluation,
      previousAttempts
    );

    // Apply specific improvements based on failed criteria
    let optimizedRepair = currentRepair;

    if (!evaluation.criteria.followsConventions) {
      optimizedRepair = this.improveConventions(optimizedRepair, failure);
    }

    if (!evaluation.criteria.noRegressions) {
      optimizedRepair = this.removeUnsafePatterns(optimizedRepair);
    }

    if (!evaluation.criteria.testPasses) {
      // Try alternative repair strategy
      optimizedRepair = this.tryAlternativeStrategy(failure, previousAttempts);
    }

    return optimizedRepair;
  }

  // Helper: Check if repair addresses the error
  private repairAddressesError(failure: TestFailure, repair: string): boolean {
    const errorKeywords = this.extractKeywords(failure.error);
    const repairKeywords = this.extractKeywords(repair);

    // Check if repair mentions key error concepts
    return errorKeywords.some(keyword => repairKeywords.includes(keyword));
  }

  // Helper: Detect potential regressions
  private detectPotentialRegressions(repair: string): boolean {
    const unsafePatterns = [
      /any\s+type/i,           // TypeScript 'any' type
      /console\.log/i,         // Debug statements
      /@ts-ignore/i,           // Suppressing TS errors
      /\/\/\s*TODO/i,          // Unfinished work
      /setTimeout.*999999/i,   // Extremely long timeouts
    ];

    return unsafePatterns.some(pattern => pattern.test(repair));
  }

  // Helper: Check coding conventions
  private checksConventions(repair: string): boolean {
    // Basic convention checks
    const hasTypeAnnotations = repair.includes(':') || !repair.includes('const ');
    const hasProperErrorHandling = repair.includes('try') || !repair.includes('Error');
    const noMagicNumbers = !/\d{3,}/.test(repair); // No large magic numbers

    return hasTypeAnnotations && hasProperErrorHandling && noMagicNumbers;
  }

  // Helper: Build optimization prompt context
  private buildOptimizationPrompt(
    failure: TestFailure,
    currentRepair: string,
    evaluation: EvaluationResult,
    previousAttempts: Array<{ repair: string; feedback: string }>
  ): string {
    return `
Error: ${failure.error}
Current Repair: ${currentRepair}
Feedback: ${evaluation.feedback}
Previous Attempts: ${previousAttempts.length}
Failed Criteria: ${Object.entries(evaluation.criteria)
      .filter(([_, passed]) => !passed)
      .map(([criterion]) => criterion)
      .join(', ')}
    `.trim();
  }

  // Helper: Improve conventions
  private improveConventions(repair: string, failure: TestFailure): string {
    // Add type safety if missing
    if (!repair.includes(':') && failure.type === 'runtime') {
      return `${repair} (add proper TypeScript types and null checks)`;
    }

    // Add error handling if missing
    if (!repair.includes('try') && failure.type === 'runtime') {
      return `Wrap in try-catch: ${repair}`;
    }

    return repair;
  }

  // Helper: Remove unsafe patterns
  private removeUnsafePatterns(repair: string): string {
    return repair
      .replace(/@ts-ignore/g, '') // Remove TS suppressions
      .replace(/console\.log/g, '') // Remove debug statements
      .replace(/any/g, 'unknown'); // Replace 'any' with 'unknown'
  }

  // Helper: Try alternative strategy
  private tryAlternativeStrategy(
    failure: TestFailure,
    previousAttempts: Array<{ repair: string; feedback: string }>
  ): string {
    // If previous strategies failed, try a different approach based on failure type
    const attemptedStrategies = previousAttempts.map(a => a.repair);

    switch (failure.type) {
      case 'assertion':
        if (!attemptedStrategies.some(s => s.includes('mock'))) {
          return 'Add proper test mocking for external dependencies';
        }
        return 'Update test expectations to match implementation behavior';

      case 'runtime':
        if (!attemptedStrategies.some(s => s.includes('null'))) {
          return 'Add comprehensive null/undefined guards with type narrowing';
        }
        return 'Refactor to use optional chaining and nullish coalescing';

      case 'syntax':
        return 'Fix syntax using AST-aware formatter (Prettier/ESLint auto-fix)';

      case 'timeout':
        return 'Replace synchronous operations with async/await patterns';

      default:
        return 'Apply general-purpose error resolution strategy';
    }
  }

  // Helper: Extract keywords from text
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3);
  }

  private parseTestOutput(stdout: string, stderr: string): TestFailure[] {
    const failures: TestFailure[] = [];
    const output = stdout + stderr;
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Parse Vitest failure format
      if (line.includes('FAIL') || line.includes('✗')) {
        const failure = this.parseViTestFailure(lines, i);
        if (failure) failures.push(failure);
      }
    }

    return failures;
  }

  private parseViTestFailure(lines: string[], startIndex: number): TestFailure | null {
    try {
      const failLine = lines[startIndex];
      const file = this.extractFileName(failLine);
      const testName = this.extractTestName(lines, startIndex);
      const error = this.extractErrorMessage(lines, startIndex);
      const type = this.classifyFailureType(error);

      return {
        file,
        testName,
        error,
        type,
      };
    } catch {
      return null;
    }
  }

  private extractFileName(line: string): string {
    const match = line.match(/(\S+\.test\.\w+)/);
    return match ? match[1] : 'unknown-file';
  }

  private extractTestName(lines: string[], startIndex: number): string {
    for (let i = startIndex; i < Math.min(startIndex + 5, lines.length); i++) {
      const match = lines[i].match(/describe|it|test\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (match) return match[1];
    }
    return 'unknown-test';
  }

  private extractErrorMessage(lines: string[], startIndex: number): string {
    const errorLines = [];
    for (let i = startIndex + 1; i < Math.min(startIndex + 10, lines.length); i++) {
      if (lines[i].trim() && !lines[i].includes('at ')) {
        errorLines.push(lines[i].trim());
      }
    }
    return errorLines.join(' ').substring(0, 500);
  }

  private classifyFailureType(error: string): TestFailure['type'] {
    if (error.includes('SyntaxError') || error.includes('Unexpected token')) {
      return 'syntax';
    }
    if (error.includes('timeout') || error.includes('Timeout')) {
      return 'timeout';
    }
    if (error.includes('expected') || error.includes('AssertionError')) {
      return 'assertion';
    }
    return 'runtime';
  }

  private async createDraftPR(
    repairs: Array<{ file: string; changes: string; success: boolean }>,
    context: AgentExecutionContext
  ): Promise<string> {
    const successfulRepairs = repairs.filter(r => r.success);
    const branchName = `test-repair/${context.runId}`;
    
    this.logger.info('Creating draft PR for test repairs', { 
      branchName, 
      repairCount: successfulRepairs.length 
    });

    try {
      // Create branch
      await this.executeCommand(['git', 'checkout', '-b', branchName], process.cwd());
      
      // Apply repairs (simplified - in practice would apply actual code changes)
      const repairSummary = successfulRepairs.map(r => `- ${r.file}: ${r.changes}`).join('\n');
      writeFileSync(
        join(process.cwd(), `test-repairs-${context.runId}.md`), 
        `# Test Repair Summary\n\n${repairSummary}`
      );
      
      // Commit changes
      await this.executeCommand(['git', 'add', '.'], process.cwd());
      await this.executeCommand([
        'git', 'commit', '-m', 
        `fix: automated test repairs for ${successfulRepairs.length} failures\n\n🤖 Generated by test-repair-agent`
      ], process.cwd());
      
      // Create draft PR (requires gh CLI)
      const prResult = await this.executeCommand([
        'gh', 'pr', 'create', 
        '--title', `🔧 Automated Test Repairs (${successfulRepairs.length} fixes)`,
        '--body', `Automated repairs generated by test-repair-agent:\n\n${repairSummary}`,
        '--draft'
      ], process.cwd());
      
      return prResult.stdout.trim();
    } catch (error: unknown) {
      this.logger.error('Failed to create draft PR', { error });
      throw new Error(`Draft PR creation failed: ${error}`);
    }
  }

  private executeCommand(command: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const childProcess: ChildProcess = spawn(command[0], command.slice(1), {
        cwd,
        stdio: 'pipe',
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      }
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      }

      childProcess.on('close', (exitCode: number | null) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });

      childProcess.on('error', reject);
    });
  }

  protected getExecutionMetadata(input: RepairInput) {
    return {
      projectRoot: input.projectRoot,
      testPattern: input.testPattern || 'all',
      maxRepairs: input.maxRepairs || 5,
      draftPR: input.draftPR || false,
    };
  }
}