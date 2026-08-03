import {
  QUARTERLY_REVIEW_CATEGORIES,
  QUARTERLY_REVIEW_CONTRACT_VERSION,
  QuarterlyReviewItemMutationSchema,
  type QuarterlyReviewCategory,
  type QuarterlyReviewCommandResult,
  type QuarterlyReviewCurrentBasisResponse,
  type QuarterlyReviewItemMutation,
  type QuarterlyReviewItemState,
  type QuarterlyReviewWaiverMutation,
  parseQuarterlyReviewChangeReference,
} from '../../../shared/contracts/internal-analysis/quarterly-review-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  internalAnalysisDrafts,
  quarterlyReviewCommandReceipts,
  quarterlyReviewCompanies,
  quarterlyReviewItems,
  quarterlyReviewRosters,
} from '../../../shared/schema/internal-analysis';
import { tasks } from '../../../shared/schema/operating-objects';
import { portfolioCompanies } from '../../../shared/schema/portfolio';
import { userFundGrants, users } from '../../../shared/schema/user';
import { db } from '../../db';
import { weakETag } from '../../lib/http-preconditions';

export { QUARTERLY_REVIEW_CATEGORIES };

const POSTGRES_INT_MAX = 2_147_483_647;

export interface QuarterlyReviewRosterRecord {
  rosterId: number;
  fundId: number;
  draftId: number;
  draftVersion: number;
  financialFactsSnapshotId: number;
  companyCount: number;
}

export interface QuarterlyReviewCompanyRecord {
  companyId: number;
  portfolioCompanyId: number;
  waivedAt: Date | null;
  waivedBy: number | null;
  waiverReason: string | null;
  version: number;
}

export interface QuarterlyReviewItemRecord {
  itemId: number;
  companyId: number;
  category: QuarterlyReviewCategory;
  state: QuarterlyReviewItemState;
  version: number;
}

export interface QuarterlyReviewSummary {
  requiresRefresh: boolean;
  companyCount: number;
  completedCompanyCount: number;
  pending: Array<{
    companyId: number;
    portfolioCompanyId: number;
    categories: QuarterlyReviewCategory[];
  }>;
  canFinalize: boolean;
}

export class QuarterlyReviewServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'QuarterlyReviewServiceError';
  }
}

export interface QuarterlyReviewReceiptRecord {
  requestHash: string;
  result: QuarterlyReviewCommandResult;
}

export interface QuarterlyReviewCommandPorts {
  findReceipt(fundId: number, idempotencyKey: string): Promise<QuarterlyReviewReceiptRecord | null>;
  executeItemMutation(
    input: QuarterlyReviewItemCommandInput & { requestHash: string }
  ): Promise<QuarterlyReviewCommandResult>;
  executeWaiverMutation(
    input: QuarterlyReviewWaiverCommandInput & { requestHash: string }
  ): Promise<QuarterlyReviewCommandResult>;
}

export interface QuarterlyReviewPorts extends QuarterlyReviewCommandPorts {
  getCurrentReview(fundId: number, draftId: number): Promise<QuarterlyReviewCurrentBasisResponse>;
}

interface QuarterlyReviewCommandIdentity {
  fundId: number;
  draftId: number;
  companyId: number;
  actorId: number;
  idempotencyKey: string;
  rawIfMatch: string;
}

function assertCommandIdentity(input: QuarterlyReviewCommandIdentity): void {
  for (const field of ['fundId', 'draftId', 'companyId', 'actorId'] as const) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 1 || value > POSTGRES_INT_MAX) {
      throw new QuarterlyReviewServiceError(
        400,
        'INVALID_QUARTERLY_REVIEW_COMMAND_ID',
        `${field} must be a positive PostgreSQL integer.`,
        { field }
      );
    }
  }
}

export interface QuarterlyReviewItemCommandInput extends QuarterlyReviewCommandIdentity {
  category: QuarterlyReviewCategory;
  body: QuarterlyReviewItemMutation;
}

export interface QuarterlyReviewWaiverCommandInput extends QuarterlyReviewCommandIdentity {
  body: QuarterlyReviewWaiverMutation;
}

function requestHash(input: {
  operation: 'review_item_update' | 'company_waive';
  command: QuarterlyReviewItemCommandInput | QuarterlyReviewWaiverCommandInput;
}): string {
  const command = input.command;
  return canonicalSha256({
    operation: input.operation,
    contractVersion: QUARTERLY_REVIEW_CONTRACT_VERSION,
    fundId: command.fundId,
    draftId: command.draftId,
    companyId: command.companyId,
    ...('category' in command ? { category: command.category } : {}),
    rawIfMatch: command.rawIfMatch,
    body: command.body,
  });
}

async function replayReceipt(
  ports: QuarterlyReviewCommandPorts,
  input: QuarterlyReviewCommandIdentity,
  expectedHash: string
): Promise<QuarterlyReviewCommandResult | null> {
  const existing = await ports.findReceipt(input.fundId, input.idempotencyKey);
  if (existing === null) return null;
  if (existing.requestHash !== expectedHash) {
    throw new QuarterlyReviewServiceError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different quarterly review command.',
      { idempotencyKey: input.idempotencyKey }
    );
  }
  return existing.result;
}

export async function executeQuarterlyReviewItemCommand(
  ports: QuarterlyReviewCommandPorts,
  input: QuarterlyReviewItemCommandInput
): Promise<QuarterlyReviewCommandResult> {
  assertCommandIdentity(input);
  const parsedBody = QuarterlyReviewItemMutationSchema.safeParse(input.body);
  if (!parsedBody.success) {
    throw new QuarterlyReviewServiceError(
      400,
      'INVALID_QUARTERLY_REVIEW_ITEM_MUTATION',
      'Invalid quarterly review item mutation.'
    );
  }
  const command = { ...input, body: parsedBody.data };
  const hash = requestHash({ operation: 'review_item_update', command });
  const replay = await replayReceipt(ports, command, hash);
  if (replay !== null) return replay;
  return ports.executeItemMutation({ ...command, requestHash: hash });
}

export async function executeQuarterlyReviewWaiverCommand(
  ports: QuarterlyReviewCommandPorts,
  input: QuarterlyReviewWaiverCommandInput
): Promise<QuarterlyReviewCommandResult> {
  assertCommandIdentity(input);
  const hash = requestHash({ operation: 'company_waive', command: input });
  const replay = await replayReceipt(ports, input, hash);
  if (replay !== null) return replay;
  return ports.executeWaiverMutation({ ...input, requestHash: hash });
}

type Database = typeof db;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function receiptResult(
  row: typeof quarterlyReviewCommandReceipts.$inferSelect
): QuarterlyReviewCommandResult {
  const targetId =
    row.resultItemId ?? row.resultCompanyId ?? row.resultReferenceId ?? row.analysisDraftId;
  return {
    receiptId: row.id,
    operation: row.operation as QuarterlyReviewCommandResult['operation'],
    draftId: row.analysisDraftId,
    targetId,
    ...(row.resultDraftVersion === null ? {} : { resultingDraftVersion: row.resultDraftVersion }),
    ...(row.resultRowVersion === null ? {} : { resultingRowVersion: row.resultRowVersion }),
  };
}

function toContractItem(
  item: typeof quarterlyReviewItems.$inferSelect
): QuarterlyReviewCurrentBasisResponse['companies'][number]['items'][number] {
  const common = {
    id: item.id,
    category: item.category as QuarterlyReviewCategory,
    version: item.version,
    etag: weakETag(`quarterly-review-item:${item.fundId}:${item.id}:${item.version}`),
  };
  if (item.state === 'pending') {
    return {
      ...common,
      state: 'pending',
      note: null,
      reviewedBy: null,
      reviewedAt: null,
      changeReference: null,
      followUp: null,
    };
  }
  if (item.note === null || item.reviewedBy === null || item.reviewedAt === null) {
    throw new QuarterlyReviewServiceError(
      409,
      'QUARTERLY_REVIEW_ITEM_CORRUPT',
      'Quarterly review item audit fields are incomplete.'
    );
  }
  if (item.state === 'reviewed_no_change') {
    return {
      ...common,
      state: 'reviewed_no_change',
      note: item.note,
      reviewedBy: item.reviewedBy,
      reviewedAt: item.reviewedAt.toISOString(),
      changeReference: null,
      followUp: null,
    };
  }
  if (
    item.state !== 'changed' ||
    item.changeRefKind !== 'internal_route' ||
    item.changeRefPath === null ||
    item.changeRefLabel === null
  ) {
    throw new QuarterlyReviewServiceError(
      409,
      'QUARTERLY_REVIEW_ITEM_CORRUPT',
      'Changed review item has invalid provenance.'
    );
  }
  return {
    ...common,
    state: 'changed',
    note: item.note,
    reviewedBy: item.reviewedBy,
    reviewedAt: item.reviewedAt.toISOString(),
    changeReference: {
      kind: 'internal_route',
      path: item.changeRefPath,
      label: item.changeRefLabel,
    },
    followUp:
      item.followUpTaskId === null
        ? null
        : { availability: 'linked', target: { kind: 'task', id: item.followUpTaskId } },
  };
}

async function loadAggregate(
  tx: Transaction,
  fundId: number,
  draftId: number,
  draftVersion: number,
  factsId: number,
  options?: { forUpdate?: boolean }
) {
  const rosterQuery = tx
    .select()
    .from(quarterlyReviewRosters)
    .where(
      and(
        eq(quarterlyReviewRosters.fundId, fundId),
        eq(quarterlyReviewRosters.analysisDraftId, draftId),
        eq(quarterlyReviewRosters.draftVersion, draftVersion),
        eq(quarterlyReviewRosters.financialFactsSnapshotId, factsId)
      )
    )
    .limit(1);
  const [roster] = options?.forUpdate ? await rosterQuery.for('update') : await rosterQuery;
  if (!roster) return { roster: null, companies: [], items: [] } as const;
  const companiesQuery = tx
    .select()
    .from(quarterlyReviewCompanies)
    .where(
      and(
        eq(quarterlyReviewCompanies.fundId, fundId),
        eq(quarterlyReviewCompanies.quarterlyReviewRosterId, roster.id)
      )
    )
    .orderBy(quarterlyReviewCompanies.id);
  const companies = options?.forUpdate ? await companiesQuery.for('update') : await companiesQuery;
  const items =
    companies.length === 0
      ? []
      : await (() => {
          const itemsQuery = tx
            .select()
            .from(quarterlyReviewItems)
            .where(
              and(
                eq(quarterlyReviewItems.fundId, fundId),
                inArray(
                  quarterlyReviewItems.quarterlyReviewCompanyId,
                  companies.map((company) => company.id)
                )
              )
            )
            .orderBy(quarterlyReviewItems.id);
          return options?.forUpdate ? itemsQuery.for('update') : itemsQuery;
        })();
  return { roster, companies, items };
}

async function assertActor(
  tx: Transaction,
  actorId: number,
  fundId: number,
  allowedRoles: readonly string[]
) {
  const [actor] = await tx
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  if (!actor || !actor.isActive || !allowedRoles.includes(actor.role)) {
    throw new QuarterlyReviewServiceError(
      403,
      'QUARTERLY_REVIEW_ACTOR_FORBIDDEN',
      'Actor is not authorized for this quarterly review command.'
    );
  }
  if (actor.role === 'admin') return;
  const [grant] = await tx
    .select({ userId: userFundGrants.userId })
    .from(userFundGrants)
    .where(and(eq(userFundGrants.userId, actorId), eq(userFundGrants.fundId, fundId)))
    .limit(1);
  if (!grant) {
    throw new QuarterlyReviewServiceError(
      403,
      'QUARTERLY_REVIEW_ACTOR_FORBIDDEN',
      'Actor is not authorized for this quarterly review command.'
    );
  }
}

async function throwMissingOrStaleCompany(
  tx: Transaction,
  input: { fundId: number; draftId: number; companyId: number },
  draft: typeof internalAnalysisDrafts.$inferSelect
): Promise<never> {
  const [historicalCompany] = await tx
    .select({ id: quarterlyReviewCompanies.id })
    .from(quarterlyReviewCompanies)
    .innerJoin(
      quarterlyReviewRosters,
      and(
        eq(quarterlyReviewCompanies.quarterlyReviewRosterId, quarterlyReviewRosters.id),
        eq(quarterlyReviewRosters.fundId, input.fundId)
      )
    )
    .where(
      and(
        eq(quarterlyReviewCompanies.id, input.companyId),
        eq(quarterlyReviewCompanies.fundId, input.fundId),
        eq(quarterlyReviewRosters.analysisDraftId, input.draftId)
      )
    )
    .limit(1);

  if (historicalCompany) {
    throw new QuarterlyReviewServiceError(
      412,
      'QUARTERLY_REVIEW_BASIS_CONFLICT',
      'Quarterly review basis changed since it was read.',
      {
        draftId: draft.id,
        draftVersion: draft.version,
        financialFactsSnapshotId: draft.financialFactsSnapshotId,
      }
    );
  }
  throw new QuarterlyReviewServiceError(
    404,
    'QUARTERLY_REVIEW_COMPANY_NOT_FOUND',
    'Quarterly review company not found.'
  );
}

export function createQuarterlyReviewPorts(database: Database = db): QuarterlyReviewPorts {
  return {
    async findReceipt(fundId, idempotencyKey) {
      const [row] = await database
        .select()
        .from(quarterlyReviewCommandReceipts)
        .where(
          and(
            eq(quarterlyReviewCommandReceipts.fundId, fundId),
            eq(quarterlyReviewCommandReceipts.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      return row ? { requestHash: row.requestHash, result: receiptResult(row) } : null;
    },

    async getCurrentReview(fundId, draftId) {
      const [draft] = await database
        .select()
        .from(internalAnalysisDrafts)
        .where(
          and(eq(internalAnalysisDrafts.id, draftId), eq(internalAnalysisDrafts.fundId, fundId))
        )
        .limit(1);
      if (!draft)
        throw new QuarterlyReviewServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
      const aggregate = await loadAggregate(
        database as Transaction,
        fundId,
        draftId,
        draft.version,
        draft.financialFactsSnapshotId
      );
      const summary = summarizeQuarterlyReview(
        aggregate.roster === null
          ? null
          : {
              rosterId: aggregate.roster.id,
              fundId,
              draftId,
              draftVersion: draft.version,
              financialFactsSnapshotId: draft.financialFactsSnapshotId,
              companyCount: aggregate.roster.companyCount,
            },
        aggregate.companies.map((company) => ({
          companyId: company.id,
          portfolioCompanyId: company.portfolioCompanyId,
          waivedAt: company.waivedAt,
          waivedBy: company.waivedBy,
          waiverReason: company.waiverReason,
          version: company.version,
        })),
        aggregate.items.map((item) => ({
          itemId: item.id,
          companyId: item.quarterlyReviewCompanyId,
          category: item.category as QuarterlyReviewCategory,
          state: item.state as QuarterlyReviewItemState,
          version: item.version,
        }))
      );
      const names =
        aggregate.companies.length === 0
          ? []
          : await database
              .select({ id: portfolioCompanies.id, name: portfolioCompanies.name })
              .from(portfolioCompanies)
              .where(
                and(
                  eq(portfolioCompanies.fundId, fundId),
                  inArray(
                    portfolioCompanies.id,
                    aggregate.companies.map((company) => company.portfolioCompanyId)
                  )
                )
              );
      const nameById = new Map(names.map((row) => [row.id, row.name]));
      return {
        contractVersion: QUARTERLY_REVIEW_CONTRACT_VERSION,
        fundId,
        draftId,
        draftVersion: draft.version,
        financialFactsSnapshotId: draft.financialFactsSnapshotId,
        draftEtag: weakETag(`internal-analysis-draft:${fundId}:${draftId}:${draft.version}`),
        requiresRefresh: summary.requiresRefresh,
        rosterId: aggregate.roster?.id ?? null,
        companies: aggregate.companies.map((company) => ({
          id: company.id,
          portfolioCompanyId: company.portfolioCompanyId,
          companyName:
            nameById.get(company.portfolioCompanyId) ?? `Company ${company.portfolioCompanyId}`,
          waivedAt: company.waivedAt?.toISOString() ?? null,
          waivedBy: company.waivedBy,
          waiverReason: company.waiverReason,
          version: company.version,
          etag: weakETag(`quarterly-review-company:${fundId}:${company.id}:${company.version}`),
          items: aggregate.items
            .filter((item) => item.quarterlyReviewCompanyId === company.id)
            .map(toContractItem),
        })),
        completion: {
          companyCount: summary.companyCount,
          completedCompanyCount: summary.completedCompanyCount,
          pendingCompanyCount: summary.pending.length,
          pendingItemCount: summary.pending.reduce(
            (count, company) => count + company.categories.length,
            0
          ),
        },
        canFinalize: summary.canFinalize,
        capabilities: {
          operatingDecision: { availability: 'unavailable', reason: 'dependency_not_available' },
        },
      };
    },

    async executeItemMutation(input) {
      return database.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(internalAnalysisDrafts)
          .where(
            and(
              eq(internalAnalysisDrafts.id, input.draftId),
              eq(internalAnalysisDrafts.fundId, input.fundId)
            )
          )
          .for('update')
          .limit(1);
        if (!draft)
          throw new QuarterlyReviewServiceError(
            404,
            'DRAFT_NOT_FOUND',
            'Analysis draft not found.'
          );
        const [replay] = await tx
          .select()
          .from(quarterlyReviewCommandReceipts)
          .where(
            and(
              eq(quarterlyReviewCommandReceipts.fundId, input.fundId),
              eq(quarterlyReviewCommandReceipts.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (replay) {
          if (replay.requestHash !== input.requestHash)
            throw new QuarterlyReviewServiceError(
              409,
              'IDEMPOTENCY_KEY_REUSE',
              'Idempotency-Key was already used.'
            );
          return receiptResult(replay);
        }
        if (draft.savedAt !== null)
          throw new QuarterlyReviewServiceError(
            409,
            'DRAFT_ALREADY_SAVED',
            'Saved draft is immutable.'
          );
        const aggregate = await loadAggregate(
          tx,
          input.fundId,
          input.draftId,
          draft.version,
          draft.financialFactsSnapshotId,
          { forUpdate: true }
        );
        summarizeQuarterlyReview(
          aggregate.roster === null
            ? null
            : {
                rosterId: aggregate.roster.id,
                fundId: input.fundId,
                draftId: input.draftId,
                draftVersion: draft.version,
                financialFactsSnapshotId: draft.financialFactsSnapshotId,
                companyCount: aggregate.roster.companyCount,
              },
          aggregate.companies.map((company) => ({
            companyId: company.id,
            portfolioCompanyId: company.portfolioCompanyId,
            waivedAt: company.waivedAt,
            waivedBy: company.waivedBy,
            waiverReason: company.waiverReason,
            version: company.version,
          })),
          aggregate.items.map((item) => ({
            itemId: item.id,
            companyId: item.quarterlyReviewCompanyId,
            category: item.category as QuarterlyReviewCategory,
            state: item.state as QuarterlyReviewItemState,
            version: item.version,
          }))
        );
        if (!aggregate.roster)
          throw new QuarterlyReviewServiceError(
            409,
            'QUARTERLY_REVIEW_ROSTER_MISSING',
            'Quarterly review requires refresh.'
          );
        await assertActor(tx, input.actorId, input.fundId, ['partner', 'admin', 'analyst']);
        const company =
          aggregate.companies.find((candidate) => candidate.id === input.companyId) ??
          (await throwMissingOrStaleCompany(tx, input, draft));
        if (company.waivedAt !== null)
          throw new QuarterlyReviewServiceError(
            409,
            'QUARTERLY_REVIEW_COMPANY_WAIVED',
            'Waiver is terminal for this review basis.'
          );
        const item = aggregate.items.find(
          (candidate) =>
            candidate.quarterlyReviewCompanyId === company.id &&
            candidate.category === input.category
        );
        if (!item)
          throw new QuarterlyReviewServiceError(
            404,
            'QUARTERLY_REVIEW_ITEM_NOT_FOUND',
            'Quarterly review item not found.'
          );
        if (
          weakETag(`quarterly-review-item:${input.fundId}:${item.id}:${item.version}`) !==
          input.rawIfMatch
        )
          throw new QuarterlyReviewServiceError(
            412,
            'QUARTERLY_REVIEW_ITEM_VERSION_CONFLICT',
            'Review item changed since it was read.'
          );
        if (input.body.state === 'changed') {
          try {
            parseQuarterlyReviewChangeReference({
              category: input.category,
              fundId: input.fundId,
              portfolioCompanyId: company.portfolioCompanyId,
              value: input.body.changeReference,
            });
          } catch {
            throw new QuarterlyReviewServiceError(
              400,
              'INVALID_QUARTERLY_REVIEW_CHANGE_REFERENCE',
              'Change reference does not match review category, fund, and company.'
            );
          }
          if (input.body.followUpTaskId !== undefined) {
            const [task] = await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.id, input.body.followUpTaskId), eq(tasks.fundId, input.fundId)))
              .limit(1);
            if (!task)
              throw new QuarterlyReviewServiceError(
                404,
                'FOLLOW_UP_TASK_NOT_FOUND',
                'Follow-up task not found.'
              );
          }
        }
        const [updated] = await tx
          .update(quarterlyReviewItems)
          .set({
            state: input.body.state,
            note: input.body.note,
            reviewedBy: input.actorId,
            reviewedAt: new Date(),
            changeRefKind: input.body.state === 'changed' ? 'internal_route' : null,
            changeRefPath: input.body.state === 'changed' ? input.body.changeReference.path : null,
            changeRefLabel:
              input.body.state === 'changed' ? input.body.changeReference.label : null,
            followUpTaskId:
              input.body.state === 'changed' ? (input.body.followUpTaskId ?? null) : null,
            version: sql`${quarterlyReviewItems.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quarterlyReviewItems.id, item.id),
              eq(quarterlyReviewItems.version, item.version)
            )
          )
          .returning();
        if (!updated)
          throw new QuarterlyReviewServiceError(
            412,
            'QUARTERLY_REVIEW_ITEM_VERSION_CONFLICT',
            'Review item changed since it was read.'
          );
        const [receipt] = await tx
          .insert(quarterlyReviewCommandReceipts)
          .values({
            fundId: input.fundId,
            analysisDraftId: input.draftId,
            rosterId: aggregate.roster.id,
            operation: 'review_item_update',
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            responseStatus: 200,
            resultKind: 'item',
            resultItemId: updated.id,
            resultRowVersion: updated.version,
            actorId: input.actorId,
          })
          .returning();
        if (!receipt)
          throw new QuarterlyReviewServiceError(
            500,
            'QUARTERLY_REVIEW_RECEIPT_WRITE_FAILED',
            'Failed to persist command receipt.'
          );
        return receiptResult(receipt);
      });
    },

    async executeWaiverMutation(input) {
      return database.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(internalAnalysisDrafts)
          .where(
            and(
              eq(internalAnalysisDrafts.id, input.draftId),
              eq(internalAnalysisDrafts.fundId, input.fundId)
            )
          )
          .for('update')
          .limit(1);
        if (!draft)
          throw new QuarterlyReviewServiceError(
            404,
            'DRAFT_NOT_FOUND',
            'Analysis draft not found.'
          );
        const [replay] = await tx
          .select()
          .from(quarterlyReviewCommandReceipts)
          .where(
            and(
              eq(quarterlyReviewCommandReceipts.fundId, input.fundId),
              eq(quarterlyReviewCommandReceipts.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (replay) {
          if (replay.requestHash !== input.requestHash)
            throw new QuarterlyReviewServiceError(
              409,
              'IDEMPOTENCY_KEY_REUSE',
              'Idempotency-Key was already used.'
            );
          return receiptResult(replay);
        }
        if (draft.savedAt !== null)
          throw new QuarterlyReviewServiceError(
            409,
            'DRAFT_ALREADY_SAVED',
            'Saved draft is immutable.'
          );
        const aggregate = await loadAggregate(
          tx,
          input.fundId,
          input.draftId,
          draft.version,
          draft.financialFactsSnapshotId,
          { forUpdate: true }
        );
        summarizeQuarterlyReview(
          aggregate.roster === null
            ? null
            : {
                rosterId: aggregate.roster.id,
                fundId: input.fundId,
                draftId: input.draftId,
                draftVersion: draft.version,
                financialFactsSnapshotId: draft.financialFactsSnapshotId,
                companyCount: aggregate.roster.companyCount,
              },
          aggregate.companies.map((company) => ({
            companyId: company.id,
            portfolioCompanyId: company.portfolioCompanyId,
            waivedAt: company.waivedAt,
            waivedBy: company.waivedBy,
            waiverReason: company.waiverReason,
            version: company.version,
          })),
          aggregate.items.map((item) => ({
            itemId: item.id,
            companyId: item.quarterlyReviewCompanyId,
            category: item.category as QuarterlyReviewCategory,
            state: item.state as QuarterlyReviewItemState,
            version: item.version,
          }))
        );
        if (!aggregate.roster)
          throw new QuarterlyReviewServiceError(
            409,
            'QUARTERLY_REVIEW_ROSTER_MISSING',
            'Quarterly review requires refresh.'
          );
        await assertActor(tx, input.actorId, input.fundId, ['partner', 'admin']);
        const company =
          aggregate.companies.find((candidate) => candidate.id === input.companyId) ??
          (await throwMissingOrStaleCompany(tx, input, draft));
        if (company.waivedAt !== null)
          throw new QuarterlyReviewServiceError(
            409,
            'QUARTERLY_REVIEW_COMPANY_WAIVED',
            'Waiver is terminal for this review basis.'
          );
        if (
          weakETag(`quarterly-review-company:${input.fundId}:${company.id}:${company.version}`) !==
          input.rawIfMatch
        )
          throw new QuarterlyReviewServiceError(
            412,
            'QUARTERLY_REVIEW_COMPANY_VERSION_CONFLICT',
            'Review company changed since it was read.'
          );
        const [updated] = await tx
          .update(quarterlyReviewCompanies)
          .set({
            waivedAt: new Date(),
            waivedBy: input.actorId,
            waiverReason: input.body.reason,
            version: sql`${quarterlyReviewCompanies.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(quarterlyReviewCompanies.id, company.id),
              eq(quarterlyReviewCompanies.version, company.version)
            )
          )
          .returning();
        if (!updated)
          throw new QuarterlyReviewServiceError(
            412,
            'QUARTERLY_REVIEW_COMPANY_VERSION_CONFLICT',
            'Review company changed since it was read.'
          );
        const [receipt] = await tx
          .insert(quarterlyReviewCommandReceipts)
          .values({
            fundId: input.fundId,
            analysisDraftId: input.draftId,
            rosterId: aggregate.roster.id,
            operation: 'company_waive',
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            responseStatus: 200,
            resultKind: 'company',
            resultCompanyId: updated.id,
            resultRowVersion: updated.version,
            actorId: input.actorId,
          })
          .returning();
        if (!receipt)
          throw new QuarterlyReviewServiceError(
            500,
            'QUARTERLY_REVIEW_RECEIPT_WRITE_FAILED',
            'Failed to persist command receipt.'
          );
        return receiptResult(receipt);
      });
    },
  };
}

export function summarizeQuarterlyReview(
  roster: QuarterlyReviewRosterRecord | null,
  companies: readonly QuarterlyReviewCompanyRecord[],
  items: readonly QuarterlyReviewItemRecord[]
): QuarterlyReviewSummary {
  if (roster === null) {
    return {
      requiresRefresh: true,
      companyCount: 0,
      completedCompanyCount: 0,
      pending: [],
      canFinalize: false,
    };
  }

  if (roster.companyCount !== companies.length) {
    throw new QuarterlyReviewServiceError(
      409,
      'QUARTERLY_REVIEW_ROSTER_CORRUPT',
      'Quarterly review roster membership does not match its marker.',
      {
        draftId: roster.draftId,
        draftVersion: roster.draftVersion,
        financialFactsSnapshotId: roster.financialFactsSnapshotId,
        expectedCompanyCount: roster.companyCount,
        actualCompanyCount: companies.length,
      }
    );
  }

  const pending: QuarterlyReviewSummary['pending'] = [];
  let completedCompanyCount = 0;
  for (const company of [...companies].sort((left, right) => left.companyId - right.companyId)) {
    if (company.waivedAt !== null) {
      completedCompanyCount += 1;
      continue;
    }

    const itemState = new Map(
      items
        .filter((item) => item.companyId === company.companyId)
        .map((item) => [item.category, item.state] as const)
    );
    const categories = QUARTERLY_REVIEW_CATEGORIES.filter(
      (category) => (itemState.get(category) ?? 'pending') === 'pending'
    );
    if (categories.length === 0) {
      completedCompanyCount += 1;
    } else {
      pending.push({
        companyId: company.companyId,
        portfolioCompanyId: company.portfolioCompanyId,
        categories: [...categories],
      });
    }
  }

  return {
    requiresRefresh: false,
    companyCount: roster.companyCount,
    completedCompanyCount,
    pending,
    canFinalize: completedCompanyCount === roster.companyCount,
  };
}
