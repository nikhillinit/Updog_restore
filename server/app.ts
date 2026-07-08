import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { reservesV1Router } from './routes/v1/reserves.js';
import { flagsRouter } from './routes/flags.js';
import cashflowRouter from './routes/cashflow.js';
import healthRouter from './routes/health.js';
import calculationsRouter from './routes/calculations.js';
import aiRouter from './routes/ai.js';
import scenarioAnalysisRouter from './routes/scenario-analysis.js';
import dualForecastRouter from './routes/dual-forecast.js';
import dashboardSummaryRouter from './routes/dashboard-summary.js';
import fundActualsRouter from './routes/fund-actuals.js';
import allocationsRouter from './routes/allocations.js';
import allocationScenariosRouter from './routes/allocation-scenarios.js';
import planningFmvOverridesRouter from './routes/planning-fmv-overrides.js';
import fundScenarioSetsRouter from './routes/fund-scenario-sets.js';
import fundMoicRouter from './routes/fund-moic.js';
import timelineRouter from './routes/timeline.js';
import { sharesRouter, publicSharesRouter } from './routes/shares.js';
import capitalAllocationRouter from './routes/capital-allocation.js';
import liquidityRouter from './routes/liquidity.js';
import graduationRouter from './routes/graduation.js';
import reallocationRouter from './routes/reallocation.js';
import cashFlowEventsRouter from './routes/cash-flow-events.js';
import operatingObjectTasksRouter from './routes/operating-object-tasks.js';
import backtestingRouter from './routes/backtesting.js';
import fundsRouter from './routes/funds.js';
import fundMetricsRouter from './routes/fund-metrics.js';
import investmentsRouter from './routes/investments.js';
import portfolioCompaniesRouter from './routes/portfolio-companies.js';
import portfolioOverviewRouter from './routes/portfolio-overview.js';
import varianceRouter from './routes/variance.js';
import { registerFundConfigRoutes } from './routes/fund-config.js';
import { dealPipelineRouter } from './routes/deal-pipeline.js';
import cohortAnalysisRouter from './routes/cohort-analysis.js';
import sensitivityRouter from './routes/sensitivity.js';
import portfolioLotsRouter from './routes/portfolio/lots.js';
import performanceApiRouter from './routes/performance-api.js';
import lpApiRouter from './routes/lp-api.js';
import lpCapitalCallsRouter from './routes/lp-capital-calls.js';
import lpDistributionsRouter from './routes/lp-distributions.js';
import lpDocumentsRouter from './routes/lp-documents.js';
import lpNotificationsRouter from './routes/lp-notifications.js';
import lpReportingImportsRouter from './routes/lp-reporting/imports.js';
import lpReportingMetricRunsRouter from './routes/lp-reporting/metric-runs.js';
import metricsRouter from './routes/metrics-endpoint.js';
import { installRumIngressGuards } from './routes/metrics-rum-ingress.js';
import { metricsRumRouter } from './routes/metrics-rum.js';
import { swaggerSpec } from './config/swagger.js';
import { cspDirectives, securityHeaders } from './config/csp.js';
import { requireAuth } from './lib/auth/jwt.js';
import { isPublicApiPath } from './lib/public-api-boundary.js';
import { errorHandler } from './errors.js';

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
        'content-type, authorization, x-request-id, if-match, idempotency-key'
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

  // Scenario Analysis API (Construction vs Current, deal modeling)
  app.use('/api', scenarioAnalysisRouter);
  app.use('/api', dualForecastRouter);
  // Dashboard header KPI cards + Portfolio Allocation read model (#1032). Mounted
  // here so the Vercel/makeApp surface matches the Docker routes.ts mount; without
  // it the endpoint 404s in prod and the KPI provenance envelope stays invisible.
  app.use('/api', dashboardSummaryRouter);
  app.use('/api', fundActualsRouter);

  // Keep the makeApp/serverless surface aligned with the canonical fund routes
  // used by the wizard bootstrap flow.
  app.use('/api', fundsRouter);
  app.use(fundMetricsRouter);
  app.use('/api', investmentsRouter);
  // Portfolio Companies API (#1036 burn-down). Fund-scoped reads/writes of portfolio_companies via
  // IStorage; protected by the global /api auth boundary above + per-request enforceProvidedFundScope.
  // Mounted at the bare /api root (routes self-define relative /portfolio-companies paths), mirroring
  // the Docker routes.ts mount; without it /api/portfolio-companies 404s in prod. Closes the parity
  // 404 gap; does NOT by itself restore the prod client flow (apiRequest sends cookies, not Bearer).
  app.use('/api', portfolioCompaniesRouter);
  // Portfolio Overview API (#1036 burn-down). Fund-scoped server-computed overview (KPIs + per-company
  // MOIC) read from funds/portfolio_companies via IStorage; protected by the global /api auth boundary
  // above + per-request enforceProvidedFundScope. Mounted at the bare /api root (route self-defines the
  // relative /portfolio-overview path), mirroring the Docker routes.ts mount; without it
  // /api/portfolio-overview 404s in prod (live: /portfolio -> PortfolioTabs -> OverviewTab ->
  // usePortfolioOverview). Closes the parity 404 gap; does NOT by itself restore the prod client flow
  // (apiRequest sends cookies, not Bearer).
  app.use('/api', portfolioOverviewRouter);
  app.use('/api', portfolioLotsRouter);
  app.use(performanceApiRouter);
  app.use('/', varianceRouter);
  registerFundConfigRoutes(app);

  // Fund Allocation Management API (Phase 1b - Reserve allocations with optimistic locking)
  app.use('/api', allocationsRouter);
  app.use('/api', allocationScenariosRouter);
  app.use('/api', planningFmvOverridesRouter);
  app.use('/api', fundScenarioSetsRouter);
  app.use('/api', fundMoicRouter);
  // Timeline / time-travel API (#1036 burn-down). Mounted here so the
  // Vercel/makeApp surface matches the Docker routes.ts mount; without it the
  // client's /api/timeline calls 404 in prod. /events/latest self-gates with
  // requireAuth()+requireRole('admin') inside the router (cross-surface safe).
  app.use('/api/timeline', timelineRouter);
  // Shares API (#1036 burn-down). Mounted here so the Vercel/makeApp surface matches the Docker
  // routes.ts mount; without it /api/shares and /api/public/shares 404 in prod. Management
  // self-gates per-handler (requireAuthenticatedUser + canManageFund); the public routes stay
  // anonymous via isPublicApiPath (GET /public/shares/:id and POST /public/shares/:id/verify
  // bypass the global /api auth). Placed AFTER the global /api auth boundary.
  app.use('/api/shares', sharesRouter);
  app.use('/api/public/shares', publicSharesRouter);
  // Capital-allocation API (#1036 burn-down). Pure deterministic compute (no DB, no fund-scope,
  // no route-local auth) — protected only by the global /api auth boundary above. Mounted here so
  // the Vercel/makeApp surface matches the Docker routes.ts mount; without it /api/capital-allocation
  // 404s in prod. This closes the parity 404 gap; it does NOT by itself restore the prod client flow
  // (the client hook sends no Bearer token — see the handoff TODO).
  app.use('/api/capital-allocation', capitalAllocationRouter);
  // Liquidity API (#1036 burn-down). Pure deterministic compute (no DB, NOT fund-scoped, no
  // route-local auth) — protected only by the global /api auth boundary above. Mounted here so the
  // Vercel/makeApp surface matches the Docker routes.ts mount; without it /api/liquidity 404s in prod.
  // Closes the parity 404 gap; does NOT by itself restore the prod client flow (hook sends no Bearer).
  app.use('/api/liquidity', liquidityRouter);
  // Graduation API (#1036 burn-down). Pure deterministic compute (no DB, no fund-scope, no
  // route-local auth) — protected only by the global /api auth boundary above. Mounted here so the
  // Vercel/makeApp surface matches the Docker routes.ts mount; without it /api/graduation 404s in prod.
  // Closes the parity 404 gap; does NOT by itself restore the prod client flow (hook sends no Bearer).
  app.use('/api/graduation', graduationRouter);

  // Reallocation API (Phase 1b) - mounted at root; the router self-defines its
  // full /api/funds/:fundId/reallocation/* paths (mirrors the registerRoutes mount).
  app.use(reallocationRouter);

  // Cash-flow-events API (Candidate C, Phase 1) - mounted at root; the router
  // self-defines its full /api/funds/:fundId/cash-flow-events paths (mirrors reallocation).
  app.use(cashFlowEventsRouter);

  // Operating-object Tasks API (backend-first; minimal create/list) - mounted at
  // root; the router self-defines /api/funds/:fundId/tasks (mirrors cash-flow-events).
  app.use(operatingObjectTasksRouter);

  // Deal Pipeline API (Sprint 1 - Deal tracking, DD, scoring)
  app.use('/api/deals', dealPipelineRouter);

  // Cohort Analysis API (Advanced cohort analysis with sector/vintage normalization)
  app.use('/api/cohorts', cohortAnalysisRouter);

  // Sensitivity Analysis API (Phase 1A - one-way sweeps; fund-scoped)
  app.use('/api', sensitivityRouter);
  app.use(lpApiRouter);
  app.use(lpCapitalCallsRouter);
  app.use(lpDistributionsRouter);
  app.use('/api/lp', lpDocumentsRouter);
  app.use('/api/lp', lpNotificationsRouter);
  app.use(lpReportingImportsRouter);
  app.use(lpReportingMetricRunsRouter);

  // Backtesting API (Monte Carlo validation)
  app.use('/api/backtesting', backtestingRouter);

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
