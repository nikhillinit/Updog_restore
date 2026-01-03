import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async.js';
import {
  CreateLotRequestSchema,
  ListLotsRequestSchema,
} from '../../../shared/schemas/portfolio-route.js';
import {
  LotService,
  LotNotFoundError,
  InvestmentNotFoundError,
  InvestmentFundMismatchError,
  CostBasisMismatchError,
} from '../../services/lot-service';

const router = Router();
const lotService = new LotService();

// ============================================================================
// Validation Schemas (Path Params)
// ============================================================================

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

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
      lotType,
      sharePriceCents,
      sharesAcquired,
      costBasisCents,
      idempotencyKey,
    } = bodyResult.data;

    try {
      // 3. Create lot using service
      const lot = await lotService.create(fundId, {
        investmentId,
        lotType: lotType as 'initial' | 'follow_on' | 'secondary',
        sharePriceCents: BigInt(sharePriceCents),
        sharesAcquired,
        costBasisCents: BigInt(costBasisCents),
        ...(idempotencyKey && { idempotencyKey }),
      });

      return res.status(201).json({
        success: true,
        data: {
          id: lot.id,
          investmentId: lot.investmentId,
          lotType: lot.lotType,
          sharePriceCents: lot.sharePriceCents.toString(),
          sharesAcquired: lot.sharesAcquired,
          costBasisCents: lot.costBasisCents.toString(),
          version: lot.version.toString(),
          createdAt: lot.createdAt,
          updatedAt: lot.updatedAt,
        },
        message: 'Lot created successfully',
      });
    } catch (error) {
      if (error instanceof InvestmentNotFoundError) {
        return res.status(404).json({
          error: 'investment_not_found',
          message: error.message,
        });
      }
      if (error instanceof InvestmentFundMismatchError) {
        return res.status(403).json({
          error: 'investment_fund_mismatch',
          message: error.message,
        });
      }
      if (error instanceof CostBasisMismatchError) {
        return res.status(400).json({
          error: 'cost_basis_mismatch',
          message: error.message,
        });
      }
      throw error;
    }
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

    const { cursor, limit, investmentId, lotType } = queryResult.data;

    try {
      // 3. List lots using service
      const result = await lotService.list(fundId, {
        limit,
        ...(cursor && { cursor }),
        ...(investmentId && { investmentId }),
        ...(lotType && { lotType: lotType as 'initial' | 'follow_on' | 'secondary' }),
      });

      return res.json({
        success: true,
        data: result.lots.map((lot) => ({
          id: lot.id,
          investmentId: lot.investmentId,
          lotType: lot.lotType,
          sharePriceCents: lot.sharePriceCents.toString(),
          sharesAcquired: lot.sharesAcquired,
          costBasisCents: lot.costBasisCents.toString(),
          version: lot.version.toString(),
          createdAt: lot.createdAt,
          updatedAt: lot.updatedAt,
        })),
        pagination: {
          hasMore: result.hasMore,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        },
      });
    } catch (error) {
      if (error instanceof LotNotFoundError) {
        return res.status(404).json({
          error: 'lot_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

export default router;
