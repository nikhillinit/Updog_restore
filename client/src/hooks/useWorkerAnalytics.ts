import { useEffect, useRef, useState, useCallback } from 'react';

type WorkerType = 'xirr' | 'monte-carlo' | 'waterfall' | 'cancel';
type Resolver = (result: unknown) => void;

export function useWorkerAnalytics() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef<Map<string, Resolver>>(new Map());
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const pendingMap = pending.current; // Capture ref value for cleanup

    worker.onmessage = (e: MessageEvent<unknown>) => {
      const data = e.data as
        | { id?: string; result?: unknown; error?: unknown; progress?: number }
        | null
        | undefined;
      if (!data || !data.id) return;
      const { id, result, error, progress: p } = data;
      if (p !== undefined) {
        setProgress((prev) => ({ ...prev, [id]: p }));
        return;
      }
      const r = pendingMap.get(id);
      if (r) {
        pendingMap.delete(id);
        setProgress((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (error) console.error(`Worker error for ${id}:`, error);
        r(result);
      }
    };
    return () => {
      // Clean up pending promises before terminating worker
      pendingMap.forEach((resolve: Resolver) => {
        resolve(null); // Resolve with null instead of rejecting
      });
      pendingMap.clear();
      setProgress({});

      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, []);

  const call = useCallback((type: WorkerType, payload: unknown, id: string) => {
    return new Promise((resolve: Resolver) => {
      if (!workerRef.current) return resolve(null);

      // Set up timeout to prevent hanging promises
      const timeoutId = setTimeout(() => {
        if (pending.current.has(id)) {
          pending.current.delete(id);
          resolve(null);
        }
      }, 30000); // 30 second timeout

      const wrappedResolve = (result: unknown) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      pending.current['set'](id, wrappedResolve);
      workerRef.current.postMessage({ id, type, payload });
    });
  }, []);

  const cancel = useCallback((id: string) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ id, type: 'cancel' });
    pending.current.delete(id);
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Convenience wrappers
  const calculateXIRR = useCallback(
    (cashFlows: Array<{ date: string; amount: number }>, id: string) =>
      call('xirr', { cashFlows }, id),
    [call]
  );

  const runMonteCarlo = useCallback(
    (
      cashFlows: Array<{ date: string; amount: number }>,
      id: string,
      volatility = 0.2,
      runs = 1000
    ) => call('monte-carlo', { cashFlows, volatility, runs, chunkSize: 100 }, id),
    [call]
  );

  const calculateWaterfall = useCallback(
    (config: unknown, contributions: unknown[], exits: unknown[], id: string) =>
      call('waterfall', { config, contributions, exits }, id),
    [call]
  );

  return { calculateXIRR, runMonteCarlo, calculateWaterfall, cancel, progress };
}
