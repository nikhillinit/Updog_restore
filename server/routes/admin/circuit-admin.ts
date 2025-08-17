import { Router } from 'express';
import type { CircuitBreaker } from '../../infra/circuit-breaker/CircuitBreaker';
import { breakerRegistry } from '../../infra/circuit-breaker/breaker-registry';

export function circuitAdmin(breakers?: Record<string, CircuitBreaker<any>>) {
  const r = Router();

  // TODO: add authz
  r.get('/state', (_req, res) => {
    // Use registry if available, fallback to passed breakers
    const states = breakers ? 
      Object.fromEntries(Object.entries(breakers).map(([k, b]) => [k, b.getState()])) :
      breakerRegistry.getAll();
    
    res.json({
      states,
      healthy: breakerRegistry.isHealthy(),
      degraded: breakerRegistry.getDegraded(),
      timestamp: new Date().toISOString()
    });
  });

  r.get('/health', (_req, res) => {
    const isHealthy = breakerRegistry.isHealthy();
    const degraded = breakerRegistry.getDegraded();
    
    res.status(isHealthy ? 200 : 503).json({
      healthy: isHealthy,
      degraded,
      critical: breakerRegistry.getCritical().map(c => c.name)
    });
  });

  r.post('/force/:name/:state', (req, res) => {
    const breaker = breakerRegistry.get(req.params.name) || 
                   (breakers && breakers[req.params.name]);
    
    if (!breaker) return res.status(404).json({ error: 'unknown breaker' });
    // Not exposing unsafe direct state changes in code; this endpoint can wrap debug helpers as needed.
    return res.status(501).json({ error: 'force transitions not implemented (guarded operation)' });
  });

  return r;
}
