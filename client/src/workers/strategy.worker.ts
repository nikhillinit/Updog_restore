/// <reference lib="webworker" />
import { buildInvestmentStrategy, type StrategyInputs, type InvestmentStrategy } from '@/selectors/buildInvestmentStrategy';

type StrategyWorkerResponse =
  | { ok: true; result: InvestmentStrategy; timing: number }
  | { ok: false; error: string };

type StrategyWorkerScope = Pick<DedicatedWorkerGlobalScope, 'postMessage'> & {
  onmessage: ((event: MessageEvent<StrategyInputs>) => void) | null;
};

const workerScope = self as unknown as StrategyWorkerScope;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

workerScope.onmessage = (event: MessageEvent<StrategyInputs>) => {
  try {
    // Add performance monitoring in worker
    const start = performance.now();
    const out: InvestmentStrategy = buildInvestmentStrategy(event.data);
    const end = performance.now();
    
    // Include timing data for monitoring
    const response: StrategyWorkerResponse = {
      ok: true, 
      result: out,
      timing: end - start
    };
    workerScope.postMessage(response);
  } catch (err: unknown) {
    const response: StrategyWorkerResponse = {
      ok: false, 
      error: getErrorMessage(err)
    };
    workerScope.postMessage(response);
  }
};

export {};
