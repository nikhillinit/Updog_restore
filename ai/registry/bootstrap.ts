import { AgentRegistry } from './AgentRegistry';
import { logger } from '@/lib/logger';

/**
 * Bootstrap default agents and auto-discover additional agents
 * Called on server startup
 */
export function bootstrapAgents(): void {
  logger.info('Bootstrapping AI agents...');

  // Register default scenario optimizer agent
  AgentRegistry.register({
    id: 'scenario-optimizer',
    version: '0.1.0',
    capabilities: ['scenario.optimize', 'reserve.analyze'],
    costProfile: {
      estUsdPer1kTokens: 0.4,
      estimatedLatencyMs: 2000,
    },
    qualityProfile: {
      notes: 'Primary scenario optimization agent with reserve analysis',
      successRate: 0.85,
    },
  });

  // Register LP explanation agent
  AgentRegistry.register({
    id: 'lp-explainer',
    version: '0.1.0',
    capabilities: ['explain.lp'],
    costProfile: {
      estUsdPer1kTokens: 0.3,
      estimatedLatencyMs: 1500,
    },
    qualityProfile: {
      notes: 'LP-facing Q&A and portfolio explanations',
      successRate: 0.90,
    },
  });

  // Register data quality agent
  AgentRegistry.register({
    id: 'data-validator',
    version: '0.1.0',
    capabilities: ['data.quality'],
    costProfile: {
      estUsdPer1kTokens: 0.2,
      estimatedLatencyMs: 1000,
    },
    qualityProfile: {
      notes: 'Data validation and quality checks',
      successRate: 0.95,
    },
  });

  // TODO: Auto-discover agents from auto-discovery/ if present
  // This would scan a known directory for agent manifests and register them

  const registered = AgentRegistry.list();
  logger.info('Agent bootstrap complete', {
    totalAgents: registered.length,
    agents: registered.map(a => ({ id: a.id, version: a.version, capabilities: a.capabilities })),
  });
}
