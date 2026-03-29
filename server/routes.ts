import type { Express, Request, Response, NextFunction } from 'express';
import type { RequestListener } from 'http';
import { createServer, type Server } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage';
import {
} from '@shared/schema';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';
import { generateCohortSummary } from '@shared/core/cohorts/CohortEngine';
import { registerFundConfigRoutes } from './routes/fund-config.js';
import { recordHttpMetrics } from './metrics';
import { toNumber } from '@shared/number';
import type {
  ReserveCompanyInput,
  PacingInput,
  CohortInput,
  ApiError,
  ReserveSummary,
  PacingSummary,
  CohortSummary,
} from '@shared/types';
import { monitor } from './middleware/performance-monitor.js';
import { getConfig } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Fund metrics routes - Type-safe parameter validation
  app['get']('/api/fund-metrics/:fundId', async (req: Request, res: Response) => {
    try {
      const fundIdParam = req.params['fundId'];
      const fundId = toNumber(fundIdParam, 'fund ID');

      if (fundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
        };
        return res['status'](400)['json'](error);
      }

      const metrics = await storage.getFundMetrics(fundId);
      res['json'](metrics);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch fund metrics',
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Portfolio company, activity, dashboard summary, and investment routes have
  // been extracted into dedicated modules.

  // Reserve Engine routes - Type-safe with comprehensive error handling
  app['get']('/api/reserves/:fundId', async (req: Request, res: Response) => {
    try {
      const fundIdParam = req.params['fundId'];
      const fundId = toNumber(fundIdParam, 'fund ID');

      if (fundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
        };
        return res['status'](400)['json'](error);
      }

      // Load portfolio fixture data
      const portfolioPath = join(__dirname, '../tests/fixtures/portfolio.json');

      // Type for portfolio fixture JSON structure
      interface PortfolioFixtureCompany {
        invested?: number;
        ownership?: number;
        stage?: string;
        sector?: string;
      }
      interface PortfolioFixtureData {
        companies: PortfolioFixtureCompany[];
      }

      let portfolioData: PortfolioFixtureData;

      try {
        const rawData: unknown = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
        // Validate basic structure
        if (
          !rawData ||
          typeof rawData !== 'object' ||
          !('companies' in rawData) ||
          !Array.isArray((rawData as PortfolioFixtureData).companies)
        ) {
          throw new Error('Invalid portfolio fixture format');
        }
        portfolioData = rawData as PortfolioFixtureData;
      } catch {
        const error: ApiError = {
          error: 'Portfolio data unavailable',
          message: 'Could not load portfolio fixture data',
        };
        return res['status'](500)['json'](error);
      }

      // Transform to ReserveCompanyInput format with validation
      const portfolio: ReserveCompanyInput[] = portfolioData.companies.map(
        (company: PortfolioFixtureCompany, index: number) => ({
          id: index + 1,
          invested: typeof company.invested === 'number' ? company.invested : 500000,
          ownership: typeof company.ownership === 'number' ? company.ownership : 0.15,
          stage: typeof company.stage === 'string' ? company.stage : 'Series A',
          sector: typeof company.sector === 'string' ? company.sector : 'Tech',
        })
      );

      // Generate comprehensive reserve summary
      const summary: ReserveSummary = generateReserveSummary(fundId, portfolio);

      res['json'](summary);
    } catch (error) {
      console.error('ReserveEngine error:', error);
      const apiError: ApiError = {
        error: 'Reserve engine processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { fundId: req.params['fundId'] },
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Pacing Engine routes - Type-safe with query parameter support
  app['get']('/api/pacing/summary', async (req: Request, res: Response) => {
    try {
      // Extract and validate query parameters
      const fundSizeParam = req.query['fundSize'] as string;
      const quarterParam = req.query['deploymentQuarter'] as string;
      const marketConditionParam = req.query['marketCondition'] as string;

      const pacingInput: PacingInput = {
        fundSize: fundSizeParam ? toNumber(fundSizeParam, 'fund size') : 50000000, // $50M default
        deploymentQuarter: quarterParam ? toNumber(quarterParam, 'deployment quarter') : 1, // Q1 default
        marketCondition: (marketConditionParam as 'bull' | 'bear' | 'neutral') || 'neutral',
      };

      // Validate market condition
      if (!['bull', 'bear', 'neutral'].includes(pacingInput.marketCondition)) {
        const error: ApiError = {
          error: 'Invalid market condition',
          message: `Market condition must be 'bull', 'bear', or 'neutral', received: ${marketConditionParam}`,
        };
        return res['status'](400)['json'](error);
      }

      // Generate comprehensive pacing summary
      const summary: PacingSummary = generatePacingSummary(pacingInput);

      res['json'](summary);
    } catch (error) {
      console.error('PacingEngine error:', error);
      const apiError: ApiError = {
        error: 'Pacing engine processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { query: req.query },
      };
      res['status'](500)['json'](apiError);
    }
  });

  // Cohort Engine routes - Type-safe vintage cohort analysis (SCAFFOLD)
  app['get']('/api/cohorts/analysis', async (req: Request, res: Response) => {
    try {
      // Extract and validate query parameters
      const fundIdQuery = req.query['fundId'];
      const vintageYearQuery = req.query['vintageYear'];
      const cohortSizeQuery = req.query['cohortSize'];

      let fundId = getConfig().DEFAULT_FUND_ID; // Default fund (from env config)
      let vintageYear = new Date().getFullYear() - 1; // Default to last year
      let cohortSize = 10; // Default cohort size

      if (fundIdQuery) {
        const parsedId = toNumber(fundIdQuery as string, 'fund ID');
        if (parsedId <= 0) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
          };
          return res['status'](400)['json'](error);
        }
        fundId = parsedId;
      }

      if (vintageYearQuery) {
        try {
          const parsedYear = toNumber(vintageYearQuery as string, 'vintage year');
          if (parsedYear < 2000 || parsedYear > 2030) {
            const error: ApiError = {
              error: 'Invalid vintage year',
              message: `Vintage year must be between 2000-2030, received: ${vintageYearQuery}`,
            };
            return res['status'](400)['json'](error);
          }
          vintageYear = parsedYear;
        } catch {
          const error: ApiError = {
            error: 'Invalid vintage year',
            message: `Vintage year must be a valid number, received: ${vintageYearQuery}`,
          };
          return res['status'](400)['json'](error);
        }
      }

      if (cohortSizeQuery) {
        try {
          const parsedSize = toNumber(cohortSizeQuery as string, 'cohort size');
          if (parsedSize <= 0 || parsedSize > 1000) {
            const error: ApiError = {
              error: 'Invalid cohort size',
              message: `Cohort size must be between 1-1000, received: ${cohortSizeQuery}`,
            };
            return res['status'](400)['json'](error);
          }
          cohortSize = parsedSize;
        } catch {
          const error: ApiError = {
            error: 'Invalid cohort size',
            message: `Cohort size must be a valid number, received: ${cohortSizeQuery}`,
          };
          return res['status'](400)['json'](error);
        }
      }

      const cohortInput: CohortInput = {
        fundId,
        vintageYear,
        cohortSize,
      };

      // Generate comprehensive cohort summary
      const summary: CohortSummary = generateCohortSummary(cohortInput);

      res['json'](summary);
    } catch (error) {
      console.error('CohortEngine error:', error);
      const apiError: ApiError = {
        error: 'Cohort analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: {
          query: req.query,
          note: 'This is a scaffolded endpoint for future cohort analysis features',
        },
      };
      res['status'](500)['json'](apiError);
    }
  });

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
