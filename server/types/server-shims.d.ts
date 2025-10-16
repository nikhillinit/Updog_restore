/**
 * Shims for server modules that are excluded from tsconfig.server.json
 *
 * These files exist in the codebase but are intentionally excluded from the
 * server TypeScript project to reduce compilation complexity. This ambient
 * declaration file provides type-safe access to their exports.
 *
 * Excluded files (per tsconfig.server.json lines 63-66):
 * - server/services/streaming-monte-carlo-engine.ts
 * - server/services/monte-carlo-simulation.ts
 * - server/services/database-pool-manager.ts
 * - server/examples/streaming-monte-carlo-examples.ts
 *
 * Also covers:
 * - tools/ai-review (not in include pattern)
 */

// ============================================================================
// Streaming Monte Carlo Engine (excluded from tsconfig)
// ============================================================================

declare module '*streaming-monte-carlo-engine' {
  export interface StreamingConfig {
    runs: number;
    batchSize?: number;
    timeHorizonYears: number;
    fundId?: number;
    randomSeed?: number;
    [key: string]: any;
  }

  export class StreamingMonteCarloEngine {
    constructor();
    runStreamingSimulation(config: StreamingConfig): Promise<any>;
    getStreamingStats(): any;
    getConnectionStats(): any;
  }
}

// ============================================================================
// Database Pool Manager (excluded from tsconfig)
// ============================================================================

declare module '*database-pool-manager' {
  export interface PoolConfig {
    connectionString: string;
    minConnections?: number;
    maxConnections?: number;
    idleTimeoutMs?: number;
    connectionTimeoutMs?: number;
    enableMetrics?: boolean;
  }

  export class DatabasePoolManager {
    createPool(name: string, config: PoolConfig): Promise<void>;
    getAllMetrics(): any;
    closeAll(): Promise<void>;
  }

  export const databasePoolManager: DatabasePoolManager;
}

// ============================================================================
// Monte Carlo Simulation Service (excluded from tsconfig)
// ============================================================================

declare module '*monte-carlo-simulation' {
  export interface SimulationParameters {
    fundId: number;
    scenarios: number;
    timeHorizonYears: number;
    confidenceIntervals: number[];
    baselineId?: string;
  }

  export interface MonteCarloForecast {
    forecastId: string;
    fundId: number;
    scenarios: number;
    timeHorizonYears: number;
    multiple: {
      mean: number;
      median: number;
      p5: number;
      p95: number;
    };
    [key: string]: any;
  }

  export interface MonteCarloSimulationService {
    generateForecast(params: SimulationParameters): Promise<MonteCarloForecast>;
  }

  export const monteCarloSimulationService: MonteCarloSimulationService;
}

// ============================================================================
// AI Review Orchestrator (tools/ai-review - not in include pattern)
// ============================================================================

declare module '*OrchestratorAdapter' {
  export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }

  export interface OrchestratorAdapter {
    call(providerId: string, messages: ChatMessage[], opts?: any): Promise<{
      text: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        costUsd?: number;
      };
      elapsed?: number;
    }>;
  }
}

declare module '*MultiAIReviewAgent' {
  const x: any;
  export = x;
}

declare module '*SynthesisAgent' {
  const x: any;
  export = x;
}

declare module '*/ai-review/types' {
  const x: any;
  export = x;
}

declare module '*/execute-multi-ai-review' {
  const x: any;
  export = x;
}
