import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async.js';
import {
  CreateLotRequestSchema,
  ListLotsRequestSchema,
} from '../../../shared/schemas/portfolio-route.js';

const router = Router();

// ============================================================================
// Validation Schemas (Path Params)
// ============================================================================

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify that a fund exists in the database.
 * Throws 404 error if fund not found.
 */
async function verifyFundExists(_fundId: number): Promise<void> {
  // TODO: Implement database query
  throw new Error('Not implemented');
}

/**
 * Verify that an investment exists and belongs to the specified fund.
 * Throws 404 error if investment not found or doesn't belong to fund.
 */
async function verifyInvestmentExists(_fundId: number, _investmentId: number): Promise<void> {
  // TODO: Implement database query
  throw new Error('Not implemented');
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/funds/:fundId/portfolio/lots
 * Create a new investment lot (idempotent)
 */
router.post(
  '/funds/:fundId/portfolio/lots',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { fundId } = FundIdParamSchema.parse(req.params);

    // 2. Validate request body
    const bodyResult = CreateLotRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const {
      investmentId,
      lotType: _lotType,
      sharePriceCents: _sharePriceCents,
      sharesAcquired: _sharesAcquired,
      costBasisCents: _costBasisCents,
      idempotencyKey: _idempotencyKey,
    } = bodyResult.data;

    // 3. Verify fund exists
    await verifyFundExists(fundId);

    // 4. Verify investment exists and belongs to fund
    await verifyInvestmentExists(fundId, investmentId);

    // TODO: Implement lot creation logic
    // - Check idempotency key (if provided)
    // - Create lot record
    // - Return 201 with lot

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Lot creation not yet implemented',
    });
  })
);

/**
 * GET /api/funds/:fundId/portfolio/lots
 * List investment lots for a fund (filtering + pagination)
 */
router.get(
  '/funds/:fundId/portfolio/lots',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { fundId } = FundIdParamSchema.parse(req.params);

    // 2. Validate query params
    const queryResult = ListLotsRequestSchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query_parameters',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const {
      cursor: _cursor,
      limit: _limit,
      investmentId: _investmentId,
      lotType: _lotType,
    } = queryResult.data;

    // 3. Verify fund exists
    await verifyFundExists(fundId);

    // TODO: Implement lot listing logic
    // - Build query conditions (fundId, investmentId filter, lotType filter, cursor)
    // - Fetch limit+1 rows (detect hasMore)
    // - Return paginated response

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Lot listing not yet implemented',
    });
  })
);

export default router;
