import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CircuitBreaker } from '../../infra/circuit-breaker/CircuitBreaker';
import { breakerRegistry } from '../../infra/circuit-breaker/breaker-registry';
import { requireAuth, requireRole } from '../../lib/auth/jwt';
import { adminRateLimiter } from '../../middleware/rate-limit';

export function circuitAdmin(breakers?: Record<string, CircuitBreaker<unknown>>) {
  const r = Router();

  // Apply rate limiting, authentication and admin role requirement to all routes
  r.use(adminRateLimiter);
  r.use(requireAuth(), requireRole('admin'));
  r.get('/state', (_req: Request, res: Response) => {
    // Use registry if available, fallback to passed breakers
    const states = breakers
      ? Object.fromEntries(Object.entries(breakers).map(([k, b]) => [k, b.getState()]))
      : breakerRegistry.getAll();

    res.json({
      states,
      healthy: breakerRegistry.isHealthy(),
      degraded: breakerRegistry.getDegraded(),
      timestamp: new Date().toISOString(),
    });
  });

  r.get('/health', (_req: Request, res: Response) => {
    const isHealthy = breakerRegistry.isHealthy();
    const degraded = breakerRegistry.getDegraded();

    res.status(isHealthy ? 200 : 503).json({
      healthy: isHealthy,
      degraded,
      critical: breakerRegistry.getCritical().map((c) => c.name),
    });
  });

  r.post('/force/:name/:state', (req: Request<{ name: string; state: string }>, res: Response) => {
    const breakerName = req.params.name;
    const breaker = breakerRegistry.get(breakerName) || (breakers && breakers[breakerName]);

    if (!breaker) return res.status(404).json({ error: 'unknown breaker' });
    // Not exposing unsafe direct state changes in code; this endpoint can wrap debug helpers as needed.
    return res.status(501).json({ error: 'force transitions not implemented (guarded operation)' });
  });

  return r;
}
