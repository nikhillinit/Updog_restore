import type { Request, Response, NextFunction } from 'express';

// in-memory for now; swap to Redis/DB if needed
const seen = new Map<string, { status: number; body: any; at: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) return next();

  const now = Date.now();
  // cleanup TTL (simple)
  for (const [k, v] of seen) if (now - v.at > TTL_MS) seen.delete(k);

  const cached = seen.get(key);
  if (cached) return res.status(cached.status).json(cached.body);

  // Wrap res.json to capture response once
  const orig = res.json.bind(res);
  res.json = (body: any) => {
    const result = orig(body);
    seen.set(key, { status: res.statusCode, body, at: Date.now() });
    return result;
  };
  next();
}