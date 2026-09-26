import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import {
  dealPipelineCommands,
  dealOpportunities,
  dueDiligenceItems,
  pipelineActivities,
  pipelineStages,
  scoringModels,
} from '@shared/schema';
import { runIdempotentCommand } from '../lib/idempotent-command';
import { createRouteLogger } from '../lib/route-logger.js';

const serviceLog = createRouteLogger('deal-pipeline-service');
const DEAL_CREATE_CONTRACT_VERSION = 'deal-pipeline-create-v1';
const DEAL_IMPORT_CONTRACT_VERSION = 'deal-pipeline-import-v1';

export type DealStatus =
  'lead' | 'qualified' | 'pitch' | 'dd' | 'committee' | 'term_sheet' | 'closed' | 'passed';

export type DealPriority = 'high' | 'medium' | 'low';
export type DealSortBy = 'updatedAt' | 'companyName' | 'dealSize' | 'createdAt';
export type DealSortDir = 'asc' | 'desc';

export interface DealCursor {
  createdAt: string;
  id: number;
}

export interface CreateDealInput {
  fundId: number;
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

// Import rows carry no fundId of their own -- the confirmed import's single
// authoritative fundId is applied to every row.
export interface ImportDealRowInput extends Omit<
  CreateDealInput,
  'fundId' | 'status' | 'priority'
> {
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
  fundId: number;
  mode: 'skip_duplicates' | 'import_all';
}

export interface BulkStatusInput {
  dealIds: number[];
  status: DealStatus;
  notes?: string | undefined;
  fundId: number;
}

export interface BulkArchiveInput {
  dealIds: number[];
  fundId: number;
}

type DealRow = typeof dealOpportunities.$inferSelect;
type DiligenceItemRow = typeof dueDiligenceItems.$inferSelect;
type DealCommandResponse = Record<string, unknown>;
/** `subject` binds the request hash; `userId` is the nullable users.id FK. */
export type DealCommandActor = { subject: string | null; userId: number | null };

function postgresErrorCode(error: unknown): string {
  let cause = error;
  while (cause && typeof cause === 'object') {
    if ('code' in cause && cause.code != null) return String(cause.code);
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return 'UNKNOWN';
}

// Same scope as the receipt's unique key, so any two requests that could
// collide on (fund_id, operation, idempotency_key) serialize on one lock.
function commandLockKey(
  contractVersion: string,
  fundId: number,
  operation: 'deal_create' | 'deal_import',
  idempotencyKey: string
): string {
  return [contractVersion, fundId, operation, idempotencyKey].join(':');
}

function toDealInsertValues(data: CreateDealInput) {
  return {
    fundId: data.fundId,
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

async function findDealById(
  id: number,
  authoritativeFundId?: number
): Promise<DealRow | undefined> {
  const conditions = [eq(dealOpportunities.id, id)];
  if (authoritativeFundId !== undefined) {
    conditions.push(eq(dealOpportunities.fundId, authoritativeFundId));
  }

  const [deal] = await db
    .select()
    .from(dealOpportunities)
    .where(and(...conditions))
    .limit(1);

  return deal;
}

export async function getDealOwnership(id: number) {
  const [deal] = await db
    .select({ id: dealOpportunities.id, fundId: dealOpportunities.fundId })
    .from(dealOpportunities)
    .where(eq(dealOpportunities.id, id))
    .limit(1);

  return deal;
}

export async function getDealOwnerships(ids: number[]) {
  return db
    .select({ id: dealOpportunities.id, fundId: dealOpportunities.fundId })
    .from(dealOpportunities)
    .where(inArray(dealOpportunities.id, ids));
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

export async function createDealWithReceipt(
  data: CreateDealInput,
  idempotencyKey: string,
  actor: DealCommandActor
): Promise<{ row: DealCommandResponse; replayed: boolean }> {
  const operation = 'deal_create' as const;
  const contractVersion = DEAL_CREATE_CONTRACT_VERSION;
  const loadExisting = async () => {
    const [existing] = await db
      .select({
        responseBody: dealPipelineCommands.responseBody,
        requestHash: dealPipelineCommands.requestHash,
      })
      .from(dealPipelineCommands)
      .where(
        and(
          eq(dealPipelineCommands.fundId, data.fundId),
          eq(dealPipelineCommands.operation, operation),
          eq(dealPipelineCommands.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return existing ? { row: existing.responseBody, requestHash: existing.requestHash } : null;
  };

  return runIdempotentCommand<DealCommandResponse>({
    db,
    fundId: data.fundId,
    idempotencyKey,
    contractVersion,
    request: { operation, actor: actor.subject, fundId: data.fundId, body: data, contractVersion },
    loadExisting,
    insert: async (requestHash) => {
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${commandLockKey(
          contractVersion,
          data.fundId,
          operation,
          idempotencyKey
        )}))`
      );
      if (await loadExisting()) return null;

      const deal = await createDeal(data);
      if (!deal) throw new Error('Failed to create deal');
      const response = {
        success: true,
        data: deal,
        message: 'Deal created successfully',
      } satisfies DealCommandResponse;

      await db.insert(dealPipelineCommands).values({
        fundId: data.fundId,
        operation,
        idempotencyKey,
        requestHash,
        responseBody: response,
        createdBy: actor.userId,
      });
      return response;
    },
  });
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

export async function updateDeal(id: number, authoritativeFundId: number, data: UpdateDealInput) {
  const existing = await findDealById(id, authoritativeFundId);

  if (!existing) {
    return undefined;
  }

  const [updated] = await db
    .update(dealOpportunities)
    .set(toDealUpdateValues(data))
    .where(and(eq(dealOpportunities.id, id), eq(dealOpportunities.fundId, authoritativeFundId)))
    .returning();

  return updated;
}

export async function archiveDeal(id: number, authoritativeFundId: number) {
  const existing = await findDealById(id, authoritativeFundId);

  if (!existing) {
    return undefined;
  }

  const [archived] = await db
    .update(dealOpportunities)
    .set({
      status: 'passed',
      updatedAt: new Date(),
    })
    .where(and(eq(dealOpportunities.id, id), eq(dealOpportunities.fundId, authoritativeFundId)))
    .returning();

  if (!archived) {
    return undefined;
  }

  await db.insert(pipelineActivities).values({
    opportunityId: id,
    type: 'stage_change',
    title: 'Deal Archived',
    description: `Deal "${existing.companyName}" was archived`,
    completedDate: new Date(),
  });

  return archived;
}

export async function changeDealStage(
  id: number,
  authoritativeFundId: number,
  input: StageChangeInput
) {
  const existing = await findDealById(id, authoritativeFundId);

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
    .where(and(eq(dealOpportunities.id, id), eq(dealOpportunities.fundId, authoritativeFundId)))
    .returning();

  if (!updated) {
    return undefined;
  }

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

export async function createDiligenceItem(
  dealId: number,
  authoritativeFundId: number,
  data: CreateDiligenceItemInput
) {
  const deal = await findDealById(dealId, authoritativeFundId);

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
  const failed: Array<{ index: number; message: 'Insert failed'; code: string }> = [];

  for (let index = 0; index < input.rows.length; index++) {
    if (skipSet.has(index)) continue;
    const row = input.rows[index];
    if (!row) continue;

    try {
      const createInput: CreateDealInput = {
        ...row,
        fundId: input.fundId,
        status: row.status ?? 'lead',
        priority: row.priority ?? 'medium',
      };
      // Savepoint under the request transaction: a failed row must not abort
      // the rows around it (the final COMMIT would silently roll them back).
      await db.transaction(async (tx) => {
        await tx.insert(dealOpportunities).values(toDealInsertValues(createInput));
      });
      imported++;
    } catch (error) {
      serviceLog.error('Deal import row failed', error);
      failed.push({
        index,
        message: 'Insert failed',
        code: postgresErrorCode(error),
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

export async function confirmImportWithReceipt(
  input: ConfirmImportInput,
  idempotencyKey: string,
  actor: DealCommandActor
): Promise<{ row: DealCommandResponse; replayed: boolean }> {
  const operation = 'deal_import' as const;
  const contractVersion = DEAL_IMPORT_CONTRACT_VERSION;
  const loadExisting = async () => {
    const [existing] = await db
      .select({
        responseBody: dealPipelineCommands.responseBody,
        requestHash: dealPipelineCommands.requestHash,
      })
      .from(dealPipelineCommands)
      .where(
        and(
          eq(dealPipelineCommands.fundId, input.fundId),
          eq(dealPipelineCommands.operation, operation),
          eq(dealPipelineCommands.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return existing ? { row: existing.responseBody, requestHash: existing.requestHash } : null;
  };

  return runIdempotentCommand<DealCommandResponse>({
    db,
    fundId: input.fundId,
    idempotencyKey,
    contractVersion,
    request: {
      operation,
      actor: actor.subject,
      fundId: input.fundId,
      body: input,
      contractVersion,
    },
    loadExisting,
    insert: async (requestHash) => {
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${commandLockKey(
          contractVersion,
          input.fundId,
          operation,
          idempotencyKey
        )}))`
      );
      if (await loadExisting()) return null;

      const data = await confirmImport(input);
      const response = {
        success: data.failed === 0,
        data,
      } satisfies DealCommandResponse;

      await db.insert(dealPipelineCommands).values({
        fundId: input.fundId,
        operation,
        idempotencyKey,
        requestHash,
        responseBody: response,
        createdBy: actor.userId,
      });
      return response;
    },
  });
}

export async function bulkUpdateStatus(input: BulkStatusInput) {
  const updatedIds: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  const existing = await db
    .select({
      id: dealOpportunities.id,
      status: dealOpportunities.status,
      fundId: dealOpportunities.fundId,
    })
    .from(dealOpportunities)
    .where(
      and(inArray(dealOpportunities.id, input.dealIds), eq(dealOpportunities.fundId, input.fundId))
    );

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
        .where(and(eq(dealOpportunities.id, dealId), eq(dealOpportunities.fundId, input.fundId)));

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
      fundId: dealOpportunities.fundId,
    })
    .from(dealOpportunities)
    .where(
      and(inArray(dealOpportunities.id, input.dealIds), eq(dealOpportunities.fundId, input.fundId))
    );

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
        .where(and(eq(dealOpportunities.id, dealId), eq(dealOpportunities.fundId, input.fundId)));

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
