import { Request, Response, NextFunction } from 'express';

export function degradedHeader(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.locals.degraded = false;
  res.setHeader('Server-Timing', 'cb;desc="circuit-breaker"');
  res.json = (body: any) => {
    if (res.locals.degraded) {
      res.setHeader('X-Circuit-State', 'DEGRADED');
    }
    return originalJson(body);
  };
  next();
}
