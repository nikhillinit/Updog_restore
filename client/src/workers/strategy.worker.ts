/// <reference lib="webworker" />
import { buildInvestmentStrategy, type StrategyInputs, type InvestmentStrategy } from '@/selectors/buildInvestmentStrategy';

self.onmessage = (e: MessageEvent<StrategyInputs>) => {
  try {
    // Add performance monitoring in worker
    const start = performance.now();
    const out: InvestmentStrategy = buildInvestmentStrategy(e.data);
    const end = performance.now();
    
    // Include timing data for monitoring
    (self as any).postMessage({ 
      ok: true, 
      result: out,
      timing: end - start
    });
  } catch (err: any) {
    (self as any).postMessage({ 
      ok: false, 
      error: String(err?.message || err)
    });
  }
};

export {};