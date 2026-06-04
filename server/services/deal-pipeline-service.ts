import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import {
  dealOpportunities,
  dueDiligenceItems,
  pipelineActivities,
  pipelineStages,
  scoringModels,
} from '@shared/schema';

export type DealStatus =
  | 'lead'
  | 'qualified'
  | 'pitch'
  | 'dd'
  | 'committee'
  | 'term_sheet'
  | 'closed'
  | 'passed';

export type DealPriority = 'high' | 'medium' | 'low';
export type DealSortBy = 'updatedAt' | 'companyName' | 'dealSize' | 'createdAt';
export type DealSortDir = 'asc' | 'desc';

export interface DealCursor {
  createdAt: string;
  id: number;
}

export interface CreateDealInput {
  fundId?: number | undefined;
  companyName: string;
  sector: string;
  stage: string;
  sourceType: string;
  dealSize?: number | undefined;
  valuation?: number | undefined;
  status: DealStatus;
  priority: DealPriority;
  foundedYear?: number | undefined;
  employeeCount?: number | undefined;
  revenue?: number | undefined;
  description?: string | undefined;
  website?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  sourceNotes?: string | undefined;
  nextAction?: string | undefined;
}

export type UpdateDealInput = {
  [K in keyof CreateDealInput]?: CreateDealInput[K] | undefined;
};

export interface ListDealsInput {
  cursor?: DealCursor | undefined;
  limit: number;
  status?: DealStatus | undefined;
  priority?: DealPriority | undefined;
  fundId?: number | undefined;
  search?: string | undefined;
  sortBy: DealSortBy;
  sortDir: DealSortDir;
}

export interface StageChangeInput {
  status: DealStatus;
  notes?: string | undefined;
}

export interface CreateDiligenceItemInput {
  category: 'Financial' | 'Legal' | 'Technical' | 'Market' | 'Team';
  item: string;
  description?: string | undefined;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  priority: DealPriority;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
}

export interface ImportDealRowInput extends Omit<CreateDealInput, 'status' | 'priority'> {
  status?: DealStatus | undefined;
  priority?: DealPriority | undefined;
}

export interface ImportPreviewRow {
  index: number;
  data: ImportDealRowInput;
}

export interface InvalidImportPreviewRow {
  index: number;
  errors: string[];
}

export interface PreviewImportInput {
  rawRowCount: number;
  valid: ImportPreviewRow[];
  invalid: InvalidImportPreviewRow[];
  fundId?: number | undefined;
}

export interface ConfirmImportInput {
  rows: ImportDealRowInput[];
  fundId?: number | undefined;
  mode: 'skip_duplicates' | 'import_all';
}

export interface BulkStatusInput {
  dealIds: number[];
  status: DealStatus;
  notes?: string | undefined;
}

export interface BulkArchiveInput {
  dealIds: number[];
}

type DealRow = typeof dealOpportunities.$inferSelect;
type DiligenceItemRow = typeof dueDiligenceItems.$inferSelect;

function toDealInsertValues(data: CreateDealInput) {
  return {
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
  };
}

function toDealUpdateValues(data: UpdateDealInput): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

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

  return updateData;
}

function dealNameCondition(companyNames: string[]): SQL<unknown> {
  return sql`LOWER(TRIM(${dealOpportunities.companyName})) IN (${sql.join(
    companyNames.map((name) => sql`${name}`),
    sql`, `
  )})`;
}

async function findDealById(id: number): Promise<DealRow | undefined> {
  const [deal] = await db
    .select()
    .from(dealOpportunities)
    .where(eq(dealOpportunities.id, id))
    .limit(1);

  return deal;
}

export async function createDeal(data: CreateDealInput) {
  const [deal] = await db.insert(dealOpportunities).values(toDealInsertValues(data)).returning();

  if (!deal) {
    return undefined;
  }

  await db.insert(pipelineActivities).values({
    opportunityId: deal.id,
    type: 'stage_change',
    title: 'Deal Created',
    description: `New deal "${data.companyName}" added to pipeline`,
    completedDate: new Date(),
  });

  return deal;
}

export async function listDeals(input: ListDealsInput) {
  const { cursor, limit, status, priority, fundId, search, sortBy, sortDir } = input;
  const conditions: SQL<unknown>[] = [];

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
    const searchCondition = or(
      sql`${dealOpportunities.companyName} ILIKE ${`%${search}%`}`,
      sql`${dealOpportunities.sector} ILIKE ${`%${search}%`}`,
      sql`${dealOpportunities.description} ILIKE ${`%${search}%`}`
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const isDefaultSort = sortBy === 'createdAt' && sortDir === 'desc';
  if (cursor && isDefaultSort) {
    const cursorCondition = or(
      lt(dealOpportunities.createdAt, new Date(cursor.createdAt)),
      and(
        eq(dealOpportunities.createdAt, new Date(cursor.createdAt)),
        lt(dealOpportunities.id, cursor.id)
      )
    );
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

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

  const hasMore = deals.length > limit;
  const items = hasMore ? deals.slice(0, limit) : deals;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && isDefaultSort && lastItem?.createdAt
      ? {
          createdAt: lastItem.createdAt,
          id: lastItem.id,
        }
      : null;

  return {
    items,
    pagination: {
      hasMore,
      nextCursor,
      count: items.length,
    },
  };
}

export async function getDeal(id: number) {
  const deal = await findDealById(id);

  if (!deal) {
    return undefined;
  }

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

  return {
    ...deal,
    dueDiligence: ddItems,
    activities,
    scores,
  };
}

export async function updateDeal(id: number, data: UpdateDealInput) {
  const existing = await findDealById(id);

  if (!existing) {
    return undefined;
  }

  const [updated] = await db
    .update(dealOpportunities)
    .set(toDealUpdateValues(data))
    .where(eq(dealOpportunities.id, id))
    .returning();

  return updated;
}

export async function archiveDeal(id: number) {
  const existing = await findDealById(id);

  if (!existing) {
    return undefined;
  }

  const [archived] = await db
    .update(dealOpportunities)
    .set({
      status: 'passed',
      updatedAt: new Date(),
    })
    .where(eq(dealOpportunities.id, id))
    .returning();

  await db.insert(pipelineActivities).values({
    opportunityId: id,
    type: 'stage_change',
    title: 'Deal Archived',
    description: `Deal "${existing.companyName}" was archived`,
    completedDate: new Date(),
  });

  return archived;
}

export async function changeDealStage(id: number, input: StageChangeInput) {
  const existing = await findDealById(id);

  if (!existing) {
    return undefined;
  }

  const previousStatus = existing.status;
  const [updated] = await db
    .update(dealOpportunities)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(dealOpportunities.id, id))
    .returning();

  await db.insert(pipelineActivities).values({
    opportunityId: id,
    type: 'stage_change',
    title: `Stage Changed: ${previousStatus} -> ${input.status}`,
    description: input.notes ?? `Deal moved from ${previousStatus} to ${input.status}`,
    completedDate: new Date(),
  });

  return {
    updated,
    previousStatus,
    newStatus: input.status,
  };
}

export async function getPipeline(fundId?: number) {
  const conditions = fundId ? eq(dealOpportunities.fundId, fundId) : undefined;

  const deals = await db
    .select()
    .from(dealOpportunities)
    .where(conditions)
    .orderBy(desc(dealOpportunities.priority), desc(dealOpportunities.updatedAt));

  const pipeline: Record<string, DealRow[]> = {
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

  const stages = await db.select().from(pipelineStages).orderBy(pipelineStages.orderIndex);

  return {
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
  };
}

export async function getPipelineStages() {
  return db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.isActive, true))
    .orderBy(pipelineStages.orderIndex);
}

export async function createDiligenceItem(dealId: number, data: CreateDiligenceItemInput) {
  const deal = await findDealById(dealId);

  if (!deal) {
    return undefined;
  }

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

  return item;
}

export async function getDiligenceItems(dealId: number) {
  const items = await db
    .select()
    .from(dueDiligenceItems)
    .where(eq(dueDiligenceItems.opportunityId, dealId))
    .orderBy(dueDiligenceItems.category, desc(dueDiligenceItems.createdAt));

  const grouped: Record<string, DiligenceItemRow[]> = {
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

  const total = items.length;
  const completed = items.filter((item) => item.status === 'completed').length;
  const inProgress = items.filter((item) => item.status === 'in_progress').length;

  return {
    items,
    grouped,
    stats: {
      total,
      completed,
      inProgress,
      pending: total - completed - inProgress,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  };
}

export async function previewImport(input: PreviewImportInput) {
  const duplicates: Array<{ index: number; existingId: number; companyName: string }> = [];

  if (input.valid.length > 0) {
    const companyNames = input.valid.map((row) => row.data.companyName.trim().toLowerCase());
    const conditions = [dealNameCondition(companyNames)];
    if (input.fundId) {
      conditions.push(eq(dealOpportunities.fundId, input.fundId));
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

    const existingMap = new Map(
      existing.map((deal) => [deal.companyName.trim().toLowerCase(), deal])
    );

    for (const row of input.valid) {
      const key = row.data.companyName.trim().toLowerCase();
      const match = existingMap.get(key);
      if (match) {
        duplicates.push({
          index: row.index,
          existingId: match.id,
          companyName: row.data.companyName,
        });
      }
    }
  }

  const duplicateIndices = new Set(duplicates.map((duplicate) => duplicate.index));
  const toImport = input.valid.filter((row) => !duplicateIndices.has(row.index));

  return {
    total: input.rawRowCount,
    valid: input.valid.length,
    invalid: input.invalid.length,
    duplicates: duplicates.length,
    toImport: toImport.length,
    invalidRows: input.invalid,
    duplicateRows: duplicates,
  };
}

export async function confirmImport(input: ConfirmImportInput) {
  const skipSet = new Set<number>();
  if (input.mode === 'skip_duplicates' && input.rows.length > 0) {
    const companyNames = input.rows.map((row) => row.companyName.trim().toLowerCase());
    const conditions = [dealNameCondition(companyNames)];
    if (input.fundId) {
      conditions.push(eq(dealOpportunities.fundId, input.fundId));
    }

    const existing = await db
      .select({ companyName: dealOpportunities.companyName })
      .from(dealOpportunities)
      .where(and(...conditions));

    const existingNames = new Set(existing.map((deal) => deal.companyName.trim().toLowerCase()));
    input.rows.forEach((row, index) => {
      if (existingNames.has(row.companyName.trim().toLowerCase())) {
        skipSet.add(index);
      }
    });
  }

  let imported = 0;
  const skipped = skipSet.size;
  const failed: Array<{ index: number; message: string }> = [];

  for (let index = 0; index < input.rows.length; index++) {
    if (skipSet.has(index)) continue;
    const row = input.rows[index];
    if (!row) continue;

    try {
      const createInput: CreateDealInput = {
        ...row,
        status: row.status ?? 'lead',
        priority: row.priority ?? 'medium',
      };
      if (input.fundId !== undefined) {
        createInput.fundId = input.fundId;
      }
      await db.insert(dealOpportunities).values(toDealInsertValues(createInput));
      imported++;
    } catch (error) {
      failed.push({
        index,
        message: error instanceof Error ? error.message : 'Insert failed',
      });
    }
  }

  return {
    imported,
    skipped,
    failed: failed.length,
    failedRows: failed,
    total: input.rows.length,
  };
}

export async function bulkUpdateStatus(input: BulkStatusInput) {
  const updatedIds: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  const existing = await db
    .select({ id: dealOpportunities.id, status: dealOpportunities.status })
    .from(dealOpportunities)
    .where(inArray(dealOpportunities.id, input.dealIds));

  const existingMap = new Map(existing.map((deal) => [deal.id, deal]));

  for (const dealId of input.dealIds) {
    const deal = existingMap.get(dealId);
    if (!deal) {
      failed.push({ id: dealId, reason: 'Deal not found' });
      continue;
    }
    if (deal.status === input.status) {
      updatedIds.push(dealId);
      continue;
    }

    try {
      await db
        .update(dealOpportunities)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(dealOpportunities.id, dealId));

      await db.insert(pipelineActivities).values({
        opportunityId: dealId,
        type: 'stage_change',
        title: `Bulk Status Change: ${deal.status} -> ${input.status}`,
        description: input.notes ?? `Bulk status change to ${input.status}`,
        completedDate: new Date(),
      });

      updatedIds.push(dealId);
    } catch (error) {
      failed.push({
        id: dealId,
        reason: error instanceof Error ? error.message : 'Update failed',
      });
    }
  }

  return { updatedIds, failed };
}

export async function bulkArchive(input: BulkArchiveInput) {
  const updatedIds: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  const existing = await db
    .select({
      id: dealOpportunities.id,
      companyName: dealOpportunities.companyName,
      status: dealOpportunities.status,
    })
    .from(dealOpportunities)
    .where(inArray(dealOpportunities.id, input.dealIds));

  const existingMap = new Map(existing.map((deal) => [deal.id, deal]));

  for (const dealId of input.dealIds) {
    const deal = existingMap.get(dealId);
    if (!deal) {
      failed.push({ id: dealId, reason: 'Deal not found' });
      continue;
    }
    if (deal.status === 'passed') {
      updatedIds.push(dealId);
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
    } catch (error) {
      failed.push({
        id: dealId,
        reason: error instanceof Error ? error.message : 'Archive failed',
      });
    }
  }

  return { updatedIds, failed };
}
