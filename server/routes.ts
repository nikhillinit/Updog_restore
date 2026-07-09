import type { Express, Request, Response, NextFunction, Router } from 'express';
import type { RequestListener } from 'http';
import { createServer, type Server } from 'http';
import { registerFundConfigRoutes } from './routes/fund-config.js';
import { recordHttpMetrics } from './metrics';
import { monitor } from './middleware/performance-monitor.js';
import { registerCompletionHandlers } from './services/calc-run-completion-handlers.js';
import { varianceAlertAutomationService } from './services/variance-alert-automation.js';

type DefaultRouteModule = {
  default: Router;
};

type DefaultRouteMount = {
  mountPath?: string;
  load: () => Promise<DefaultRouteModule>;
};

async function mountDefaultRoute(app: Express, { mountPath, load }: DefaultRouteMount) {
  const routeModule = await load();

  if (mountPath === undefined) {
    app.use(routeModule.default);
    return;
  }

  app.use(mountPath, routeModule.default);
}

async function mountDefaultRoutes(app: Express, mounts: readonly DefaultRouteMount[]) {
  for (const mount of mounts) {
    await mountDefaultRoute(app, mount);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Wire calc-run completion automation and periodic alert scheduling.
  registerCompletionHandlers();
  varianceAlertAutomationService.start();

  // Performance monitoring middleware - track all API requests
  app.use('/api', monitor.middleware());

  // Fund routes
  await mountDefaultRoute(app, { mountPath: '/api', load: () => import('./routes/funds.js') });

  // Deal pipeline routes
  const dealPipelineRoutes = await import('./routes/deal-pipeline.js');
  app.use('/api/deals', dealPipelineRoutes.dealPipelineRouter);

  // Cohort Analysis routes
  await mountDefaultRoute(app, {
    mountPath: '/api/cohorts',
    load: () => import('./routes/cohort-analysis.js'),
  });

  // Feature flags routes
  const flagsRoutes = await import('./routes/flags.js');
  app.use('/api/flags', flagsRoutes.flagsRouter);

  await mountDefaultRoutes(app, [
    // Health and metrics routes
    { mountPath: '/', load: () => import('./routes/health.js') },
    { mountPath: '/api', load: () => import('./routes/dashboard-summary.js') },
    { mountPath: '/api', load: () => import('./routes/investments.js') },
    { mountPath: '/api', load: () => import('./routes/portfolio-companies.js') },
    { mountPath: '/api', load: () => import('./routes/portfolio-overview.js') },
    { mountPath: '/api', load: () => import('./routes/portfolio/lots.js') },
    { mountPath: '/api', load: () => import('./routes/allocation-scenarios.js') },
    { mountPath: '/api', load: () => import('./routes/planning-fmv-overrides.js') },
    { mountPath: '/api', load: () => import('./routes/fund-scenario-sets.js') },
    { mountPath: '/api', load: () => import('./routes/fund-actuals.js') },
    { mountPath: '/api', load: () => import('./routes/allocations.js') },
    { mountPath: '/api', load: () => import('./routes/activities.js') },
    { mountPath: '/api', load: () => import('./routes/fund-metrics-legacy.js') },
    { mountPath: '/api', load: () => import('./routes/engine-summaries.js') },
    // Operations polling routes
    { mountPath: '/', load: () => import('./routes/operations.js') },
    // Monte Carlo simulation routes
    { mountPath: '/api/monte-carlo', load: () => import('./routes/monte-carlo.js') },
    // Cache monitoring & management routes
    { mountPath: '/api/cache', load: () => import('./routes/cache.js') },
    // Backtesting routes (Monte Carlo validation)
    { mountPath: '/api/backtesting', load: () => import('./routes/backtesting.js') },
    { mountPath: '/api', load: () => import('./routes/sensitivity.js') },
    // Fund-scoped MOIC follow-on rankings (authenticated, fund-scoped)
    { mountPath: '/api', load: () => import('./routes/fund-moic.js') },
    // Graduation Rate Engine routes
    { mountPath: '/api/graduation', load: () => import('./routes/graduation.js') },
    // Capital Allocation Engine routes
    { mountPath: '/api/capital-allocation', load: () => import('./routes/capital-allocation.js') },
    // Liquidity Engine routes
    { mountPath: '/api/liquidity', load: () => import('./routes/liquidity.js') },
    // Performance monitoring routes
    { mountPath: '/api/performance', load: () => import('./routes/performance-metrics.js') },
    // Server-Sent Events (SSE) routes for real-time updates
    { mountPath: '/', load: () => import('./routes/sse-events.js') },
  ]);

  // Reallocation routes (Phase 1b)
  const reallocationRoutes = await import('./routes/reallocation.js');
  app.use(reallocationRoutes.default);

  // Unified Metrics Layer routes
  await mountDefaultRoute(app, { load: () => import('./routes/fund-metrics.js') });

  const dualForecastRoutes = await import('./routes/dual-forecast.js');
  app.use('/api', dualForecastRoutes.default);

  // Register before the LP/shares route groups below so requests that finish
  // inside those routers still reach recordHttpMetrics on response finish.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      // Express Route type has path property, but req.route may be undefined
      const route = req.route as { path?: string } | undefined;
      const routePath = route?.path ?? req.path ?? 'unknown';
      recordHttpMetrics(req.method || 'UNKNOWN', routePath, res.statusCode, duration);
    });

    next();
  });

  await mountDefaultRoutes(app, [
    // Performance Dashboard API routes (timeseries, breakdown, comparison)
    { load: () => import('./routes/performance-api.js') },
    // LP Reporting Dashboard API routes
    { load: () => import('./routes/lp-api.js') },
    // LP Reporting Dashboard health check routes
    { load: () => import('./routes/lp-health.js') },
    // LP dashboard widget routes
    { load: () => import('./routes/lp-capital-calls.js') },
    { load: () => import('./routes/lp-distributions.js') },
    { mountPath: '/api/lp', load: () => import('./routes/lp-documents.js') },
    { mountPath: '/api/lp', load: () => import('./routes/lp-notifications.js') },
    // LP Reporting workflow routes
    { load: () => import('./routes/lp-reporting/imports.js') },
    { load: () => import('./routes/lp-reporting/metric-runs.js') },
  ]);

  // Shares routes (fund sharing system)
  const sharesRoutes = await import('./routes/shares.js');
  app.use('/api/shares', sharesRoutes.sharesRouter);
  app.use('/api/public/shares', sharesRoutes.publicSharesRouter);

  // Dashboard, investments, portfolio companies, activities, legacy fund
  // metrics, and engine summary routes have been extracted into dedicated
  // modules.

  // Register fund configuration routes
  registerFundConfigRoutes(app);

  await mountDefaultRoutes(app, [
    // Register variance tracking routes
    { mountPath: '/', load: () => import('./routes/variance.js') },
    // Register timeline routes for event-sourced architecture
    { mountPath: '/api/timeline', load: () => import('./routes/timeline.js') },
  ]);

  // Admin routes for engine management (non-prod only)
  const { engineAdminRoutes } = await import('./routes/admin/engine.js');
  app.use('/api/admin/engine', engineAdminRoutes);

  // Portfolio Intelligence API routes (feature-flagged)
  // Routes use /api/portfolio/* prefix internally
  const { FEATURES } = await import('./config/features.js');
  if (FEATURES.portfolioIntelligence) {
    await mountDefaultRoute(app, { load: () => import('./routes/portfolio-intelligence.js') });
  }

  // Metrics & Observability routes (feature-flagged)
  if (FEATURES.metrics) {
    // Prometheus metrics endpoint (/metrics)
    const { metricsRouter } = await import('./routes/metrics-endpoint.js');
    app.use(metricsRouter);

    // Error budget reporting (/api/error-budget)
    await mountDefaultRoute(app, {
      mountPath: '/api/error-budget',
      load: () => import('./routes/error-budget.js'),
    });
  }

  // Development dashboard routes (development only)
  if (process.env['NODE_ENV'] === 'development') {
    await mountDefaultRoute(app, {
      mountPath: '/api/dev-dashboard',
      load: () => import('./routes/dev-dashboard.js'),
    });
  }

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'not_found',
      message: 'API route not found',
    });
  });

  // Express app is compatible with http.RequestListener
  const httpServer = createServer(app as unknown as RequestListener);

  // Setup WebSocket servers
  const { setupWebSocketServers } = await import('./websocket/index.js');
  setupWebSocketServers(httpServer);

  return httpServer;
}
