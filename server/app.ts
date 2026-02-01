import type { Request, Response, NextFunction } from 'express';
import express from 'express';

// Extended Request interface for request ID tracking
interface RequestWithId extends Request {
  rid?: string;
}

// Error type for error handler
interface HttpError {
  status?: number;
  message?: string;
}
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import { reservesV1Router } from './routes/v1/reserves.js';
import { flagsRouter } from './routes/flags.js';
import cashflowRouter from './routes/cashflow.js';
import healthRouter from './routes/health.js';
import calculationsRouter from './routes/calculations.js';
import aiRouter from './routes/ai.js';
import interleavedThinkingRouter from './routes/interleaved-thinking.js';
import scenarioAnalysisRouter from './routes/scenario-analysis.js';
import allocationsRouter from './routes/allocations.js';
import { dealPipelineRouter } from './routes/deal-pipeline.js';
import cohortAnalysisRouter from './routes/cohort-analysis.js';
import { swaggerSpec } from './config/swagger.js';
import { cspDirectives, securityHeaders } from './config/csp.js';

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
    res['setHeader']('Referrer-Policy', securityHeaders.referrerPolicy);
    res['setHeader']('X-Content-Type-Options', securityHeaders.xContentTypeOptions);
    res['setHeader']('X-Frame-Options', securityHeaders.xFrameOptions);
    res['setHeader']('X-XSS-Protection', securityHeaders.xXSSProtection);

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
    const ok = dev || (origin && allow.includes(origin));
    if (ok && origin) {
      res['setHeader']('Access-Control-Allow-Origin', origin);
      res['setHeader']('Vary', 'Origin');
      res['setHeader']('Access-Control-Allow-Credentials', 'true');
      res['setHeader']('Access-Control-Allow-Headers', 'content-type, authorization, x-request-id');
      res['setHeader']('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
        return res['status'](415)['json']({
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
    const reqWithId = req as RequestWithId;
    reqWithId.rid = (req.headers['x-request-id'] as string | undefined) || crypto.randomUUID();
    res['setHeader']('x-request-id', reqWithId.rid);
    next();
  });
  app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));

  // API Documentation
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'POVC Fund Platform API',
      customfavIcon: '/favicon.ico',
      customCss: '.swagger-ui .topbar { display: none }',
      explorer: true,
    })
  );

  // OpenAPI spec endpoint
  app['get']('/api-docs.json', (_req: Request, res: Response) => {
    res['setHeader']('Content-Type', 'application/json');
    res['send'](swaggerSpec);
  });

  // Health endpoints (must be before other routes for /healthz)
  app.use(healthRouter);

  // Feature flags API
  app.use('/api/flags', flagsRouter);

  // Versioned API
  app.use('/api/v1/reserves', reservesV1Router);

  // Cashflow management API
  app.use('/api/cashflow', cashflowRouter);

  // Fund calculations API (CSV export, deterministic engine)
  app.use('/api/calculations', calculationsRouter);

  // AI orchestrator API (multi-model queries)
  app.use('/api/ai', aiRouter);

  // Interleaved Thinking API (Claude with thinking, calculator, database tools)
  app.use('/api/interleaved-thinking', interleavedThinkingRouter);

  // Scenario Analysis API (Construction vs Current, deal modeling)
  app.use('/api', scenarioAnalysisRouter);

  // Fund Allocation Management API (Phase 1b - Reserve allocations with optimistic locking)
  app.use('/api', allocationsRouter);

  // Deal Pipeline API (Sprint 1 - Deal tracking, DD, scoring)
  app.use('/api/deals', dealPipelineRouter);

  // Cohort Analysis API (Advanced cohort analysis with sector/vintage normalization)
  app.use('/api/cohorts', cohortAnalysisRouter);

  // API version endpoint for deployment verification
  app['get']('/api/version', (_req: Request, res: Response) =>
    res['json']({
      version: process.env['npm_package_version'] || '1.3.2',
      environment: process.env['NODE_ENV'] || 'development',
      commit: process.env['VERCEL_GIT_COMMIT_SHA'] || process.env['COMMIT_REF'] || 'local',
    })
  );

  // 404 + error handler
  app.use((_req: Request, res: Response) => res['status'](404)['json']({ error: 'not_found' }));
  app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) =>
    res['status'](err.status ?? 500)['json']({
      error: 'internal',
      message: err.message ?? 'unknown',
    })
  );

  return app;
}

// Default export for Vercel compatibility
export default makeApp;
