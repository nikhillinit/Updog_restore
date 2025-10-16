// server/middleware/correlation.ts
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlation(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-correlation-id'] as string) || randomUUID();
  (req as any).correlationId = id;
  res["header"]('x-correlation-id', id);
  next();
}
