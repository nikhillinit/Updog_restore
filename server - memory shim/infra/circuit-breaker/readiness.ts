import type { Request, Response } from 'express';
import type { CircuitBreaker } from './CircuitBreaker';

export function readinessHandler(breakers: Record<string, CircuitBreaker<any>>, maxOpenMs = 5 * 60 * 1000) {
  return (_req: Request, res: Response) => {
    const now = Date.now();
    const unhealthy = Object.entries(breakers).some(([_, b]) => {
      const m = b.getMetrics();
      if (m.state === 'OPEN' && m.currentBackoffMs > maxOpenMs) return true;
      return false;
    });
    if (unhealthy) return res.status(503).json({ status: 'unready' });
    return res.status(200).json({ status: 'ready' });
  };
}
