/**
 * Scenario Comparison API Routes
 *
 * Phase 1: Ephemeral comparisons with Redis caching (5min TTL)
 * Endpoints:
 * - POST /api/portfolio/comparisons - Create comparison
 * - GET /api/portfolio/comparisons/:id - Get cached comparison
 *
 * Phase 2 (Future PR): Add persistence for saved configurations
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { scenarios, scenarioCases } from '@shared/schema';
import { inArray, eq } from 'drizzle-orm';
import { ComparisonService } from '../services/comparison-service.js';
import type { ScenarioDatabaseRow } from '../services/comparison-service.js';
import { createClient } from 'redis';

const router = Router();

// ============================================================================
// Redis Client Setup
// ============================================================================

let redis: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (!redis && process.env['REDIS_URL'] && process.env['REDIS_URL'] !== 'memory://') {
    redis = createClient({ url: process.env['REDIS_URL'] });
    await redis.connect().catch((err) => {
      console.error('[scenario-comparison] Redis connect failed; comparisons will not be cached', err);
      redis = null;
    });
  }
  return redis;
}

// ============================================================================
// Validation Schemas
// ============================================================================

// Simplified schemas for MVP (ephemeral comparisons only)
const CreateComparisonRequestSchema = z.object({
  fundId: z.number().int().positive(),
  baseScenarioId: z.string().uuid(),
  comparisonScenarioIds: z
    .array(z.string().uuid())
    .min(1, 'At least one comparison scenario required')
    .max(5, 'Maximum 5 comparison scenarios allowed'),
  comparisonMetrics: z
    .array(
      z.enum([
        'moic',
        'irr',
        'tvpi',
        'dpi',
        'total_investment',
        'follow_ons',
        'exit_proceeds',
        'exit_valuation',
        'gross_multiple',
        'net_irr',
        'gross_irr',
        'total_to_lps',
        'projected_fund_value',
        'weighted_summary',
      ])
    )
    .min(1, 'At least one metric required')
    .default(['moic', 'total_investment', 'exit_proceeds']),
}).strict(); // .strict() prevents extra fields for security

const GetComparisonParamsSchema = z.object({
  comparisonId: z.string().uuid(),
});

// ============================================================================
// Middleware: Authorization
// ============================================================================

/**
 * Check if user has access to fund/scenarios
 * Simplified for 5-person internal tool (all have access, just track who)
 */
function requireFundAccess(_permission: 'read' | 'write') {
  return (_req: Request, _res: Response, next: () => void) => {
    // For internal tool: All users have access, no filtering needed
    // User tracking happens via req.user.id (already augmented in types/express.d.ts)
    // Future: Add actual permission checks when team grows
    next();
  };
}

// ============================================================================
// Route: Create Comparison
// ============================================================================

/**
 * POST /api/portfolio/comparisons
 *
 * Create ephemeral scenario comparison (cached in Redis for 5min)
 *
 * Request:
 * {
 *   "fundId": 1,
 *   "baseScenarioId": "uuid-here",
 *   "comparisonScenarioIds": ["uuid1", "uuid2"],
 *   "comparisonMetrics": ["moic", "total_investment"]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "comparison-uuid",
 *     "status": "ready",
 *     "scenarios": [...],
 *     "deltaMetrics": [...],
 *     "comparisonMetrics": [...],
 *     "createdAt": "2025-01-01T00:00:00Z",
 *     "expiresAt": "2025-01-01T00:05:00Z"
 *   }
 * }
 */
router.post(
  '/api/portfolio/comparisons',
  requireFundAccess('read'),
  async (req: Request, res: Response) => {
    try {
      // Validate request
      const validated = CreateComparisonRequestSchema.parse(req.body);

      // Build list of all scenario IDs
      const allScenarioIds = [validated.baseScenarioId, ...validated.comparisonScenarioIds];

      // Fetch scenarios from database with cases
      const scenariosFromDb = await db.query.scenarios.findMany({
        where: inArray(scenarios.id, allScenarioIds),
        with: {
          cases: true,
        },
      });

      // Validate all scenarios found
      if (scenariosFromDb.length !== allScenarioIds.length) {
        const foundIds = scenariosFromDb.map((s: typeof scenariosFromDb[number]) => s.id);
        const missingIds = allScenarioIds.filter((id) => !foundIds.includes(id));
        return res.status(404).json({
          success: false,
          error: `Scenarios not found: ${missingIds.join(', ')}`,
        });
      }

      // Transform to service format (Drizzle returns camelCase fields)
      type ScenarioWithCases = typeof scenariosFromDb[number];
      type CaseType = ScenarioWithCases['cases'][number];
      const scenariosForService: ScenarioDatabaseRow[] = scenariosFromDb.map((s: ScenarioWithCases) => ({
        id: s.id,
        name: s.name,
        scenario_type: 'deal_level', // Hard-coded for MVP (all scenarios are deal-level)
        cases: s.cases.map((c: CaseType) => ({
          probability: Number(c.probability),
          investment: Number(c.investment),
          follow_ons: Number(c.followOns),
          exit_proceeds: Number(c.exitProceeds),
          exit_valuation: Number(c.exitValuation),
          ...(c.monthsToExit != null && { months_to_exit: c.monthsToExit }),
        })),
      }));

      // Initialize comparison service with Redis
      const redisClient = await getRedisClient();
      const comparisonService = new ComparisonService(redisClient as any);

      // Perform comparison
      const result = await comparisonService.compareScenarios(
        {
          fundId: validated.fundId,
          baseScenarioId: validated.baseScenarioId,
          comparisonScenarioIds: validated.comparisonScenarioIds,
          comparisonMetrics: validated.comparisonMetrics,
        },
        scenariosForService
      );

      // Return result
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      // Zod validation errors
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          details: err.errors,
        });
      }

      // Other errors
      console.error('[scenario-comparison] Create comparison failed:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

// ============================================================================
// Route: Get Cached Comparison
// ============================================================================

/**
 * GET /api/portfolio/comparisons/:comparisonId
 *
 * Retrieve cached comparison from Redis
 * Returns 404 if expired or not found
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ... comparison response ... }
 * }
 *
 * OR
 *
 * {
 *   "success": false,
 *   "error": "Comparison expired or not found"
 * }
 */
router.get(
  '/api/portfolio/comparisons/:comparisonId',
  requireFundAccess('read'),
  async (req: Request, res: Response) => {
    try {
      // Validate params
      const { comparisonId } = GetComparisonParamsSchema.parse(req.params);

      // Initialize comparison service with Redis
      const redisClient = await getRedisClient();
      const comparisonService = new ComparisonService(redisClient as any);

      // Retrieve cached comparison
      const cached = await comparisonService.getComparison(comparisonId);

      if (!cached) {
        return res.status(404).json({
          success: false,
          error: 'Comparison expired or not found',
        });
      }

      // Return cached result
      res.json({
        success: true,
        data: cached,
      });
    } catch (err) {
      // Zod validation errors
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          details: err.errors,
        });
      }

      // Other errors
      console.error('[scenario-comparison] Get comparison failed:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

// Export router as default (matches pattern from scenario-analysis.ts)
export default router;
