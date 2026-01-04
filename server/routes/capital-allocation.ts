/**
 * Capital Allocation Engine API Routes
 *
 * Endpoints for waterfall capital allocation calculations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async.js';
import {
  calculateCapitalAllocation,
  adaptTruthCaseInput,
  checkAllInvariants,
  type TruthCaseInput,
  type CAEngineOutput,
} from '../../shared/core/capitalAllocation/index.js';

const router = Router();

/**
 * POST /api/capital-allocation/calculate
 * Calculate capital allocation for a fund
 */
router.post(
  '/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as TruthCaseInput;

    if (!input || !input.fund) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'fund configuration is required',
      });
    }

    // Normalize input (handles unit conversions)
    const normalized = adaptTruthCaseInput(input);

    // Calculate allocation
    const result = calculateCapitalAllocation(normalized);

    res.json(result);
  })
);

/**
 * POST /api/capital-allocation/validate
 * Validate capital allocation output against invariants
 */
router.post(
  '/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const { input, output } = req.body as {
      input: TruthCaseInput;
      output: CAEngineOutput;
    };

    if (!input || !output) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'input and output are required for validation',
      });
    }

    const normalized = adaptTruthCaseInput(input);
    const invariantResults = checkAllInvariants(normalized, output);

    res.json({
      valid: invariantResults.allPassed,
      results: invariantResults,
    });
  })
);

export default router;
