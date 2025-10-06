import type { AgentDescriptor, Capability, ConstraintSet } from './types';
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

    // Sort by cost (cheapest first)
    candidates.sort((a, b) => {
      const costA = a.costProfile?.estUsdPer1kTokens ?? Infinity;
      const costB = b.costProfile?.estUsdPer1kTokens ?? Infinity;
      return costA - costB;
    });

    logger.debug('Agent selection completed', {
      capability: cap,
      constraints,
      candidatesFound: candidates.length,
    });

    return candidates;
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
