import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import { reservesV1Router } from './routes/v1/reserves.js';
import { flagsRouter } from './routes/flags.js';
import { swaggerSpec } from './config/swagger.js';
import { cspDirectives, buildCSPHeader, securityHeaders } from './config/csp.js';

export function makeApp() {
  const app = express();

  // Security and hardening
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers with custom CSP
  const isReportOnly = process.env.CSP_REPORT_ONLY === '1';
  const cspHeader = buildCSPHeader(cspDirectives);
  
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Disable helmet's CSP to use our custom one
    hsts: {
      maxAge: securityHeaders.hsts.maxAge,
      includeSubDomains: securityHeaders.hsts.includeSubDomains,
      preload: securityHeaders.hsts.preload
    }
  }));
  
  // Apply custom CSP header
  app.use((req: Request, res: Response, next: NextFunction) => {
    const headerName = isReportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    res.setHeader(headerName, cspHeader);
    
    // Additional security headers
    res.setHeader('Referrer-Policy', securityHeaders.referrerPolicy);
    res.setHeader('X-Content-Type-Options', securityHeaders.xContentTypeOptions);
    res.setHeader('X-Frame-Options', securityHeaders.xFrameOptions);
    res.setHeader('X-XSS-Protection', securityHeaders.xXSSProtection);
    
    next();
  });

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

  // API Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'POVC Fund Platform API',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
    explorer: true
  }));
  
  // OpenAPI spec endpoint
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Feature flags API
  app.use('/api/flags', flagsRouter);
  
  // Versioned API
  app.use('/api/v1/reserves', reservesV1Router);

  /**
   * @swagger
   * /healthz:
   *   get:
   *     summary: Health check endpoint
   *     description: Returns the health status of the service
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   */
  app.get('/healthz', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  
  /**
   * @swagger
   * /readyz:
   *   get:
   *     summary: Readiness check endpoint
   *     description: Returns the readiness status of the service
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: Service is ready
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *                   example: true
   */
  app.get('/readyz', (_req: Request, res: Response) => res.json({ ok: true }));

  // API health endpoint for smoke tests
  app.get('/api/health', (_req: Request, res: Response) => res.json({ 
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  }));

  // API version endpoint for deployment verification
  app.get('/api/version', (_req: Request, res: Response) => res.json({ 
    version: process.env.npm_package_version || '1.3.2',
    environment: process.env.NODE_ENV || 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || 'local'
  }));

  // 404 + error handler
  app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => res.status(err?.status ?? 500).json({ error: 'internal', message: err?.message ?? 'unknown' }));

  return app;
}