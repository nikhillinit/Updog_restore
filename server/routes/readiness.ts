import type { Request, Response } from 'express';
import type { CircuitBreaker } from '../infra/circuit-breaker/CircuitBreaker';

export function readinessHandler(critical: CircuitBreaker<any>[]) {
  return (_req: Request, res: Response) => {
    const unhealthy = critical.some((b) => b.getState() === 'OPEN');
    if (unhealthy) return res.status(503).send('unready: critical dependency breaker OPEN');
    res.send('ok');
  };
}
