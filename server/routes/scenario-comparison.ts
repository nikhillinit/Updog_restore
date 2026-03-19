/**
 * Scenario Comparison API Routes
 *
 * Phase 1: Ephemeral comparisons with Redis caching (5min TTL)
 * Endpoints:
 * - POST /api/portfolio/comparisons - Create comparison
 * - GET /api/portfolio/comparisons/:id - Get cached comparison
 *
 * Phase 2 (Future PR): Add persistence for saved configurations
 *
 * Feature Flag: ENABLE_SCENARIO_COMPARISON
 * When disabled, all routes return 501 Not Implemented
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { q } from '../db/index.js';
import { ComparisonService } from '../services/comparison-service.js';
import type { ScenarioDatabaseRow } from '../services/comparison-service.js';
import { createClient, type RedisClientType } from 'redis';
import { logger } from '../lib/logger';

const router = Router();

// ============================================================================
// Feature Flag Middleware
// ============================================================================

/**
 * Middleware to check if scenario comparison feature is enabled.
 * Returns 501 Not Implemented when ENABLE_SCENARIO_COMPARISON !== 'true'
 */
function requireFeatureFlag(_req: Request, res: Response, next: NextFunction) {
  if (process.env['ENABLE_SCENARIO_COMPARISON'] !== 'true') {
    return res.status(501).json({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message:
        'Scenario comparison feature is not enabled. Set ENABLE_SCENARIO_COMPARISON=true to enable.',
    });
  }
  next();
}

// Apply feature flag check to all routes in this router
router.use(requireFeatureFlag);

// ============================================================================
// Redis Client Setup
// ============================================================================

type RedisClient = RedisClientType | null;

interface ScenarioLookupRow {
  id: string;
  name: string;
}

interface ScenarioCaseLookupRow {
  scenario_id: string;
  probability: string | number;
  investment: string | number;
  follow_ons: string | number;
  exit_proceeds: string | number;
  exit_valuation: string | number;
  months_to_exit: number | null;
}

let redis: RedisClient = null;

async function getRedisClient(): Promise<RedisClient> {
  if (!redis && process.env['REDIS_URL'] && process.env['REDIS_URL'] !== 'memory://') {
    redis = createClient({ url: process.env['REDIS_URL'] });
    await redis.connect().catch((err: unknown) => {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[scenario-comparison] Redis connect failed; comparisons will not be cached'
      );
      redis = null;
    });
  }
  return redis;
}

async function loadScenarioRows(allScenarioIds: string[]): Promise<{
  scenarios: ScenarioLookupRow[];
  cases: ScenarioCaseLookupRow[];
}> {
  const [scenarioRows, caseRows] = await Promise.all([
    q<ScenarioLookupRow>(
      `
        SELECT id, name
        FROM scenarios
        WHERE id = ANY($1::uuid[])
      `,
      [allScenarioIds]
    ),
    q<ScenarioCaseLookupRow>(
      `
        SELECT
          scenario_id,
          probability,
          investment,
          follow_ons,
          exit_proceeds,
          exit_valuation,
          months_to_exit
        FROM scenario_cases
        WHERE scenario_id = ANY($1::uuid[])
      `,
      [allScenarioIds]
    ),
  ]);

  return {
    scenarios: scenarioRows,
    cases: caseRows,
  };
}

function toScenarioDatabaseRows(
  scenarioRows: ScenarioLookupRow[],
  caseRows: ScenarioCaseLookupRow[]
): ScenarioDatabaseRow[] {
  const casesByScenarioId = caseRows.reduce<Record<string, ScenarioDatabaseRow['cases']>>(
    (acc, row) => {
      const cases = acc[row.scenario_id] ?? [];
      cases.push({
        probability: Number(row.probability),
        investment: Number(row.investment),
        follow_ons: Number(row.follow_ons),
        exit_proceeds: Number(row.exit_proceeds),
        exit_valuation: Number(row.exit_valuation),
        ...(row.months_to_exit != null ? { months_to_exit: row.months_to_exit } : {}),
      });
      acc[row.scenario_id] = cases;
      return acc;
    },
    {}
  );

  return scenarioRows.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    scenario_type: 'deal_level',
    cases: casesByScenarioId[scenario.id] ?? [],
  }));
}

// ============================================================================
// Validation Schemas
// ============================================================================

// Simplified schemas for MVP (ephemeral comparisons only)
const CreateComparisonRequestSchema = z
  .object({
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
  })
  .strict(); // .strict() prevents extra fields for security

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

      // Fetch scenarios and cases explicitly to avoid unresolved relation typing.
      const { scenarios: scenarioRows, cases: caseRows } = await loadScenarioRows(allScenarioIds);

      // Validate all scenarios found
      if (scenarioRows.length !== allScenarioIds.length) {
        const foundIds = scenarioRows.map((scenario) => scenario.id);
        const missingIds = allScenarioIds.filter((id) => !foundIds.includes(id));
        return res.status(404).json({
          success: false,
          error: `Scenarios not found: ${missingIds.join(', ')}`,
        });
      }

      const scenariosForService = toScenarioDatabaseRows(scenarioRows, caseRows);

      // Initialize comparison service with Redis
      const redisClient = await getRedisClient();
      const comparisonService = new ComparisonService(redisClient);

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
      const comparisonService = new ComparisonService(redisClient);

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
