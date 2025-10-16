/**
 * Type shims for modules excluded from tsconfig.server.json
 *
 * These modules exist in the codebase but are intentionally excluded from the
 * server TypeScript project (see tsconfig.server.json exclude list). This file
 * provides ambient declarations so TypeScript doesn't complain about TS6307
 * errors when these modules are imported with type-only imports.
 *
 * IMPORTANT: This approach works because:
 * 1. type-only imports don't generate runtime code
 * 2. These ambient declarations provide the minimal types needed
 * 3. The actual implementation files exist and are used at runtime via bundler
 */

// ============================================================================
// Client modules (excluded via client/src/machines, client/src/adapters)
// ============================================================================

declare module '@/machines/modeling-wizard.machine' {
  export type ModelingWizardContext = any;
  export const machine: any;
}

declare module '@/adapters/reserves-adapter' {
  export function adaptFundToReservesInput(fund: any): any;
  export function adaptReservesConfig(config: any): any;
  export function adaptReservesResult(result: any, companiesMap: any): any;
}

// ============================================================================
// Server services (explicitly excluded in tsconfig.server.json lines 63-66)
// ============================================================================

declare module '*/streaming-monte-carlo-engine' {
  export interface StreamingConfig {
    runs: number;
    batchSize?: number;
    timeHorizonYears: number;
    [key: string]: any;
  }
  export class StreamingMonteCarloEngine {
    runStreamingSimulation(config: StreamingConfig): Promise<any>;
    getStreamingStats(): any;
    getConnectionStats(): any;
  }
}

declare module '*/database-pool-manager' {
  export interface PoolConfig {
    connectionString: string;
    minConnections?: number;
    maxConnections?: number;
    [key: string]: any;
  }
  export class DatabasePoolManager {
    createPool(name: string, config: PoolConfig): Promise<void>;
    getAllMetrics(): any;
    closeAll(): Promise<void>;
  }
  export const databasePoolManager: DatabasePoolManager;
}

declare module '*/monte-carlo-simulation' {
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
// Tools directory (not in server/**/* include pattern)
// ============================================================================

declare module '*/tools/ai-review/OrchestratorAdapter' {
  export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }
}
