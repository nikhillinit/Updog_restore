import { Router } from 'express';
import type { CircuitBreaker } from './CircuitBreaker';
import type { CircuitState } from './types';

export function makeAdminRouter(registry: Record<string, CircuitBreaker<any>>) {
  const r = Router();

  // AUTHZ REQUIRED INTEGRATION: ensure only admins can access
  r.get('/api/admin/circuit', (_req, res) => {
    const snapshot = Object.fromEntries(Object.entries(registry).map(([k, b]) => [k, b.getMetrics()]));
    res.json(snapshot);
  });

  r.post('/api/admin/circuit/:name/force', (req, res) => {
    const { name } = req.params;
    const breaker = registry[name];
    if (!breaker) return res.status(404).json({ error: 'not found' });
    const { state } = req.body as { state: CircuitState };
    // In a real system we would expose a method on CircuitBreaker to force state; omitted for safety.
    return res.status(501).json({ error: 'force state not implemented in demo – wire a safe hook if needed' });
  });

  return r;
}
