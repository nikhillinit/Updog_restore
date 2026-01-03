/**
 * AI Router Pattern (Claude Cookbook)
 *
 * Intelligently routes tasks to the most appropriate AI model based on:
 * - Task type and complexity
 * - Model strengths and weaknesses
 * - Cost optimization
 *
 * Reference: https://github.com/anthropics/claude-cookbooks/tree/main/patterns/agents
 */

export type AIModel =
  | 'claude-sonnet'    // Balanced, general-purpose
  | 'claude-haiku'     // Fast, cheap, simple tasks
  | 'claude-opus'      // Powerful, complex reasoning
  | 'gemini'           // Fast, optimization-focused
  | 'gpt-4'            // Strong frontend/React knowledge
  | 'grok'             // Systems thinking, debugging
  | 'deepseek';        // Code-focused, TypeScript expertise

export type TaskType =
  | 'typescript-error'
  | 'react-component'
  | 'performance'
  | 'database-query'
  | 'test-failure'
  | 'api-design'
  | 'refactoring'
  | 'debugging'
  | 'code-review'
  | 'architecture'
  | 'general';

export interface Task {
  type: TaskType;
  complexity: number; // 1-10 scale
  description: string;
  context?: string;
  urgency?: 'low' | 'medium' | 'high';
  budget?: 'minimal' | 'moderate' | 'unlimited';
}

export interface RoutingDecision {
  model: AIModel;
  reason: string;
  confidence: number; // 0-1
  alternativeModels?: AIModel[];
  estimatedCost?: number;
  estimatedTime?: number;
}

export interface RouterConfig {
  preferFastModels?: boolean;
  costSensitive?: boolean;
  qualityThreshold?: number; // 0-1
  allowFallback?: boolean;
}

/**
 * AIRouter: Selects the optimal AI model for each task
 *
 * Usage:
 * ```typescript
 * const router = new AIRouter();
 *
 * const decision = router.route({
 *   type: 'typescript-error',
 *   complexity: 6,
 *   description: 'Type mismatch in ReserveEngine',
 *   urgency: 'high'
 * });
 *
 * console.log(`Route to: ${decision.model}`);
 * console.log(`Reason: ${decision.reason}`);
 * ```
 */
export class AIRouter {
  private config: Required<RouterConfig>;
  private routingHistory: Array<{
    task: Task;
    decision: RoutingDecision;
    timestamp: Date;
  }>;

  constructor(config: RouterConfig = {}) {
    this.config = {
      preferFastModels: config.preferFastModels ?? false,
      costSensitive: config.costSensitive ?? true,
      qualityThreshold: config.qualityThreshold ?? 0.7,
      allowFallback: config.allowFallback ?? true,
    };

    this.routingHistory = [];
  }

  /**
   * Route a task to the optimal AI model
   */
  route(task: Task): RoutingDecision {
    // Type-based routing (primary)
    const typeBasedModel = this.routeByType(task);

    // Complexity-based routing (secondary)
    const complexityAdjustedModel = this.adjustForComplexity(typeBasedModel, task.complexity);

    // Budget/urgency adjustments (tertiary)
    const finalModel = this.adjustForConstraints(complexityAdjustedModel, task);

    // Build decision
    const decision: RoutingDecision = {
      model: finalModel,
      reason: this.buildReason(task, finalModel),
      confidence: this.calculateConfidence(task, finalModel),
      alternativeModels: this.getAlternatives(finalModel, task),
      estimatedCost: this.estimateCost(finalModel, task),
      estimatedTime: this.estimateTime(finalModel, task)
    };

    // Track routing decision
    this.routingHistory.push({
      task,
      decision,
      timestamp: new Date()
    });

    return decision;
  }

  /**
   * Route based on task type
   */
  private routeByType(task: Task): AIModel {
    const typeRouting: Record<TaskType, AIModel> = {
      'typescript-error': 'deepseek',      // Code-focused AI
      'react-component': 'gpt-4',          // Strong frontend knowledge
      'performance': 'gemini',             // Optimization expertise
      'database-query': 'claude-sonnet',   // Balanced SQL knowledge
      'test-failure': 'deepseek',          // Code debugging
      'api-design': 'claude-opus',         // Architecture thinking
      'refactoring': 'claude-sonnet',      // Balanced refactoring
      'debugging': 'grok',                 // Systems debugging
      'code-review': 'claude-opus',        // Comprehensive analysis
      'architecture': 'claude-opus',       // High-level design
      'general': 'claude-sonnet'           // Default balanced
    };

    return typeRouting[task.type] || 'claude-sonnet';
  }

  /**
   * Adjust routing based on complexity
   */
  private adjustForComplexity(baseModel: AIModel, complexity: number): AIModel {
    // Very simple (1-3) → Prefer fast models
    if (complexity <= 3 && this.config.preferFastModels) {
      if (baseModel === 'claude-opus') return 'claude-sonnet';
      if (baseModel === 'claude-sonnet') return 'claude-haiku';
      if (baseModel === 'gpt-4') return 'gemini';
    }

    // Very complex (8-10) → Prefer powerful models
    if (complexity >= 8) {
      if (baseModel === 'claude-haiku') return 'claude-sonnet';
      if (baseModel === 'claude-sonnet') return 'claude-opus';
      if (baseModel === 'gemini') return 'gpt-4';
    }

    return baseModel;
  }

  /**
   * Adjust for budget/urgency constraints
   */
  private adjustForConstraints(model: AIModel, task: Task): AIModel {
    // Cost-sensitive routing
    if (this.config.costSensitive && task.budget === 'minimal') {
      const costTier: Record<AIModel, number> = {
        'claude-haiku': 1,
        'gemini': 1,
        'claude-sonnet': 2,
        'deepseek': 2,
        'grok': 2,
        'gpt-4': 3,
        'claude-opus': 3
      };

      if (costTier[model] >= 3) {
        return 'claude-sonnet'; // Fallback to balanced model
      }
    }

    // Urgency routing
    if (task.urgency === 'high') {
      // Prefer fast models
      if (model === 'claude-opus') return 'claude-sonnet';
      if (model === 'gpt-4') return 'gemini';
    }

    return model;
  }

  /**
   * Build human-readable reason for routing decision
   */
  private buildReason(task: Task, model: AIModel): string {
    const reasons: Record<AIModel, string> = {
      'claude-sonnet': 'Balanced model for general-purpose tasks',
      'claude-haiku': 'Fast, cost-effective for simple tasks',
      'claude-opus': 'Most capable model for complex reasoning',
      'gemini': 'Optimized for performance and speed',
      'gpt-4': 'Strong expertise in frontend and React',
      'grok': 'Excellent systems thinking and debugging',
      'deepseek': 'Specialized in code analysis and TypeScript'
    };

    let reason = reasons[model];

    // Add task-specific context
    if (task.complexity >= 8) {
      reason += ' (complexity: high)';
    }
    if (task.urgency === 'high') {
      reason += ' (urgent)';
    }
    if (task.budget === 'minimal') {
      reason += ' (cost-optimized)';
    }

    return reason;
  }

  /**
   * Calculate confidence in routing decision (0-1)
   */
  private calculateConfidence(task: Task, model: AIModel): number {
    let confidence = 0.8; // Base confidence

    // Increase confidence for clear type matches
    const strongMatches: Partial<Record<TaskType, AIModel>> = {
      'typescript-error': 'deepseek',
      'react-component': 'gpt-4',
      'performance': 'gemini'
    };

    if (strongMatches[task.type] === model) {
      confidence = 0.95;
    }

    // Decrease confidence for constraint-based overrides
    if (task.budget === 'minimal' && ['claude-opus', 'gpt-4'].includes(model)) {
      confidence *= 0.8;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get alternative models for fallback
   */
  private getAlternatives(primaryModel: AIModel, _task: Task): AIModel[] {
    const alternatives: Record<AIModel, AIModel[]> = {
      'claude-sonnet': ['claude-opus', 'gemini'],
      'claude-haiku': ['claude-sonnet', 'gemini'],
      'claude-opus': ['claude-sonnet', 'gpt-4'],
      'gemini': ['claude-haiku', 'claude-sonnet'],
      'gpt-4': ['claude-opus', 'claude-sonnet'],
      'grok': ['claude-sonnet', 'deepseek'],
      'deepseek': ['grok', 'claude-sonnet']
    };

    return alternatives[primaryModel] || ['claude-sonnet'];
  }

  /**
   * Estimate cost for task (relative scale 1-10)
   */
  private estimateCost(model: AIModel, task: Task): number {
    const baseCost: Record<AIModel, number> = {
      'claude-haiku': 1,
      'gemini': 1,
      'claude-sonnet': 3,
      'deepseek': 2,
      'grok': 3,
      'gpt-4': 5,
      'claude-opus': 8
    };

    const complexityMultiplier = 1 + (task.complexity / 10);
    return Math.round(baseCost[model] * complexityMultiplier);
  }

  /**
   * Estimate time for task (in seconds)
   */
  private estimateTime(model: AIModel, task: Task): number {
    const baseTime: Record<AIModel, number> = {
      'claude-haiku': 2,
      'gemini': 2,
      'claude-sonnet': 5,
      'deepseek': 4,
      'grok': 5,
      'gpt-4': 8,
      'claude-opus': 12
    };

    const complexityMultiplier = 1 + (task.complexity / 5);
    return Math.round(baseTime[model] * complexityMultiplier);
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalRoutes: number;
    modelDistribution: Record<AIModel, number>;
    averageConfidence: number;
    totalEstimatedCost: number;
  } {
    const modelDistribution: Record<AIModel, number> = {
      'claude-sonnet': 0,
      'claude-haiku': 0,
      'claude-opus': 0,
      'gemini': 0,
      'gpt-4': 0,
      'grok': 0,
      'deepseek': 0
    };

    let totalConfidence = 0;
    let totalCost = 0;

    this.routingHistory.forEach(entry => {
      modelDistribution[entry.decision.model]++;
      totalConfidence += entry.decision.confidence;
      totalCost += entry.decision.estimatedCost || 0;
    });

    return {
      totalRoutes: this.routingHistory.length,
      modelDistribution,
      averageConfidence: this.routingHistory.length > 0
        ? totalConfidence / this.routingHistory.length
        : 0,
      totalEstimatedCost: totalCost
    };
  }

  /**
   * Clear routing history
   */
  clearHistory(): void {
    this.routingHistory = [];
  }
}

/**
 * Helper function to create task objects
 */
export function createTask(
  type: TaskType,
  description: string,
  options?: Partial<Task>
): Task {
  return {
    type,
    description,
    complexity: options?.complexity ?? 5,
    context: options?.context,
    urgency: options?.urgency ?? 'medium',
    budget: options?.budget ?? 'moderate'
  };
}
