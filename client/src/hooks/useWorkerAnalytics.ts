import { useEffect, useRef, useState, useCallback } from 'react';
import type { XIRRResult } from '@/lib/finance/xirr';
import type {
  AmericanWaterfallConfig,
  AmericanWaterfallResult,
  ContributionCF,
  ExitCF,
} from '@/lib/waterfall/american-ledger';

type WorkerRequestType = 'xirr' | 'monte-carlo' | 'waterfall';
type WorkerType = WorkerRequestType | 'cancel';

type CashFlowInput = { date: string | Date; amount: number };

interface MonteCarloResult {
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
  std: number | null;
  runs: number;
}

type WorkerPayloadByType = {
  xirr: { cashFlows: CashFlowInput[]; guess?: number };
  'monte-carlo': { cashFlows: CashFlowInput[]; volatility?: number; runs?: number; chunkSize?: number };
  waterfall: { config: AmericanWaterfallConfig; contributions: ContributionCF[]; exits: ExitCF[] };
};

type WorkerResultByType = {
  xirr: XIRRResult;
  'monte-carlo': MonteCarloResult;
  waterfall: AmericanWaterfallResult;
};

type WorkerResult = WorkerResultByType[WorkerRequestType];

interface WorkerResponse {
  id: string;
  result?: WorkerResult;
  error?: string;
  progress?: number;
}

type Resolver = (result: WorkerResult | null) => void;

export function useWorkerAnalytics() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef<Map<string, Resolver>>(new Map());
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), { type: 'module' });
    const pendingRef = pending.current;
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, result, error, progress: p } = e.data;
      if (p !== undefined) {
        setProgress(prev => ({ ...prev, [id]: p }));
        return;
      }
      const r = pendingRef['get'](id);
      if (r) {
        pendingRef.delete(id);
        setProgress(prev => {
          const next = { ...prev }; delete next[id]; return next;
        });
        if (error) console.error(`Worker error for ${id}:`, error);
        r(result ?? null);
      }
    };
    return () => {
      // Clean up pending promises before terminating worker
      pendingRef.forEach((resolve) => {
        resolve(null); // Resolve with null instead of rejecting
      });
      pendingRef.clear();
      setProgress({});

      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, []);

  const call = useCallback(<TType extends WorkerRequestType>(
    type: TType,
    payload: WorkerPayloadByType[TType],
    id: string
  ) => {
    return new Promise<WorkerResultByType[TType] | null>((resolve) => {
      if (!workerRef.current) return resolve(null);

      // Set up timeout to prevent hanging promises
      const timeoutId = setTimeout(() => {
        if (pending.current.has(id)) {
          pending.current.delete(id);
          resolve(null);
        }
      }, 30000); // 30 second timeout

      const wrappedResolve: Resolver = (result) => {
        clearTimeout(timeoutId);
        resolve(result as WorkerResultByType[TType] | null);
      };

      pending.current['set'](id, wrappedResolve);
      workerRef.current.postMessage({ id, type, payload });
    });
  }, []);

  const cancel = useCallback((id: string) => {
    if (!workerRef.current) return;
    const message: { id: string; type: WorkerType } = { id, type: 'cancel' };
    workerRef.current.postMessage(message);
    pending.current.delete(id);
    setProgress(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  // Convenience wrappers
  const calculateXIRR = useCallback((cashFlows: CashFlowInput[], id: string) =>
    call('xirr', { cashFlows }, id), [call]);

  const runMonteCarlo = useCallback((cashFlows: CashFlowInput[], id: string, volatility = 0.2, runs = 1000) =>
    call('monte-carlo', { cashFlows, volatility, runs, chunkSize: 100 }, id), [call]);

  const calculateWaterfall = useCallback((config: AmericanWaterfallConfig, contributions: ContributionCF[], exits: ExitCF[], id: string) =>
    call('waterfall', { config, contributions, exits }, id), [call]);

  return { calculateXIRR, runMonteCarlo, calculateWaterfall, cancel, progress };
}
