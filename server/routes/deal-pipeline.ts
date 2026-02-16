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
import { z } from 'zod';
import { db } from '../db';
import {
  dealOpportunities,
  pipelineStages,
  dueDiligenceItems,
  scoringModels,
  pipelineActivities,
} from '@shared/schema';
import { eq, and, desc, asc, lt, or, sql, inArray } from 'drizzle-orm';
import { idempotency } from '../middleware/idempotency';

const router = Router();

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

const DealStageEnum = z.enum([
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Growth',
  'Late Stage',
]);

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
  sector: z.string().min(1, 'Sector is required').max(100),
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
router['post']('/opportunities', idempotency, async (req: Request, res: Response) => {
  const validation = CreateDealSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const data = validation.data;

    const [deal] = await db
      .insert(dealOpportunities)
      .values({
        fundId: data.fundId ?? null,
        companyName: data.companyName,
        sector: data.sector,
        stage: data.stage,
        sourceType: data.sourceType,
        dealSize: data.dealSize ? String(data.dealSize) : null,
        valuation: data.valuation ? String(data.valuation) : null,
        status: data.status,
        priority: data.priority,
        foundedYear: data.foundedYear ?? null,
        employeeCount: data.employeeCount ?? null,
        revenue: data.revenue ? String(data.revenue) : null,
        description: data.description ?? null,
        website: data.website || null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone ?? null,
        sourceNotes: data.sourceNotes ?? null,
        nextAction: data.nextAction ?? null,
      })
      .returning();

    if (!deal) {
      return res['status'](500)['json']({
        error: 'internal_error',
        message: 'Failed to create deal - no result returned',
      });
    }

    // Log activity for deal creation
    await db.insert(pipelineActivities).values({
      opportunityId: deal.id,
      type: 'stage_change',
      title: 'Deal Created',
      description: `New deal "${data.companyName}" added to pipeline`,
      completedDate: new Date(),
    });

    return res['status'](201)['json']({
      success: true,
      data: deal,
      message: 'Deal created successfully',
    });
  } catch (error) {
    console.error('Deal creation error:', error);
    return res['status'](500)['json']({
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
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { cursor, limit, status, priority, fundId, search, sortBy, sortDir } = validation.data;

    // Build filter conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(dealOpportunities.status, status));
    }
    if (priority) {
      conditions.push(eq(dealOpportunities.priority, priority));
    }
    if (fundId) {
      conditions.push(eq(dealOpportunities.fundId, fundId));
    }
    if (search) {
      conditions.push(
        or(
          sql`${dealOpportunities.companyName} ILIKE ${`%${search}%`}`,
          sql`${dealOpportunities.sector} ILIKE ${`%${search}%`}`,
          sql`${dealOpportunities.description} ILIKE ${`%${search}%`}`
        )
      );
    }

    // Cursor pagination only works with default sort (createdAt DESC)
    const isDefaultSort = sortBy === 'createdAt' && sortDir === 'desc';
    if (cursor && isDefaultSort) {
      const cursorData = decodeCursor(cursor);
      if (!cursorData) {
        return res['status'](400)['json']({
          error: 'invalid_cursor',
          message: 'The provided cursor is invalid or expired',
        });
      }
      conditions.push(
        or(
          lt(dealOpportunities.createdAt, new Date(cursorData.createdAt)),
          and(
            eq(dealOpportunities.createdAt, new Date(cursorData.createdAt)),
            lt(dealOpportunities.id, cursorData.id)
          )
        )
      );
    }

    // Build dynamic orderBy
    const sortFn = sortDir === 'asc' ? asc : desc;
    const sortColumn = {
      updatedAt: dealOpportunities.updatedAt,
      companyName: dealOpportunities.companyName,
      dealSize: dealOpportunities.dealSize,
      createdAt: dealOpportunities.createdAt,
    }[sortBy];

    const deals = await db
      .select()
      .from(dealOpportunities)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sortFn(sortColumn), desc(dealOpportunities.id))
      .limit(limit + 1);

    // Determine pagination info
    const hasMore = deals.length > limit;
    const items = hasMore ? deals.slice(0, limit) : deals;
    const lastItem = items[items.length - 1];
    // Only provide cursor for default sort
    const nextCursor =
      hasMore && isDefaultSort && lastItem?.createdAt
        ? encodeCursor(lastItem.createdAt, lastItem.id)
        : null;

    return res['json']({
      success: true,
      data: items,
      pagination: {
        hasMore,
        nextCursor,
        count: items.length,
      },
    });
  } catch (error) {
    console.error('Deal list error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to fetch deals',
    });
  }
});

/**
 * GET /api/deals/opportunities/:id - Get deal by ID
 */
router['get']('/opportunities/:id', async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const [deal] = await db
      .select()
      .from(dealOpportunities)
      .where(eq(dealOpportunities.id, id))
      .limit(1);

    if (!deal) {
      return res['status'](404)['json']({ error: 'not_found', message: 'Deal not found' });
    }

    // Fetch related data
    const [ddItems, activities, scores] = await Promise.all([
      db
        .select()
        .from(dueDiligenceItems)
        .where(eq(dueDiligenceItems.opportunityId, id))
        .orderBy(desc(dueDiligenceItems.createdAt)),
      db
        .select()
        .from(pipelineActivities)
        .where(eq(pipelineActivities.opportunityId, id))
        .orderBy(desc(pipelineActivities.createdAt))
        .limit(20),
      db
        .select()
        .from(scoringModels)
        .where(eq(scoringModels.opportunityId, id))
        .orderBy(desc(scoringModels.scoredAt)),
    ]);

    return res['json']({
      success: true,
      data: {
        ...deal,
        dueDiligence: ddItems,
        activities,
        scores,
      },
    });
  } catch (error) {
    console.error('Deal fetch error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to fetch deal',
    });
  }
});

/**
 * PUT /api/deals/opportunities/:id - Update deal
 * Idempotency-enabled
 */
router['put']('/opportunities/:id', idempotency, async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = UpdateDealSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    // Check if deal exists
    const [existing] = await db
      .select()
      .from(dealOpportunities)
      .where(eq(dealOpportunities.id, id))
      .limit(1);

    if (!existing) {
      return res['status'](404)['json']({ error: 'not_found', message: 'Deal not found' });
    }

    const data = validation.data;
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Only include provided fields - use bracket notation for index signature access
    if (data.fundId !== undefined) updateData['fundId'] = data.fundId;
    if (data.companyName !== undefined) updateData['companyName'] = data.companyName;
    if (data.sector !== undefined) updateData['sector'] = data.sector;
    if (data.stage !== undefined) updateData['stage'] = data.stage;
    if (data.sourceType !== undefined) updateData['sourceType'] = data.sourceType;
    if (data.dealSize !== undefined) updateData['dealSize'] = String(data.dealSize);
    if (data.valuation !== undefined) updateData['valuation'] = String(data.valuation);
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.priority !== undefined) updateData['priority'] = data.priority;
    if (data.foundedYear !== undefined) updateData['foundedYear'] = data.foundedYear;
    if (data.employeeCount !== undefined) updateData['employeeCount'] = data.employeeCount;
    if (data.revenue !== undefined) updateData['revenue'] = String(data.revenue);
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.website !== undefined) updateData['website'] = data.website || null;
    if (data.contactName !== undefined) updateData['contactName'] = data.contactName;
    if (data.contactEmail !== undefined) updateData['contactEmail'] = data.contactEmail || null;
    if (data.contactPhone !== undefined) updateData['contactPhone'] = data.contactPhone;
    if (data.sourceNotes !== undefined) updateData['sourceNotes'] = data.sourceNotes;
    if (data.nextAction !== undefined) updateData['nextAction'] = data.nextAction;

    const [updated] = await db
      .update(dealOpportunities)
      .set(updateData)
      .where(eq(dealOpportunities.id, id))
      .returning();

    return res['json']({
      success: true,
      data: updated,
      message: 'Deal updated successfully',
    });
  } catch (error) {
    console.error('Deal update error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to update deal',
    });
  }
});

/**
 * DELETE /api/deals/opportunities/:id - Archive deal (soft delete)
 */
router['delete']('/opportunities/:id', idempotency, async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const [existing] = await db
      .select()
      .from(dealOpportunities)
      .where(eq(dealOpportunities.id, id))
      .limit(1);

    if (!existing) {
      return res['status'](404)['json']({ error: 'not_found', message: 'Deal not found' });
    }

    // Soft delete by setting status to 'passed'
    const [archived] = await db
      .update(dealOpportunities)
      .set({
        status: 'passed',
        updatedAt: new Date(),
      })
      .where(eq(dealOpportunities.id, id))
      .returning();

    // Log activity
    await db.insert(pipelineActivities).values({
      opportunityId: id,
      type: 'stage_change',
      title: 'Deal Archived',
      description: `Deal "${existing.companyName}" was archived`,
      completedDate: new Date(),
    });

    return res['json']({
      success: true,
      data: archived,
      message: 'Deal archived successfully',
    });
  } catch (error) {
    console.error('Deal archive error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to archive deal',
    });
  }
});

/**
 * POST /api/deals/:id/stage - Move deal to new stage
 */
router['post']('/:id/stage', idempotency, async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const id = parseInt(paramId, 10);
  if (isNaN(id)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = StageChangeSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const [existing] = await db
      .select()
      .from(dealOpportunities)
      .where(eq(dealOpportunities.id, id))
      .limit(1);

    if (!existing) {
      return res['status'](404)['json']({ error: 'not_found', message: 'Deal not found' });
    }

    const { status, notes } = validation.data;
    const previousStatus = existing.status;

    const [updated] = await db
      .update(dealOpportunities)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(dealOpportunities.id, id))
      .returning();

    // Log stage change activity
    await db.insert(pipelineActivities).values({
      opportunityId: id,
      type: 'stage_change',
      title: `Stage Changed: ${previousStatus} -> ${status}`,
      description: notes ?? `Deal moved from ${previousStatus} to ${status}`,
      completedDate: new Date(),
    });

    return res['json']({
      success: true,
      data: updated,
      previousStatus,
      newStatus: status,
      message: 'Deal stage updated successfully',
    });
  } catch (error) {
    console.error('Stage change error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to update deal stage',
    });
  }
});

/**
 * GET /api/deals/pipeline - Pipeline view (grouped by status)
 */
router['get']('/pipeline', async (req: Request, res: Response) => {
  const fundIdParam = req['query']['fundId'];
  const fundId = fundIdParam ? parseInt(fundIdParam as string, 10) : undefined;

  try {
    const conditions = fundId ? eq(dealOpportunities['fundId'], fundId) : undefined;

    const deals = await db
      .select()
      .from(dealOpportunities)
      .where(conditions)
      .orderBy(desc(dealOpportunities.priority), desc(dealOpportunities.updatedAt));

    // Group by status for Kanban view
    type DealArray = typeof deals;
    const pipeline: { [key: string]: DealArray } = {
      lead: [],
      qualified: [],
      pitch: [],
      dd: [],
      committee: [],
      term_sheet: [],
      closed: [],
      passed: [],
    };

    for (const deal of deals) {
      const status = deal.status;
      if (status && pipeline[status]) {
        pipeline[status].push(deal);
      }
    }

    // Get stage configuration
    const stages = await db.select().from(pipelineStages).orderBy(pipelineStages.orderIndex);

    return res['json']({
      success: true,
      data: {
        pipeline,
        stages,
        totalDeals: deals.length,
        summary: {
          lead: pipeline['lead']?.length ?? 0,
          qualified: pipeline['qualified']?.length ?? 0,
          pitch: pipeline['pitch']?.length ?? 0,
          dd: pipeline['dd']?.length ?? 0,
          committee: pipeline['committee']?.length ?? 0,
          term_sheet: pipeline['term_sheet']?.length ?? 0,
          closed: pipeline['closed']?.length ?? 0,
          passed: pipeline['passed']?.length ?? 0,
        },
      },
    });
  } catch (error) {
    console.error('Pipeline fetch error:', error);
    return res['status'](500)['json']({
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
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.isActive, true))
      .orderBy(pipelineStages.orderIndex);

    return res['json']({
      success: true,
      data: stages,
    });
  } catch (error) {
    console.error('Stages fetch error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to fetch stages',
    });
  }
});

/**
 * POST /api/deals/:id/diligence - Add due diligence item
 */
router['post']('/:id/diligence', idempotency, async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const dealId = parseInt(paramId, 10);
  if (isNaN(dealId)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  const validation = CreateDDItemSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    // Verify deal exists
    const [deal] = await db
      .select()
      .from(dealOpportunities)
      .where(eq(dealOpportunities.id, dealId))
      .limit(1);

    if (!deal) {
      return res['status'](404)['json']({ error: 'not_found', message: 'Deal not found' });
    }

    const data = validation.data;
    const [item] = await db
      .insert(dueDiligenceItems)
      .values({
        opportunityId: dealId,
        category: data.category,
        item: data.item,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority,
        assignedTo: data.assignedTo ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      })
      .returning();

    return res['status'](201)['json']({
      success: true,
      data: item,
      message: 'Due diligence item added',
    });
  } catch (error) {
    console.error('DD item creation error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to add due diligence item',
    });
  }
});

/**
 * GET /api/deals/:id/diligence - Get due diligence items for deal
 */
router['get']('/:id/diligence', async (req: Request, res: Response) => {
  const paramId = req['params']['id'];
  if (!paramId) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID is required' });
  }
  const dealId = parseInt(paramId, 10);
  if (isNaN(dealId)) {
    return res['status'](400)['json']({ error: 'invalid_id', message: 'Deal ID must be a number' });
  }

  try {
    const items = await db
      .select()
      .from(dueDiligenceItems)
      .where(eq(dueDiligenceItems.opportunityId, dealId))
      .orderBy(dueDiligenceItems.category, desc(dueDiligenceItems.createdAt));

    // Group by category
    const grouped: Record<string, typeof items> = {
      Financial: [],
      Legal: [],
      Technical: [],
      Market: [],
      Team: [],
    };

    for (const item of items) {
      const category = item.category as keyof typeof grouped;
      if (grouped[category]) {
        grouped[category].push(item);
      }
    }

    // Calculate completion stats
    const total = items.length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const inProgress = items.filter((i) => i.status === 'in_progress').length;

    return res['json']({
      success: true,
      data: {
        items,
        grouped,
        stats: {
          total,
          completed,
          inProgress,
          pending: total - completed - inProgress,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        },
      },
    });
  } catch (error) {
    console.error('DD items fetch error:', error);
    return res['status'](500)['json']({
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
  sector: z.string().min(1).max(100),
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
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { rows: rawRows, fundId } = validation.data;
    const valid: Array<{ index: number; data: z.infer<typeof ImportRowSchema> }> = [];
    const invalid: Array<{ index: number; errors: string[] }> = [];

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

    // Check for duplicates among valid rows
    const duplicates: Array<{ index: number; existingId: number; companyName: string }> = [];
    if (valid.length > 0) {
      const companyNames = valid.map((v) => v.data.companyName.trim().toLowerCase());
      const conditions = [
        sql`LOWER(TRIM(${dealOpportunities.companyName})) IN (${sql.join(
          companyNames.map((n) => sql`${n}`),
          sql`, `
        )})`,
      ];
      if (fundId) {
        conditions.push(eq(dealOpportunities.fundId, fundId));
      }

      const existing = await db
        .select({
          id: dealOpportunities.id,
          companyName: dealOpportunities.companyName,
          stage: dealOpportunities.stage,
          fundId: dealOpportunities.fundId,
        })
        .from(dealOpportunities)
        .where(and(...conditions));

      const existingMap = new Map(existing.map((e) => [e.companyName.trim().toLowerCase(), e]));

      for (const v of valid) {
        const key = v.data.companyName.trim().toLowerCase();
        const match = existingMap.get(key);
        if (match) {
          duplicates.push({
            index: v.index,
            existingId: match.id,
            companyName: v.data.companyName,
          });
        }
      }
    }

    const duplicateIndices = new Set(duplicates.map((d) => d.index));
    const toImport = valid.filter((v) => !duplicateIndices.has(v.index));

    return res['json']({
      success: true,
      data: {
        total: rawRows.length,
        valid: valid.length,
        invalid: invalid.length,
        duplicates: duplicates.length,
        toImport: toImport.length,
        invalidRows: invalid,
        duplicateRows: duplicates,
      },
    });
  } catch (error) {
    console.error('Import preview error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to preview import',
    });
  }
});

/**
 * POST /api/deals/opportunities/import
 * Bulk import validated rows. Supports skip_duplicates mode.
 */
router['post']('/opportunities/import', idempotency, async (req: Request, res: Response) => {
  const validation = ImportConfirmSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { rows, fundId, mode } = validation.data;

    // Build skip set for duplicates if needed
    const skipSet = new Set<number>();
    if (mode === 'skip_duplicates' && rows.length > 0) {
      const companyNames = rows.map((r) => r.companyName.trim().toLowerCase());
      const conditions = [
        sql`LOWER(TRIM(${dealOpportunities.companyName})) IN (${sql.join(
          companyNames.map((n) => sql`${n}`),
          sql`, `
        )})`,
      ];
      if (fundId) {
        conditions.push(eq(dealOpportunities.fundId, fundId));
      }

      const existing = await db
        .select({ companyName: dealOpportunities.companyName })
        .from(dealOpportunities)
        .where(and(...conditions));

      const existingNames = new Set(existing.map((e) => e.companyName.trim().toLowerCase()));
      rows.forEach((r, i) => {
        if (existingNames.has(r.companyName.trim().toLowerCase())) {
          skipSet.add(i);
        }
      });
    }

    let imported = 0;
    const skipped = skipSet.size;
    const failed: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      if (skipSet.has(i)) continue;
      const row = rows[i]!;
      try {
        await db.insert(dealOpportunities).values({
          fundId: fundId ?? null,
          companyName: row.companyName,
          sector: row.sector,
          stage: row.stage,
          sourceType: row.sourceType,
          dealSize: row.dealSize ? String(row.dealSize) : null,
          valuation: row.valuation ? String(row.valuation) : null,
          status: row.status ?? 'lead',
          priority: row.priority ?? 'medium',
          foundedYear: row.foundedYear ?? null,
          employeeCount: row.employeeCount ?? null,
          revenue: row.revenue ? String(row.revenue) : null,
          description: row.description ?? null,
          website: row.website || null,
          contactName: row.contactName ?? null,
          contactEmail: row.contactEmail || null,
          contactPhone: row.contactPhone ?? null,
          sourceNotes: row.sourceNotes ?? null,
          nextAction: row.nextAction ?? null,
        });
        imported++;
      } catch (err) {
        failed.push({
          index: i,
          message: err instanceof Error ? err.message : 'Insert failed',
        });
      }
    }

    return res['json']({
      success: failed.length === 0,
      data: {
        imported,
        skipped,
        failed: failed.length,
        failedRows: failed,
        total: rows.length,
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return res['status'](500)['json']({
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
router['post']('/opportunities/bulk/status', idempotency, async (req: Request, res: Response) => {
  const validation = BulkStatusSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { dealIds, status, notes } = validation.data;
    const updatedIds: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    // Verify all deals exist first
    const existing = await db
      .select({ id: dealOpportunities.id, status: dealOpportunities.status })
      .from(dealOpportunities)
      .where(inArray(dealOpportunities.id, dealIds));

    const existingMap = new Map(existing.map((e) => [e.id, e]));

    for (const dealId of dealIds) {
      const deal = existingMap.get(dealId);
      if (!deal) {
        failed.push({ id: dealId, reason: 'Deal not found' });
        continue;
      }
      if (deal.status === status) {
        updatedIds.push(dealId); // Already in target status = idempotent success
        continue;
      }
      try {
        await db
          .update(dealOpportunities)
          .set({ status, updatedAt: new Date() })
          .where(eq(dealOpportunities.id, dealId));

        await db.insert(pipelineActivities).values({
          opportunityId: dealId,
          type: 'stage_change',
          title: `Bulk Status Change: ${deal.status} -> ${status}`,
          description: notes ?? `Bulk status change to ${status}`,
          completedDate: new Date(),
        });

        updatedIds.push(dealId);
      } catch (err) {
        failed.push({
          id: dealId,
          reason: err instanceof Error ? err.message : 'Update failed',
        });
      }
    }

    return res['json']({
      success: failed.length === 0,
      data: { updatedIds, failed },
    });
  } catch (error) {
    console.error('Bulk status error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to bulk update statuses',
    });
  }
});

/**
 * POST /api/deals/opportunities/bulk/archive
 * Bulk archive deals (soft delete to 'passed' status). Idempotent.
 */
router['post']('/opportunities/bulk/archive', idempotency, async (req: Request, res: Response) => {
  const validation = BulkArchiveSchema.safeParse(req.body);
  if (!validation.success) {
    return res['status'](400)['json']({
      error: 'validation_error',
      issues: validation.error.issues,
    });
  }

  try {
    const { dealIds } = validation.data;
    const updatedIds: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    const existing = await db
      .select({
        id: dealOpportunities.id,
        companyName: dealOpportunities.companyName,
        status: dealOpportunities.status,
      })
      .from(dealOpportunities)
      .where(inArray(dealOpportunities.id, dealIds));

    const existingMap = new Map(existing.map((e) => [e.id, e]));

    for (const dealId of dealIds) {
      const deal = existingMap.get(dealId);
      if (!deal) {
        failed.push({ id: dealId, reason: 'Deal not found' });
        continue;
      }
      if (deal.status === 'passed') {
        updatedIds.push(dealId); // Already archived = idempotent success
        continue;
      }
      try {
        await db
          .update(dealOpportunities)
          .set({ status: 'passed', updatedAt: new Date() })
          .where(eq(dealOpportunities.id, dealId));

        await db.insert(pipelineActivities).values({
          opportunityId: dealId,
          type: 'stage_change',
          title: 'Bulk Archive',
          description: `Deal "${deal.companyName}" archived via bulk action`,
          completedDate: new Date(),
        });

        updatedIds.push(dealId);
      } catch (err) {
        failed.push({
          id: dealId,
          reason: err instanceof Error ? err.message : 'Archive failed',
        });
      }
    }

    return res['json']({
      success: failed.length === 0,
      data: { updatedIds, failed },
    });
  } catch (error) {
    console.error('Bulk archive error:', error);
    return res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to bulk archive deals',
    });
  }
});

export default router;
export { router as dealPipelineRouter };
