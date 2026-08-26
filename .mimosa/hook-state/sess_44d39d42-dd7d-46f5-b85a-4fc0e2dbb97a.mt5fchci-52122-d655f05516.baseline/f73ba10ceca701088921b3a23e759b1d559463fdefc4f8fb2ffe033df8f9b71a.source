/**
 * Graduation Rate Engine API Routes
 *
 * Endpoints for company stage transition projections.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async.js';
import {
  GraduationRateEngine,
  createDefaultGraduationConfig,
  type GraduationConfig,
} from '../../shared/core/graduation/GraduationRateEngine.js';

const router = Router();

interface GraduationProjectBody {
  initialCompanies?: number;
  horizonQuarters?: number;
  config?: GraduationConfig;
  expectationMode?: boolean;
  seed?: number;
}

/**
 * POST /api/graduation/project
 * Project a cohort through stage transitions
 */
router.post(
  '/project',
  asyncHandler(async (req: Request, res: Response) => {
    const body: GraduationProjectBody =
      typeof req.body === 'object' && req.body !== null ? (req.body as GraduationProjectBody) : {};
    const {
      initialCompanies = 20,
      horizonQuarters = 16,
      config,
      expectationMode = true,
      seed = 42,
    } = body;

    // Validate inputs
    if (typeof initialCompanies !== 'number' || initialCompanies < 1) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'initialCompanies must be a positive number',
      });
    }

    if (typeof horizonQuarters !== 'number' || horizonQuarters < 1) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'horizonQuarters must be a positive number',
      });
    }

    // Use provided config or create default
    const engineConfig: GraduationConfig = config || createDefaultGraduationConfig(
      expectationMode,
      seed
    );

    const engine = new GraduationRateEngine(engineConfig);
    const summary = engine.getSummary(initialCompanies, horizonQuarters);

    res.json(summary);
  })
);

/**
 * GET /api/graduation/defaults
 * Get default graduation configuration
 */
router.get(
  '/defaults',
  asyncHandler(async (_req: Request, res: Response) => {
    const config = createDefaultGraduationConfig(true);
    res.json(config);
  })
);

export default router;
