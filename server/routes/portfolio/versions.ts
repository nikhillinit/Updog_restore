/**
 * Snapshot Version Routes
 *
 * API endpoints for managing snapshot version history.
 * Base path: /api/snapshots/:snapshotId/versions
 *
 * @module server/routes/portfolio/versions
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async.js';
import {
  SnapshotVersionService,
  VersionNotFoundError,
  SnapshotNotFoundError,
} from '../../services/snapshot-version-service';
import { VersionComparisonService } from '../../services/version-comparison-service';
import {
  SnapshotIdParamSchema,
  VersionIdParamSchema,
  VersionNumberParamSchema,
  CreateVersionRequestSchema,
  RestoreVersionRequestSchema,
  CompareVersionsRequestSchema,
  ListVersionsQuerySchema,
  HistoryQuerySchema,
} from '../../../shared/schemas/version-schemas.js';

const router = Router({ mergeParams: true });
const versionService = new SnapshotVersionService();
const comparisonService = new VersionComparisonService(versionService);

// ============================================================================
// Version CRUD Routes
// ============================================================================

/**
 * POST /api/snapshots/:snapshotId/versions
 * Create a new version (saves current state)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const paramsResult = SnapshotIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid snapshot ID',
        details: paramsResult.error.format(),
      });
    }

    // 2. Validate request body
    const bodyResult = CreateVersionRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const { snapshotId } = paramsResult.data;
    const { versionName, description, tags, isPinned } = bodyResult.data;

    try {
      // 3. Get current snapshot state (from parent service)
      // Note: In a real implementation, we'd fetch the current snapshot state
      // For now, we'll use a placeholder - the caller should provide state
      const stateSnapshot = req.body.stateSnapshot || {};

      const version = await versionService.createVersion({
        snapshotId,
        stateSnapshot,
        versionName,
        description,
        tags,
        isPinned,
      });

      return res.status(201).json({
        success: true,
        data: {
          id: version.id,
          snapshotId: version.snapshotId,
          versionNumber: version.versionNumber,
          versionName: version.versionName,
          isCurrent: version.isCurrent,
          isPinned: version.isPinned,
          sourceHash: version.sourceHash,
          createdAt: version.createdAt.toISOString(),
          expiresAt: version.expiresAt?.toISOString() ?? null,
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
 * GET /api/snapshots/:snapshotId/versions
 * List versions with pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate path params
    const paramsResult = SnapshotIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid snapshot ID',
        details: paramsResult.error.format(),
      });
    }

    // 2. Validate query params
    const queryResult = ListVersionsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { snapshotId } = paramsResult.data;
    const { cursor, limit, includeExpired } = queryResult.data;

    try {
      const result = await versionService.listVersions({
        snapshotId,
        cursor,
        limit,
        includeExpired,
      });

      return res.status(200).json({
        success: true,
        data: result.versions.map((v) => ({
          id: v.id,
          snapshotId: v.snapshotId,
          versionNumber: v.versionNumber,
          versionName: v.versionName,
          description: v.description,
          isCurrent: v.isCurrent,
          isPinned: v.isPinned,
          createdAt: v.createdAt.toISOString(),
          expiresAt: v.expiresAt?.toISOString() ?? null,
        })),
        pagination: {
          hasMore: result.hasMore,
          ...(result.nextCursor && { nextCursor: result.nextCursor }),
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
 * GET /api/snapshots/:snapshotId/versions/current
 * Get current (latest) version
 */
router.get(
  '/current',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = SnapshotIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid snapshot ID',
        details: paramsResult.error.format(),
      });
    }

    const { snapshotId } = paramsResult.data;

    try {
      const version = await versionService.getCurrent(snapshotId);

      return res.status(200).json({
        success: true,
        data: {
          id: version.id,
          snapshotId: version.snapshotId,
          versionNumber: version.versionNumber,
          versionName: version.versionName,
          description: version.description,
          isCurrent: version.isCurrent,
          isPinned: version.isPinned,
          stateSnapshot: version.stateSnapshot,
          calculatedMetrics: version.calculatedMetrics,
          sourceHash: version.sourceHash,
          createdAt: version.createdAt.toISOString(),
          expiresAt: version.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      if (error instanceof SnapshotNotFoundError) {
        return res.status(404).json({
          error: 'snapshot_not_found',
          message: error.message,
        });
      }
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/snapshots/:snapshotId/versions/number/:versionNumber
 * Get specific version by number
 */
router.get(
  '/number/:versionNumber',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionNumberParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const { snapshotId, versionNumber } = paramsResult.data;

    try {
      const version = await versionService.getVersionByNumber(snapshotId, versionNumber);

      return res.status(200).json({
        success: true,
        data: {
          id: version.id,
          snapshotId: version.snapshotId,
          versionNumber: version.versionNumber,
          versionName: version.versionName,
          description: version.description,
          isCurrent: version.isCurrent,
          isPinned: version.isPinned,
          stateSnapshot: version.stateSnapshot,
          calculatedMetrics: version.calculatedMetrics,
          sourceHash: version.sourceHash,
          createdAt: version.createdAt.toISOString(),
          expiresAt: version.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      if (error instanceof SnapshotNotFoundError) {
        return res.status(404).json({
          error: 'snapshot_not_found',
          message: error.message,
        });
      }
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/snapshots/:snapshotId/versions/:versionId
 * Get specific version by ID
 */
router.get(
  '/:versionId',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const { versionId } = paramsResult.data;

    try {
      const version = await versionService.getVersion(versionId);

      return res.status(200).json({
        success: true,
        data: {
          id: version.id,
          snapshotId: version.snapshotId,
          versionNumber: version.versionNumber,
          versionName: version.versionName,
          description: version.description,
          isCurrent: version.isCurrent,
          isPinned: version.isPinned,
          stateSnapshot: version.stateSnapshot,
          calculatedMetrics: version.calculatedMetrics,
          sourceHash: version.sourceHash,
          createdAt: version.createdAt.toISOString(),
          expiresAt: version.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

// ============================================================================
// Version Operations Routes
// ============================================================================

/**
 * POST /api/snapshots/:snapshotId/versions/:versionId/restore
 * Restore to this version (creates new version with old state)
 */
router.post(
  '/:versionId/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const bodyResult = RestoreVersionRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const { snapshotId, versionId } = paramsResult.data;
    const { description } = bodyResult.data;

    try {
      const version = await versionService.restore(snapshotId, versionId, description);

      return res.status(201).json({
        success: true,
        data: {
          id: version.id,
          snapshotId: version.snapshotId,
          versionNumber: version.versionNumber,
          versionName: version.versionName,
          isCurrent: version.isCurrent,
          createdAt: version.createdAt.toISOString(),
        },
        message: 'Version restored successfully',
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * POST /api/snapshots/:snapshotId/versions/:versionId/pin
 * Pin version (prevent auto-pruning)
 */
router.post(
  '/:versionId/pin',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const { versionId } = paramsResult.data;

    try {
      const version = await versionService.pinVersion(versionId);

      return res.status(200).json({
        success: true,
        data: {
          id: version.id,
          isPinned: version.isPinned,
          expiresAt: version.expiresAt?.toISOString() ?? null,
        },
        message: 'Version pinned successfully',
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/snapshots/:snapshotId/versions/:versionId/pin
 * Unpin version (allow auto-pruning)
 */
router.delete(
  '/:versionId/pin',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const { versionId } = paramsResult.data;

    try {
      const version = await versionService.unpinVersion(versionId);

      return res.status(200).json({
        success: true,
        data: {
          id: version.id,
          isPinned: version.isPinned,
          expiresAt: version.expiresAt?.toISOString() ?? null,
        },
        message: 'Version unpinned successfully',
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/snapshots/:snapshotId/versions/:versionId/history
 * Get ancestry chain for a version
 */
router.get(
  '/:versionId/history',
  asyncHandler(async (req: Request, res: Response) => {
    const paramsResult = VersionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Invalid parameters',
        details: paramsResult.error.format(),
      });
    }

    const queryResult = HistoryQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'invalid_query',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { versionId } = paramsResult.data;
    const { limit } = queryResult.data;

    try {
      const history = await versionService.getHistory(versionId, limit);

      return res.status(200).json({
        success: true,
        data: history.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          versionName: v.versionName,
          description: v.description,
          isCurrent: v.isCurrent,
          isPinned: v.isPinned,
          createdAt: v.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

// ============================================================================
// Version Comparison Routes
// ============================================================================

/**
 * POST /api/snapshots/:snapshotId/versions/compare
 * Compare two versions and get diff + metric deltas
 */
router.post(
  '/compare',
  asyncHandler(async (req: Request, res: Response) => {
    const bodyResult = CompareVersionsRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid request body',
        details: bodyResult.error.format(),
      });
    }

    const { baseVersionId, comparisonVersionId, metrics } = bodyResult.data;

    try {
      const result = await comparisonService.compareVersions({
        baseVersionId,
        comparisonVersionId,
        metrics,
      });

      return res.status(200).json({
        success: true,
        data: {
          id: result.id,
          baseVersionId: result.baseVersionId,
          comparisonVersionId: result.comparisonVersionId,
          baseVersionNumber: result.baseVersionNumber,
          comparisonVersionNumber: result.comparisonVersionNumber,
          diffSummary: result.diffSummary,
          stateDiff: {
            addedKeys: result.stateDiff.addedKeys,
            removedKeys: result.stateDiff.removedKeys,
            modifiedKeys: result.stateDiff.modifiedKeys,
            totalChanges: result.stateDiff.totalChanges,
          },
          metricDeltas: result.metricDeltas,
          createdAt: result.createdAt,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({
          error: 'version_not_found',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

/**
 * GET /api/snapshots/:snapshotId/versions/compare/:comparisonId
 * Retrieve cached comparison result
 */
router.get(
  '/compare/:comparisonId',
  asyncHandler(async (req: Request, res: Response) => {
    const { comparisonId } = req.params;

    if (!comparisonId) {
      return res.status(400).json({
        error: 'invalid_params',
        message: 'Comparison ID is required',
      });
    }

    const result = await comparisonService.getComparison(comparisonId);

    if (!result) {
      return res.status(404).json({
        error: 'comparison_not_found',
        message: 'Comparison not found or expired',
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export default router;
