import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import { rumLimiter, rumOriginGuard, rumSamplingGuard } from './metrics-rum.guard.js';

export const RUM_INGRESS_POST_PATHS = ['/metrics/rum', '/api/metrics/rum'] as const;

export function passThroughNext(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export interface RumIngressDeps {
  rumOriginGuard: RequestHandler;
  rumLimiter: RequestHandler;
  rumSamplingGuard: RequestHandler;
}

const defaultRumIngressDeps: RumIngressDeps = {
  rumOriginGuard,
  rumLimiter,
  rumSamplingGuard,
};

export function installRumIngressGuards(
  app: Express,
  deps: RumIngressDeps = defaultRumIngressDeps
): void {
  for (const path of RUM_INGRESS_POST_PATHS) {
    app.post(path, deps.rumOriginGuard, deps.rumLimiter, deps.rumSamplingGuard, passThroughNext);
  }
}
