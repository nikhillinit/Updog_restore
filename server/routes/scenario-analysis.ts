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
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';

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
// Middleware: User tracking for audit
// ============================================================================

// Extend Request type for scenario routes
interface ScenarioRequest extends Request {
  userId: string;
}

/**
 * Extract user ID for audit logging (use after requireAuth)
 */
function extractUserId(req: Request, _res: Response, next: () => void) {
  const userId = req.user?.id || 'system';
  (req as ScenarioRequest).userId = userId;
  next();
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
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
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
  requireAuth(),
  requireFundAccess,
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { fundId } = req.params;

      if (!fundId) {
        return res["status"](400)["json"]({ error: 'Missing fund ID' });
      }

      const query = PortfolioAnalysisQuerySchema.parse(req.query);

      // Cache for 5 minutes (sufficient for internal tool)
      res.set('Cache-Control', 'private, max-age=300');

      // Parse fundId to integer
      const fundIdInt = parseInt(fundId);

      // TODO: Implement actual query logic based on your schema
      // This is a placeholder showing the pattern
      const results = await db.select()
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundIdInt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit);

      const total = await db.select({ count: sql<number>`count(*)` })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundIdInt));

      // Transform to ComparisonRow format
      const rows = results.map((company: typeof results[number]) => ({
        entry_round: company.stage || 'Unknown',
        construction_value: Number(company.investmentAmount || 0),
        actual_value: Number(company.investmentAmount || 0),
        forecast_value: Number(company.currentValuation || 0),
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

    } catch (error: unknown) {
      console.error('Portfolio analysis error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;

      if (!companyId || !scenarioId) {
        return res["status"](400)["json"]({ error: 'Missing required parameters' });
      }

      const include = (req.query['include'] as string)?.split(',') || ['cases', 'weighted_summary'];

      const scenario = await db.select()
        .from(scenarios)
        .where(and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, parseInt(companyId))
        ))
        .limit(1);

      if (!scenario || scenario.length === 0 || !scenario[0]) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      const scenarioData = scenario[0];

      // Fetch cases if requested
      let mappedCases: Array<Record<string, unknown>> = [];
      if (include.includes('cases')) {
        const cases = await db.select()
          .from(scenarioCases)
          .where(eq(scenarioCases.scenarioId, scenarioId));

        mappedCases = cases.map((c) => ({
          id: c.id,
          case_name: c.caseName,
          description: c.description ?? undefined,
          probability: Number(c.probability),
          investment: Number(c.investment),
          follow_ons: Number(c.followOns),
          exit_proceeds: Number(c.exitProceeds),
          exit_valuation: Number(c.exitValuation),
          months_to_exit: c.monthsToExit ?? undefined,
          ownership_at_exit: c.ownershipAtExit ? Number(c.ownershipAtExit) : undefined,
        }));
      }

      // Add MOIC to each case
      const casesWithMOIC = addMOICToCases(mappedCases);

      // Calculate weighted summary
      const weighted_summary = include.includes('weighted_summary') && casesWithMOIC.length > 0
        ? calculateWeightedSummary(casesWithMOIC)
        : undefined;

      // Get investment rounds if requested (commented out - investmentRounds not in schema)
      // let rounds = [];
      // if (include.includes('rounds')) {
      //   rounds = await db.query.investments.findMany({
      //     where: eq(investments.companyId, parseInt(companyId)),
      //     orderBy: (investments: any, { asc }: any) => [asc(investments.investmentDate)]
      //   });
      // }

      const response: ScenarioAnalysisResponse = {
        company_name: '', // TODO: fetch company name separately if needed
        company_id: companyId,
        scenario: {
          id: scenarioData.id,
          company_id: String(scenarioData.companyId),
          name: scenarioData.name,
          ...(scenarioData.description && { description: scenarioData.description }),
          version: scenarioData.version,
          is_default: scenarioData.isDefault,
          ...(scenarioData.lockedAt && { locked_at: scenarioData.lockedAt }),
          ...(scenarioData.createdBy && { created_by: scenarioData.createdBy }),
          created_at: scenarioData.createdAt,
          updated_at: scenarioData.updatedAt,
        },
        cases: casesWithMOIC,
        ...(weighted_summary && { weighted_summary }),
        // rounds: undefined, // include.includes('rounds') ? rounds : undefined,
      };

      res["json"](response);

    } catch (error: unknown) {
      console.error('Get scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        return res["status"](400)["json"]({ error: 'Missing company ID' });
      }

      const { name, description } = req.body;
      const userId = (req as ScenarioRequest).userId;

      const scenario = await db.insert(scenarios).values({
        companyId: parseInt(companyId),
        name: name || 'New Scenario',
        description,
        version: 1,
        isDefault: false,
        ...(userId && { createdBy: userId }),
      }).returning();

      // Audit log
      await auditLog({
        userId,
        entityType: 'scenario',
        entityId: scenario[0]?.id ?? '',
        action: 'CREATE',
      });

      res["status"](201)["json"](scenario[0]);

    } catch (error: unknown) {
      console.error('Create scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;

      if (!companyId || !scenarioId) {
        return res["status"](400)["json"]({ error: 'Missing required parameters' });
      }

      const body = UpdateScenarioRequestSchema.parse(req.body);

      // Fetch current scenario
      const currentScenario = await db.select()
        .from(scenarios)
        .where(and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, parseInt(companyId))
        ))
        .limit(1);

      if (!currentScenario || currentScenario.length === 0 || !currentScenario[0]) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      const current = currentScenario[0];

      // Fetch current cases for audit log
      const currentCases = await db.select()
        .from(scenarioCases)
        .where(eq(scenarioCases.scenarioId, scenarioId));

      // BLOCKER #1 FIX: Optimistic locking
      if (body.version !== undefined && current.version !== body.version) {
        return res["status"](409)["json"]({
          error: 'Conflict',
          message: 'Scenario was modified by another user. Please refresh.',
          current_version: current.version,
        });
      }

      // Validate probabilities
      let cases = body.cases as Array<Record<string, unknown>>;
      const validation = validateProbabilities(cases as Array<{ probability: number }>);

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
        cases = normalizeProbabilities(cases as Array<{ probability: number }>) as Array<Record<string, unknown>>;
        normalized = true;
      }

      // Delete existing cases and insert new ones (transaction)
      await db.transaction(async (tx) => {
        await tx.delete(scenarioCases)
          .where(eq(scenarioCases.scenarioId, scenarioId));

        if (cases.length > 0) {
          await tx.insert(scenarioCases).values(
            cases.map((c) => ({
              scenarioId: scenarioId,
              caseName: String(c.case_name || ''),
              description: c.description as string | undefined,
              probability: String(c.probability || 0),
              investment: String(c.investment || 0),
              followOns: String(c.follow_ons || 0),
              exitProceeds: String(c.exit_proceeds || 0),
              exitValuation: String(c.exit_valuation || 0),
              monthsToExit: c.months_to_exit as number | undefined,
              ownershipAtExit: c.ownership_at_exit ? String(c.ownership_at_exit) : null,
            }))
          );
        }

        // Increment version
        await tx.update(scenarios)
          .set({
            version: current.version + 1,
            updatedAt: new Date()
          })
          .where(eq(scenarios.id, scenarioId));
      });

      // BLOCKER #2 FIX: Audit logging
      await auditLog({
        userId: (req as ScenarioRequest).userId ?? 'system',
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'UPDATE',
        diff: {
          old: currentCases,
          new: cases,
          normalized,
        },
      });

      // Return updated data
      const casesWithMOIC = addMOICToCases(cases as Array<Record<string, unknown>>);
      const weighted_summary = calculateWeightedSummary(casesWithMOIC);

      res["json"]({
        scenario_id: scenarioId,
        cases: casesWithMOIC,
        weighted_summary,
        version: current.version + 1,
        normalized,
        original_sum: normalized ? original_sum : undefined,
      });

    } catch (error: unknown) {
      console.error('Update scenario error:', error);

      if (error instanceof z.ZodError) {
        return res["status"](400)["json"]({
          error: 'Validation error',
          details: error.errors,
        });
      }

      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { companyId, scenarioId } = req.params;

      if (!companyId || !scenarioId) {
        return res["status"](400)["json"]({ error: 'Missing required parameters' });
      }

      const scenarioResult = await db.select()
        .from(scenarios)
        .where(and(
          eq(scenarios.id, scenarioId),
          eq(scenarios.companyId, parseInt(companyId))
        ))
        .limit(1);

      if (!scenarioResult || scenarioResult.length === 0 || !scenarioResult[0]) {
        return res["status"](404)["json"]({ error: 'Scenario not found' });
      }

      const scenario = scenarioResult[0];

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
        userId: (req as ScenarioRequest).userId ?? 'system',
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'DELETE',
      });

      res["status"](204)["send"]();

    } catch (error: unknown) {
      console.error('Delete scenario error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
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
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const { companyId } = req.params;
      const { scenario_id } = req.body;

      // TODO: Wire to existing DeterministicReserveEngine
      // This is a placeholder showing the integration pattern

      // 1. Fetch scenario data
      const scenario = await db.query.scenarios.findFirst({
        where: eq(scenarios.id, scenario_id),
        with: { cases: true, company: true }
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

    } catch (error: unknown) {
      console.error('Reserves optimization error:', error);
      res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
