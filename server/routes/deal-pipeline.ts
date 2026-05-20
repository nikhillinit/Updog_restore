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
import { firstString } from '../lib/request-values';
import { z } from 'zod';
import { CompanySectorSchema, CompanyStageSchema } from '@shared/company-taxonomy';
import { idempotency } from '../middleware/idempotency';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import * as dealPipelineService from '../services/deal-pipeline-service';

const router = Router();
const idempotent = idempotency();

// ============================================================
// ZOD VALIDATION SCHEMAS
// Ref: AP-CURSOR-02 - Cursor validation required
// ============================================================

const DealStatusEnum = z.enum([
  'lead',
  'qualified',
  'pitch',
  'dd',
  'committee',
  'term_sheet',
  'closed',
  'passed',
]);

const DealPriorityEnum = z.enum(['high', 'medium', 'low']);

const DealStageEnum = CompanyStageSchema;

const SourceTypeEnum = z.enum([
  'Referral',
  'Cold outreach',
  'Inbound',
  'Event',
  'Network',
  'Other',
]);

// Create Deal Schema
const CreateDealSchema = z.object({
  fundId: z.number().int().positive().optional(),
  companyName: z.string().min(1, 'Company name is required').max(255),
  sector: CompanySectorSchema,
  stage: DealStageEnum,
  sourceType: SourceTypeEnum,
  dealSize: z.number().positive().optional(),
  valuation: z.number().positive().optional(),
  status: DealStatusEnum.default('lead'),
  priority: DealPriorityEnum.default('medium'),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  sourceNotes: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
});

// Update Deal Schema (partial)
const UpdateDealSchema = CreateDealSchema.partial();

// Cursor Pagination Schema - Ref: AP-CURSOR-04 - Limit clamping required
const SortByEnum = z
  .enum(['updatedAt', 'companyName', 'dealSize', 'createdAt'])
  .default('createdAt');
const SortDirEnum = z.enum(['asc', 'desc']).default('desc');

const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: DealStatusEnum.optional(),
  priority: DealPriorityEnum.optional(),
  fundId: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  sortBy: SortByEnum,
  sortDir: SortDirEnum,
});

const PipelineQuerySchema = z.object({
  fundId: z.coerce.number().int().positive().optional(),
});

// Stage Change Schema
const StageChangeSchema = z.object({
  status: DealStatusEnum,
  notes: z.string().max(1000).optional(),
});

// Due Diligence Item Schema
const CreateDDItemSchema = z.object({
  category: z.enum(['Financial', 'Legal', 'Technical', 'Market', 'Team']),
  item: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'not_applicable']).default('pending'),
  priority: DealPriorityEnum.default('medium'),
  assignedTo: z.string().max(255).optional(),
  dueDate: z.string().datetime().optional(),
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

interface CursorData {
  createdAt: string;
  id: number;
}

function encodeCursor(createdAt: Date, id: number): string {
  const data: CursorData = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const data = JSON.parse(decoded) as CursorData;
    // Validate cursor structure
    if (!data.createdAt || typeof data.id !== 'number') {
      return null;
    }
    const createdAt = new Date(data.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
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
    console.error('Deal creation error:', error);
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
    console.error('Deal list error:', error);
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
    console.error('Deal fetch error:', error);
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
router['put']('/opportunities/:id', idempotent, async (req: Request, res: Response) => {
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
    if (data.fundId !== undefined && !(await enforceProvidedFundScope(req, res, data.fundId))) {
      return;
    }

    const updated = await dealPipelineService.updateDeal(id, data);
    if (!updated) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: updated,
      message: 'Deal updated successfully',
    });
  } catch (error) {
    console.error('Deal update error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update deal',
    });
  }
});

/**
 * DELETE /api/deals/opportunities/:id - Archive deal (soft delete)
 */
router['delete']('/opportunities/:id', idempotent, async (req: Request, res: Response) => {
  const paramId = firstString(req.params['id']);
  if (!paramId) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const archived = await dealPipelineService.archiveDeal(id);
    if (!archived) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.json({
      success: true,
      data: archived,
      message: 'Deal archived successfully',
    });
  } catch (error) {
    console.error('Deal archive error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to archive deal',
    });
  }
});

/**
 * POST /api/deals/:id/stage - Move deal to new stage
 */
router['post']('/:id/stage', idempotent, async (req: Request, res: Response) => {
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
    const result = await dealPipelineService.changeDealStage(id, validation.data);
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
    console.error('Stage change error:', error);
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
    console.error('Pipeline fetch error:', error);
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
    console.error('Stages fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch stages',
    });
  }
});

/**
 * POST /api/deals/:id/diligence - Add due diligence item
 */
router['post']('/:id/diligence', idempotent, async (req: Request, res: Response) => {
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
    const item = await dealPipelineService.createDiligenceItem(dealId, validation.data);
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'Deal not found' });
    }

    return res.status(201).json({
      success: true,
      data: item,
      message: 'Due diligence item added',
    });
  } catch (error) {
    console.error('DD item creation error:', error);
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
    console.error('DD items fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch due diligence items',
    });
  }
});

// ============================================================
// IMPORT SCHEMAS
// ============================================================

const ImportRowSchema = z.object({
  companyName: z.string().min(1).max(255),
  sector: CompanySectorSchema,
  stage: DealStageEnum,
  sourceType: SourceTypeEnum,
  dealSize: z.number().positive().optional(),
  valuation: z.number().positive().optional(),
  status: DealStatusEnum.optional(),
  priority: DealPriorityEnum.optional(),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  sourceNotes: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
});

const ImportPreviewSchema = z.object({
  rows: z.array(z.record(z.unknown())).max(1000),
  fundId: z.number().int().positive().optional(),
});

const ImportConfirmSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(1000),
  fundId: z.number().int().positive().optional(),
  mode: z.enum(['skip_duplicates', 'import_all']).default('skip_duplicates'),
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
    console.error('Import preview error:', error);
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
    console.error('Import error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to import deals',
    });
  }
});

// ============================================================
// BULK ACTION SCHEMAS
// ============================================================

const BulkStatusSchema = z.object({
  dealIds: z.array(z.number().int().positive()).min(1).max(100),
  status: DealStatusEnum,
  notes: z.string().max(1000).optional(),
});

const BulkArchiveSchema = z.object({
  dealIds: z.array(z.number().int().positive()).min(1).max(100),
});

// ============================================================
// BULK ACTION ENDPOINTS
// ============================================================

/**
 * POST /api/deals/opportunities/bulk/status
 * Bulk update deal statuses. Idempotent per dealId+status pair.
 */
router['post']('/opportunities/bulk/status', idempotent, async (req: Request, res: Response) => {
  const validation = BulkStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const data = await dealPipelineService.bulkUpdateStatus(validation.data);

    return res.json({
      success: data.failed.length === 0,
      data,
    });
  } catch (error) {
    console.error('Bulk status error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to bulk update statuses',
    });
  }
});

/**
 * POST /api/deals/opportunities/bulk/archive
 * Bulk archive deals (soft delete to 'passed' status). Idempotent.
 */
router['post']('/opportunities/bulk/archive', idempotent, async (req: Request, res: Response) => {
  const validation = BulkArchiveSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const data = await dealPipelineService.bulkArchive(validation.data);

    return res.json({
      success: data.failed.length === 0,
      data,
    });
  } catch (error) {
    console.error('Bulk archive error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to bulk archive deals',
    });
  }
});

export default router;
export { router as dealPipelineRouter };
export const dealPipelineValidationSchemas = {
  createDeal: CreateDealSchema,
  updateDeal: UpdateDealSchema,
  importConfirm: ImportConfirmSchema,
} as const;
