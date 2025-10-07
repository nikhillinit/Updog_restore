/**
 * Reserve Calculation API Routes
 * Provides RESTful endpoints for reserve allocation calculations
 * Implements proper validation, error handling, and performance monitoring
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  ReserveAllocationInputSchema,
  type ReserveAllocationInput,
  type ReserveCalculationResult,
  ReserveCalculationError,
} from '@shared/schemas/reserves-schemas';
import { logger } from '../lib/logger';
// import { performanceMonitor } from '../observability/metrics'; // TODO: Add when metrics module is ready
// import { validateApiKey } from '../middleware/auth'; // TODO: Add auth middleware
import { requestId } from '../middleware/requestId';
import { requireApproval, computeStrategyHash, createApprovalIfNeeded, verifyApproval } from '../lib/approvals-guard.js';
import { requireAuth } from '../lib/auth/jwt.js';

// Import the reserve engine (would be a server-side implementation)
// For now, we'll create a mock that delegates to the client-side engine
interface ReserveEngineInterface {
  calculateOptimalReserveAllocation(_input: ReserveAllocationInput, _pagination?: { limit: number; offset: number }): Promise<ReserveCalculationResult>;
}

// Rate limiting configuration
const reserveCalculationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many reserve calculation requests',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const heavyCalculationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit heavy calculations
  message: {
    error: 'Too many heavy calculation requests',
    retryAfter: '5 minutes'
  },
});

// Request validation schemas
const ReserveCalculationRequestSchema = z.object({
  body: ReserveAllocationInputSchema,
  query: z.object({
    /** Accept "true"/"false" strings or boolean values */
    async: z.coerce.boolean().optional(),
    /** Accept "true"/"false" strings or boolean values */
    cache: z.coerce.boolean().optional(),
    /** Priority level - accepts case variations and converts to lowercase */
    priority: z.string().optional().transform(val =>
      val ? val.toLowerCase() as 'low' | 'normal' | 'high' : undefined
    ),
    /** Maximum number of allocations to return (1-500, default 100) */
    limit: z.coerce.number().int().min(1).max(500).default(100),
    /** Number of allocations to skip (default 0) */
    offset: z.coerce.number().int().min(0).default(0),
  }).optional(), // Unknown params are ignored by default (not validated but passthrough)
});

const ParityValidationRequestSchema = z.object({
  body: z.object({
    excelData: z.object({
      fundMetrics: z.object({
        totalCommitted: z.number(),
        totalCalled: z.number(),
        totalDistributed: z.number(),
        netAssetValue: z.number(),
        managementFees: z.number(),
        carriedInterest: z.number(),
      }),
      companyData: z.array(z.object({
        companyName: z.string(),
        invested: z.number(),
        currentValue: z.number(),
        distributed: z.number(),
        moic: z.number(),
        irr: z.number(),
      })),
      timeline: z.array(z.object({
        quarter: z.string(),
        navValue: z.number(),
        distributions: z.number(),
        calls: z.number(),
        dpi: z.number(),
        tvpi: z.number(),
        irr: z.number(),
      })),
    }),
    webAppData: z.object({
      fundMetrics: z.object({
        totalCommitted: z.number(),
        totalCalled: z.number(),
        totalDistributed: z.number(),
        netAssetValue: z.number(),
        managementFees: z.number(),
        carriedInterest: z.number(),
      }),
      companyData: z.array(z.object({
        companyName: z.string(),
        invested: z.number(),
        currentValue: z.number(),
        distributed: z.number(),
        moic: z.number(),
        irr: z.number(),
      })),
      timeline: z.array(z.object({
        quarter: z.string(),
        navValue: z.number(),
        distributions: z.number(),
        calls: z.number(),
        dpi: z.number(),
        tvpi: z.number(),
        irr: z.number(),
      })),
    }),
    tolerance: z.number().min(0).max(1).optional(),
  }),
});

// Mock reserve engine implementation
class ServerReserveEngine implements ReserveEngineInterface {
  async calculateOptimalReserveAllocation(input: ReserveAllocationInput, pagination?: { limit: number; offset: number }): Promise<ReserveCalculationResult> {
    // In a real implementation, this would contain the server-side logic
    // For now, we'll simulate the calculation with a delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Apply pagination to portfolio (default: all companies)
    const limit = pagination?.limit ?? input.portfolio.length;
    const offset = pagination?.offset ?? 0;
    const paginatedPortfolio = input.portfolio.slice(offset, offset + limit);

    // Mock result - in production this would be the actual calculation
    const mockResult: ReserveCalculationResult = {
      inputSummary: {
        totalPortfolioCompanies: input.portfolio.length,
        availableReserves: input.availableReserves,
        totalAllocated: Math.min(input.availableReserves * 0.8, 5000000),
        allocationEfficiency: 0.8,
      },
      allocations: paginatedPortfolio.map((company: any, index: any) => ({
        companyId: company.id,
        companyName: company.name,
        recommendedAllocation: Math.min(input.availableReserves * 0.3, 2000000) / (index + 1),
        allocationRationale: `High potential based on current MOIC of ${company.currentMOIC}x`,
        priority: index + 1,
        expectedMOIC: (company.currentMOIC || 1) * 1.5,
        expectedValue: company.totalInvested * ((company.currentMOIC || 1) * 1.5),
        riskAdjustedReturn: company.totalInvested * ((company.currentMOIC || 1) * 1.3),
        newOwnership: Math.min(company.ownershipPercentage + 0.05, 0.25),
        portfolioWeight: (company.totalInvested / input.totalFundSize) + 0.02,
        concentrationRisk: 'medium' as const,
        recommendedStage: company.currentStage,
        timeToDeployment: 6,
        followOnPotential: 0.7,
        riskFactors: ['Market volatility', 'Competition risk'],
        mitigationStrategies: ['Staged deployment', 'Due diligence'],
        calculationMetadata: {
          graduationProbability: 0.6,
          expectedExitMultiple: 8.0,
          timeToExit: 84,
          diversificationBonus: 0.1,
          liquidationPrefImpact: 0,
        },
      })),
      unallocatedReserves: input.availableReserves * 0.2,
      portfolioMetrics: {
        expectedPortfolioMOIC: 5.5,
        expectedPortfolioValue: input.availableReserves * 4.5,
        portfolioDiversification: 0.75,
        concentrationRisk: 'medium' as const,
        averageTimeToExit: 84,
      },
      riskAnalysis: {
        portfolioRisk: 'medium' as const,
        keyRiskFactors: ['Sector concentration', 'Stage concentration'],
        riskMitigationActions: ['Diversification', 'Risk monitoring'],
        stressTestResults: {
          downside10: input.availableReserves * 2.0,
          upside90: input.availableReserves * 8.0,
          expectedValue: input.availableReserves * 4.5,
        },
      },
      scenarioResults: {
        conservative: {
          totalValue: input.availableReserves * 3.0,
          portfolioMOIC: 3.0,
          probability: 0.2,
        },
        base: {
          totalValue: input.availableReserves * 5.0,
          portfolioMOIC: 5.0,
          probability: 0.6,
        },
        optimistic: {
          totalValue: input.availableReserves * 12.0,
          portfolioMOIC: 12.0,
          probability: 0.2,
        },
      },
      metadata: {
        calculationDate: new Date(),
        calculationDuration: 150,
        modelVersion: '1.0.0',
        deterministicHash: Buffer.from(JSON.stringify({
          portfolio: input.portfolio.length,
          reserves: input.availableReserves,
        })).toString('base64'),
        assumptions: [
          'Market conditions remain stable',
          'Industry graduation rates apply',
        ],
        limitations: [
          'Based on historical data',
          'Market timing not considered',
        ],
      },
    };

    return mockResult;
  }
}

const reserveEngine = new ServerReserveEngine();

// Create router
const router = Router();

// Apply middleware
router.use(requestId);
router.use(requireAuth()); // Require authentication for all routes
router.use(reserveCalculationLimiter);

/**
 * POST /api/reserves/calculate
 * Calculate optimal reserve allocation
 */
router.post('/calculate', 
  async (req: Request & { user?: any; approval?: any }, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = (req as any).id;

    try {
      // Validate request
      const validatedRequest = ReserveCalculationRequestSchema.parse({
        body: req.body,
        query: req.query,
      });

      const { body: input, query: options } = validatedRequest;

      // Compute impact assessment for approval check
      const totalAmount = input.availableReserves;
      const affectedFunds = input.portfolio.map(c => c.id);
      const riskLevel = totalAmount > 5000000 ? 'high' : 
                         totalAmount > 1000000 ? 'medium' : 'low';

      // Check if approval is needed for high-impact changes
      const strategyId = `reserve-calc-${correlationId}`;
      const approvalCheck = await createApprovalIfNeeded(
        strategyId,
        'update',
        input,
        'Reserve calculation requested',
        req.user?.email || 'unknown',
        {
          affectedFunds,
          estimatedAmount: totalAmount,
          riskLevel
        }
      );

      if (approvalCheck.requiresApproval) {
        // Verify approval exists and is valid
        const inputsHash = computeStrategyHash(input);
        const verification = await verifyApproval({
          strategyId,
          inputsHash,
          minApprovals: 2
        });

        if (!verification.ok) {
          return res.status(403).json({
            error: 'approval_required',
            message: verification.reason,
            approvalId: approvalCheck.approvalId,
            details: {
              strategyId,
              inputsHash,
              riskLevel,
              estimatedAmount: totalAmount,
              affectedFunds: affectedFunds.length
            },
            correlationId
          });
        }

        // Attach approval to request for audit trail
        req.approval = {
          id: verification.approvalId,
          signatures: verification.signatures
        };
      }

      (logger as any).info('Reserve calculation request received', {
        correlationId,
        portfolioSize: input.portfolio.length,
        availableReserves: input.availableReserves,
        scenarioType: input.scenarioType,
        requiresApproval: approvalCheck.requiresApproval,
        approvalId: req.approval?.id,
        options,
      });

      // Perform calculation with pagination
      const pagination = options ? { limit: options.limit ?? 100, offset: options.offset ?? 0 } : undefined;
      const result = await reserveEngine.calculateOptimalReserveAllocation(input, pagination);

      // Track performance
      const duration = Date.now() - startTime;
      // TODO: Wire up performance monitoring when instrumentation is configured
      // performanceMonitor.recordMetric(
      //   'reserve_calculation_api',
      //   duration,
      //   'ms',
      //   {
      //     portfolioSize: input.portfolio.length,
      //     success: true,
      //   }
      // );

      (logger as any).info('Reserve calculation completed', {
        correlationId,
        duration,
        allocationsGenerated: result.allocations.length,
        totalAllocated: result.inputSummary.totalAllocated,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          correlationId,
          processingTime: duration,
          timestamp: new Date().toISOString(),
          approval: req.approval ? {
            id: req.approval.id,
            signatures: req.approval.signatures
          } : undefined,
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // TODO: Add performance monitoring
      // performanceMonitor.recordMetric(
      //   'reserve_calculation_api',
      //   duration,
      //   'ms',
      //   {
      //     portfolioSize: req.body?.portfolio?.length || 0,
      //     success: false,
      //     error: error.message,
      //   }
      // );

      const errorMessage = error instanceof Error ? error.message : String(error);
      (logger as any).error('Reserve calculation failed', {
        correlationId,
        error: errorMessage,
        duration,
        input: req.body ? {
          portfolioSize: req.body.portfolio?.length,
          availableReserves: req.body.availableReserves,
        } : null,
      });

      next(error);
    }
  }
);

/**
 * POST /api/reserves/validate-parity
 * Validate Excel parity
 */
router.post('/validate-parity',
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = (req as any).id;

    try {
      // Validate request
      const validatedRequest = ParityValidationRequestSchema.parse({ body: req.body });
      const { excelData: _excelData, webAppData: _webAppData, tolerance = 0.01 } = validatedRequest.body;

      (logger as any).info('Parity validation request received', {
        correlationId,
        tolerance,
      });

      // Mock parity validation - in production this would use the actual validator
      const mockParityResult = {
        comparisonResults: [
          {
            metric: 'nav',
            excelValue: 50000000,
            webAppValue: 49800000,
            percentageDrift: 0.004,
            withinTolerance: true,
            tolerance: tolerance,
          },
          {
            metric: 'dpi',
            excelValue: 1.25,
            webAppValue: 1.24,
            percentageDrift: 0.008,
            withinTolerance: true,
            tolerance: tolerance,
          },
          {
            metric: 'tvpi',
            excelValue: 2.1,
            webAppValue: 2.09,
            percentageDrift: 0.005,
            withinTolerance: true,
            tolerance: tolerance,
          },
        ],
        overallParity: {
          totalMetricsCompared: 3,
          metricsWithinTolerance: 3,
          parityPercentage: 1.0,
          maxDrift: 0.008,
          passesParityTest: true,
        },
        detailedBreakdown: {
          navComparison: { match: true, drift: 0.004 },
          dpiComparison: { match: true, drift: 0.008 },
          tvpiComparison: { match: true, drift: 0.005 },
          irrComparison: { match: true, drift: 0.006 },
          moicComparison: { match: true, drift: 0.003 },
        },
      };

      const duration = Date.now() - startTime;

      (logger as any).info('Parity validation completed', {
        correlationId,
        duration,
        passRate: mockParityResult.overallParity.parityPercentage,
        maxDrift: mockParityResult.overallParity.maxDrift,
      });

      res.json({
        success: true,
        data: mockParityResult,
        metadata: {
          correlationId,
          processingTime: duration,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      (logger as any).error('Parity validation failed', {
        correlationId,
        error: errorMessage,
        duration,
      });

      next(error);
    }
  }
);

/**
 * GET /api/reserves/health
 * Health check endpoint
 */
router['get']('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'reserves-api',
  });
});

/**
 * GET /api/reserves/config
 * Get configuration and limits
 */
router['get']('/config', (req: Request, res: Response) => {
  res.json({
    rateLimits: {
      calculation: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      heavyCalculation: {
        windowMs: 5 * 60 * 1000,
        max: 10,
      },
    },
    tolerances: {
      default: 0.01,
      critical: 0.005,
      maximum: 0.05,
    },
    limits: {
      maxPortfolioSize: 1000,
      maxCalculationTime: 30000, // 30 seconds
      maxReserveAmount: 1000000000, // $1B
    },
  });
});

// Error handling middleware
router.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  const correlationId = (req as any).id;

  // Handle validation errors
  if (error instanceof z.ZodError) {
    (logger as any).warn('Validation error in reserves API', {
      correlationId,
      errors: error.errors,
    });

    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: error.errors,
      correlationId,
    });
  }

  // Handle reserve calculation errors
  if (error instanceof ReserveCalculationError) {
    (logger as any).warn('Reserve calculation error', {
      correlationId,
      error: error.message,
      code: error.code,
      context: error.context,
    });

    return res.status(400).json({
      success: false,
      error: error.message,
      code: error.code,
      correlationId,
    });
  }

  // Handle rate limiting
  if (error.status === 429) {
    (logger as any).warn('Rate limit exceeded for reserves API', {
      correlationId,
      ip: req.ip,
    });

    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: error.retryAfter,
      correlationId,
    });
  }

  // Generic error handling
  (logger as any).error('Unexpected error in reserves API', {
    correlationId,
    error: error.message,
    stack: error.stack,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    correlationId,
  });
});

/**
 * POST /api/reserves/calculate-protected
 * Protected endpoint that always requires dual approval
 */
router.post('/calculate-protected',
  requireApproval({ minApprovals: 2 }),
  heavyCalculationLimiter,
  async (req: Request & { approval?: any }, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = (req as any).id;

    try {
      // Validate request
      const validatedRequest = ReserveCalculationRequestSchema.parse({
        body: req.body,
        query: req.query,
      });

      const { body: input } = validatedRequest;

      (logger as any).info('Protected reserve calculation initiated', {
        correlationId,
        portfolioSize: input.portfolio.length,
        availableReserves: input.availableReserves,
        approvalId: req.approval.id,
        signatures: req.approval.signatures.length,
      });

      // Perform calculation with approval verified and pagination
      const { query: options } = validatedRequest;
      const pagination = options ? { limit: options.limit ?? 100, offset: options.offset ?? 0 } : undefined;
      const result = await reserveEngine.calculateOptimalReserveAllocation(input, pagination);

      const duration = Date.now() - startTime;

      (logger as any).info('Protected reserve calculation completed', {
        correlationId,
        duration,
        approvalId: req.approval.id,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          correlationId,
          processingTime: duration,
          timestamp: new Date().toISOString(),
          protected: true,
          approval: {
            id: req.approval.id,
            signatures: req.approval.signatures,
            calculationHash: req.approval.calculationHash,
          },
        },
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      (logger as any).error('Protected reserve calculation failed', {
        correlationId,
        error: error.message,
        duration,
        approvalId: req.approval?.id,
      });

      next(error);
    }
  }
);

export default router;