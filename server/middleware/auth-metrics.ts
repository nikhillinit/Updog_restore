import type { Request, Response, NextFunction } from 'express';

/**
 * Authentication middleware for /metrics.
 * Supports either:
 *  - Bearer token via METRICS_KEY, or
 *  - IP allowlist via METRICS_ALLOW_FROM (comma-separated exact IPs)
 *
 * In production, if neither is set, deny by default.
 */
export function authenticateMetrics(req: Request, res: Response, next: NextFunction) {
  const metricsKey = process.env['METRICS_KEY'];
  const allowFrom = (process.env['METRICS_ALLOW_FROM'] ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Best-effort IP (trust proxy should be set at app level if behind LB)
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const callerIp = xff || req.ip;

  if (allowFrom.length && callerIp && allowFrom.includes(callerIp)) return next();

  if (metricsKey) {
    const auth = req.headers["authorization"];
    if (typeof auth === 'string') {
      const [scheme, token] = auth.split(' ');
      if (scheme === 'Bearer' && token === metricsKey) return next();
    }
  }

  // Deny by default in production
  if (process.env['NODE_ENV'] === 'production' || metricsKey || allowFrom.length) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next(); // Allow in dev if no auth configured
}