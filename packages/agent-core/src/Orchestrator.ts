/**
 * Orchestrator-Workers Pattern (Claude Cookbook)
 *
 * Central orchestrator coordinates specialized worker agents to solve complex tasks.
 * Dynamically breaks down tasks into subtasks and delegates to appropriate workers.
 *
 * Reference: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/orchestrator_workers.ipynb
 */

import type { AIModel} from './Router';
import { AIRouter, createTask } from './Router';
import { Logger } from './Logger';

export interface Subtask {
  id: string;
  description: string;
  assignedWorker: AIModel;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
  dependencies?: string[]; // IDs of subtasks that must complete first
}

export interface WorkerResult {
  subtaskId: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export interface OrchestratorConfig {
  maxParallelWorkers?: number;
  enableDynamicDecomposition?: boolean;
  useRouter?: boolean;
  retryFailedSubtasks?: boolean;
  maxRetries?: number;
}

export type WorkerFunction = (subtask: Subtask) => Promise<WorkerResult>;

/**
 * Orchestrator: Coordinates worker agents to solve complex tasks
 *
 * Usage:
 * ```typescript
 * const orchestrator = new Orchestrator({
 *   maxParallelWorkers: 3,
 *   enableDynamicDecomposition: true
 * });
 *
 * const result = await orchestrator.execute({
 *   taskDescription: 'Fix all failing tests in the repository',
 *   context: { projectRoot: '/path/to/project' },
 *   workerFunction: async (subtask) => {
 *     // Call appropriate AI based on subtask.assignedWorker
 *     return await callAI(subtask.assignedWorker, subtask.description);
 *   }
 * });
 * ```
 */
export class Orchestrator {
  private config: Required<OrchestratorConfig>;
  private router: AIRouter;
  private logger: Logger;
  private subtasks: Map<string, Subtask>;
  private executionHistory: Array<{
    taskDescription: string;
    subtasks: Subtask[];
    totalDuration: number;
    timestamp: Date;
  }>;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      maxParallelWorkers: config.maxParallelWorkers ?? 3,
      enableDynamicDecomposition: config.enableDynamicDecomposition ?? true,
      useRouter: config.useRouter ?? true,
      retryFailedSubtasks: config.retryFailedSubtasks ?? true,
      maxRetries: config.maxRetries ?? 2
    };

    this.router = new AIRouter();
    this.logger = new Logger({ level: 'info', agent: 'orchestrator' });
    this.subtasks = new Map();
    this.executionHistory = [];
  }

  /**
   * Execute a complex task by orchestrating workers
   */
  async execute(options: {
    taskDescription: string;
    context?: Record<string, any>;
    workerFunction: WorkerFunction;
    predefinedSubtasks?: Omit<Subtask, 'id' | 'status'>[];
  }): Promise<{
    success: boolean;
    subtasks: Subtask[];
    results: WorkerResult[];
    totalDuration: number;
  }> {
    const startTime = Date.now();
    this.logger.info('Orchestrator starting task', { task: options.taskDescription });

    // Step 1: Decompose task into subtasks
    const subtasks = options.predefinedSubtasks
      ? this.createSubtasks(options.predefinedSubtasks)
      : await this.decomposeTask(options.taskDescription, options.context);

    this.logger.info(`Task decomposed into ${subtasks.length} subtasks`, {
      subtasks: subtasks.map(s => ({ id: s.id, description: s.description }))
    });

    // Step 2: Assign workers to subtasks
    subtasks.forEach(subtask => {
      if (this.config.useRouter) {
        const task = createTask('general', subtask.description, {
          context: JSON.stringify(options.context)
        });
        const decision = this.router.route(task);
        subtask.assignedWorker = decision.model;
        this.logger.debug(`Assigned ${decision.model} to subtask ${subtask.id}`, {
          reason: decision.reason
        });
      }
      this.subtasks.set(subtask.id, subtask);
    });

    // Step 3: Execute subtasks (respecting dependencies)
    const results = await this.executeSubtasks(subtasks, options.workerFunction);

    // Step 4: Aggregate results
    const totalDuration = Date.now() - startTime;
    const success = results.every(r => r.success);

    // Track execution
    this.executionHistory.push({
      taskDescription: options.taskDescription,
      subtasks: Array.from(this.subtasks.values()),
      totalDuration,
      timestamp: new Date()
    });

    this.logger.info('Orchestrator completed task', {
      success,
      totalDuration,
      successfulSubtasks: results.filter(r => r.success).length,
      failedSubtasks: results.filter(r => !r.success).length
    });

    return {
      success,
      subtasks: Array.from(this.subtasks.values()),
      results,
      totalDuration
    };
  }

  /**
   * Decompose task into subtasks (can be overridden)
   */
  private async decomposeTask(
    taskDescription: string,
    context?: Record<string, any>
  ): Promise<Subtask[]> {
    // Simple heuristic-based decomposition
    // In production, this would call an AI to dynamically decompose

    const subtaskTemplates = this.generateSubtaskTemplates(taskDescription);

    return this.createSubtasks(subtaskTemplates);
  }

  /**
   * Generate subtask templates based on task description
   */
  private generateSubtaskTemplates(taskDescription: string): Omit<Subtask, 'id' | 'status'>[] {
    const lowerDesc = taskDescription.toLowerCase();

    // Pattern matching for common task types
    if (lowerDesc.includes('test') && lowerDesc.includes('fail')) {
      return [
        { description: 'Analyze test failures and categorize by type', assignedWorker: 'deepseek' },
        { description: 'Generate repairs for syntax errors', assignedWorker: 'deepseek', dependencies: ['0'] },
        { description: 'Generate repairs for runtime errors', assignedWorker: 'grok', dependencies: ['0'] },
        { description: 'Generate repairs for assertion errors', assignedWorker: 'claude-sonnet', dependencies: ['0'] },
        { description: 'Validate and apply all repairs', assignedWorker: 'claude-opus', dependencies: ['1', '2', '3'] }
      ];
    }

    if (lowerDesc.includes('refactor') || lowerDesc.includes('improve')) {
      return [
        { description: 'Analyze current code structure', assignedWorker: 'claude-sonnet' },
        { description: 'Identify refactoring opportunities', assignedWorker: 'gpt-4', dependencies: ['0'] },
        { description: 'Apply refactoring changes', assignedWorker: 'deepseek', dependencies: ['1'] },
        { description: 'Run tests and validate changes', assignedWorker: 'gemini', dependencies: ['2'] }
      ];
    }

    if (lowerDesc.includes('performance') || lowerDesc.includes('optimize')) {
      return [
        { description: 'Profile current performance', assignedWorker: 'gemini' },
        { description: 'Identify bottlenecks', assignedWorker: 'grok', dependencies: ['0'] },
        { description: 'Implement optimizations', assignedWorker: 'deepseek', dependencies: ['1'] },
        { description: 'Benchmark improvements', assignedWorker: 'gemini', dependencies: ['2'] }
      ];
    }

    // Default: Single subtask
    return [
      { description: taskDescription, assignedWorker: 'claude-sonnet' }
    ];
  }

  /**
   * Create subtasks with unique IDs
   */
  private createSubtasks(templates: Omit<Subtask, 'id' | 'status'>[]): Subtask[] {
    return templates.map((template, index) => ({
      id: String(index),
      status: 'pending' as const,
      ...template
    }));
  }

  /**
   * Execute subtasks respecting dependencies
   */
  private async executeSubtasks(
    subtasks: Subtask[],
    workerFunction: WorkerFunction
  ): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    const completed = new Set<string>();

    // Build dependency graph
    const canExecute = (subtask: Subtask): boolean => {
      if (!subtask.dependencies || subtask.dependencies.length === 0) {
        return true;
      }
      return subtask.dependencies.every(depId => completed.has(depId));
    };

    // Execute in waves (respecting dependencies and parallelism)
    while (completed.size < subtasks.length) {
      const ready = subtasks.filter(
        s => s.status === 'pending' && canExecute(s)
      );

      if (ready.length === 0) {
        this.logger.error('Circular dependency or blocked subtasks detected');
        break;
      }

      // Execute batch in parallel (up to maxParallelWorkers)
      const batch = ready.slice(0, this.config.maxParallelWorkers);

      this.logger.debug(`Executing batch of ${batch.length} subtasks`, {
        subtasks: batch.map(s => s.id)
      });

      const batchResults = await Promise.all(
        batch.map(async (subtask) => {
          subtask.status = 'in_progress';
          this.subtasks.set(subtask.id, subtask);

          try {
            const result = await this.executeWithRetry(subtask, workerFunction);

            if (result.success) {
              subtask.status = 'completed';
              subtask.result = result.data;
              completed.add(subtask.id);
            } else {
              subtask.status = 'failed';
              subtask.error = result.error;
            }

            this.subtasks.set(subtask.id, subtask);
            return result;
          } catch (error) {
            subtask.status = 'failed';
            subtask.error = String(error);
            this.subtasks.set(subtask.id, subtask);

            return {
              subtaskId: subtask.id,
              success: false,
              error: String(error),
              duration: 0
            };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute subtask with retry logic
   */
  private async executeWithRetry(
    subtask: Subtask,
    workerFunction: WorkerFunction
  ): Promise<WorkerResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing subtask ${subtask.id} (attempt ${attempt + 1})`, {
          worker: subtask.assignedWorker
        });

        const result = await workerFunction(subtask);

        if (result.success) {
          return result;
        }

        lastError = result.error;
        this.logger.warn(`Subtask ${subtask.id} failed, retrying...`, { error: result.error });

      } catch (error) {
        lastError = String(error);
        this.logger.warn(`Subtask ${subtask.id} threw error, retrying...`, { error });
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.config.maxRetries) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    return {
      subtaskId: subtask.id,
      success: false,
      error: lastError || 'Unknown error',
      duration: 0
    };
  }

  /**
   * Get orchestration statistics
   */
  getStats(): {
    totalExecutions: number;
    averageSubtasksPerExecution: number;
    averageDuration: number;
    successRate: number;
  } {
    const totalExecutions = this.executionHistory.length;

    if (totalExecutions === 0) {
      return {
        totalExecutions: 0,
        averageSubtasksPerExecution: 0,
        averageDuration: 0,
        successRate: 0
      };
    }

    const totalSubtasks = this.executionHistory.reduce((sum, exec) => sum + exec.subtasks.length, 0);
    const totalDuration = this.executionHistory.reduce((sum, exec) => sum + exec.totalDuration, 0);
    const successfulSubtasks = this.executionHistory.reduce(
      (sum, exec) => sum + exec.subtasks.filter(s => s.status === 'completed').length,
      0
    );

    return {
      totalExecutions,
      averageSubtasksPerExecution: totalSubtasks / totalExecutions,
      averageDuration: totalDuration / totalExecutions,
      successRate: totalSubtasks > 0 ? successfulSubtasks / totalSubtasks : 0
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
