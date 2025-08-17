import type { Request, Response, NextFunction } from 'express';

export function setDegradedHeaders(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN') {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Circuit-State', state);
    if (state !== 'CLOSED') {
      // Surfaced in timelines
      res.setHeader('Server-Timing', `circuit;desc="${state}"`);
      (res.locals as any).degraded = true;
    }
    next();
  };
}
