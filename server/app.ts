import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { reservesV1Router } from './routes/v1/reserves.js';

export function makeApp() {
  const app = express();

  // Security and hardening
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Strict CORS (no wildcards in prod)
  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    const dev = process.env.NODE_ENV !== 'production';
    const ok = dev || (origin && allow.includes(origin));
    if (ok && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-request-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(ok ? 200 : 403);
    if (!ok && origin) return res.sendStatus(403);
    next();
  });

  // Content-Type validation for mutations
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = ((req.headers['content-type'] as string) || '').toLowerCase();
      if (!ct.startsWith('application/json')) {
        return res.status(415).json({ 
          error: 'unsupported_media_type', 
          message: 'Content-Type must be application/json' 
        });
      }
    }
    next();
  });

  // JSON limit + Request IDs + Rate limit
  app.use(express.json({ limit: '256kb' }));
  app.use((req: Request, res: Response, next: NextFunction) => { 
    (req as any).rid = req.headers['x-request-id'] || crypto.randomUUID(); 
    res.setHeader('x-request-id', (req as any).rid);
    next(); 
  });
  app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));

  // Versioned API
  app.use('/api/v1/reserves', reservesV1Router);

  // Health/Ready
  app.get('/healthz', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.get('/readyz', (_req: Request, res: Response) => res.json({ ok: true }));

  // 404 + error handler
  app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => res.status(err?.status ?? 500).json({ error: 'internal', message: err?.message ?? 'unknown' }));

  return app;
}