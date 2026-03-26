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

type WorkerScope = Pick<DedicatedWorkerGlobalScope, 'addEventListener' | 'postMessage'>;

const workerScope = self as unknown as WorkerScope;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

workerScope.addEventListener('message', async (evt: MessageEvent<RunMsg>) => {
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
    
    workerScope.postMessage(response);
  } catch (err: unknown) {
    const errorResponse: ResultMsg = {
      type: 'error',
      runId: data.runId,
      error: getErrorMessage(err)
    };
    workerScope.postMessage(errorResponse);
  }
});

// Export for TypeScript type checking only
export type { RunMsg, ResultMsg };
