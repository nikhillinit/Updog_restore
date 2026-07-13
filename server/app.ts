import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { reservesV1Router } from './routes/v1/reserves.js';
import cashflowRouter from './routes/cashflow.js';
import healthRouter from './routes/health.js';
import calculationsRouter from './routes/calculations.js';
import aiRouter from './routes/ai.js';
import scenarioAnalysisRouter from './routes/scenario-analysis.js';
import metricsRouter from './routes/metrics-endpoint.js';
import { installRumIngressGuards } from './routes/metrics-rum-ingress.js';
import { metricsRumRouter } from './routes/metrics-rum.js';
import { swaggerSpec } from './config/swagger.js';
import { cspDirectives, securityHeaders } from './config/csp.js';
import { requireAuth } from './lib/auth/jwt.js';
import { isPublicApiPath } from './lib/public-api-boundary.js';
import { errorHandler } from './errors.js';
import { requireCsrf } from './lib/auth/csrf.js';
import { mountCommonRoutes } from './routes/mount-common-routes.js';

export function makeApp() {
  const app = express();

  // Security and hardening
  app['disable']('x-powered-by');
  app['set']('trust proxy', 1);

  // Security headers with custom CSP
  // Use bracket notation for env vars to avoid TypeScript warnings
  const isReportOnly = process.env['CSP_REPORT_ONLY'] === '1';

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives as unknown as Record<string, Iterable<string> | null>,
        reportOnly: isReportOnly,
      },
      hsts: {
        maxAge: securityHeaders.hsts.maxAge,
        includeSubDomains: securityHeaders.hsts.includeSubDomains,
        preload: securityHeaders.hsts.preload,
      },
    })
  );

  // Additional security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Referrer-Policy', securityHeaders.referrerPolicy);
    res.setHeader('X-Content-Type-Options', securityHeaders.xContentTypeOptions);
    res.setHeader('X-Frame-Options', securityHeaders.xFrameOptions);
    res.setHeader('X-XSS-Protection', securityHeaders.xXSSProtection);

    next();
  });

  // Strict CORS (no wildcards in prod)
  const allow = (process.env['ALLOWED_ORIGINS'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers['origin'] as string | undefined;
    const dev = process.env['NODE_ENV'] !== 'production';
    const devOriginOk =
      dev && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const ok = devOriginOk || (origin && allow.includes(origin));
    if (ok && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'content-type, authorization, x-csrf-token, x-request-id, if-match, idempotency-key'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(ok ? 200 : 403);
    if (!ok && origin) return res.sendStatus(403);
    next();
  });

  const rateLimitWindowMs = Number(process.env['RATE_LIMIT_WINDOW_MS'] || '60000');
  const rateLimitMax = Number(process.env['RATE_LIMIT_MAX'] || '60');

  // Content-Type validation for mutations
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = ((req.headers['content-type'] as string) || '').toLowerCase();
      if (!ct.startsWith('application/json')) {
        return res.status(415).json({
          error: 'unsupported_media_type',
          message: 'Content-Type must be application/json',
        });
      }
    }
    next();
  });

  // JSON limit + Request IDs + Rate limit
  app.use(express['json']({ limit: '256kb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) || crypto.randomUUID();
    req.rid = requestId;
    req.id = requestId;
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });
  app.use(rateLimit({ windowMs: rateLimitWindowMs, max: rateLimitMax, standardHeaders: true }));

  // API Documentation landing page
  app['get']('/api-docs', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>POVC Fund Platform API Docs</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f4f4f5; padding: 0.15rem 0.35rem; border-radius: 4px; }
      a { color: #0a66c2; }
    </style>
  </head>
  <body>
    <h1>POVC Fund Platform API Docs</h1>
    <p>OpenAPI JSON: <a href="/api-docs.json"><code>/api-docs.json</code></a></p>
    <p>Import the JSON into your preferred OpenAPI viewer (Swagger Editor, Stoplight, Postman, etc.).</p>
  </body>
</html>`);
  });

  // OpenAPI spec endpoint
  app['get']('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Health endpoints (must be before other routes for /healthz)
  app.use(healthRouter);

  // Metrics endpoints — auth required (METRICS_KEY or METRICS_ALLOW_FROM)
  app.use(metricsRouter);
  app.use('/api', metricsRouter);
  installRumIngressGuards(app);
  app.use(metricsRumRouter);
  app.use('/api', metricsRumRouter);

  const requireApiAuth = requireAuth();

  // Keep the makeApp/serverless surface aligned with the canonical /api boundary:
  // minimal health probes and explicitly public product routes remain public,
  // while fund data and detailed observability stay authenticated.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (isPublicApiPath(req.method, req.path)) {
      return next();
    }

    return requireApiAuth(req, res, next);
  });

  // Cookie credentials are ambient. Enforce their jti-bound CSRF token after
  // authentication has identified the credential source and before any route.
  // Public unauthenticated routes pass here; login has its own pre-auth token.
  app.use('/api', requireCsrf);

  mountCommonRoutes(app, { surface: 'make_app' });

  // Versioned API
  app.use('/api/v1/reserves', reservesV1Router);

  // Cashflow management API
  app.use('/api/cashflow', cashflowRouter);

  // Fund calculations API (CSV export, deterministic engine)
  app.use('/api/calculations', calculationsRouter);

  // AI orchestrator API (multi-model queries)
  app.use('/api/ai', aiRouter);

  // Scenario Analysis API (Construction vs Current, deal modeling)
  app.use('/api', scenarioAnalysisRouter);
  // API version endpoint for deployment verification
  app['get']('/api/version', (_req: Request, res: Response) =>
    res.json({
      version: process.env['npm_package_version'] || '1.3.2',
      environment: process.env['NODE_ENV'] || 'development',
      commit: process.env['VERCEL_GIT_COMMIT_SHA'] || process.env['COMMIT_REF'] || 'local',
    })
  );

  // 404 + error handler
  app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));
  app.use(errorHandler());

  return app;
}

// Default export for Vercel compatibility
export default makeApp;
