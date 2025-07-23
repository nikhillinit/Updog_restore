import { BaseAgent, AgentConfig, AgentExecutionContext } from '@povc/agent-core';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
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
  }>;
  prUrl?: string;
}

export class TestRepairAgent extends BaseAgent<RepairInput, RepairResult> {
  constructor(config?: Partial<AgentConfig>) {
    super({
      name: 'test-repair-agent',
      maxRetries: 1, // Test repairs should be careful, minimal retries
      timeout: 180000, // 3 minutes for test analysis and repair
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

  // Core logic: Generate repairs (~20 lines)
  private async generateRepairs(
    failures: TestFailure[],
    input: RepairInput
  ): Promise<Array<{ file: string; changes: string; success: boolean }>> {
    const maxRepairs = input.maxRepairs || 5;
    const repairs = [];

    for (const failure of failures.slice(0, maxRepairs)) {
      try {
        const repair = await this.generateSingleRepair(failure);
        repairs.push({
          file: failure.file,
          changes: repair,
          success: true,
        });
        this.logger.info(`Generated repair for ${failure.file}`, { failure, repair });
      } catch (error) {
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

  private async generateSingleRepair(failure: TestFailure): Promise<string> {
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

  private generateTimeoutRepair(failure: TestFailure): string {
    return 'Increase test timeout or optimize async operations';
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
    } catch (error) {
      this.logger.error('Failed to create draft PR', { error });
      throw new Error(`Draft PR creation failed: ${error}`);
    }
  }

  private executeCommand(command: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command[0], command.slice(1), {
        cwd,
        stdio: 'pipe',
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => stdout += data.toString());
      process.stderr.on('data', (data) => stderr += data.toString());

      process.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });

      process.on('error', reject);
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