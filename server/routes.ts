import type { Express } from "express";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { storage } from "./storage";
import { insertFundSchema, insertPortfolioCompanySchema, insertActivitySchema } from "@shared/schema";
import { fundSchema } from "./validators/fundSchema";
import { ReserveEngine, generateReserveSummary } from "../client/src/core/reserves/ReserveEngine.js";
import { PacingEngine, generatePacingSummary } from "../client/src/core/pacing/PacingEngine.js";
import { CohortEngine, generateCohortSummary } from "../client/src/core/cohorts/CohortEngine.js";
import { registerFundConfigRoutes } from "./routes/fund-config.js";
import { healthCheck, readinessCheck, livenessCheck } from "./health";
import { register as metricsRegister, recordHttpMetrics } from "./metrics";
import type { ReserveInput, PacingInput, CohortInput, ApiError, ReserveSummary, PacingSummary, CohortSummary } from "@shared/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check and metrics routes
  app.get("/api/health", healthCheck);
  app.get("/api/health/ready", readinessCheck);
  app.get("/api/health/live", livenessCheck);
  app.get("/metrics", async (req, res) => {
    try {
      res.set('Content-Type', metricsRegister.contentType);
      const metrics = await metricsRegister.metrics();
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error generating metrics');
    }
  });

  // Middleware to record HTTP metrics
  app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      recordHttpMetrics(req.method, req.route?.path || req.path, res.statusCode, duration);
    });
    
    next();
  });
  
  // Fund routes - Type-safe error responses
  app.get("/api/funds", async (req, res) => {
    try {
      const funds = await storage.getAllFunds();
      res.json(funds);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch funds'
      };
      res.status(500).json(apiError);
    }
  });

  app.get("/api/funds/:id", async (req, res) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(idParam, 10);
      
      if (isNaN(id) || id <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${idParam}`
        };
        return res.status(400).json(error);
      }
      
      const fund = await storage.getFund(id);
      if (!fund) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${id}`
        };
        return res.status(404).json(error);
      }
      res.json(fund);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch fund'
      };
      res.status(500).json(apiError);
    }
  });

  app.post("/api/funds", async (req, res) => {
    try {
      // For now, validate only the basic fund fields that can be stored
      // TODO: Add support for storing investment strategy, exit recycling, and waterfall
      const basicFundSchema = z.object({
        name: z.string().min(1),
        size: z.number().positive(),
        deployedCapital: z.number().nonnegative().optional(),
        managementFee: z.number().min(0).max(1),
        carryPercentage: z.number().min(0).max(1),
        vintageYear: z.number().int().min(2000).max(2030)
      });
      
      const result = basicFundSchema.safeParse(req.body);
      if (!result.success) {
        const error: ApiError = {
          error: 'Invalid fund data',
          message: 'Fund validation failed',
          details: { validationErrors: result.error.issues }
        };
        return res.status(400).json(error);
      }
      
      // Convert to format expected by storage layer
      const basicFundData = {
        name: result.data.name,
        size: result.data.size,
        deployedCapital: result.data.deployedCapital || 0,
        managementFee: result.data.managementFee,
        carryPercentage: result.data.carryPercentage,
        vintageYear: result.data.vintageYear,
        status: 'active'
      };
      
      const fund = await storage.createFund(basicFundData);
      res.status(201).json(fund);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to create fund'
      };
      res.status(500).json(apiError);
    }
  });

  // Portfolio company routes - Type-safe with query validation
  app.get("/api/portfolio-companies", async (req, res) => {
    try {
      const fundIdQuery = req.query.fundId;
      let fundId: number | undefined = undefined;
      
      if (fundIdQuery) {
        const parsedId = parseInt(fundIdQuery as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          const error: ApiError = {
            error: 'Invalid fund ID query',
            message: `Fund ID must be a positive integer, received: ${fundIdQuery}`
          };
          return res.status(400).json(error);
        }
        fundId = parsedId;
      }
      
      const companies = await storage.getPortfolioCompanies(fundId);
      res.json(companies);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch portfolio companies'
      };
      res.status(500).json(apiError);
    }
  });

  app.get("/api/portfolio-companies/:id", async (req, res) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(idParam, 10);
      
      if (isNaN(id) || id <= 0) {
        const error: ApiError = {
          error: 'Invalid company ID',
          message: `Company ID must be a positive integer, received: ${idParam}`
        };
        return res.status(400).json(error);
      }
      
      const company = await storage.getPortfolioCompany(id);
      if (!company) {
        const error: ApiError = {
          error: 'Company not found',
          message: `No portfolio company exists with ID: ${id}`
        };
        return res.status(404).json(error);
      }
      res.json(company);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch portfolio company'
      };
      res.status(500).json(apiError);
    }
  });

  app.post("/api/portfolio-companies", async (req, res) => {
    try {
      const result = insertPortfolioCompanySchema.safeParse(req.body);
      if (!result.success) {
        const error: ApiError = {
          error: 'Invalid company data',
          message: 'Portfolio company validation failed',
          details: { validationErrors: result.error.issues }
        };
        return res.status(400).json(error);
      }
      const company = await storage.createPortfolioCompany(result.data);
      res.status(201).json(company);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to create portfolio company'
      };
      res.status(500).json(apiError);
    }
  });

  // Fund metrics routes - Type-safe parameter validation
  app.get("/api/fund-metrics/:fundId", async (req, res) => {
    try {
      const fundIdParam = req.params.fundId;
      const fundId = parseInt(fundIdParam, 10);
      
      if (isNaN(fundId) || fundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`
        };
        return res.status(400).json(error);
      }
      
      const metrics = await storage.getFundMetrics(fundId);
      res.json(metrics);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch fund metrics'
      };
      res.status(500).json(apiError);
    }
  });

  // Activity routes - Type-safe query parameter handling
  app.get("/api/activities", async (req, res) => {
    try {
      const fundIdQuery = req.query.fundId;
      let fundId: number | undefined = undefined;
      
      if (fundIdQuery) {
        const parsedId = parseInt(fundIdQuery as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          const error: ApiError = {
            error: 'Invalid fund ID query',
            message: `Fund ID must be a positive integer, received: ${fundIdQuery}`
          };
          return res.status(400).json(error);
        }
        fundId = parsedId;
      }
      
      const activities = await storage.getActivities(fundId);
      res.json(activities.sort((a, b) => b.activityDate.getTime() - a.activityDate.getTime()));
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch activities'
      };
      res.status(500).json(apiError);
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const result = insertActivitySchema.safeParse(req.body);
      if (!result.success) {
        const error: ApiError = {
          error: 'Invalid activity data',
          message: 'Activity validation failed',
          details: { validationErrors: result.error.issues }
        };
        return res.status(400).json(error);
      }
      const activity = await storage.createActivity(result.data);
      res.status(201).json(activity);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to create activity'
      };
      res.status(500).json(apiError);
    }
  });

  // Dashboard summary route - Type-safe with comprehensive validation
  app.get("/api/dashboard-summary/:fundId", async (req, res) => {
    try {
      const fundIdParam = req.params.fundId;
      const fundId = parseInt(fundIdParam, 10);
      
      if (isNaN(fundId) || fundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`
        };
        return res.status(400).json(error);
      }
      
      const [fund, portfolioCompanies, activities, metrics] = await Promise.all([
        storage.getFund(fundId),
        storage.getPortfolioCompanies(fundId),
        storage.getActivities(fundId),
        storage.getFundMetrics(fundId),
      ]);

      if (!fund) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`
        };
        return res.status(404).json(error);
      }

      const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;
      const recentActivities = activities.slice(0, 5);

      // Type-safe summary calculation
      const fundSize = parseFloat(fund.size || "0");
      const deployedCapital = parseFloat(fund.deployedCapital || "0");
      const currentIRR = latestMetrics ? parseFloat(latestMetrics.irr || "0") * 100 : 0;
      
      const dashboardSummary = {
        fund,
        portfolioCompanies,
        recentActivities,
        metrics: latestMetrics,
        summary: {
          totalCompanies: portfolioCompanies.length,
          deploymentRate: fundSize !== 0 ? (deployedCapital / fundSize) * 100 : 0,
          currentIRR,
        }
      };
      
      res.json(dashboardSummary);
    } catch (error) {
      console.error('Dashboard summary error:', error);
      const apiError: ApiError = {
        error: 'Dashboard data processing failed',
        message: error instanceof Error ? error.message : 'Failed to fetch dashboard summary',
        details: { fundId: req.params.fundId }
      };
      res.status(500).json(apiError);
    }
  });

  // Investment routes - Type-safe with query validation
  app.get("/api/investments", async (req, res) => {
    try {
      const fundIdQuery = req.query.fundId;
      let fundId: number | undefined = undefined;
      
      if (fundIdQuery) {
        const parsedId = parseInt(fundIdQuery as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          const error: ApiError = {
            error: 'Invalid fund ID query',
            message: `Fund ID must be a positive integer, received: ${fundIdQuery}`
          };
          return res.status(400).json(error);
        }
        fundId = parsedId;
      }
      
      const investments = await storage.getInvestments(fundId);
      res.json(investments);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch investments'
      };
      res.status(500).json(apiError);
    }
  });

  app.get("/api/investments/:id", async (req, res) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(idParam, 10);
      
      if (isNaN(id) || id <= 0) {
        const error: ApiError = {
          error: 'Invalid investment ID',
          message: `Investment ID must be a positive integer, received: ${idParam}`
        };
        return res.status(400).json(error);
      }
      
      const investment = await storage.getInvestment(id);
      if (!investment) {
        const error: ApiError = {
          error: 'Investment not found',
          message: `No investment exists with ID: ${id}`
        };
        return res.status(404).json(error);
      }
      res.json(investment);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch investment'
      };
      res.status(500).json(apiError);
    }
  });

  app.post("/api/investments", async (req, res) => {
    try {
      // Note: Investment schema validation should be added here
      // For now, trust storage layer to handle validation
      if (!req.body || Object.keys(req.body).length === 0) {
        const error: ApiError = {
          error: 'Invalid investment data',
          message: 'Request body cannot be empty'
        };
        return res.status(400).json(error);
      }
      
      const investment = await storage.createInvestment(req.body);
      res.status(201).json(investment);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to create investment'
      };
      res.status(500).json(apiError);
    }
  });

  // Investment rounds routes - Type-safe parameter validation
  app.post("/api/investments/:id/rounds", async (req, res) => {
    try {
      const idParam = req.params.id;
      const investmentId = parseInt(idParam, 10);
      
      if (isNaN(investmentId) || investmentId <= 0) {
        const error: ApiError = {
          error: 'Invalid investment ID',
          message: `Investment ID must be a positive integer, received: ${idParam}`
        };
        return res.status(400).json(error);
      }
      
      if (!req.body || Object.keys(req.body).length === 0) {
        const error: ApiError = {
          error: 'Invalid round data',
          message: 'Request body cannot be empty'
        };
        return res.status(400).json(error);
      }
      
      const round = await storage.addInvestmentRound(investmentId, req.body);
      res.status(201).json(round);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to add investment round'
      };
      res.status(500).json(apiError);
    }
  });

  // Performance cases routes - Type-safe parameter validation
  app.post("/api/investments/:id/cases", async (req, res) => {
    try {
      const idParam = req.params.id;
      const investmentId = parseInt(idParam, 10);
      
      if (isNaN(investmentId) || investmentId <= 0) {
        const error: ApiError = {
          error: 'Invalid investment ID',
          message: `Investment ID must be a positive integer, received: ${idParam}`
        };
        return res.status(400).json(error);
      }
      
      if (!req.body || Object.keys(req.body).length === 0) {
        const error: ApiError = {
          error: 'Invalid case data',
          message: 'Request body cannot be empty'
        };
        return res.status(400).json(error);
      }
      
      const performanceCase = await storage.addPerformanceCase(investmentId, req.body);
      res.status(201).json(performanceCase);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to add performance case'
      };
      res.status(500).json(apiError);
    }
  });

  // Reserve Engine routes - Type-safe with comprehensive error handling
  app.get("/api/reserves/:fundId", async (req, res) => {
    try {
      const fundIdParam = req.params.fundId;
      const fundId = parseInt(fundIdParam, 10);
      
      if (isNaN(fundId) || fundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`
        };
        return res.status(400).json(error);
      }
      
      // Load portfolio fixture data
      const portfolioPath = join(__dirname, '../tests/fixtures/portfolio.json');
      let portfolioData: any;
      
      try {
        portfolioData = JSON.parse(readFileSync(portfolioPath, 'utf-8'));
      } catch (fileError) {
        const error: ApiError = {
          error: 'Portfolio data unavailable',
          message: 'Could not load portfolio fixture data'
        };
        return res.status(500).json(error);
      }
      
      // Transform to ReserveInput format with validation
      const portfolio: ReserveInput[] = portfolioData.companies.map((company: any, index: number) => ({
        id: index + 1,
        invested: typeof company.invested === 'number' ? company.invested : 500000,
        ownership: typeof company.ownership === 'number' ? company.ownership : 0.15,
        stage: typeof company.stage === 'string' ? company.stage : 'Series A',
        sector: typeof company.sector === 'string' ? company.sector : 'Tech'
      }));
      
      // Generate comprehensive reserve summary
      const summary: ReserveSummary = generateReserveSummary(fundId, portfolio);
      
      res.json(summary);
    } catch (error) {
      console.error('ReserveEngine error:', error);
      const apiError: ApiError = {
        error: 'Reserve engine processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { fundId: req.params.fundId }
      };
      res.status(500).json(apiError);
    }
  });

  // Pacing Engine routes - Type-safe with query parameter support
  app.get("/api/pacing/summary", async (req, res) => {
    try {
      // Extract and validate query parameters
      const fundSizeParam = req.query.fundSize as string;
      const quarterParam = req.query.deploymentQuarter as string;
      const marketConditionParam = req.query.marketCondition as string;
      
      const pacingInput: PacingInput = {
        fundSize: fundSizeParam ? parseInt(fundSizeParam, 10) : 50000000, // $50M default
        deploymentQuarter: quarterParam ? parseInt(quarterParam, 10) : 1, // Q1 default
        marketCondition: (marketConditionParam as 'bull' | 'bear' | 'neutral') || 'neutral'
      };
      
      // Validate market condition
      if (!['bull', 'bear', 'neutral'].includes(pacingInput.marketCondition)) {
        const error: ApiError = {
          error: 'Invalid market condition',
          message: `Market condition must be 'bull', 'bear', or 'neutral', received: ${marketConditionParam}`
        };
        return res.status(400).json(error);
      }
      
      // Generate comprehensive pacing summary
      const summary: PacingSummary = generatePacingSummary(pacingInput);
      
      res.json(summary);
    } catch (error) {
      console.error('PacingEngine error:', error);
      const apiError: ApiError = {
        error: 'Pacing engine processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { query: req.query }
      };
      res.status(500).json(apiError);
    }
  });

  // Cohort Engine routes - Type-safe vintage cohort analysis (SCAFFOLD)
  app.get("/api/cohorts/analysis", async (req, res) => {
    try {
      // Extract and validate query parameters
      const fundIdQuery = req.query.fundId;
      const vintageYearQuery = req.query.vintageYear;
      const cohortSizeQuery = req.query.cohortSize;
      
      let fundId = 1; // Default fund
      let vintageYear = new Date().getFullYear() - 1; // Default to last year
      let cohortSize = 10; // Default cohort size
      
      if (fundIdQuery) {
        const parsedId = parseInt(fundIdQuery as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: `Fund ID must be a positive integer, received: ${fundIdQuery}`
          };
          return res.status(400).json(error);
        }
        fundId = parsedId;
      }
      
      if (vintageYearQuery) {
        const parsedYear = parseInt(vintageYearQuery as string, 10);
        if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2030) {
          const error: ApiError = {
            error: 'Invalid vintage year',
            message: `Vintage year must be between 2000-2030, received: ${vintageYearQuery}`
          };
          return res.status(400).json(error);
        }
        vintageYear = parsedYear;
      }
      
      if (cohortSizeQuery) {
        const parsedSize = parseInt(cohortSizeQuery as string, 10);
        if (isNaN(parsedSize) || parsedSize <= 0 || parsedSize > 1000) {
          const error: ApiError = {
            error: 'Invalid cohort size',
            message: `Cohort size must be between 1-1000, received: ${cohortSizeQuery}`
          };
          return res.status(400).json(error);
        }
        cohortSize = parsedSize;
      }
      
      const cohortInput: CohortInput = {
        fundId,
        vintageYear,
        cohortSize
      };
      
      // Generate comprehensive cohort summary
      const summary: CohortSummary = generateCohortSummary(cohortInput);
      
      res.json(summary);
    } catch (error) {
      console.error('CohortEngine error:', error);
      const apiError: ApiError = {
        error: 'Cohort analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { 
          query: req.query,
          note: 'This is a scaffolded endpoint for future cohort analysis features'
        }
      };
      res.status(500).json(apiError);
    }
  });

  // Register fund configuration routes
  registerFundConfigRoutes(app);

  // Register timeline routes for event-sourced architecture
  const timelineRouter = await import('./routes/timeline.js');
  app.use('/api/timeline', timelineRouter.default);

  const httpServer = createServer(app);
  return httpServer;
}
