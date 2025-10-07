import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

type StreamStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

interface AgentStreamResult {
  status: StreamStatus;
  partials: any[];
  error: string | null;
  cancel: () => Promise<void>;
  isComplete: boolean;
}

/**
 * useAgentStream: React hook for SSE-based agent run streaming
 *
 * Usage:
 * ```tsx
 * const { status, partials, cancel, isComplete } = useAgentStream(runId);
 *
 * if (status === 'running') {
 *   return <div>Processing... <button onClick={cancel}>Cancel</button></div>;
 * }
 * ```
 */
export function useAgentStream(runId: string | null): AgentStreamResult {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [partials, setPartials] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setPartials([]);
    setError(null);

    const es = new EventSource(`/api/agents/stream/${runId}`);
    esRef.current = es;

    es.addEventListener('status', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      logger.debug('Agent status update', { runId, data });
      setStatus('running');
    });

    es.addEventListener('partial', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPartials(prev => [...prev, data]);
      logger.debug('Agent partial result', { runId, data });
    });

    es.addEventListener('delta', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPartials(prev => [...prev, data]);
      logger.debug('Agent delta update', { runId, data });
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPartials(prev => [...prev, data]);
      setStatus('complete');
      logger.info('Agent run complete', { runId, data });
      es.close();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setError(data.message || 'Unknown error');
      setStatus('error');
      logger.error('Agent run error', undefined, { runId, errorData: data });
      es.close();
    });

    es.onerror = () => {
      logger.error('SSE connection error', undefined, { runId });
      setStatus('error');
      setError('Connection failed');
      es.close();
    };

    return () => {
      logger.debug('Cleaning up agent stream', { runId });
      es.close();
      esRef.current = null;
    };
  }, [runId]);

  const cancel = useCallback(async () => {
    if (!runId) return;

    try {
      const response = await fetch(`/api/agents/run/${runId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        logger.info('Agent run cancelled', { runId });
        esRef.current?.close();
        setStatus('idle');
        setError('Cancelled by user');
      } else {
        throw new Error(`Cancel failed: ${response.statusText}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Cancel failed';
      const error = err instanceof Error ? err : undefined;
      logger.error('Failed to cancel agent run', error, { runId, errorMessage });
      setError(errorMessage);
    }
  }, [runId]);

  return {
    status,
    partials,
    error,
    cancel,
    isComplete: status === 'complete',
  };
}
