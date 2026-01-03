import { useEffect, useRef, useState } from 'react';

type WorkerFactory = () => Worker;

export type WorkerResult<TOut> = {
  data: TOut | null;
  loading: boolean;
  error: Error | null;
  timing?: number | undefined;
};

/**
 * Compute off the main thread. Spawns a fresh worker when deps change,
 * cancels the previous one, and returns {data, loading, error}.
 */
export function useWorkerMemo<TIn, TOut>(
  makeWorker: WorkerFactory,
  input: TIn | null,
): WorkerResult<TOut> {
  const [data, setData] = useState<TOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [timing, setTiming] = useState<number | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (input == null) {
      setData(null);
      setLoading(false);
      setError(null);
      setTiming(undefined);
      return;
    }
    
    setLoading(true);
    setError(null);
    setTiming(undefined);

    // Kill previous worker
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const w = makeWorker();
    workerRef.current = w;

    w.onmessage = (e: MessageEvent<{ ok: boolean; result?: TOut; error?: string; timing?: number }>) => {
      if (!w || w !== workerRef.current) return; // stale
      
      if (e.data.ok) {
        setData(e.data.result ?? null);
        setLoading(false);
        if (e.data.timing && import.meta.env.DEV) {
          setTiming(e.data.timing);
          console.log(`[WORKER] Computation took ${e.data.timing.toFixed(2)}ms`);
        }
      } else {
        setError(new Error(e.data.error || 'Worker error'));
        setLoading(false);
      }
    };

    w.onerror = (ev: any) => {
      if (!w || w !== workerRef.current) return;
      setError(ev instanceof ErrorEvent ? ev.error : new Error('Worker error'));
      setLoading(false);
    };

    // Send input to worker
    w.postMessage(input);

    return () => {
      w.terminate();
      if (workerRef.current === w) {
        workerRef.current = null;
      }
    };
  }, [makeWorker, input]);

  const result: WorkerResult<TOut> = {
    data,
    loading,
    error,
    ...(timing !== undefined ? { timing } : {}),
  };
  return result;
}
