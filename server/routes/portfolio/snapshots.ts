import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async.js';
import {
  CreateSnapshotRequestSchema,
  ListSnapshotsRequestSchema,
  UpdateSnapshotRequestSchema,
} from '../../../shared/schemas/portfolio-route.js';

const router = Router();

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
 * Verify that a snapshot exists and optionally belongs to a specific fund.
 * Throws 404 error if snapshot not found.
 */
async function verifySnapshotExists(_snapshotId: string, _fundId?: number): Promise<void> {
  // TODO: Implement database query
  throw new Error('Not implemented');
}

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

    const { name: _name, idempotencyKey: _idempotencyKey } = bodyResult.data;

    // 3. Verify fund exists
    await verifyFundExists(fundId);

    // TODO: Implement snapshot creation logic
    // - Check idempotency key (if provided)
    // - Create snapshot record (status: pending)
    // - Queue BullMQ job
    // - Return 202 with snapshot ID

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Snapshot creation not yet implemented',
    });
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

    const { cursor: _cursor, limit: _limit, status: _status } = queryResult.data;

    // 3. Verify fund exists
    await verifyFundExists(fundId);

    // TODO: Implement snapshot listing logic
    // - Build query conditions (fundId, status filter, cursor)
    // - Fetch limit+1 rows (detect hasMore)
    // - Return paginated response

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Snapshot listing not yet implemented',
    });
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

    // 2. Verify snapshot exists
    await verifySnapshotExists(snapshotId);

    // TODO: Implement snapshot retrieval logic
    // - Fetch snapshot from database
    // - If calculating: include progress from Redis
    // - If not complete: include retryAfter

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Snapshot retrieval not yet implemented',
    });
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

    const {
      name: _name,
      status: _status,
      calculatedMetrics: _calculatedMetrics,
      version: _version,
    } = bodyResult.data;

    // 3. Verify snapshot exists
    await verifySnapshotExists(snapshotId);

    // TODO: Implement snapshot update logic
    // - Validate status transition (if status provided)
    // - Update with WHERE version = ? clause
    // - Check rowCount (if 0, return 409 Conflict)
    // - Return updated snapshot

    return res.status(501).json({
      error: 'not_implemented',
      message: 'Snapshot update not yet implemented',
    });
  })
);

export default router;
