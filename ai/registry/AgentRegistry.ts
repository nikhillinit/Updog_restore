import type { AgentDescriptor, AgentHealth, Capability, ConstraintSet } from './types';
import { logger } from '@/lib/logger';

/**
 * AgentRegistry: Centralized agent discovery and capability-based routing
 *
 * Features:
 * - Register agents with capabilities metadata
 * - Select agents by capability with optional constraints
 * - Rank agents by cost/quality tradeoffs
 */
class Registry {
  private agents: AgentDescriptor[] = [];

  /**
   * Register an agent with its capabilities
   */
  register(agent: AgentDescriptor): void {
    // Check for duplicate registration
    const existing = this.agents.findIndex(
      a => a.id === agent.id && a.version === agent.version
    );

    if (existing >= 0) {
      logger.warn('Agent already registered, replacing', {
        id: agent.id,
        version: agent.version,
      });
      this.agents[existing] = agent;
    } else {
      this.agents.push(agent);
      logger.info('Agent registered', {
        id: agent.id,
        version: agent.version,
        capabilities: agent.capabilities,
      });
    }
  }

  /**
   * List all registered agents
   */
  list(): AgentDescriptor[] {
    return [...this.agents];
  }

  /**
   * Select agents by capability with optional filtering
   */
  selectByCapability(
    cap: Capability,
    constraints?: ConstraintSet
  ): AgentDescriptor[] {
    let candidates = this.agents.filter(a => a.capabilities.includes(cap));

    // Apply cost constraints
    if (constraints?.maxCostUsd !== undefined) {
      candidates = candidates.filter(
        a => !a.costProfile?.estUsdPer1kTokens ||
             a.costProfile.estUsdPer1kTokens <= constraints.maxCostUsd!
      );
    }

    // Apply latency constraints
    if (constraints?.maxLatencyMs !== undefined) {
      candidates = candidates.filter(
        a => !a.costProfile?.estimatedLatencyMs ||
             a.costProfile.estimatedLatencyMs <= constraints.maxLatencyMs!
      );
    }

    // Apply quality constraints
    if (constraints?.minQuality !== undefined) {
      candidates = candidates.filter(
        a => !a.qualityProfile?.successRate ||
             a.qualityProfile.successRate >= constraints.minQuality!
      );
    }

    // Sort by health score (best first), fallback to cost
    candidates.sort((a, b) => {
      const scoreA = this.calculateHealthScore(a);
      const scoreB = this.calculateHealthScore(b);

      // Primary: health score (descending)
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // Fallback: cost (ascending)
      const costA = a.costProfile?.estUsdPer1kTokens ?? Infinity;
      const costB = b.costProfile?.estUsdPer1kTokens ?? Infinity;
      return costA - costB;
    });

    logger.debug('Agent selection completed', {
      capability: cap,
      constraints,
      candidatesFound: candidates.length,
      topAgent: candidates[0]?.id,
      topAgentScore: candidates[0] ? this.calculateHealthScore(candidates[0]) : null
    });

    return candidates;
  }

  /**
   * Calculate agent health score (0-1)
   *
   * Formula: w1*success_1h + w2*success_24h - w3*latency - w4*cost
   */
  private calculateHealthScore(agent: AgentDescriptor): number {
    const WEIGHTS = {
      w1: 0.6,  // success_1h (most recent)
      w2: 0.2,  // success_24h (longer term)
      w3: 0.15, // latency penalty
      w4: 0.05  // cost penalty
    };

    // No health data: fall back to quality-based score
    if (!agent.health) {
      // Use qualityProfile if available
      if (agent.qualityProfile?.successRate) {
        return agent.qualityProfile.successRate;
      }
      // Default: assume healthy
      return 0.7;
    }

    const { success_ratio_1h, success_ratio_24h, latency_p95_ms } = agent.health;
    const costUsd = agent.costProfile?.estUsdPer1kTokens ?? 0;

    // Normalize latency to seconds for scoring
    const latencyPenalty = latency_p95_ms / 1000;

    const score =
      WEIGHTS.w1 * success_ratio_1h +
      WEIGHTS.w2 * success_ratio_24h -
      WEIGHTS.w3 * latencyPenalty -
      WEIGHTS.w4 * costUsd;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Update agent health metrics
   */
  updateHealth(id: string, version: string, health: AgentHealth): void {
    const agent = this.get(id, version);
    if (!agent) {
      logger.warn('Cannot update health for unknown agent', { id, version });
      return;
    }

    agent.health = health;

    logger.debug('Agent health updated', {
      id,
      version,
      score: this.calculateHealthScore(agent)
    });
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const total = this.agents.length;
    const withHealth = this.agents.filter(a => a.health).length;
    const avgScore = total > 0
      ? this.agents.reduce((sum, a) => sum + this.calculateHealthScore(a), 0) / total
      : 0;

    return {
      total,
      withHealth,
      withoutHealth: total - withHealth,
      avgScore: avgScore.toFixed(3)
    };
  }

  /**
   * Get agent by ID and version
   */
  get(id: string, version: string): AgentDescriptor | undefined {
    return this.agents.find(a => a.id === id && a.version === version);
  }

  /**
   * Clear all registered agents (for testing)
   */
  clear(): void {
    this.agents = [];
    logger.debug('Agent registry cleared');
  }
}

/**
 * Singleton instance for global agent registry
 */
export const AgentRegistry = new Registry();
