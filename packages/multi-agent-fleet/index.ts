/**
 * BMAD Multi-Agent Fleet & Intelligent Routing
 * Coordinates specialized repair agents for different failure types
 */

import { TestRepairAgent } from '@povc/test-repair-agent';
import type { BaseAgent } from '@povc/agent-core';

export interface TestFailure {
  file: string;
  test: string;
  error: string;
  stack: string;
  type?: string;
  confidence?: number;
}

export interface RepairPlan {
  syntax: TestFailure[];
  assertion: TestFailure[];
  integration: TestFailure[];
  e2e: TestFailure[];
  manual: TestFailure[];
}

/**
 * Specialized agent configurations
 */
export const agentConfigs = {
  syntax: {
    specialty: 'syntax',
    maxConcurrency: 3,
    patterns: [
      /SyntaxError/,
      /Unexpected token/,
      /Missing semicolon/,
      /Unterminated/,
    ],
  },
  assertion: {
    specialty: 'assertion',
    maxConcurrency: 2,
    patterns: [
      /Expected .* to be/,
      /toBe|toEqual|toMatch/,
      /AssertionError/,
      /received.*expected/,
    ],
  },
  integration: {
    specialty: 'integration',
    maxConcurrency: 1,
    patterns: [
      /database|Database/,
      /redis|Redis/,
      /connection|Connection/,
      /timeout.*query/i,
    ],
  },
  e2e: {
    specialty: 'e2e',
    maxConcurrency: 2,
    patterns: [
      /\.e2e\.|\.spec\./,
      /playwright|Playwright/,
      /selector|locator/,
      /Element not found/,
    ],
  },
};

/**
 * Failure classifier using pattern matching and confidence scoring
 */
export class FailureClassifier {
  classify(failures: TestFailure[]): TestFailure[] {
    return failures.map(failure => {
      let type = 'unknown';
      let confidence = 0;
      
      // Check each agent's patterns
      for (const [agentType, config] of Object.entries(agentConfigs)) {
        const matchCount = config.patterns.filter(pattern => 
          pattern.test(failure.error) || pattern.test(failure.stack)
        ).length;
        
        const currentConfidence = matchCount / config.patterns.length;
        
        if (currentConfidence > confidence) {
          type = agentType;
          confidence = currentConfidence;
        }
      }
      
      // File-based classification overrides
      if (failure.file.includes('.e2e.')) {
        type = 'e2e';
        confidence = 0.9;
      } else if (failure.file.includes('integration')) {
        type = 'integration';
        confidence = 0.8;
      }
      
      return { ...failure, type, confidence };
    });
  }
}

/**
 * Intelligent repair router
 * Routes failures to appropriate specialized agents
 */
export class RepairRouter {
  private classifier = new FailureClassifier();
  
  async route(failures: TestFailure[]): Promise<RepairPlan> {
    const classified = this.classifier.classify(failures);
    
    return {
      syntax: classified.filter(f => 
        f.type === 'syntax' && (f.confidence ?? 0) > 0.7
      ),
      assertion: classified.filter(f => 
        f.type === 'assertion' && (f.confidence ?? 0) > 0.6
      ),
      integration: classified.filter(f => 
        f.type === 'integration' || 
        (/database|redis/i.test(f.stack) && (f.confidence ?? 0) > 0.5)
      ),
      e2e: classified.filter(f => 
        f.type === 'e2e' || 
        /\.e2e\./.test(f.file)
      ),
      manual: classified.filter(f => 
        f.type === 'unknown' || (f.confidence ?? 0) < 0.5
      ),
    };
  }
}

/**
 * Multi-agent fleet coordinator
 * Manages parallel execution of specialized repair agents
 */
export class MultiAgentFleet {
  private agents: Map<string, BaseAgent<unknown, unknown>> = new Map();
  private router = new RepairRouter();
  
  constructor() {
    this.initializeAgents();
  }
  
  private initializeAgents() {
    // Create specialized agents
    for (const [type, config] of Object.entries(agentConfigs)) {
      this.agents.set(type, new TestRepairAgent({
        name: `repair-agent-${type}`,
        maxRetries: 2,
        timeout: 60000,
        ...config,
      }));
    }
  }
  
  /**
   * Execute repairs using the multi-agent fleet
   */
  async executeRepairs(failures: TestFailure[]): Promise<{
    successful: number;
    failed: number;
    manual: number;
    repairs: unknown[];
  }> {
    // Route failures to appropriate agents
    const plan = await this.router.route(failures);
    
    // Execute repairs in parallel
    const repairPromises: Promise<{ type: string; result?: unknown; error?: unknown }>[] = [];

    for (const [type, agentFailures] of Object.entries(plan)) {
      if (type === 'manual' || agentFailures.length === 0) continue;

      const agent = this.agents.get(type);
      if (agent) {
        repairPromises.push(
          agent.execute({ failures: agentFailures })
            .then(result => ({ type, result }))
            .catch(error => ({ type, error }))
        );
      }
    }

    // Wait for all repairs to complete
    const results = await Promise.allSettled(repairPromises);

    // Aggregate results
    let successful = 0;
    let failed = 0;
    const repairs: unknown[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { type, result: agentResult, error } = result.value;
        
        if (error) {
          failed += plan[type as keyof RepairPlan]?.length || 0;
          console.error(`Agent ${type} failed:`, error);
        } else if (agentResult?.success) {
          successful += agentResult.data?.repairs?.length || 0;
          repairs.push(...(agentResult.data?.repairs || []));
        } else {
          failed += plan[type as keyof RepairPlan]?.length || 0;
        }
      } else {
        failed++;
        console.error('Repair promise rejected:', result.reason);
      }
    }
    
    return {
      successful,
      failed,
      manual: plan.manual.length,
      repairs,
    };
  }
  
  /**
   * Get agent statistics
   */
  getStats() {
    const stats: Record<string, { name: string }> = {};

    for (const [type, agent] of this.agents) {
      stats[type] = {
        name: agent.name,
        // Add more stats as needed
      };
    }

    return stats;
  }
}

// Export singleton instance
export const fleet = new MultiAgentFleet();