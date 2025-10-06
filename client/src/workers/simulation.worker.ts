/// <reference lib="webworker" />
/**
 * Runs the fund simulation off the main thread.
 */
import { runFundModelV2 } from '../lib/fund-calc-v2';
import type { ExtendedFundModelInputs, SimulationResult } from '@shared/schemas/extended-fund-model';
import type { SimulationInputs } from '@shared/types';

type RunMsg = { 
  type: 'run'; 
  runId: string; 
  inputs: SimulationInputs;
  seed?: number;
};

type ResultMsg = {
  type: 'result' | 'error';
  runId: string;
  result?: SimulationResult;
  error?: string;
  duration?: number;
};

self.addEventListener('message', async (evt: MessageEvent<RunMsg>) => {
  const { data } = evt;
  if (!data || data.type !== 'run') return;

  try {
    const t0 = performance.now();
    
    // Pass seed for deterministic results if provided
    const result = runFundModelV2(data.inputs as ExtendedFundModelInputs);
    
    const duration = performance.now() - t0;
    
    // For large numeric arrays, consider using transferables
    const response: ResultMsg = {
      type: 'result',
      runId: data.runId,
      result,
      duration
    };
    
    (self as any).postMessage(response);
  } catch (err: any) {
    const errorResponse: ResultMsg = {
      type: 'error',
      runId: data.runId,
      error: String(err?.message ?? err)
    };
    (self as any).postMessage(errorResponse);
  }
});

// Export for TypeScript type checking only
export type { RunMsg, ResultMsg };