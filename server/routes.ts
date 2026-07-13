import type { Express, Request, Response, NextFunction, Router } from 'express';
import type { RequestListener } from 'http';
import { createServer, type Server } from 'http';
import { mountCommonRoutes } from './routes/mount-common-routes.js';
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

  mountCommonRoutes(app, { surface: 'register_routes', group: 'pre_deal' });
  mountCommonRoutes(app, { surface: 'register_routes', group: 'pre_health' });

  await mountDefaultRoute(app, { mountPath: '/', load: () => import('./routes/health.js') });

  mountCommonRoutes(app, { surface: 'register_routes', group: 'post_health' });

  await mountDefaultRoutes(app, [
    { mountPath: '/api', load: () => import('./routes/activities.js') },
    { mountPath: '/api', load: () => import('./routes/fund-metrics-legacy.js') },
    { mountPath: '/api', load: () => import('./routes/engine-summaries.js') },
    // Operations polling routes
    { mountPath: '/', load: () => import('./routes/operations.js') },
    // Monte Carlo simulation routes
    { mountPath: '/api/monte-carlo', load: () => import('./routes/monte-carlo.js') },
    // Cache monitoring & management routes
    { mountPath: '/api/cache', load: () => import('./routes/cache.js') },
  ]);

  mountCommonRoutes(app, { surface: 'register_routes', group: 'post_cache' });

  await mountDefaultRoutes(app, [
    // Performance monitoring routes
    { mountPath: '/api/performance', load: () => import('./routes/performance-metrics.js') },
    // Server-Sent Events (SSE) routes for real-time updates
    { mountPath: '/', load: () => import('./routes/sse-events.js') },
  ]);

  mountCommonRoutes(app, { surface: 'register_routes', group: 'post_runtime' });

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

  mountCommonRoutes(app, { surface: 'register_routes', group: 'post_response_metrics' });

  await mountDefaultRoutes(app, [
    // LP Reporting Dashboard health check routes
    { load: () => import('./routes/lp-health.js') },
  ]);

  mountCommonRoutes(app, { surface: 'register_routes', group: 'post_lp_health' });

  // Dashboard, investments, portfolio companies, activities, legacy fund
  // metrics, and engine summary routes have been extracted into dedicated
  // modules.

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
