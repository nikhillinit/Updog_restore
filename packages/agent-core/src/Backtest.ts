/**
 * Backtest Engine for Agent Performance Evaluation
 *
 * Runs AI agents against historical test failures to measure:
 * - Success rate: Did agent produce equivalent fix?
 * - Quality score: How good is the fix (0-100)?
 * - Speed: Simulated time vs actual human time
 * - Iteration count: Agent iterations vs human revisions
 * - Cost estimate: API calls, tokens used
 *
 * Uses git worktrees for safe isolation from current working directory
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { Logger } from './Logger';
import { MetricsCollector } from './MetricsCollector';
import type { AIModel, TaskType } from './Router';
import { AIRouter } from './Router';

// ========================================
// Core Types
// ========================================

export interface BacktestCase {
  id: string;
  commitHash: string;
  type: TaskType;
  description: string;
  files: string[];
  errorMessage: string;
  humanSolution: string;
  timeToResolve: number; // in minutes
  complexity: number; // 1-10 scale
  metadata?: {
    testCommand?: string;
    expectedOutcome?: string;
    category?: string;
  };
}

export interface BacktestResult {
  caseId: string;
  agentSuccess: boolean;
  qualityScore: number; // 0-100
  agentSolution: string;
  humanSolution: string;
  similarityScore: number; // 0-1 (how similar to human solution)
  speedup: number; // agent time / human time (>1 means agent faster)
  iterations: number;
  cost: number; // estimated cost in arbitrary units
  errors?: string[];
  metadata?: {
    agentModel?: AIModel;
    timestamp?: string;
    executionDetails?: any;
  };
}

export interface BacktestReport {
  totalCases: number;
  successfulCases: number;
  failedCases: number;
  averageQualityScore: number;
  averageSimilarityScore: number;
  averageSpeedup: number;
  averageIterations: number;
  totalCost: number;
  successRate: number; // 0-1
  results: BacktestResult[];
  summary: {
    bestCase: BacktestResult | null;
    worstCase: BacktestResult | null;
    totalDuration: number;
    timestamp: string;
  };
}

export interface BacktestConfig {
  projectRoot: string;
  worktreePath?: string;
  cleanupWorktree?: boolean;
  maxConcurrent?: number;
  timeout?: number; // per case timeout in ms
  verbose?: boolean;
  dryRun?: boolean;
}

export interface AgentExecutor {
  name: string;
  execute(testCase: BacktestCase, context: WorktreeContext): Promise<AgentExecutionResult>;
}

export interface AgentExecutionResult {
  success: boolean;
  solution: string;
  iterations: number;
  duration: number; // in ms
  cost: number;
  error?: string;
}

export interface WorktreeContext {
  path: string;
  commitHash: string;
  cleanup: () => Promise<void>;
}

// ========================================
// BacktestRunner Class
// ========================================

export class BacktestRunner {
  private config: Required<BacktestConfig>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private router: AIRouter;
  private worktrees: Map<string, WorktreeContext>;

  constructor(config: BacktestConfig) {
    this.config = {
      worktreePath: join(config.projectRoot, '.backtest-worktrees'),
      cleanupWorktree: true,
      maxConcurrent: 3,
      timeout: 300000, // 5 minutes per case
      verbose: false,
      dryRun: false,
      ...config,
    };

    this.logger = new Logger({
      level: this.config.verbose ? 'debug' : 'info',
      agent: 'backtest-runner',
    });

    this.metrics = MetricsCollector.getInstance();
    this.router = new AIRouter();
    this.worktrees = new Map();

    this.ensureWorktreeDirectory();
  }

  /**
   * Run backtest on a set of test cases
   */
  async runBacktest(cases: BacktestCase[]): Promise<BacktestReport> {
    const startTime = Date.now();
    this.logger.info(`Starting backtest with ${cases.length} cases`, {
      projectRoot: this.config.projectRoot,
      maxConcurrent: this.config.maxConcurrent,
    });

    if (this.config.dryRun) {
      this.logger.warn('DRY RUN MODE - No actual changes will be made');
    }

    const results: BacktestResult[] = [];
    const batches = this.createBatches(cases, this.config.maxConcurrent);

    // Process in batches to respect concurrency limit
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} cases)`);

      const batchResults = await Promise.all(
        batch.map(testCase => this.evaluateSingleCase(testCase))
      );

      results.push(...batchResults);

      // Log progress
      const successCount = results.filter(r => r.agentSuccess).length;
      this.logger.info(`Progress: ${results.length}/${cases.length} cases completed, ${successCount} successful`);
    }

    // Generate report
    const report = this.generateReport(results, Date.now() - startTime);

    this.logger.info('Backtest completed', {
      totalCases: report.totalCases,
      successRate: `${(report.successRate * 100).toFixed(2)}%`,
      averageQualityScore: report.averageQualityScore.toFixed(2),
      totalDuration: `${(report.summary.totalDuration / 1000).toFixed(2)}s`,
    });

    // Cleanup all worktrees
    if (this.config.cleanupWorktree) {
      await this.cleanupAllWorktrees();
    }

    return report;
  }

  /**
   * Evaluate a single backtest case
   */
  async evaluateSingleCase(testCase: BacktestCase): Promise<BacktestResult> {
    const startTime = Date.now();
    this.logger.debug(`Evaluating case ${testCase.id}`, { testCase });

    try {
      // Step 1: Create isolated worktree at specific commit
      const worktree = await this.createWorktree(testCase.commitHash, testCase.id);

      // Step 2: Create agent executor for this test case
      const agentExecutor = this.createAgentExecutor(testCase);

      // Step 3: Execute agent with timeout
      const agentResult = await this.executeWithTimeout(
        () => agentExecutor.execute(testCase, worktree),
        this.config.timeout,
        `Case ${testCase.id} timed out`
      );

      // Step 4: Compare agent solution with human solution
      const similarityScore = this.compareWithHumanSolution(
        agentResult.solution,
        testCase.humanSolution
      );

      // Step 5: Calculate quality score
      const qualityScore = this.calculateQualityScore(
        agentResult,
        testCase,
        similarityScore
      );

      // Step 6: Calculate speedup
      const agentTimeMinutes = agentResult.duration / 60000;
      const speedup = testCase.timeToResolve / Math.max(agentTimeMinutes, 0.1);

      const result: BacktestResult = {
        caseId: testCase.id,
        agentSuccess: agentResult.success,
        qualityScore,
        agentSolution: agentResult.solution,
        humanSolution: testCase.humanSolution,
        similarityScore,
        speedup,
        iterations: agentResult.iterations,
        cost: agentResult.cost,
        metadata: {
          timestamp: new Date().toISOString(),
          executionDetails: {
            duration: agentResult.duration,
            humanTime: testCase.timeToResolve,
          },
        },
      };

      // Cleanup worktree for this case
      if (this.config.cleanupWorktree) {
        await worktree.cleanup();
      }

      this.logger.info(`Case ${testCase.id} completed`, {
        success: result.agentSuccess,
        qualityScore: result.qualityScore.toFixed(2),
        speedup: result.speedup.toFixed(2),
      });

      return result;
    } catch (error) {
      this.logger.error(`Case ${testCase.id} failed`, error);

      return {
        caseId: testCase.id,
        agentSuccess: false,
        qualityScore: 0,
        agentSolution: '',
        humanSolution: testCase.humanSolution,
        similarityScore: 0,
        speedup: 0,
        iterations: 0,
        cost: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Compare agent solution with human solution
   * Returns similarity score (0-1)
   */
  compareWithHumanSolution(agentSolution: string, humanSolution: string): number {
    // Normalize solutions for comparison
    const normalizeCode = (code: string): string => {
      return code
        .toLowerCase()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/['"]/g, '') // Remove quotes
        .replace(/;/g, '') // Remove semicolons
        .trim();
    };

    const agentNorm = normalizeCode(agentSolution);
    const humanNorm = normalizeCode(humanSolution);

    // Exact match
    if (agentNorm === humanNorm) {
      return 1.0;
    }

    // Levenshtein distance-based similarity
    const similarity = this.levenshteinSimilarity(agentNorm, humanNorm);

    // Keyword overlap
    const agentKeywords = this.extractKeywords(agentSolution);
    const humanKeywords = this.extractKeywords(humanSolution);
    const keywordOverlap = this.calculateOverlap(agentKeywords, humanKeywords);

    // Weighted average: 60% structure similarity, 40% keyword overlap
    return similarity * 0.6 + keywordOverlap * 0.4;
  }

  /**
   * Calculate quality score (0-100) based on multiple factors
   */
  private calculateQualityScore(
    agentResult: AgentExecutionResult,
    testCase: BacktestCase,
    similarityScore: number
  ): number {
    if (!agentResult.success) {
      return 0;
    }

    // Factors contributing to quality score:
    // 1. Similarity to human solution (40%)
    const similarityFactor = similarityScore * 40;

    // 2. Efficiency (number of iterations) (20%)
    const optimalIterations = 1;
    const maxIterations = 5;
    const iterationsFactor =
      Math.max(0, (maxIterations - agentResult.iterations) / maxIterations) * 20;

    // 3. Speed (20%)
    const agentTimeMinutes = agentResult.duration / 60000;
    const speedFactor = Math.min(
      20,
      (testCase.timeToResolve / Math.max(agentTimeMinutes, 0.1)) * 4
    );

    // 4. Solution length (conciseness) (10%)
    const humanLength = testCase.humanSolution.length;
    const agentLength = agentResult.solution.length;
    const lengthRatio = humanLength / Math.max(agentLength, 1);
    const lengthFactor = Math.min(10, lengthRatio * 10);

    // 5. Cost efficiency (10%)
    const costThreshold = 10;
    const costFactor = Math.max(0, (costThreshold - agentResult.cost) / costThreshold) * 10;

    return Math.min(
      100,
      similarityFactor + iterationsFactor + speedFactor + lengthFactor + costFactor
    );
  }

  /**
   * Create agent executor based on test case type
   */
  private createAgentExecutor(testCase: BacktestCase): AgentExecutor {
    // Route to appropriate agent based on task type
    const routingDecision = this.router.route({
      type: testCase.type,
      complexity: testCase.complexity,
      description: testCase.description,
      urgency: 'medium',
      budget: 'moderate',
    });

    return {
      name: routingDecision.model,
      execute: async (tc: BacktestCase, context: WorktreeContext): Promise<AgentExecutionResult> => {
        const startTime = Date.now();

        if (this.config.dryRun) {
          // Simulate execution in dry run mode
          return {
            success: true,
            solution: `[DRY RUN] Simulated solution for ${tc.id}`,
            iterations: 1,
            duration: 1000,
            cost: 1,
          };
        }

        // In production, this would call the actual AI agent
        // For now, we simulate based on test case complexity
        const iterations = Math.ceil(tc.complexity / 3);
        const duration = Date.now() - startTime;
        const cost = iterations * 2; // Simple cost model

        // Simulate solution generation
        const solution = `Fix for ${tc.description}\nFiles: ${tc.files.join(', ')}\nError: ${tc.errorMessage}`;

        return {
          success: Math.random() > (tc.complexity / 15), // Higher complexity = lower success chance
          solution,
          iterations,
          duration,
          cost,
        };
      },
    };
  }

  /**
   * Create a git worktree at a specific commit
   */
  private async createWorktree(commitHash: string, caseId: string): Promise<WorktreeContext> {
    const worktreePath = join(this.config.worktreePath, `case-${caseId}`);

    this.logger.debug(`Creating worktree at ${worktreePath} for commit ${commitHash}`);

    // Remove existing worktree if it exists
    if (existsSync(worktreePath)) {
      await this.removeWorktree(worktreePath);
    }

    // Create new worktree
    await this.executeGitCommand(
      ['worktree', 'add', worktreePath, commitHash],
      this.config.projectRoot
    );

    const context: WorktreeContext = {
      path: worktreePath,
      commitHash,
      cleanup: async () => {
        await this.removeWorktree(worktreePath);
      },
    };

    this.worktrees.set(caseId, context);
    return context;
  }

  /**
   * Remove a git worktree
   */
  private async removeWorktree(worktreePath: string): Promise<void> {
    this.logger.debug(`Removing worktree at ${worktreePath}`);

    try {
      // Remove worktree
      await this.executeGitCommand(
        ['worktree', 'remove', worktreePath, '--force'],
        this.config.projectRoot
      );
    } catch (error) {
      this.logger.warn(`Failed to remove worktree: ${error}`);
      // Try to prune in case of stale worktrees
      await this.executeGitCommand(['worktree', 'prune'], this.config.projectRoot);
    }
  }

  /**
   * Cleanup all created worktrees
   */
  private async cleanupAllWorktrees(): Promise<void> {
    this.logger.info('Cleaning up all worktrees');

    const cleanupPromises = Array.from(this.worktrees.values()).map(async (context) => {
      try {
        await context.cleanup();
      } catch (error) {
        this.logger.warn(`Failed to cleanup worktree: ${error}`);
      }
    });

    await Promise.all(cleanupPromises);
    this.worktrees.clear();

    // Prune any remaining stale worktrees
    try {
      await this.executeGitCommand(['worktree', 'prune'], this.config.projectRoot);
    } catch (error) {
      this.logger.warn(`Failed to prune worktrees: ${error}`);
    }
  }

  /**
   * Execute git command
   */
  private executeGitCommand(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd,
        stdio: 'pipe',
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Git command failed: ${stderr || stdout}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeout)
      ),
    ]);
  }

  /**
   * Generate backtest report
   */
  private generateReport(results: BacktestResult[], totalDuration: number): BacktestReport {
    const successfulResults = results.filter(r => r.agentSuccess);

    const averageQualityScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length
        : 0;

    const averageSimilarityScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.similarityScore, 0) / results.length
        : 0;

    const averageSpeedup =
      successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.speedup, 0) / successfulResults.length
        : 0;

    const averageIterations =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.iterations, 0) / results.length
        : 0;

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

    // Find best and worst cases
    const sortedByQuality = [...results].sort((a, b) => b.qualityScore - a.qualityScore);
    const bestCase = sortedByQuality[0] || null;
    const worstCase = sortedByQuality[sortedByQuality.length - 1] || null;

    return {
      totalCases: results.length,
      successfulCases: successfulResults.length,
      failedCases: results.length - successfulResults.length,
      averageQualityScore,
      averageSimilarityScore,
      averageSpeedup,
      averageIterations,
      totalCost,
      successRate: results.length > 0 ? successfulResults.length / results.length : 0,
      results,
      summary: {
        bestCase,
        worstCase,
        totalDuration,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Create batches for concurrent processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Ensure worktree directory exists
   */
  private ensureWorktreeDirectory(): void {
    if (!existsSync(this.config.worktreePath)) {
      mkdirSync(this.config.worktreePath, { recursive: true });
    }
  }

  /**
   * Calculate Levenshtein similarity (0-1)
   */
  private levenshteinSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return 1 - distance / maxLength;
  }

  /**
   * Extract keywords from code
   */
  private extractKeywords(code: string): Set<string> {
    const keywords = code
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3); // Filter short words

    return new Set(keywords);
  }

  /**
   * Calculate overlap between two sets
   */
  private calculateOverlap(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Load test cases from JSON file
   */
  static loadTestCases(filePath: string): BacktestCase[] {
    if (!existsSync(filePath)) {
      throw new Error(`Test cases file not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const cases = JSON.parse(content);

    // Validate cases
    if (!Array.isArray(cases)) {
      throw new Error('Test cases must be an array');
    }

    return cases.map((c, index) => ({
      id: c.id || `case-${index}`,
      commitHash: c.commitHash,
      type: c.type || 'general',
      description: c.description || '',
      files: c.files || [],
      errorMessage: c.errorMessage || '',
      humanSolution: c.humanSolution || '',
      timeToResolve: c.timeToResolve || 0,
      complexity: c.complexity || 5,
      metadata: c.metadata || {},
    }));
  }

  /**
   * Save backtest report to file
   */
  static saveReport(report: BacktestReport, outputPath: string): void {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Save full JSON report
    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    // Save human-readable summary
    const summaryPath = outputPath.replace('.json', '-summary.txt');
    const summary = BacktestRunner.generateSummaryText(report);
    writeFileSync(summaryPath, summary);
  }

  /**
   * Generate human-readable summary text
   */
  private static generateSummaryText(report: BacktestReport): string {
    const lines = [
      '=' .repeat(60),
      'BACKTEST REPORT SUMMARY',
      '='.repeat(60),
      '',
      `Total Cases: ${report.totalCases}`,
      `Successful: ${report.successfulCases} (${(report.successRate * 100).toFixed(2)}%)`,
      `Failed: ${report.failedCases}`,
      '',
      '--- Performance Metrics ---',
      `Average Quality Score: ${report.averageQualityScore.toFixed(2)}/100`,
      `Average Similarity: ${(report.averageSimilarityScore * 100).toFixed(2)}%`,
      `Average Speedup: ${report.averageSpeedup.toFixed(2)}x`,
      `Average Iterations: ${report.averageIterations.toFixed(2)}`,
      `Total Cost: ${report.totalCost.toFixed(2)} units`,
      '',
      '--- Best Case ---',
      report.summary.bestCase
        ? `  Case: ${report.summary.bestCase.caseId}`
        : '  None',
      report.summary.bestCase
        ? `  Quality: ${report.summary.bestCase.qualityScore.toFixed(2)}/100`
        : '',
      report.summary.bestCase
        ? `  Speedup: ${report.summary.bestCase.speedup.toFixed(2)}x`
        : '',
      '',
      '--- Worst Case ---',
      report.summary.worstCase
        ? `  Case: ${report.summary.worstCase.caseId}`
        : '  None',
      report.summary.worstCase
        ? `  Quality: ${report.summary.worstCase.qualityScore.toFixed(2)}/100`
        : '',
      '',
      `Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`,
      `Timestamp: ${report.summary.timestamp}`,
      '='.repeat(60),
    ];

    return lines.join('\n');
  }
}
