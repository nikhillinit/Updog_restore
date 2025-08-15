import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// in-memory for now; swap to Redis/DB if needed  
const seen = new Map<string, { status: number; body: any; bodyHash: string; at: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashRequestBody(body: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) return next();

  const now = Date.now();
  const bodyHash = hashRequestBody(req.body);

  // cleanup TTL (simple)
  for (const [k, v] of seen) if (now - v.at > TTL_MS) seen.delete(k);

  const cached = seen.get(key);
  if (cached) {
    // Same key, different body = conflict
    if (cached.bodyHash !== bodyHash) {
      return res.status(409).json({ error: 'Idempotency key reused with different request body' });
    }
    // Same key, same body = return cached response
    return res.status(cached.status).json(cached.body);
  }

  // Wrap res.json to capture response once
  const orig = res.json.bind(res);
  res.json = (body: any) => {
    const result = orig(body);
    seen.set(key, { status: res.statusCode, body, bodyHash, at: Date.now() });
    return result;
  };
  next();
}