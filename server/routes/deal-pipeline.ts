/**
 * Deal Pipeline API Routes
 *
 * Sprint 1: Deal Pipeline MVP - Full CRUD with cursor pagination
 * Ref: Roadmap Section 1.1 Backend API Development
 *
 * Endpoints:
 * - POST   /api/deals/opportunities        - Create new deal
 * - GET    /api/deals/opportunities        - List deals with filters
 * - GET    /api/deals/opportunities/:id    - Get deal by ID
 * - PUT    /api/deals/opportunities/:id    - Update deal
 * - DELETE /api/deals/opportunities/:id    - Archive deal
 * - POST   /api/deals/:id/stage            - Move deal to stage
 * - GET    /api/deals/pipeline             - Pipeline view (Kanban)
 * - POST   /api/deals/:id/diligence        - Add DD item
 * - GET    /api/deals/stages               - Get pipeline stages
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { TEAM_WRITE_ROLES } from '@shared/auth/effective-roles';
import { firstString } from '../lib/request-values';
import { idempotency } from '../middleware/idempotency';
import { requireWriteRole } from '../lib/auth/jwt';
import {
  enforceProvidedFundScope,
  getVerifiedFundScope,
} from '../lib/auth/provided-fund-scope';
import * as dealPipelineService from '../services/deal-pipeline-service';
import { decodeCursor, encodeCursor, type CursorData } from '../services/deal-pipeline/cursor';
import {
  BulkArchiveSchema,
  BulkStatusSchema,
  CreateDDItemSchema,
  CreateDealSchema,
  ImportPreviewSchema,
  ImportRowSchema,
  ImportConfirmSchema,
  PaginationSchema,
  PipelineQuerySchema,
  StageChangeSchema,
  UpdateDealSchema,
  dealPipelineValidationSchemas,
} from '../services/deal-pipeline/schemas';
import { createRouteLogger } from '../lib/route-logger.js';

const routeLog = createRouteLogger('deal-pipeline');

const router = Router();
const idempotent = idempotency();
const requireTeamWrite = requireWriteRole(TEAM_WRITE_ROLES);

type DealWriteScope = {
  dealId: number;
  fundId: number;
};

function notFoundDeal(res: Response): void {
  res.status(404).json({ error: 'not_found', message: 'Deal not found' });
}

function denyDealFundAccess(res: Response, fundId: number): void {
  res.status(403).json({
    error: 'Forbidden',
    code: 'FUND_ACCESS_DENIED',
    message: `You do not have access to fund ${fundId}`,
  });
}

async function resolveDealWriteScope(
  req: Request,
  res: Response,
  dealId: number,
  requestedFundId?: number
): Promise<DealWriteScope | undefined> {
  const ownership = await dealPipelineService.getDealOwnership(dealId);
  if (!ownership || ownership.fundId === null) {
    notFoundDeal(res);
    return undefined;
  }

  if (requestedFundId !== undefined && requestedFundId !== ownership.fundId) {
    denyDealFundAccess(res, requestedFundId);
    return undefined;
  }

  const verifiedScope = await getVerifiedFundScope(req);
  if (
    requestedFundId === undefined &&
    verifiedScope &&
    !verifiedScope.unrestricted &&
    !verifiedScope.fundIds.includes(ownership.fundId)
  ) {
    notFoundDeal(res);
    return undefined;
  }

  if (!(await enforceProvidedFundScope(req, res, ownership.fundId, { forWrite: true }))) {
    return undefined;
  }

  return { dealId, fundId: ownership.fundId };
}

async function resolveBulkDealFund(
  req: Request,
  res: Response,
  dealIds: number[]
): Promise<number | undefined> {
  const uniqueDealIds = [...new Set(dealIds)];
  const ownerships = await dealPipelineService.getDealOwnerships(uniqueDealIds);
  if (ownerships.length !== uniqueDealIds.length || ownerships.some((deal) => deal.fundId === null)) {
    notFoundDeal(res);
    return undefined;
  }

  const fundIds = new Set(ownerships.map((deal) => deal.fundId));
  if (fundIds.size !== 1) {
    res.status(400).json({
      error: 'mixed_fund_deals',
      message: 'All deal IDs must belong to one fund',
    });
    return undefined;
  }

  const [fundId] = [...fundIds];
  if (typeof fundId !== 'number') {
    notFoundDeal(res);
    return undefined;
  }

  const verifiedScope = await getVerifiedFundScope(req);
  if (
    verifiedScope &&
    !verifiedScope.unrestricted &&
    !verifiedScope.fundIds.includes(fundId)
  ) {
    notFoundDeal(res);
    return undefined;
  }

  if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
    return undefined;
  }

  return fundId;
}

// ============================================================
// DEAL OPPORTUNITY ROUTES
// ============================================================

/**
 * POST /api/deals/opportunities - Create new deal
 * Idempotency-enabled for safe retries
 */
router['post']('/opportunities', idempotent, async (req: Request, res: Response) => {
  const validation = CreateDealSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const data = validation.data;
    if (data.fundId !== undefined && !(await enforceProvidedFundScope(req, res, data.fundId))) {
      return;
    }

    const deal = await dealPipelineService.createDeal(data);
    if (!deal) {
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create deal - no result returned',
      });
    }

    return res.status(201).json({
      success: true,
      data: deal,
      message: 'Deal created successfully',
    });
  } catch (error) {
    routeLog.error('Deal creation error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Failed to create deal',
    });
  }
});

/**
 * GET /api/deals/opportunities - List deals with cursor pagination
 * Ref: AP-CURSOR-05 - Compound cursor for race-condition-free pagination
 */
router['get']('/opportunities', async (req: Request, res: Response) => {
  const validation = PaginationSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { cursor, limit, status, priority, fundId, search, sortBy, sortDir } = validation.data;

    if (fundId !== undefined && !(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const isDefaultSort = sortBy === 'createdAt' && sortDir === 'desc';
    let cursorData: CursorData | undefined;
    if (cursor && isDefaultSort) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return res.status(400).json({
          error: 'invalid_cursor',
          message: 'The provided cursor is invalid or expired',
        });
      }
      cursorData = decodedCursor;
    }

    const result = await dealPipelineService.listDeals({
      cursor: cursorData,
      limit,
      status,
      priority,
      fundId,
      search,
      sortBy,
      sortDir,
    });
    const nextCursor = result.pagination.nextCursor
      ? encodeCursor(result.pagination.nextCursor.createdAt, result.pagination.nextCursor.id)
      : null;

    return res.json({
      success: true,
      data: result.items,
      pagination: {
        hasMore: result.pagination.hasMore,
        nextCursor,
        count: result.pagination.count,
      },
    });
  } catch (error) {
    routeLog.error('Deal list error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch deals',
    });
  }
});

/**
 * GET /api/deals/opportunities/:id - Get deal by ID
 */
router['get']('/opportunities/:id', async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const deal = await dealPipelineService.getDeal(id);
    if (!deal) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: deal,
    });
  } catch (error) {
    routeLog.error('Deal fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch deal',
    });
  }
});

/**
 * PUT /api/deals/opportunities/:id - Update deal
 * Idempotency-enabled
 */
router['put']('/opportunities/:id', requireTeamWrite, idempotent, async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = UpdateDealSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const data = validation.data;
    if (
      data.fundId !== undefined &&
      !(await enforceProvidedFundScope(req, res, data.fundId, { forWrite: true }))
    ) {
      return;
    }

    const scope = await resolveDealWriteScope(req, res, id, data.fundId);
    if (!scope) {
      return;
    }

    const mutationData = { ...data };
    delete mutationData.fundId;
    const updated = await dealPipelineService.updateDeal(id, scope.fundId, mutationData);
    if (!updated) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: updated,
      message: 'Deal updated successfully',
    });
  } catch (error) {
    routeLog.error('Deal update error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update deal',
    });
  }
});

/**
 * DELETE /api/deals/opportunities/:id - Archive deal (soft delete)
 */
router['delete'](
  '/opportunities/:id',
  requireTeamWrite,
  idempotent,
  async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const scope = await resolveDealWriteScope(req, res, id);
    if (!scope) {
      return;
    }

    const archived = await dealPipelineService.archiveDeal(id, scope.fundId);
    if (!archived) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: archived,
      message: 'Deal archived successfully',
    });
  } catch (error) {
    routeLog.error('Deal archive error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to archive deal',
    });
  }
  }
);

/**
 * POST /api/deals/:id/stage - Move deal to new stage
 */
router['post']('/:id/stage', requireTeamWrite, idempotent, async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = StageChangeSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const scope = await resolveDealWriteScope(req, res, id);
    if (!scope) {
      return;
    }

    const result = await dealPipelineService.changeDealStage(id, scope.fundId, validation.data);
    if (!result) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: result.updated,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      message: 'Deal stage updated successfully',
    });
  } catch (error) {
    routeLog.error('Stage change error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update deal stage',
    });
  }
});

/**
 * GET /api/deals/pipeline - Pipeline view (grouped by status)
 */
router['get']('/pipeline', async (req: Request, res: Response) => {
  const validation = PipelineQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { fundId } = validation.data;
    if (fundId !== undefined && !(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const data = await dealPipelineService.getPipeline(fundId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    routeLog.error('Pipeline fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch pipeline',
    });
  }
});

/**
 * GET /api/deals/stages - Get pipeline stage configuration
 */
router['get']('/stages', async (_req: Request, res: Response) => {
  try {
    const stages = await dealPipelineService.getPipelineStages();

    return res.json({
      success: true,
      data: stages,
    });
  } catch (error) {
    routeLog.error('Stages fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch stages',
    });
  }
});

/**
 * POST /api/deals/:id/diligence - Add due diligence item
 */
router['post']('/:id/diligence', requireTeamWrite, idempotent, async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const dealId = parseInt(paramId, 10);
  if (isNaN(dealId)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = CreateDDItemSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const scope = await resolveDealWriteScope(req, res, dealId);
    if (!scope) {
      return;
    }

    const item = await dealPipelineService.createDiligenceItem(
      dealId,
      scope.fundId,
      validation.data
    );
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.status(201).json({
      success: true,
      data: item,
      message: 'Due diligence item added',
    });
  } catch (error) {
    routeLog.error('DD item creation error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to add due diligence item',
    });
  }
});

/**
 * GET /api/deals/:id/diligence - Get due diligence items for deal
 */
router['get']('/:id/diligence', async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const dealId = parseInt(paramId, 10);
  if (isNaN(dealId)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const data = await dealPipelineService.getDiligenceItems(dealId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    routeLog.error('DD items fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch due diligence items',
    });
  }
});

// ============================================================
// IMPORT ENDPOINTS
// ============================================================

/**
 * POST /api/deals/opportunities/import/preview
 * Validate rows and check for duplicates. Returns summary without inserting.
 */
router['post']('/opportunities/import/preview', async (req: Request, res: Response) => {
  const validation = ImportPreviewSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { rows: rawRows, fundId } = validation.data;
    if (fundId !== undefined && !(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const valid: dealPipelineService.ImportPreviewRow[] = [];
    const invalid: dealPipelineService.InvalidImportPreviewRow[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const result = ImportRowSchema.safeParse(rawRows[i]);
      if (result.success) {
        valid.push({ index: i, data: result.data });
      } else {
        invalid.push({
          index: i,
          errors: result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`),
        });
      }
    }

    const data = await dealPipelineService.previewImport({
      rawRowCount: rawRows.length,
      valid,
      invalid,
      fundId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    routeLog.error('Import preview error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to preview import',
    });
  }
});

/**
 * POST /api/deals/opportunities/import
 * Bulk import validated rows. Supports skip_duplicates mode.
 */
router['post']('/opportunities/import', idempotent, async (req: Request, res: Response) => {
  const validation = ImportConfirmSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { rows, fundId, mode } = validation.data;
    if (fundId !== undefined && !(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const data = await dealPipelineService.confirmImport({ rows, fundId, mode });

    return res.json({
      success: data.failed === 0,
      data,
    });
  } catch (error) {
    routeLog.error('Import error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to import deals',
    });
  }
});

// ============================================================
// BULK ACTION ENDPOINTS
// ============================================================

/**
 * POST /api/deals/opportunities/bulk/status
 * Bulk update deal statuses. Idempotent per dealId+status pair.
 */
router['post'](
  '/opportunities/bulk/status',
  requireTeamWrite,
  idempotent,
  async (req: Request, res: Response) => {
  const validation = BulkStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const fundId = await resolveBulkDealFund(req, res, validation.data.dealIds);
    if (fundId === undefined) {
      return;
    }

    const data = await dealPipelineService.bulkUpdateStatus({ ...validation.data, fundId });

    return res.json({
      success: data.failed.length === 0,
      data,
    });
  } catch (error) {
    routeLog.error('Bulk status error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to bulk update statuses',
    });
  }
  }
);

/**
 * POST /api/deals/opportunities/bulk/archive
 * Bulk archive deals (soft delete to 'passed' status). Idempotent.
 */
router['post'](
  '/opportunities/bulk/archive',
  requireTeamWrite,
  idempotent,
  async (req: Request, res: Response) => {
  const validation = BulkArchiveSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const fundId = await resolveBulkDealFund(req, res, validation.data.dealIds);
    if (fundId === undefined) {
      return;
    }

    const data = await dealPipelineService.bulkArchive({ ...validation.data, fundId });

    return res.json({
      success: data.failed.length === 0,
      data,
    });
  } catch (error) {
    routeLog.error('Bulk archive error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to bulk archive deals',
    });
  }
  }
);

export default router;
export { router as dealPipelineRouter };
export { dealPipelineValidationSchemas };
