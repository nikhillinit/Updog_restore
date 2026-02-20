import type { Request, Response, NextFunction } from 'express';
import { engineMetrics } from '../telemetry';

function isFiniteDeep(v: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (depth > 20) return false; // bail on pathological nesting

  // Plain numbers: only allow finite
  if (typeof v === 'number') return Number.isFinite(v);

  // Date objects: check for invalid dates (getTime() returns NaN)
  if (v instanceof Date) return Number.isFinite(v.getTime());

  // Arrays: check all elements
  if (Array.isArray(v)) return v.every((item) => isFiniteDeep(item, depth + 1, seen));

  // Objects: check all values (with cycle detection)
  if (v && typeof v === 'object') {
    const o = v as object;
    if (seen.has(o)) return false; // cycle detected -> invalid
    seen.add(o);
    return Object.values(o).every((val) => isFiniteDeep(val, depth + 1, seen));
  }

  // Strings, booleans, null, undefined, etc. are fine
  return true;
}

// Request augmentation is now centralized in server/types/express.d.ts

export function engineGuardExpress() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const _json = res.json.bind(res);
    res.json = (body: any) => {
      if (!isFiniteDeep(body)) {
        engineMetrics.nonFinite422.inc?.();
        return res['status'](422).type('application/problem+json')['send']({
          type: 'about:blank',
          title: 'Non-finite numeric output',
          status: 422,
          detail:
            'Response contained NaN/Infinity or invalid Date/nested structure; adjust inputs.',
        });
      }
      return _json(body);
    };
    next();
  };
}
