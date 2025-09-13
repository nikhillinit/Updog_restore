import { useEffect, useRef, useState, useCallback } from 'react';
import { useAnalyticsFlag } from '@/lib/useFlag';
import { createKillSwitch } from '@/lib/analytics/selftest';

type WorkerType = 'xirr' | 'monte-carlo' | 'waterfall' | 'cancel';
type Resolver = (result: any) => void;

export function useWorkerAnalytics() {
  const analyticsEnabled = useAnalyticsFlag();
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef<Map<string, Resolver>>(new Map());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const killSwitch = useRef(createKillSwitch());

  useEffect(() => {
    // Only spawn worker if analytics is enabled
    if (!analyticsEnabled) {
      // Clean up any existing worker
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      killSwitch.current.killAll();
      return;
    }

    workerRef.current = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), { type: 'module' });

    // Register with kill switch
    const unregister = killSwitch.current.register(workerRef.current);

    workerRef.current.onmessage = (e: MessageEvent<any>) => {
      const { id, result, error, progress: p } = e.data ?? {};
      if (p !== undefined) {
        setProgress(prev => ({ ...prev, [id]: p }));
        return;
      }
      const r = pending.current.get(id);
      if (r) {
        pending.current.delete(id);
        setProgress(prev => {
          const next = { ...prev }; delete next[id]; return next;
        });
        if (error) console.error(`Worker error for ${id}:`, error);
        r(result);
      }
    };

    return () => {
      unregister();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [analyticsEnabled]);

  const call = useCallback((type: WorkerType, payload: any, id: string) => {
    return new Promise((resolve) => {
      if (!workerRef.current) return resolve(null);
      pending.current.set(id, resolve);
      workerRef.current.postMessage({ id, type, payload });
    });
  }, []);

  const cancel = useCallback((id: string) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ id, type: 'cancel' });
    pending.current.delete(id);
    setProgress(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  // Convenience wrappers
  const calculateXIRR = useCallback((cashFlows: Array<{ date: string; amount: number }>, id: string) =>
    call('xirr', { cashFlows }, id), [call]);

  const runMonteCarlo = useCallback((cashFlows: any[], id: string, volatility = 0.2, runs = 1000) =>
    call('monte-carlo', { cashFlows, volatility, runs, chunkSize: 100 }, id), [call]);

  const calculateWaterfall = useCallback((config: any, contributions: any[], exits: any[], id: string) =>
    call('waterfall', { config, contributions, exits }, id), [call]);

  // Expose worker spawn function for self-test
  const spawnWorker = useCallback(() => {
    return new Worker(new URL('../workers/analytics.worker.ts', import.meta.url), { type: 'module' });
  }, []);

  return { calculateXIRR, runMonteCarlo, calculateWaterfall, cancel, progress, spawnWorker };
}