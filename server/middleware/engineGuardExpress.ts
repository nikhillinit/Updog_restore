import { Request, Response, NextFunction } from 'express';
import { engineMetrics } from '../telemetry';
import { getConfig } from '../config';

function isFiniteDeep(v: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (depth > 20) return false; // bail on pathological nesting
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(item => isFiniteDeep(item, depth + 1, seen));
  if (v && typeof v === "object") {
    const o = v as object;
    if (seen.has(o)) return false;     // cycle detected -> invalid
    seen.add(o);
    return Object.values(o).every(val => isFiniteDeep(val, depth + 1, seen));
  }
  return true;
}

declare module 'express' {
  interface Request {
    correlationId?: string;
    guard?: {
      sanitizeResponse: (_data: any) => any;
      injectFaults: <T>(_fn: () => T | Promise<T>) => Promise<T>;
    }
  }
}

export function engineGuardExpress() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const _json = res.json.bind(res);
    res.json = (body: any) => {
      if (!isFiniteDeep(body)) {
        engineMetrics.nonFinite422.inc?.();
        return res.status(422)
          .type("application/problem+json")
          .send({ 
            type: "about:blank", 
            title: "Non-finite numeric output", 
            status: 422, 
            detail: "Response contained NaN/Infinity; please adjust inputs." 
          });
      }
      return _json(body);
    };
    next();
  };
}