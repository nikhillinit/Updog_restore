import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async.js';
import {
  CreateSnapshotRequestSchema,
  ListSnapshotsRequestSchema,
  UpdateSnapshotRequestSchema,
} from '../../../shared/schemas/portfolio-route.js';
import {
  SnapshotService,
  SnapshotNotFoundError,
  SnapshotVersionConflictError,
  FundNotFoundError,
} from '../../services/snapshot-service';

const router = Router();
const snapshotService = new SnapshotService();

// ============================================================================
// Validation Schemas (Path Params)
// ============================================================================

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

const SnapshotIdParamSchema = z.object({
  snapshotId: z.string().uuid(),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/funds/:fundId/portfolio/snapshots
 * Create a new snapshot (202 Accepted pattern)
 */
router.post(
  '/funds/:fundId/portfolio/snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { fundId } = FundIdParamSchema.parse(req.params);

    // 2. Validate request body
    const bodyResult = CreateSnapshotRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const { name, idempotencyKey } = bodyResult.data;

    try {
      // 3. Create snapshot using service
      const snapshot = await snapshotService.create({
        fundId,
        name,
        ...(idempotencyKey && { idempotencyKey }),
      });

      // Return 202 Accepted with location header for polling
      return res.status(202).json({
        success: true,
        data: {
          id: snapshot.id,
          fundId: snapshot.fundId,
          name: snapshot.name,
          status: snapshot.status,
          snapshotTime: snapshot.snapshotTime,
          version: snapshot.version.toString(),
        },
        message: 'Snapshot creation initiated',
        _links: {
          self: `/api/snapshots/${snapshot.id}`,
          poll: `/api/snapshots/${snapshot.id}`,
        },
      });
    } catch (error) {
      if (error instanceof FundNotFoundError) {
        return res.status(404).json({
          error: 'fund_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/funds/:fundId/portfolio/snapshots
 * List snapshots for a fund (cursor-based pagination)
 */
router.get(
  '/funds/:fundId/portfolio/snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { fundId } = FundIdParamSchema.parse(req.params);

    // 2. Validate query params
    const queryResult = ListSnapshotsRequestSchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query_parameters',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { cursor, limit, status } = queryResult.data;

    try {
      // 3. List snapshots using service
      const result = await snapshotService.list(fundId, {
        ...(cursor && { cursor }),
        limit,
        ...(status && { status: status as 'pending' | 'calculating' | 'complete' | 'error' }),
      });

      return res.json({
        success: true,
        data: result.snapshots.map((s) => ({
          id: s.id,
          fundId: s.fundId,
          name: s.name,
          status: s.status,
          snapshotTime: s.snapshotTime,
          version: s.version.toString(),
          createdAt: s.createdAt,
        })),
        pagination: {
          hasMore: result.hasMore,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        },
      });
    } catch (error) {
      if (error instanceof FundNotFoundError) {
        return res.status(404).json({
          error: 'fund_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/snapshots/:snapshotId
 * Get snapshot details (status polling)
 */
router.get(
  '/snapshots/:snapshotId',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { snapshotId } = SnapshotIdParamSchema.parse(req.params);

    try {
      // 2. Get snapshot using service
      const snapshot = await snapshotService.get(snapshotId);

      // Add retry-after header for incomplete snapshots
      if (snapshot.status === 'pending' || snapshot.status === 'calculating') {
        res.setHeader('Retry-After', '5');
      }

      return res.json({
        success: true,
        data: {
          id: snapshot.id,
          fundId: snapshot.fundId,
          name: snapshot.name,
          status: snapshot.status,
          snapshotTime: snapshot.snapshotTime,
          calculatedMetrics: snapshot.calculatedMetrics,
          fundState: snapshot.fundState,
          portfolioState: snapshot.portfolioState,
          metricsState: snapshot.metricsState,
          version: snapshot.version.toString(),
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        },
      });
    } catch (error) {
      if (error instanceof SnapshotNotFoundError) {
        return res.status(404).json({
          error: 'snapshot_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * PUT /api/snapshots/:snapshotId
 * Update snapshot (optimistic locking)
 */
router.put(
  '/snapshots/:snapshotId',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const { snapshotId } = SnapshotIdParamSchema.parse(req.params);

    // 2. Validate request body
    const bodyResult = UpdateSnapshotRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const { name, status, calculatedMetrics, version } = bodyResult.data;

    // Version is required for optimistic locking
    if (version === undefined) {
      return res.status(400).json({
        error: 'version_required',
        message: 'Version field is required for optimistic locking',
      });
    }

    try {
      // 3. Update snapshot using service
      const snapshot = await snapshotService.update(snapshotId, {
        ...(name && { name }),
        ...(status && { status: status as 'pending' | 'calculating' | 'complete' | 'error' }),
        ...(calculatedMetrics && { calculatedMetrics }),
        version: BigInt(version),
      });

      return res.json({
        success: true,
        data: {
          id: snapshot.id,
          fundId: snapshot.fundId,
          name: snapshot.name,
          status: snapshot.status,
          snapshotTime: snapshot.snapshotTime,
          calculatedMetrics: snapshot.calculatedMetrics,
          version: snapshot.version.toString(),
          updatedAt: snapshot.updatedAt,
        },
        message: 'Snapshot updated successfully',
      });
    } catch (error) {
      if (error instanceof SnapshotNotFoundError) {
        return res.status(404).json({
          error: 'snapshot_not_found',
          message: error.message,
        });
      }
      if (error instanceof SnapshotVersionConflictError) {
        return res.status(409).json({
          error: 'version_conflict',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

export default router;
