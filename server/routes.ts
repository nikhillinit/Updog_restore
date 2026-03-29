import type { Express, Request, Response, NextFunction } from 'express';
import type { RequestListener } from 'http';
import { createServer, type Server } from 'http';
import { registerFundConfigRoutes } from './routes/fund-config.js';
import { recordHttpMetrics } from './metrics';
import { monitor } from './middleware/performance-monitor.js';

export async function registerRoutes(app: Express): Promise<Server> {
  // Performance monitoring middleware - track all API requests
  app.use('/api', monitor.middleware());

  // Fund routes
  const fundRoutes = await import('./routes/funds.js');
  app.use('/api', fundRoutes.default);

  // Feature flags routes
  const flagsRoutes = await import('./routes/flags.js');
  app.use('/api/flags', flagsRoutes.flagsRouter);

  // Health and metrics routes
  const healthRoutes = await import('./routes/health.js');
  app.use('/', healthRoutes.default);

  const dashboardSummaryRoutes = await import('./routes/dashboard-summary.js');
  app.use('/api', dashboardSummaryRoutes.default);

  const investmentsRoutes = await import('./routes/investments.js');
  app.use('/api', investmentsRoutes.default);

  const portfolioCompaniesRoutes = await import('./routes/portfolio-companies.js');
  app.use('/api', portfolioCompaniesRoutes.default);

  const activitiesRoutes = await import('./routes/activities.js');
  app.use('/api', activitiesRoutes.default);

  const legacyFundMetricsRoutes = await import('./routes/fund-metrics-legacy.js');
  app.use('/api', legacyFundMetricsRoutes.default);

  const engineSummaryRoutes = await import('./routes/engine-summaries.js');
  app.use('/api', engineSummaryRoutes.default);

  // Operations polling routes
  const operationsRoutes = await import('./routes/operations.js');
  app.use('/', operationsRoutes.default);

  // Monte Carlo simulation routes
  const monteCarloRoutes = await import('./routes/monte-carlo.js');
  app.use('/api/monte-carlo', monteCarloRoutes.default);

  // Cache monitoring & management routes
  const cacheRoutes = await import('./routes/cache.js');
  app.use('/api/cache', cacheRoutes.default);

  // Backtesting routes (Monte Carlo validation)
  const backtestingRoutes = await import('./routes/backtesting.js');
  app.use('/api/backtesting', backtestingRoutes.default);

  // MOIC Calculator routes
  const moicRoutes = await import('./routes/moic.js');
  app.use('/api/moic', moicRoutes.default);

  // Graduation Rate Engine routes
  const graduationRoutes = await import('./routes/graduation.js');
  app.use('/api/graduation', graduationRoutes.default);

  // Capital Allocation Engine routes
  const capitalAllocationRoutes = await import('./routes/capital-allocation.js');
  app.use('/api/capital-allocation', capitalAllocationRoutes.default);

  // Liquidity Engine routes
  const liquidityRoutes = await import('./routes/liquidity.js');
  app.use('/api/liquidity', liquidityRoutes.default);

  // Performance monitoring routes
  const performanceRoutes = await import('./routes/performance-metrics.js');
  app.use('/api/performance', performanceRoutes.default);

  // Server-Sent Events (SSE) routes for real-time updates
  const sseRoutes = await import('./routes/sse-events.js');
  app.use('/', sseRoutes.default);

  // Reallocation routes (Phase 1b)
  const reallocationRoutes = await import('./routes/reallocation.js');
  app.use(reallocationRoutes.default);

  // Unified Metrics Layer routes
  const fundMetricsRoutes = await import('./routes/fund-metrics.js');
  app.use(fundMetricsRoutes.default);

  // Performance Dashboard API routes (timeseries, breakdown, comparison)
  const performanceApiRoutes = await import('./routes/performance-api.js');
  app.use(performanceApiRoutes.default);

  // LP Reporting Dashboard API routes
  const lpApiRoutes = await import('./routes/lp-api.js');
  app.use(lpApiRoutes.default);

  // LP Reporting Dashboard health check routes
  const lpHealthRoutes = await import('./routes/lp-health.js');
  app.use(lpHealthRoutes.default);

  // Shares routes (fund sharing system)
  const sharesRoutes = await import('./routes/shares.js');
  app.use('/api/shares', sharesRoutes.sharesRouter);

  // Middleware to record HTTP metrics
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res['on']('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      // Express Route type has path property, but req.route may be undefined
      const route = req.route as { path?: string } | undefined;
      const routePath = route?.path ?? req.path ?? 'unknown';
      recordHttpMetrics(req.method || 'UNKNOWN', routePath, res.statusCode, duration);
    });

    next();
  });

  // Dashboard, investments, portfolio companies, activities, legacy fund
  // metrics, and engine summary routes have been extracted into dedicated
  // modules.

  // Register fund configuration routes
  registerFundConfigRoutes(app);

  // Register variance tracking routes
  const varianceRouter = await import('./routes/variance.js');
  app.use('/', varianceRouter.default);

  // Register timeline routes for event-sourced architecture
  const timelineRouter = await import('./routes/timeline.js');
  app.use('/api/timeline', timelineRouter.default);

  // Admin routes for engine management (non-prod only)
  const { engineAdminRoutes } = await import('./routes/admin/engine.js');
  app.use('/api/admin/engine', engineAdminRoutes);

  // Portfolio Intelligence API routes (feature-flagged)
  // Routes use /api/portfolio/* prefix internally
  const { FEATURES } = await import('./config/features.js');
  if (FEATURES.queueDashboard) {
    const queueDashboardRoutes = await import('./routes/admin/queue-dashboard.js');
    app.use('/api/admin/queues', queueDashboardRoutes.default);
  }

  if (FEATURES.portfolioIntelligence) {
    const portfolioIntelligenceRoutes = await import('./routes/portfolio-intelligence.js');
    app.use(portfolioIntelligenceRoutes.default);
  }

  // Scenario Comparison Tool routes (feature-flagged via ENABLE_SCENARIO_COMPARISON)
  const scenarioComparisonRoutes = await import('./routes/scenario-comparison.js');
  app.use(scenarioComparisonRoutes.default);

  // Metrics & Observability routes (feature-flagged)
  if (FEATURES.metrics) {
    // Prometheus metrics endpoint (/metrics)
    const { metricsRouter } = await import('./routes/metrics-endpoint.js');
    app.use(metricsRouter);

    // Error budget reporting (/api/error-budget)
    const errorBudgetRoutes = await import('./routes/error-budget.js');
    app.use('/api/error-budget', errorBudgetRoutes.default);
  }

  // Development dashboard routes (development only)
  if (process.env['NODE_ENV'] === 'development') {
    const devDashboardRoutes = await import('./routes/dev-dashboard.js');
    app.use('/api/dev-dashboard', devDashboardRoutes.default);
  }

  // Express app is compatible with http.RequestListener
  const httpServer = createServer(app as unknown as RequestListener);

  // Setup WebSocket servers
  const { setupWebSocketServers } = await import('./websocket/index.js');
  setupWebSocketServers(httpServer);

  return httpServer;
}
