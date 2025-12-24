/**
 * Scenario Analysis API Routes
 *
 * Implements Construction vs Current portfolio analysis and deal-level scenario modeling
 * with optimistic locking, audit logging, and reserves optimization
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { scenarios, scenarioCases, scenarioAuditLogs, portfolioCompanies } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  calculateWeightedSummary,
  validateProbabilities,
  normalizeProbabilities,
  addMOICToCases
} from '@shared/utils/scenario-math';
import type {
  ScenarioAnalysisResponse
} from '@shared/types/scenario';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const ScenarioCaseSchema = z.object({
  case_name: z.string().min(1).max(255),
  description: z.string().optional(),
  probability: z.number().min(0).max(1),
  investment: z.number().min(0),
  follow_ons: z.number().min(0),
  exit_proceeds: z.number().min(0),
  exit_valuation: z.number().min(0),
  months_to_exit: z.number().int().positive().optional(),
  ownership_at_exit: z.number().min(0).max(1).optional(),
});

const UpdateScenarioRequestSchema = z.object({
  scenario_id: z.string().uuid(),
  cases: z.array(ScenarioCaseSchema),
  normalize: z.boolean().optional(),
  version: z.number().int().optional(), // Optimistic locking
});

const PortfolioAnalysisQuerySchema = z.object({
  metric: z.enum(['num_investments', 'initial_checks', 'follow_on_reserves', 'total_capital']),
  view: z.enum(['construction', 'current', 'actual']).default('construction'),
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('50'),
});

// ============================================================================
// Middleware: Authorization
// ============================================================================

// Extend Request type for scenario routes
interface ScenarioRequest extends Request {
  userId: string;
}

/**
 * Check if user has access to fund/company
 * Simplified for 5-person internal tool (all have access, just track who)
 */
function requireFundAccess(permission: 'read' | 'write') {
  return (req: Request, res: Response, next: any) => {
    const userId = (req as any).user?.id || 'system';

    // For internal tool: Just track user, don't block
    // Future: Add actual permission checks when team grows
    (req as ScenarioRequest).userId = userId;

    next();
  };
}

// ============================================================================
// Audit Logging Helper
// ============================================================================

async function auditLog(params: {
  userId: string;
  entityType: 'scenario' | 'scenario_case';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  diff?: Record<string, unknown>;
}) {
  await db.insert(scenarioAuditLogs).values({
    user_id: params.userId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    diff: params.diff,
    timestamp: new Date(),
  });
}

// ============================================================================
// Portfolio-Level Analysis (Construction vs Current)
// ============================================================================

/**
 * GET /api/funds/:fundId/portfolio-analysis
 *
 * Returns Construction vs Current comparison with pagination and caching
 */
router["get"]('/funds/:fundId/portfolio-analysis',
  requireFundAccess('read'),
  async (req: Request, res: Response) => {
    try {
      const { fundId } = req.params;
      const query = PortfolioAnalysisQuerySchema.parse(req.query);

      // Cache for 5 minutes (sufficient for internal tool)
      res.set('Cache-Control', 'private, max-age=300');

      // TODO: Implement actual query logic based on your schema
      // This is a placeholder showing the pattern
      const results = await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        with: {
          investments: true,
          scenarios: {
            where: eq(scenarios.isDefault, true),
            with: {
              cases: true
            }
          }
        }
      });

      const total = await db.select({ count: sql<number>`count(*)` })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));

      // Transform to ComparisonRow format
      const rows = results.map((company: typeof results[number]) => ({
        entry_round: company.entry_round,
        construction_value: company.construction_investment || 0,
        actual_value: company.total_invested || 0,
        forecast_value: company.projected_value || 0,
      }));

      res["json"]({
        data: rows,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: total[0]?.count || 0,
          pages: Math.ceil((total[0]?.count || 0) / query.limit)
        },
        generated_at: new Date(),
      });

    } catch (error: any) {
      console.error('Portfolio analysis error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// ============================================================================
// Scenario CRUD (Deal-Level)
// ============================================================================

/**
 * GET /api/companies/:companyId/scenarios/:scenarioId
 *
 * Get scenario with cases, rounds, and weighted summary
 */
router["get"]('/companies/:companyId/scenarios/:scenarioId',
  requireFundAccess('read'),
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;
      const include = (req.query.include as string)?.split(',') || ['cases', 'weighted_summary'];

      const scenario = await db.query.scenarios.findFirst({
        where: and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, companyId)
        ),
        with: {
          cases: true,
          company: true
        }
      });

      if (!scenario) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      // Add MOIC to each case
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const casesWithMOIC = addMOICToCases(scenario.cases as any);

      // Calculate weighted summary
      const weighted_summary = include.includes('weighted_summary') && casesWithMOIC.length > 0
        ? calculateWeightedSummary(casesWithMOIC)
        : null;

      // Get investment rounds if requested
      let rounds = [];
      if (include.includes('rounds')) {
        rounds = await db.query.investmentRounds.findMany({
          where: eq(investmentRounds.companyId, companyId),
          orderBy: (rounds: any, { asc }: any) => [asc(rounds.round_date)]
        });
      }

      const response: ScenarioAnalysisResponse = {
        company_name: scenario.company?.name || '',
        company_id: companyId,
        scenario: {
          ...scenario,
          cases: casesWithMOIC
        },
        cases: casesWithMOIC,
        weighted_summary,
        rounds: include.includes('rounds') ? rounds : undefined,
      };

      res["json"](response);

    } catch (error: any) {
      console.error('Get scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/companies/:companyId/scenarios
 *
 * Create new scenario
 */
router["post"]('/companies/:companyId/scenarios',
  requireFundAccess('write'),
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params;
      const { name, description } = req.body;
      const userId = (req as ScenarioRequest).userId;

      const scenario = await db.insert(scenarios).values({
        company_id: companyId,
        name: name || 'New Scenario',
        description,
        version: 1,
        is_default: false,
        created_by: userId,
      }).returning();

      // Audit log
      await auditLog({
        userId,
        entityType: 'scenario',
        entityId: scenario[0].id,
        action: 'CREATE',
      });

      res["status"](201)["json"](scenario[0]);

    } catch (error: any) {
      console.error('Create scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/companies/:companyId/scenarios/:scenarioId
 *
 * Update scenario cases with optimistic locking
 */
router["patch"]('/companies/:companyId/scenarios/:scenarioId',
  requireFundAccess('write'),
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;
      const body = UpdateScenarioRequestSchema.parse(req.body);

      // Fetch current scenario
      const current = await db.query.scenarios.findFirst({
        where: and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, companyId)
        ),
        with: { cases: true }
      });

      if (!current) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      // BLOCKER #1 FIX: Optimistic locking
      if (body.version !== undefined && current.version !== body.version) {
        return res["status"](409)["json"]({
          error: 'Conflict',
          message: 'Scenario was modified by another user. Please refresh.',
          current_version: current.version,
        });
      }

      // Validate probabilities
      let cases = body.cases;
      const validation = validateProbabilities(cases);

      if (!validation.is_valid && !body.normalize) {
        return res["status"](400)["json"]({
          error: 'Invalid probabilities',
          message: validation.message,
          sum: validation.sum,
          severity: validation.severity,
        });
      }

      // Auto-normalize if requested
      let normalized = false;
      const original_sum = validation.sum;
      if (body.normalize && !validation.is_valid) {
        cases = normalizeProbabilities(cases);
        normalized = true;
      }

      // Delete existing cases and insert new ones (transaction)
      await db.transaction(async (tx: any) => {
        await tx.delete(scenarioCases)
          .where(eq(scenarioCases.scenarioId, scenarioId));

        if (cases.length > 0) {
          await tx.insert(scenarioCases).values(
            cases.map(c => ({
              scenario_id: scenarioId,
              case_name: c.case_name,
              description: c.description,
              probability: c.probability,
              investment: c.investment,
              follow_ons: c.follow_ons,
              exit_proceeds: c.exit_proceeds,
              exit_valuation: c.exit_valuation,
              months_to_exit: c.months_to_exit,
              ownership_at_exit: c.ownership_at_exit,
            }))
          );
        }

        // Increment version
        await tx.update(scenarios)
          .set({
            version: current.version + 1,
            updated_at: new Date()
          })
          .where(eq(scenarios.id, scenarioId));
      });

      // BLOCKER #2 FIX: Audit logging
      await auditLog({
        userId: (req as ScenarioRequest).userId,
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'UPDATE',
        diff: {
          old: current.cases,
          new: cases,
          normalized,
        },
      });

      // Return updated data
      const casesWithMOIC = addMOICToCases(cases);
      const weighted_summary = calculateWeightedSummary(casesWithMOIC);

      res["json"]({
        scenario_id: scenarioId,
        cases: casesWithMOIC,
        weighted_summary,
        version: current.version + 1,
        normalized,
        original_sum: normalized ? original_sum : undefined,
      });

    } catch (error: any) {
      console.error('Update scenario error:', error);

      if (error instanceof z.ZodError) {
        return res["status"](400)["json"]({
          error: 'Validation error',
          details: error.errors,
        });
      }

      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/companies/:companyId/scenarios/:scenarioId
 *
 * Delete scenario and all its cases
 */
router["delete"]('/companies/:companyId/scenarios/:scenarioId',
  requireFundAccess('write'),
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;

      const scenario = await db.query.scenarios.findFirst({
        where: and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, companyId)
        )
      });

      if (!scenario) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      // Prevent deleting default scenario
      if (scenario.isDefault) {
        return res["status"](400)["json"]({
          error: 'Cannot delete default scenario'
        });
      }

      // Delete (cascade will remove cases)
      await db.delete(scenarios)
        .where(eq(scenarios.id, scenarioId));

      // Audit log
      await auditLog({
        userId: (req as ScenarioRequest).userId,
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'DELETE',
      });

      res["status"](204)["send"]();

    } catch (error: any) {
      console.error('Delete scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// ============================================================================
// Reserves Optimization Integration
// ============================================================================

/**
 * POST /api/companies/:companyId/reserves/optimize
 *
 * Call DeterministicReserveEngine to suggest optimal reserve allocation
 */
router["post"]('/companies/:companyId/reserves/optimize',
  requireFundAccess('write'),
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params;
      const { scenario_id } = req.body;

      // TODO: Wire to existing DeterministicReserveEngine
      // This is a placeholder showing the integration pattern

      // 1. Fetch scenario data
      const scenario = await db.query.scenarios.findFirst({
        where: eq(scenarios.id, scenario_id),
        with: { cases: true }
      });

      if (!scenario) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      // 2. Call reserve engine (lift from your existing pattern)
      // const suggestions = await DeterministicReserveEngine.calculateOptimalReserveAllocation({
      //   portfolio: [scenario.company],
      //   graduationMatrix: ...,
      //   stageStrategies: ...,
      //   availableReserves: ...
      // });

      // 3. Return ranked suggestions
      const suggestions = [
        {
          company_id: companyId,
          stage: 'Series A',
          recommended_amount: 5000000,
          exit_moic_on_planned_reserves: 3.2,
          confidence: 0.85,
        }
      ];

      res["json"]({
        scenario_id,
        suggestions,
        generated_at: new Date(),
      });

    } catch (error: any) {
      console.error('Reserves optimization error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

export default router;
