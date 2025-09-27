import { xirrNewtonBisection } from '@/lib/finance/xirr';
import { calculateAmericanWaterfallLedger } from '@/lib/waterfall/american-ledger';

type WorkerType = 'xirr' | 'monte-carlo' | 'waterfall';
interface WorkerRequest { id: string; type: WorkerType | 'cancel'; payload?: any; }
interface WorkerResponse { id: string; result?: any; error?: string; progress?: number; }

const CANCELLED = new Set<string>();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'cancel') { CANCELLED.add(id); return; }

    if (type === 'xirr') {
      if (CANCELLED.has(id)) return;
      const res = xirrNewtonBisection(payload.cashFlows, payload.guess ?? 0.1);
      if (!CANCELLED.has(id)) (self as any).postMessage({ id, result: res } as WorkerResponse);
      return;
    }

    if (type === 'waterfall') {
      if (CANCELLED.has(id)) return;
      const res = calculateAmericanWaterfallLedger(payload.config, payload.contributions, payload.exits);
      if (!CANCELLED.has(id)) (self as any).postMessage({ id, result: res } as WorkerResponse);
      return;
    }

    if (type === 'monte-carlo') {
      const runs: number = payload.runs ?? 1000;
      const chunkSize = payload.chunkSize ?? 100;
      const flowsBase = payload.cashFlows as Array<{ date: string; amount: number }>;
      const volatility = payload.volatility ?? 0.2;
      const results: number[] = [];

      const chunks = Math.ceil(runs / chunkSize);
      for (let c = 0; c < chunks; c++) {
        if (CANCELLED.has(id)) return;
        const start = c * chunkSize;
        const end = Math.min(start + chunkSize, runs);
        for (let i = start; i < end; i++) {
          // jitter only distributions
          const flows = flowsBase.map(cf => ({
            date: new Date(cf.date),
            amount: cf.amount > 0 ? cf.amount * (1 + randNorm(0, volatility)) : cf.amount,
          }));
          const r = xirrNewtonBisection(flows);
          if (r.converged && r.irr !== null) results.push(r.irr);
        }
        (self as any).postMessage({ id, progress: Math.round(((c + 1) / chunks) * 100) } as WorkerResponse);
      }
      results.sort((a: any, b: any) => a - b);
      const q = (p: number) => results.length ? results[Math.max(0, Math.min(results.length - 1, Math.floor(p * (results.length - 1))))] : null;
      const mean = results.length ? results.reduce((s: any, x: any) => s + x, 0) / results.length : null;
      const variance = results.length ? results.reduce((s: any, x: any) => s + Math.pow(x - (mean as number), 2), 0) / results.length : null;

      if (!CANCELLED.has(id)) {
        (self as any).postMessage({
          id,
          result: {
            p10: q(0.10),
            p25: q(0.25),
            p50: q(0.50),
            p75: q(0.75),
            p90: q(0.90),
            mean,
            std: variance !== null ? Math.sqrt(variance) : null,
            runs: results.length,
          },
        } as WorkerResponse);
      }
      return;
    }

    throw new Error(`Unknown worker type: ${type}`);
  } catch (e: any) {
    if (!CANCELLED.has(id)) (self as any).postMessage({ id, error: e?.message ?? 'Unknown error' } as WorkerResponse);
  } finally {
    CANCELLED.delete(id);
  }
};

// Simple normal(μ,σ) via Box–Muller
function randNorm(mu = 0, sigma = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mu + sigma * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}