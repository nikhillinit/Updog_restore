/**
 * Agent Router - Intelligent orchestration of 30+ specialized agents
 *
 * This router analyzes user queries and determines which agent(s) to use,
 * leveraging existing memory (CLAUDE.md, changelogs) and evaluator capabilities.
 */

import { z } from 'zod';

// Agent capability registry
const AgentCapabilities = {
  // Financial Analysis
  'waterfall-specialist': {
    domain: 'financial',
    capabilities: ['carry distribution', 'waterfall', 'hurdle rates'],
    confidence: 0.95,
  },

  // Testing & Evaluation
  'test-automator': {
    domain: 'testing',
    capabilities: ['test generation', 'TDD', 'coverage analysis'],
    confidence: 0.9,
  },
  'pr-test-analyzer': {
    domain: 'testing',
    capabilities: ['PR review', 'test coverage', 'edge cases'],
    confidence: 0.85,
  },
  'code-reviewer': {
    domain: 'quality',
    capabilities: ['code review', 'style', 'best practices'],
    confidence: 0.88,
  },

  // Architecture & Design
  'architect-review': {
    domain: 'architecture',
    capabilities: ['system design', 'module boundaries', 'data flow'],
    confidence: 0.92,
  },
  'database-expert': {
    domain: 'database',
    capabilities: ['schema design', 'query optimization', 'migrations'],
    confidence: 0.89,
  },

  // Development Support
  'debug-expert': {
    domain: 'debugging',
    capabilities: ['error analysis', 'root cause', 'troubleshooting'],
    confidence: 0.87,
  },
  'legacy-modernizer': {
    domain: 'refactoring',
    capabilities: ['technical debt', 'migration', 'modernization'],
    confidence: 0.86,
  },

  // Knowledge Management
  'knowledge-synthesizer': {
    domain: 'knowledge',
    capabilities: ['pattern extraction', 'insights', 'learning'],
    confidence: 0.83,
  },
  'context-orchestrator': {
    domain: 'context',
    capabilities: ['multi-agent coordination', 'memory', 'workflow'],
    confidence: 0.91,
  },
};

// Query analysis schema
const QueryAnalysisSchema = z.object({
  intent: z.enum(['analyze', 'build', 'test', 'debug', 'review', 'optimize']),
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  suggestedAgents: z.array(z.string()),
  requiresMemory: z.boolean(),
  requiresEvaluation: z.boolean(),
});

type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;

export class AgentRouter {
  private memoryPath = './CLAUDE.md';
  private changelogPath = './CHANGELOG.md';
  private decisionsPath = './DECISIONS.md';

  /**
   * Analyze a query to determine intent and required agents
   */
  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const queryLower = query.toLowerCase();

    // Simple keyword-based analysis (in production, use LLM)
    let intent: QueryAnalysis['intent'] = 'analyze';
    let domain = 'general';
    let suggestedAgents: string[] = [];
    let requiresMemory = false;
    let requiresEvaluation = false;

    // Intent detection
    if (queryLower.includes('test') || queryLower.includes('coverage')) {
      intent = 'test';
      domain = 'testing';
      suggestedAgents.push('test-automator', 'pr-test-analyzer');
      requiresEvaluation = true;
    } else if (queryLower.includes('debug') || queryLower.includes('error')) {
      intent = 'debug';
      domain = 'debugging';
      suggestedAgents.push('debug-expert');
    } else if (queryLower.includes('review') || queryLower.includes('quality')) {
      intent = 'review';
      domain = 'quality';
      suggestedAgents.push('code-reviewer', 'architect-review');
      requiresEvaluation = true;
    } else if (queryLower.includes('waterfall') || queryLower.includes('carry')) {
      intent = 'analyze';
      domain = 'financial';
      suggestedAgents.push('waterfall-specialist');
      requiresMemory = true; // Check previous waterfall decisions
    } else if (queryLower.includes('refactor') || queryLower.includes('modernize')) {
      intent = 'optimize';
      domain = 'refactoring';
      suggestedAgents.push('legacy-modernizer');
      requiresMemory = true; // Check architecture decisions
    } else if (queryLower.includes('database') || queryLower.includes('schema')) {
      intent = 'build';
      domain = 'database';
      suggestedAgents.push('database-expert');
      requiresMemory = true; // Check schema decisions
    }

    // Check if we need historical context
    if (
      queryLower.includes('previous') ||
      queryLower.includes('history') ||
      queryLower.includes('before') ||
      queryLower.includes('last time')
    ) {
      requiresMemory = true;
    }

    // Multi-agent scenarios
    if (queryLower.includes('and then') || queryLower.includes('after that')) {
      suggestedAgents.push('context-orchestrator');
    }

    return {
      intent,
      domain,
      confidence: this.calculateConfidence(suggestedAgents),
      suggestedAgents,
      requiresMemory,
      requiresEvaluation,
    };
  }

  /**
   * Route a query to appropriate agent(s) with context
   */
  async route(query: string): Promise<{
    agents: string[];
    context: any;
    workflow: 'sequential' | 'parallel' | 'evaluator-optimizer';
  }> {
    const analysis = await this.analyzeQuery(query);

    // Load memory if needed
    let context: any = {};
    if (analysis.requiresMemory) {
      context = await this.loadRelevantMemory(analysis.domain);
    }

    // Determine workflow pattern
    let workflow: 'sequential' | 'parallel' | 'evaluator-optimizer' = 'sequential';

    if (analysis.requiresEvaluation) {
      // Use evaluator-optimizer loop for iterative refinement
      workflow = 'evaluator-optimizer';
    } else if (
      analysis.suggestedAgents.length > 1 &&
      !analysis.suggestedAgents.includes('context-orchestrator')
    ) {
      // Run independent agents in parallel
      workflow = 'parallel';
    }

    return {
      agents: analysis.suggestedAgents,
      context,
      workflow,
    };
  }

  /**
   * Load relevant memory from project documentation
   */
  private async loadRelevantMemory(domain: string): Promise<any> {
    const memory: any = {
      architecture: null,
      recentChanges: null,
      decisions: null,
    };

    // In a real implementation, we would:
    // 1. Read CLAUDE.md for architecture context
    // 2. Read CHANGELOG.md for recent changes in the domain
    // 3. Read DECISIONS.md for relevant architectural decisions
    // 4. Use vector search to find relevant documentation

    console.log(`Loading memory for domain: ${domain}`);

    return memory;
  }

  /**
   * Calculate confidence score for agent selection
   */
  private calculateConfidence(agents: string[]): number {
    if (agents.length === 0) return 0.5;

    const scores = agents
      .map((agent) => AgentCapabilities[agent]?.confidence || 0.5)
      .filter((score) => score > 0);

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Execute an evaluator-optimizer loop
   */
  async executeEvaluatorOptimizerLoop(
    query: string,
    proposerAgent: string,
    evaluatorAgent: string,
    maxIterations: number = 3
  ): Promise<any> {
    let currentProposal = null;
    let feedback = null;

    for (let i = 0; i < maxIterations; i++) {
      console.log(`Iteration ${i + 1}/${maxIterations}`);

      // Step 1: Generate proposal
      currentProposal = await this.callAgent(proposerAgent, {
        query,
        previousFeedback: feedback,
        iteration: i,
      });

      // Step 2: Evaluate proposal
      const evaluation = await this.callAgent(evaluatorAgent, {
        proposal: currentProposal,
        criteria: this.getEvaluationCriteria(query),
      });

      // Step 3: Check if we should continue
      if (evaluation.score > 0.85) {
        console.log('Satisfactory proposal reached');
        break;
      }

      feedback = evaluation.feedback;
    }

    return currentProposal;
  }

  /**
   * Get evaluation criteria based on query type
   */
  private getEvaluationCriteria(query: string): any {
    // In production, this would be more sophisticated
    return {
      accuracy: 1.0,
      completeness: 0.9,
      performance: 0.8,
      maintainability: 0.85,
      security: 0.9,
    };
  }

  /**
   * Mock agent caller (in production, use Task tool)
   */
  private async callAgent(agent: string, params: any): Promise<any> {
    console.log(`Calling agent: ${agent} with params:`, params);

    // In production, this would use the Task tool to launch agents
    // For now, return mock response
    return {
      result: `Result from ${agent}`,
      score: Math.random(),
      feedback: 'Sample feedback',
    };
  }
}

// Example usage with extended thinking
export async function routeWithExtendedThinking(query: string): Promise<string> {
  const router = new AgentRouter();

  // Show thinking process
  const thinking = [];
  thinking.push('🤔 Analyzing query intent...');

  const analysis = await router.analyzeQuery(query);
  thinking.push(`📊 Intent: ${analysis.intent}, Domain: ${analysis.domain}`);
  thinking.push(`🎯 Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);

  if (analysis.requiresMemory) {
    thinking.push('📚 Loading relevant memory from documentation...');
  }

  const routing = await router.route(query);
  thinking.push(`🤖 Selected agents: ${routing.agents.join(', ')}`);
  thinking.push(`⚙️ Workflow pattern: ${routing.workflow}`);

  // Format with thinking tags
  return `
<thinking>
${thinking.join('\n')}
</thinking>

<execution>
Agents: ${routing.agents.join(', ')}
Workflow: ${routing.workflow}
Context loaded: ${analysis.requiresMemory ? 'Yes' : 'No'}
</execution>
`;
}
