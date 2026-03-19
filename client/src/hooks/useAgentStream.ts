import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

type StreamStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';
type AgentStreamPayload = unknown;

interface AgentStreamErrorPayload {
  message: string;
  code?: string;
}

interface AgentStreamResult {
  status: StreamStatus;
  partials: AgentStreamPayload[];
  error: string | null;
  cancel: () => Promise<void>;
  isComplete: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readEventData = (event: Event): string => {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    throw new Error('Expected string SSE payload');
  }
  return event.data;
};

const parseEventPayload = (event: Event): AgentStreamPayload => {
  return JSON.parse(readEventData(event)) as unknown;
};

const parseErrorPayload = (event: Event): AgentStreamErrorPayload => {
  const payload = parseEventPayload(event);

  if (isRecord(payload)) {
    const message = payload['message'];
    const code = payload['code'];

    if (typeof message === 'string') {
      return typeof code === 'string' ? { message, code } : { message };
    }
  }

  throw new Error('Expected stream error payload with message');
};

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
  const [partials, setPartials] = useState<AgentStreamPayload[]>([]);
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

    const closeWithParseError = (eventType: string, cause: unknown) => {
      const parseError =
        cause instanceof Error ? cause : new Error(`Invalid ${eventType} SSE payload`);
      logger.error('Invalid agent stream payload', parseError, { runId, eventType });
      setError('Invalid stream payload');
      setStatus('error');
      es.close();
    };

    es.addEventListener('status', (event: Event) => {
      try {
        const data = parseEventPayload(event);
        logger.debug('Agent status update', { runId, data });
        setStatus('running');
      } catch (cause) {
        closeWithParseError('status', cause);
      }
    });

    es.addEventListener('partial', (event: Event) => {
      try {
        const data = parseEventPayload(event);
        setPartials((previous) => [...previous, data]);
        logger.debug('Agent partial result', { runId, data });
      } catch (cause) {
        closeWithParseError('partial', cause);
      }
    });

    es.addEventListener('delta', (event: Event) => {
      try {
        const data = parseEventPayload(event);
        setPartials((previous) => [...previous, data]);
        logger.debug('Agent delta update', { runId, data });
      } catch (cause) {
        closeWithParseError('delta', cause);
      }
    });

    es.addEventListener('complete', (event: Event) => {
      try {
        const data = parseEventPayload(event);
        setPartials((previous) => [...previous, data]);
        setStatus('complete');
        logger.info('Agent run complete', { runId, data });
        es.close();
      } catch (cause) {
        closeWithParseError('complete', cause);
      }
    });

    es.addEventListener('error', (event: Event) => {
      try {
        const data = parseErrorPayload(event);
        setError(data.message);
        setStatus('error');
        logger.error('Agent run error', undefined, { runId, errorData: data });
        es.close();
      } catch (cause) {
        closeWithParseError('error', cause);
      }
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
