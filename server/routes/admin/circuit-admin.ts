import { Router } from 'express';
import type { CircuitBreaker } from '../../infra/circuit-breaker/CircuitBreaker';

export function circuitAdmin(breakers: Record<string, CircuitBreaker<any>>) {
  const r = Router();

  // TODO: add authz
  r.get('/state', (_req, res) => {
    const states = Object.fromEntries(Object.entries(breakers).map(([k, b]) => [k, b.getState()]));
    res.json(states);
  });

  r.post('/force/:name/:state', (req, res) => {
    const b = breakers[req.params.name];
    if (!b) return res.status(404).json({ error: 'unknown breaker' });
    // Not exposing unsafe direct state changes in code; this endpoint can wrap debug helpers as needed.
    return res.status(501).json({ error: 'force transitions not implemented (guarded operation)' });
  });

  return r;
}
