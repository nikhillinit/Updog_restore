import type { Request, Response } from 'express';
import { breakerRegistry } from '../infra/circuit-breaker/breaker-registry';
import type { BreakerLike } from '../infra/circuit-breaker/typed-breaker';

export function readinessHandler(critical?: BreakerLike[]) {
  return (_req: Request, res: Response) => {
    // Use registry if no critical breakers specified
    const isHealthy = critical
      ? !critical.some((breaker) => breaker.getState() === 'OPEN')
      : breakerRegistry.isHealthy();

    if (!isHealthy) {
      const degraded = breakerRegistry.getDegraded();
      return res["status"](503)["json"]({
        ready: false,
        reason: 'critical dependency breaker OPEN',
        degraded,
        timestamp: new Date().toISOString()
      });
    }

    res["json"]({
      ready: true,
      degraded: breakerRegistry.getDegraded(),
      timestamp: new Date().toISOString()
    });
  };
}
