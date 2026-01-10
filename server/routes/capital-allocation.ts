/**
 * Capital Allocation Engine API Routes
 *
 * Endpoints for waterfall capital allocation calculations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async.js';
import {
  calculateCapitalAllocation,
  adaptTruthCaseInput,
  checkAllInvariants,
  type TruthCaseInput,
  CAEngineOutputSchema,
} from '../../shared/core/capitalAllocation/index.js';

const router = Router();

// Request validation schemas
// TruthCaseInput schema - matches the structure from shared/core/capitalAllocation/adapter.ts
const TruthCaseInputSchema = z.object({
  fund: z.object({
    commitment: z.number(),
    vintage_year: z.number().optional(),
    target_reserve_pct: z.number().nullable().optional(),
    reserve_policy: z.enum(['static_pct', 'dynamic_ratio']).optional(),
    pacing_window_months: z.number().optional(),
    units: z.enum(['millions', 'raw']).optional(),
  }),
  constraints: z
    .object({
      min_cash_buffer: z.number().nullable().optional(),
      max_allocation_per_cohort: z.number().nullable().optional(),
      max_deployment_rate: z.number().nullable().optional(),
      rebalance_frequency: z.enum(['quarterly', 'monthly', 'annual']).optional(),
    })
    .optional(),
  timeline: z
    .object({
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      rebalance_frequency: z.enum(['quarterly', 'monthly', 'annual']).optional(),
    })
    .optional(),
  flows: z
    .object({
      contributions: z.array(z.object({ date: z.string(), amount: z.number() })).optional(),
      distributions: z.array(z.object({ date: z.string(), amount: z.number() })).optional(),
    })
    .optional(),
  cohorts: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        name: z.string().optional(),
        start_date: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        end_date: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        weight: z.number().optional(),
        max_allocation: z.number().optional(),
      })
    )
    .optional(),
});

const capitalAllocationValidateSchema = z.object({
  input: TruthCaseInputSchema,
  output: CAEngineOutputSchema,
});

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
    const { input, output } = capitalAllocationValidateSchema.parse(req.body);

    if (!input || !output) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'input and output are required for validation',
      });
    }

    // Type assertion safe after Zod validation
    const normalized = adaptTruthCaseInput(input as TruthCaseInput);
    const invariantResults = checkAllInvariants(normalized, output);

    res.json({
      valid: invariantResults.allPassed,
      results: invariantResults,
    });
  })
);

export default router;
