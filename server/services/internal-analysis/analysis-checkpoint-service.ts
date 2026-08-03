/**
 * Quarterly analysis checkpoints and immutable reference snapshots
 * (PLAN_61 Task 18, Wave G).
 *
 * A draft is revisable; a reference is immutable. Refresh derives EVERY consumer
 * from ONE canonical facts snapshot built at the advanced cutoff (defect D6), and
 * save refuses a bundle whose components do not all resolve to that snapshot unless
 * the operator explicitly acknowledges the mixed basis (which is then persisted and
 * logged, R34-d).
 *
 * Scheduling runs through the existing `job_outbox` planner/claim/process cycle --
 * no new queue or worker (defect D5) -- and bootstraps only on the Docker/Railway
 * `registerRoutes` surface (R33-a). The claim query is filtered to this job type and
 * uses `FOR UPDATE SKIP LOCKED`, so a second replica cannot double-process (R33-c).
 * Startup catch-up is bounded (R33-b); the admin trigger route is the escape hatch
 * for an outage longer than the bound.
 *
 * Exit gate: these are internal reference snapshots on one coherent facts basis --
 * never closes, restatements, or approved reports.
 *
 * @module server/services/internal-analysis/analysis-checkpoint-service
 */
import { createHash } from 'node:crypto';

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  ANALYSIS_REFERENCE_CONTRACT_VERSION,
  type AnalysisDraftV1,
  type AnalysisPeriod,
  type AnalysisReferenceV1,
  type AnalysisRevisionEventV1,
  MIXED_FACTS_BASIS,
  enumerateDueQuarterlyPeriods,
  quarterlyDedupeKey,
} from '../../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  internalAnalysisDrafts,
  internalAnalysisReferences,
  internalAnalysisRevisionEvents,
  quarterlyReviewCompanies,
  quarterlyReviewCommandReceipts,
  quarterlyReviewItems,
  quarterlyReviewRosters,
} from '../../../shared/schema/internal-analysis';
import { portfolioCompanies } from '../../../shared/schema/portfolio';
import { isLivePortfolioCompany } from '../../../shared/lib/portfolio-company-status';
import {
  QUARTERLY_REVIEW_CATEGORIES,
  QUARTERLY_REVIEW_CONTRACT_VERSION,
  type QuarterlyReviewCommandResult,
} from '../../../shared/contracts/internal-analysis/quarterly-review-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { internalLpEconomicsRuns } from '../../../shared/schema/internal-economics';
import { jobOutbox, type JobOutbox } from '@shared/schema';
import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { logger } from '../../lib/logger';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
import { funds, fundSnapshots } from '../../../shared/schema/fund';
import { buildFinancialFactsSnapshot } from '../financial-facts-snapshot-service';
import { runCurrentForecastV2WithReceipt } from '../current-forecast-v2-service';
import { weakETag } from '../../lib/http-preconditions';

const log = logger.child({ module: 'internal-analysis-checkpoint' });

export const QUARTERLY_ANALYSIS_JOB_TYPE = 'quarterly_analysis_draft';
export const QUARTERLY_ANALYSIS_STARTUP_CATCHUP_DAYS = 30;

const DEFAULT_PLANNER_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_PROCESSOR_INTERVAL_MS = 60 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 60 * 1000;

export class AnalysisCheckpointServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'AnalysisCheckpointServiceError';
    this.status = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Pure decision core (unit-tested, no DB, fixed clock injected)
// ---------------------------------------------------------------------------

export type PinnedComponentKind = 'forecast' | 'reserve' | 'economics';

export interface PinnedComponentBasis {
  component: PinnedComponentKind;
  id: number;
  /**
   * The facts snapshot the component was actually computed from, read from its
   * PERSISTED basis. `null` means the basis could not be established -- which is
   * treated as a mismatch, because coherence must be proven, not assumed.
   */
  financialFactsSnapshotId: number | null;
}

export interface BundleCoherenceResult {
  coherent: boolean;
  mismatches: PinnedComponentBasis[];
}

/**
 * Every pinned component must reference the draft's facts snapshot (defect D6).
 * An unpinned (absent) component is vacuously coherent -- reserve and economics
 * stay null until Waves E/F land -- but a pinned component with an unreadable or
 * differing basis is a mismatch.
 */
export function classifyBundleCoherence(
  financialFactsSnapshotId: number,
  components: readonly PinnedComponentBasis[]
): BundleCoherenceResult {
  const mismatches = components.filter(
    (component) => component.financialFactsSnapshotId !== financialFactsSnapshotId
  );
  return { coherent: mismatches.length === 0, mismatches: [...mismatches] };
}

/**
 * The terminal member of each revision chain: a reference no other reference in
 * the set supersedes. Default comparison selects these (a late correction should
 * not leave the corrected snapshot competing with its successor).
 */
export function selectTerminalReferences<
  T extends { referenceId: number; supersedesReferenceId: number | null },
>(references: readonly T[]): T[] {
  const superseded = new Set<number>();
  for (const reference of references) {
    if (reference.supersedesReferenceId !== null) {
      superseded.add(reference.supersedesReferenceId);
    }
  }
  return references.filter((reference) => !superseded.has(reference.referenceId));
}

/** The UTC day a draft's default `asOfDate` should use: the period's last day. */
export function draftAsOfDate(period: AnalysisPeriod): string {
  return period.periodEnd;
}

/**
 * Deterministic idempotency key for the draft a given period owns.
 *
 * A late correction MUST key off the reference it corrects. Keying on the period
 * alone collides with the already-saved original on
 * `internal_analysis_drafts_fund_idempotency_unique`, and makes the facts-snapshot
 * rebuild replay the original snapshot instead of building one at the new cutoff --
 * so the correction flow could never produce a second draft for the period.
 */
export function draftIdempotencyKey(
  fundId: number,
  period: AnalysisPeriod,
  sourceReferenceId: number | null = null
): string {
  const lineage = sourceReferenceId === null ? 'initial' : `from-${sourceReferenceId}`;
  return `analysis-draft:${fundId}:${period.periodStart}:${period.periodEnd}:${lineage}`;
}

/** Deterministic idempotency key for the reference a given draft version produces. */
export function referenceIdempotencyKey(fundId: number, draftId: number, version: number): string {
  return `analysis-reference:${fundId}:${draftId}:${version}`;
}

// ---------------------------------------------------------------------------
// Ports (DB seam -- unit tests inject fakes, production wires the adapter below)
// ---------------------------------------------------------------------------

export interface DraftRecord {
  draftId: number;
  fundId: number;
  period: AnalysisPeriod;
  knowledgeCutoff: Date;
  financialFactsSnapshotId: number;
  forecastFundSnapshotId: number | null;
  reserveReferenceId: number | null;
  economicsReferenceId: number | null;
  sourceReferenceId: number | null;
  savedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferenceRecord {
  referenceId: number;
  fundId: number;
  period: AnalysisPeriod;
  knowledgeCutoff: Date;
  financialFactsSnapshotId: number;
  forecastFundSnapshotId: number | null;
  reserveReferenceId: number | null;
  economicsReferenceId: number | null;
  mixedBasisAtSave: boolean;
  supersedesReferenceId: number | null;
  sourceDraftId: number | null;
  createdBy: number | null;
  createdAt: Date;
}

export interface RebuiltBasis {
  financialFactsSnapshotId: number;
  knowledgeCutoff: Date;
  forecastFundSnapshotId: number | null;
}

export interface InsertDraftWithRosterInput {
  fundId: number;
  period: AnalysisPeriod;
  basis: RebuiltBasis;
  sourceReferenceId: number | null;
  actorId: number | null;
  idempotencyKey: string;
}

export type OpenDraftMutation =
  | {
      operation: 'refresh';
      mutation: {
        fundId: number;
        draftId: number;
        expectedVersion: number;
        basis: RebuiltBasis;
        actorId: number | null;
      };
      command?: DraftCommandContext;
    }
  | {
      operation: 'economics_reference_replace';
      mutation: {
        fundId: number;
        draftId: number;
        expectedVersion: number;
        economicsReferenceId: number | null;
      };
      command?: DraftCommandContext;
    };

export interface DraftCommandContext {
  idempotencyKey: string;
  requestHash: string;
  actorId: number;
}

export interface DraftMutationOutcome {
  draft: DraftRecord;
  result: QuarterlyReviewCommandResult | null;
}

export interface AnalysisCheckpointPorts {
  /** Funds a quarterly draft should be planned for. */
  listActiveFundIds(): Promise<number[]>;
  getOpenDraft(fundId: number, period: AnalysisPeriod): Promise<DraftRecord | null>;
  getDraftById(fundId: number, draftId: number): Promise<DraftRecord | null>;
  listDrafts(fundId: number): Promise<DraftRecord[]>;
  insertDraftWithRoster(input: InsertDraftWithRosterInput): Promise<DraftRecord>;
  mutateOpenDraftWithRoster(input: OpenDraftMutation): Promise<DraftMutationOutcome>;
  findQuarterlyReviewReceipt(
    fundId: number,
    idempotencyKey: string
  ): Promise<{ requestHash: string; result: QuarterlyReviewCommandResult } | null>;
  /**
   * Insert the reference AND close its draft atomically, under the draft's
   * expected version. Splitting these lets a concurrent refresh land between the
   * read and the write, which would persist a reference built from a basis the
   * draft no longer has; a crash between them would strand an open draft whose
   * retry then collides with the reference idempotency key. Implementations MUST
   * do both in one transaction, MUST guard on `version` and `savedAt IS NULL`,
   * and MUST return the existing reference on idempotent replay. The first
   * successful commit MUST also append its save revision events in that same
   * transaction; an exact replay MUST NOT append them again.
   */
  commitReference(input: {
    fundId: number;
    draft: DraftRecord;
    expectedVersion: number;
    mixedBasisAtSave: boolean;
    mismatches: PinnedComponentBasis[];
    supersedesReferenceId: number | null;
    actorId: number | null;
    idempotencyKey: string;
    command?: DraftCommandContext;
  }): Promise<ReferenceRecord>;
  /**
   * Build ONE canonical facts snapshot at the advanced cutoff and rebuild every
   * consumer from it. The single seam that guarantees the one-basis rule (D6).
   */
  rebuildBasis(input: {
    fundId: number;
    asOfDate: string;
    actorId: number | null;
    idempotencyKey: string;
  }): Promise<RebuiltBasis>;
  /** The facts snapshot a pinned component was PERSISTED against. */
  readComponentBasis(input: {
    fundId: number;
    component: PinnedComponentKind;
    id: number;
  }): Promise<number | null>;
  listReferences(fundId: number): Promise<ReferenceRecord[]>;
  getReferenceById(fundId: number, referenceId: number): Promise<ReferenceRecord | null>;
  listRevisionEvents(fundId: number, referenceId: number): Promise<AnalysisRevisionEventV1[]>;
  recordRevisionEvent(input: {
    fundId: number;
    draftId: number | null;
    referenceId: number | null;
    eventType: 'created' | 'refreshed' | 'saved' | 'mixed_basis_acknowledged';
    detail: Record<string, unknown>;
    actorId: number | null;
  }): Promise<void>;
  enqueueQuarterlyJob(input: {
    fundId: number;
    period: AnalysisPeriod;
    now: Date;
  }): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Operations (ports-driven, so every branch below is unit-testable without a DB)
// ---------------------------------------------------------------------------

/**
 * Enqueue one job per fund per past-due period, oldest first. Replay is a no-op:
 * the unique `(job_type, dedupe_key)` index absorbs it (defect D5).
 */
export async function planQuarterlyDrafts(
  ports: AnalysisCheckpointPorts,
  now: Date,
  options?: { catchupDays?: number; period?: AnalysisPeriod; fundIds?: readonly number[] }
): Promise<{ enqueued: number; periods: AnalysisPeriod[] }> {
  const periods =
    options?.period !== undefined
      ? [options.period]
      : enumerateDueQuarterlyPeriods(
          now,
          options?.catchupDays ?? QUARTERLY_ANALYSIS_STARTUP_CATCHUP_DAYS
        );

  if (periods.length === 0) {
    return { enqueued: 0, periods: [] };
  }

  // The scheduled planner fans out across every fund; the fund-scoped admin
  // trigger passes its own fund so an operator cannot plan for someone else's.
  const fundIds = options?.fundIds ?? (await ports.listActiveFundIds());
  let enqueued = 0;
  for (const fundId of fundIds) {
    for (const period of periods) {
      if (await ports.enqueueQuarterlyJob({ fundId, period, now })) {
        enqueued += 1;
      }
    }
  }
  return { enqueued, periods: [...periods] };
}

/**
 * Create the draft a quarterly job (or a manual request) owns. Idempotent on the
 * period: an existing open draft is returned unchanged, so a replayed job never
 * produces a second draft for the same quarter.
 */
export async function createDraftForPeriod(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    period: AnalysisPeriod;
    actorId: number | null;
    sourceReferenceId?: number | null;
  }
): Promise<DraftRecord> {
  const existing = await ports.getOpenDraft(input.fundId, input.period);
  if (existing !== null) return existing;

  const sourceReferenceId = input.sourceReferenceId ?? null;
  // Keyed by lineage, not period alone: a correction must not collide with the
  // already-saved original on the fund-scoped idempotency unique.
  const idempotencyKey = draftIdempotencyKey(input.fundId, input.period, sourceReferenceId);

  const basis = await ports.rebuildBasis({
    fundId: input.fundId,
    asOfDate: draftAsOfDate(input.period),
    actorId: input.actorId,
    idempotencyKey,
  });

  const draft = await ports.insertDraftWithRoster({
    fundId: input.fundId,
    period: input.period,
    basis,
    sourceReferenceId,
    actorId: input.actorId,
    idempotencyKey,
  });

  await ports.recordRevisionEvent({
    fundId: input.fundId,
    draftId: draft.draftId,
    referenceId: null,
    eventType: 'created',
    detail: {
      period: input.period,
      financialFactsSnapshotId: basis.financialFactsSnapshotId,
      sourceReferenceId: input.sourceReferenceId ?? null,
    },
    actorId: input.actorId,
  });

  return draft;
}

/**
 * Advance the knowledge cutoff and repin every consumer from ONE freshly built
 * facts snapshot (defect D6). `periodStart`/`periodEnd` never change. Bumping the
 * draft version is what rotates the ETag.
 */
export async function refreshDraft(
  ports: AnalysisCheckpointPorts,
  input: { fundId: number; draftId: number; expectedVersion: number; actorId: number | null }
): Promise<DraftRecord> {
  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  if (draft.savedAt !== null) {
    throw new AnalysisCheckpointServiceError(
      409,
      'DRAFT_ALREADY_SAVED',
      'A saved draft is immutable. Start a new draft from its reference to correct it.'
    );
  }

  const basis = await ports.rebuildBasis({
    fundId: input.fundId,
    asOfDate: draftAsOfDate(draft.period),
    actorId: input.actorId,
    idempotencyKey: `${draftIdempotencyKey(input.fundId, draft.period, draft.sourceReferenceId)}:v${draft.version + 1}`,
  });

  const { draft: refreshed } = await ports.mutateOpenDraftWithRoster({
    operation: 'refresh',
    mutation: {
      fundId: input.fundId,
      draftId: input.draftId,
      expectedVersion: input.expectedVersion,
      basis,
      actorId: input.actorId,
    },
  });

  return refreshed;
}

export async function replaceDraftEconomicsReference(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    draftId: number;
    expectedVersion: number;
    economicsReferenceId: number | null;
  }
): Promise<DraftRecord> {
  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  if (draft.savedAt !== null) {
    throw new AnalysisCheckpointServiceError(
      409,
      'DRAFT_ALREADY_SAVED',
      'A saved draft is immutable. Start a new draft from its reference to correct it.'
    );
  }
  if (draft.version !== input.expectedVersion) {
    throw new AnalysisCheckpointServiceError(
      412,
      'DRAFT_VERSION_CONFLICT',
      'The draft changed since it was read.',
      { expectedVersion: input.expectedVersion, currentVersion: draft.version }
    );
  }

  const outcome = await ports.mutateOpenDraftWithRoster({
    operation: 'economics_reference_replace',
    mutation: input,
  });
  return outcome.draft;
}

function draftCommandRequestHash(input: {
  operation: 'draft_refresh' | 'economics_reference_replace' | 'draft_save';
  fundId: number;
  draftId: number;
  rawIfMatch: string;
  body: Record<string, unknown>;
}): string {
  return canonicalSha256({
    operation: input.operation,
    contractVersion: QUARTERLY_REVIEW_CONTRACT_VERSION,
    fundId: input.fundId,
    draftId: input.draftId,
    rawIfMatch: input.rawIfMatch,
    body: input.body,
  });
}

async function replayDraftCommand(
  ports: AnalysisCheckpointPorts,
  input: { fundId: number; idempotencyKey: string; requestHash: string }
): Promise<QuarterlyReviewCommandResult | null> {
  const receipt = await ports.findQuarterlyReviewReceipt(input.fundId, input.idempotencyKey);
  if (receipt === null) return null;
  if (receipt.requestHash !== input.requestHash) {
    throw new AnalysisCheckpointServiceError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different quarterly review command.'
    );
  }
  return receipt.result;
}

function assertDraftCommandETag(draft: DraftRecord, rawIfMatch: string): void {
  const current = weakETag(
    `internal-analysis-draft:${draft.fundId}:${draft.draftId}:${draft.version}`
  );
  if (current !== rawIfMatch) {
    throw new AnalysisCheckpointServiceError(
      412,
      'DRAFT_VERSION_CONFLICT',
      'The draft changed since it was read.'
    );
  }
}

export async function refreshDraftWithReceipt(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    draftId: number;
    actorId: number;
    idempotencyKey: string;
    rawIfMatch: string;
  }
): Promise<QuarterlyReviewCommandResult> {
  const requestHash = draftCommandRequestHash({
    operation: 'draft_refresh',
    fundId: input.fundId,
    draftId: input.draftId,
    rawIfMatch: input.rawIfMatch,
    body: {},
  });
  const replay = await replayDraftCommand(ports, { ...input, requestHash });
  if (replay !== null) return replay;
  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  assertDraftCommandETag(draft, input.rawIfMatch);
  const basis = await ports.rebuildBasis({
    fundId: input.fundId,
    asOfDate: draftAsOfDate(draft.period),
    actorId: input.actorId,
    idempotencyKey: `${draftIdempotencyKey(input.fundId, draft.period, draft.sourceReferenceId)}:v${draft.version + 1}`,
  });
  const outcome = await ports.mutateOpenDraftWithRoster({
    operation: 'refresh',
    mutation: {
      fundId: input.fundId,
      draftId: input.draftId,
      expectedVersion: draft.version,
      basis,
      actorId: input.actorId,
    },
    command: { idempotencyKey: input.idempotencyKey, requestHash, actorId: input.actorId },
  });
  if (outcome.result === null) throw new Error('Draft refresh receipt was not persisted.');
  return outcome.result;
}

export async function replaceDraftEconomicsReferenceWithReceipt(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    draftId: number;
    economicsReferenceId: number | null;
    actorId: number;
    idempotencyKey: string;
    rawIfMatch: string;
  }
): Promise<QuarterlyReviewCommandResult> {
  const body = { economicsReferenceId: input.economicsReferenceId };
  const requestHash = draftCommandRequestHash({
    operation: 'economics_reference_replace',
    fundId: input.fundId,
    draftId: input.draftId,
    rawIfMatch: input.rawIfMatch,
    body,
  });
  const replay = await replayDraftCommand(ports, { ...input, requestHash });
  if (replay !== null) return replay;
  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null)
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  assertDraftCommandETag(draft, input.rawIfMatch);
  const outcome = await ports.mutateOpenDraftWithRoster({
    operation: 'economics_reference_replace',
    mutation: {
      fundId: input.fundId,
      draftId: input.draftId,
      expectedVersion: draft.version,
      economicsReferenceId: input.economicsReferenceId,
    },
    command: { idempotencyKey: input.idempotencyKey, requestHash, actorId: input.actorId },
  });
  if (outcome.result === null) throw new Error('Economics-reference receipt was not persisted.');
  return outcome.result;
}

/** The components actually pinned on a draft, paired with their persisted basis. */
async function readPinnedComponentBases(
  ports: AnalysisCheckpointPorts,
  draft: DraftRecord
): Promise<PinnedComponentBasis[]> {
  const pinned: Array<{ component: PinnedComponentKind; id: number }> = [];
  if (draft.forecastFundSnapshotId !== null) {
    pinned.push({ component: 'forecast', id: draft.forecastFundSnapshotId });
  }
  if (draft.reserveReferenceId !== null) {
    pinned.push({ component: 'reserve', id: draft.reserveReferenceId });
  }
  if (draft.economicsReferenceId !== null) {
    pinned.push({ component: 'economics', id: draft.economicsReferenceId });
  }

  return Promise.all(
    pinned.map(async (entry) => ({
      ...entry,
      financialFactsSnapshotId: await ports.readComponentBasis({
        fundId: draft.fundId,
        component: entry.component,
        id: entry.id,
      }),
    }))
  );
}

/**
 * Freeze a draft into an immutable reference. Rejects a mixed-basis bundle with
 * MIXED_FACTS_BASIS unless the operator explicitly acknowledges it, in which case
 * `mixedBasisAtSave` is persisted so the warning renders on EVERY subsequent load
 * of the reference, and the acknowledgement is logged in the revision history
 * (R34-d).
 */
export async function saveDraft(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    draftId: number;
    expectedVersion: number;
    acknowledgeMixedBasis: boolean;
    actorId: number | null;
  }
): Promise<ReferenceRecord> {
  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  if (draft.savedAt !== null) {
    throw new AnalysisCheckpointServiceError(
      409,
      'DRAFT_ALREADY_SAVED',
      'This draft has already been saved.'
    );
  }
  if (draft.version !== input.expectedVersion) {
    throw new AnalysisCheckpointServiceError(
      412,
      'DRAFT_VERSION_CONFLICT',
      'The draft changed since it was read.',
      { expectedVersion: input.expectedVersion, actualVersion: draft.version }
    );
  }

  const components = await readPinnedComponentBases(ports, draft);
  const coherence = classifyBundleCoherence(draft.financialFactsSnapshotId, components);

  if (!coherence.coherent && !input.acknowledgeMixedBasis) {
    throw new AnalysisCheckpointServiceError(
      409,
      MIXED_FACTS_BASIS,
      'Pinned components do not all resolve to the draft facts basis.',
      {
        financialFactsSnapshotId: draft.financialFactsSnapshotId,
        mismatches: coherence.mismatches,
      }
    );
  }

  const mixedBasisAtSave = !coherence.coherent;
  // One transaction, guarded on the version we validated the bundle against: a
  // refresh that lands in this window loses rather than silently producing a
  // reference whose basis the draft no longer has.
  const reference = await ports.commitReference({
    fundId: input.fundId,
    draft,
    expectedVersion: input.expectedVersion,
    mixedBasisAtSave,
    mismatches: coherence.mismatches,
    supersedesReferenceId: draft.sourceReferenceId,
    actorId: input.actorId,
    idempotencyKey: referenceIdempotencyKey(input.fundId, draft.draftId, draft.version),
  });

  return reference;
}

export async function saveDraftWithReceipt(
  ports: AnalysisCheckpointPorts,
  input: {
    fundId: number;
    draftId: number;
    acknowledgeMixedBasis: boolean;
    actorId: number;
    idempotencyKey: string;
    rawIfMatch: string;
  }
): Promise<ReferenceRecord> {
  const body = { acknowledgeMixedBasis: input.acknowledgeMixedBasis };
  const requestHash = draftCommandRequestHash({
    operation: 'draft_save',
    fundId: input.fundId,
    draftId: input.draftId,
    rawIfMatch: input.rawIfMatch,
    body,
  });
  const replay = await replayDraftCommand(ports, { ...input, requestHash });
  if (replay !== null) {
    const reference = await ports.getReferenceById(input.fundId, replay.targetId);
    if (reference === null) {
      throw new AnalysisCheckpointServiceError(
        409,
        'QUARTERLY_REVIEW_RECEIPT_CORRUPT',
        'Save receipt reference could not be resolved.'
      );
    }
    return reference;
  }

  const draft = await ports.getDraftById(input.fundId, input.draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  assertDraftCommandETag(draft, input.rawIfMatch);
  if (draft.savedAt !== null) {
    throw new AnalysisCheckpointServiceError(
      409,
      'DRAFT_ALREADY_SAVED',
      'This draft has already been saved.'
    );
  }
  const components = await readPinnedComponentBases(ports, draft);
  const coherence = classifyBundleCoherence(draft.financialFactsSnapshotId, components);
  if (!coherence.coherent && !input.acknowledgeMixedBasis) {
    throw new AnalysisCheckpointServiceError(
      409,
      MIXED_FACTS_BASIS,
      'Pinned components do not all resolve to the draft facts basis.',
      {
        financialFactsSnapshotId: draft.financialFactsSnapshotId,
        mismatches: coherence.mismatches,
      }
    );
  }
  const mixedBasisAtSave = !coherence.coherent;
  const reference = await ports.commitReference({
    fundId: input.fundId,
    draft,
    expectedVersion: draft.version,
    mixedBasisAtSave,
    mismatches: coherence.mismatches,
    supersedesReferenceId: draft.sourceReferenceId,
    actorId: input.actorId,
    idempotencyKey: referenceIdempotencyKey(input.fundId, draft.draftId, draft.version),
    command: { idempotencyKey: input.idempotencyKey, requestHash, actorId: input.actorId },
  });
  return reference;
}

/**
 * Start a late correction: a new draft seeded from a saved reference. Saving it
 * sets `supersedesReferenceId`, extending that reference's revision chain.
 */
export async function startCorrectionDraft(
  ports: AnalysisCheckpointPorts,
  input: { fundId: number; referenceId: number; actorId: number | null }
): Promise<DraftRecord> {
  const reference = await ports.getReferenceById(input.fundId, input.referenceId);
  if (reference === null) {
    throw new AnalysisCheckpointServiceError(
      404,
      'REFERENCE_NOT_FOUND',
      'Analysis reference not found.'
    );
  }

  return createDraftForPeriod(ports, {
    fundId: input.fundId,
    period: reference.period,
    actorId: input.actorId,
    sourceReferenceId: reference.referenceId,
  });
}

/** References for a fund; terminal-per-chain unless superseded rows are requested. */
export async function listReferences(
  ports: AnalysisCheckpointPorts,
  input: { fundId: number; includeSuperseded?: boolean }
): Promise<ReferenceRecord[]> {
  const references = await ports.listReferences(input.fundId);
  return input.includeSuperseded === true ? references : selectTerminalReferences(references);
}

// ---------------------------------------------------------------------------
// Contract mapping (pure -- the wire shape is derived here, once)
// ---------------------------------------------------------------------------

export function toDraftContract(draft: DraftRecord): AnalysisDraftV1 {
  return {
    contractVersion: ANALYSIS_REFERENCE_CONTRACT_VERSION,
    draftId: draft.draftId,
    fundId: draft.fundId,
    period: draft.period,
    basis: {
      financialFactsSnapshotId: draft.financialFactsSnapshotId,
      knowledgeCutoff: draft.knowledgeCutoff.toISOString(),
      forecastFundSnapshotId: draft.forecastFundSnapshotId,
      reserveReferenceId: draft.reserveReferenceId,
      economicsReferenceId: draft.economicsReferenceId,
    },
    sourceReferenceId: draft.sourceReferenceId,
    savedAt: draft.savedAt === null ? null : draft.savedAt.toISOString(),
    version: draft.version,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function toRevisionEventContract(
  row: typeof internalAnalysisRevisionEvents.$inferSelect
): AnalysisRevisionEventV1 {
  return {
    eventId: row.id,
    fundId: row.fundId,
    draftId: row.draftId,
    referenceId: row.referenceId,
    eventType: row.eventType,
    detail: row.detail,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReferenceContract(reference: ReferenceRecord): AnalysisReferenceV1 {
  return {
    contractVersion: ANALYSIS_REFERENCE_CONTRACT_VERSION,
    referenceId: reference.referenceId,
    fundId: reference.fundId,
    period: reference.period,
    basis: {
      financialFactsSnapshotId: reference.financialFactsSnapshotId,
      knowledgeCutoff: reference.knowledgeCutoff.toISOString(),
      forecastFundSnapshotId: reference.forecastFundSnapshotId,
      reserveReferenceId: reference.reserveReferenceId,
      economicsReferenceId: reference.economicsReferenceId,
    },
    mixedBasisAtSave: reference.mixedBasisAtSave,
    supersedesReferenceId: reference.supersedesReferenceId,
    sourceDraftId: reference.sourceDraftId,
    createdBy: reference.createdBy,
    createdAt: reference.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DB-backed ports
// ---------------------------------------------------------------------------

type Database = typeof db;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

async function seedQuarterlyReviewRoster(
  tx: Transaction,
  draft: DraftRecord,
  actorId: number | null
): Promise<number> {
  const companyRows = await tx
    .select({ id: portfolioCompanies.id, status: portfolioCompanies.status })
    .from(portfolioCompanies)
    .where(eq(portfolioCompanies.fundId, draft.fundId))
    .orderBy(portfolioCompanies.id);
  const liveCompanies = companyRows.filter(isLivePortfolioCompany);
  const [roster] = await tx
    .insert(quarterlyReviewRosters)
    .values({
      fundId: draft.fundId,
      analysisDraftId: draft.draftId,
      draftVersion: draft.version,
      financialFactsSnapshotId: draft.financialFactsSnapshotId,
      companyCount: liveCompanies.length,
      createdBy: actorId,
    })
    .returning({ id: quarterlyReviewRosters.id });
  if (!roster) {
    throw new AnalysisCheckpointServiceError(
      500,
      'QUARTERLY_REVIEW_ROSTER_WRITE_FAILED',
      'Failed to persist quarterly review roster.'
    );
  }
  if (liveCompanies.length === 0) return roster.id;

  const reviewCompanies = await tx
    .insert(quarterlyReviewCompanies)
    .values(
      liveCompanies.map((company) => ({
        fundId: draft.fundId,
        quarterlyReviewRosterId: roster.id,
        portfolioCompanyId: company.id,
      }))
    )
    .returning({ id: quarterlyReviewCompanies.id });
  await tx.insert(quarterlyReviewItems).values(
    reviewCompanies.flatMap((company) =>
      QUARTERLY_REVIEW_CATEGORIES.map((category) => ({
        fundId: draft.fundId,
        quarterlyReviewCompanyId: company.id,
        category,
      }))
    )
  );
  return roster.id;
}

function toQuarterlyReviewCommandResult(
  row: typeof quarterlyReviewCommandReceipts.$inferSelect
): QuarterlyReviewCommandResult {
  return {
    receiptId: row.id,
    operation: row.operation as QuarterlyReviewCommandResult['operation'],
    draftId: row.analysisDraftId,
    targetId:
      row.resultItemId ?? row.resultCompanyId ?? row.resultReferenceId ?? row.analysisDraftId,
    ...(row.resultDraftVersion === null ? {} : { resultingDraftVersion: row.resultDraftVersion }),
    ...(row.resultRowVersion === null ? {} : { resultingRowVersion: row.resultRowVersion }),
  };
}

function toPeriod(row: {
  periodKind: string;
  periodStart: string;
  periodEnd: string;
}): AnalysisPeriod {
  return {
    periodKind: row.periodKind as AnalysisPeriod['periodKind'],
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
  };
}

function toDraftRecord(row: typeof internalAnalysisDrafts.$inferSelect): DraftRecord {
  return {
    draftId: row.id,
    fundId: row.fundId,
    period: toPeriod(row),
    knowledgeCutoff: row.knowledgeCutoff,
    financialFactsSnapshotId: row.financialFactsSnapshotId,
    forecastFundSnapshotId: row.forecastFundSnapshotId,
    reserveReferenceId: row.reserveReferenceId,
    economicsReferenceId: row.economicsReferenceId,
    sourceReferenceId: row.sourceReferenceId,
    savedAt: row.savedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReferenceRecord(row: typeof internalAnalysisReferences.$inferSelect): ReferenceRecord {
  return {
    referenceId: row.id,
    fundId: row.fundId,
    period: toPeriod(row),
    knowledgeCutoff: row.knowledgeCutoff,
    financialFactsSnapshotId: row.financialFactsSnapshotId,
    forecastFundSnapshotId: row.forecastFundSnapshotId,
    reserveReferenceId: row.reserveReferenceId,
    economicsReferenceId: row.economicsReferenceId,
    mixedBasisAtSave: row.mixedBasisAtSave,
    supersedesReferenceId: row.supersedesReferenceId,
    sourceDraftId: row.sourceDraftId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createAnalysisCheckpointPorts(database: Database = db): AnalysisCheckpointPorts {
  return {
    async listActiveFundIds() {
      const rows = await database.select({ id: funds.id }).from(funds);
      return rows.map((row) => row.id);
    },

    async getOpenDraft(fundId, period) {
      const rows = await database
        .select()
        .from(internalAnalysisDrafts)
        .where(
          and(
            eq(internalAnalysisDrafts.fundId, fundId),
            eq(internalAnalysisDrafts.periodStart, period.periodStart),
            eq(internalAnalysisDrafts.periodEnd, period.periodEnd),
            isNull(internalAnalysisDrafts.savedAt)
          )
        )
        .limit(1);
      return rows[0] ? toDraftRecord(rows[0]) : null;
    },

    async getDraftById(fundId, draftId) {
      const rows = await database
        .select()
        .from(internalAnalysisDrafts)
        .where(
          and(eq(internalAnalysisDrafts.id, draftId), eq(internalAnalysisDrafts.fundId, fundId))
        )
        .limit(1);
      return rows[0] ? toDraftRecord(rows[0]) : null;
    },

    async listDrafts(fundId) {
      const rows = await database
        .select()
        .from(internalAnalysisDrafts)
        .where(eq(internalAnalysisDrafts.fundId, fundId))
        .orderBy(desc(internalAnalysisDrafts.periodStart), desc(internalAnalysisDrafts.createdAt));
      return rows.map(toDraftRecord);
    },

    async insertDraftWithRoster(input) {
      return database.transaction(async (tx) => {
        if (input.sourceReferenceId !== null) {
          await assertOwnedByFund({
            db: tx as unknown as FundScopedOwnershipDatabase,
            fundId: input.fundId,
            ref: { kind: 'analysis_reference', id: input.sourceReferenceId },
          });
        }
        if (input.basis.forecastFundSnapshotId !== null) {
          await assertOwnedByFund({
            db: tx as unknown as FundScopedOwnershipDatabase,
            fundId: input.fundId,
            ref: { kind: 'fund_snapshot', id: input.basis.forecastFundSnapshotId },
          });
        }

        const inserted = await tx
          .insert(internalAnalysisDrafts)
          .values({
            fundId: input.fundId,
            periodKind: input.period.periodKind,
            periodStart: input.period.periodStart,
            periodEnd: input.period.periodEnd,
            knowledgeCutoff: input.basis.knowledgeCutoff,
            financialFactsSnapshotId: input.basis.financialFactsSnapshotId,
            forecastFundSnapshotId: input.basis.forecastFundSnapshotId,
            sourceReferenceId: input.sourceReferenceId,
            createdBy: input.actorId,
            idempotencyKey: input.idempotencyKey,
            requestHash: sha256Hex(input.idempotencyKey),
          })
          .onConflictDoNothing()
          .returning();

        const row = inserted[0];
        if (!row) {
          const [existing] = await tx
            .select()
            .from(internalAnalysisDrafts)
            .where(
              and(
                eq(internalAnalysisDrafts.fundId, input.fundId),
                eq(internalAnalysisDrafts.periodStart, input.period.periodStart),
                eq(internalAnalysisDrafts.periodEnd, input.period.periodEnd),
                isNull(internalAnalysisDrafts.savedAt)
              )
            )
            .limit(1);
          if (existing) return toDraftRecord(existing);
          throw new AnalysisCheckpointServiceError(
            500,
            'DRAFT_WRITE_FAILED',
            'Failed to persist the analysis draft.'
          );
        }
        const draft = toDraftRecord(row);
        await seedQuarterlyReviewRoster(tx, draft, input.actorId);
        return draft;
      });
    },

    async mutateOpenDraftWithRoster(input) {
      const mutation = input.mutation;
      return database.transaction(async (tx) => {
        const [lockedRow] = await tx
          .select()
          .from(internalAnalysisDrafts)
          .where(
            and(
              eq(internalAnalysisDrafts.id, mutation.draftId),
              eq(internalAnalysisDrafts.fundId, mutation.fundId)
            )
          )
          .for('update')
          .limit(1);
        if (!lockedRow) {
          throw new AnalysisCheckpointServiceError(
            404,
            'DRAFT_NOT_FOUND',
            'Analysis draft not found.'
          );
        }

        const locked = toDraftRecord(lockedRow);
        if (input.command) {
          const [receipt] = await tx
            .select()
            .from(quarterlyReviewCommandReceipts)
            .where(
              and(
                eq(quarterlyReviewCommandReceipts.fundId, mutation.fundId),
                eq(quarterlyReviewCommandReceipts.idempotencyKey, input.command.idempotencyKey)
              )
            )
            .limit(1);
          if (receipt) {
            if (receipt.requestHash !== input.command.requestHash) {
              throw new AnalysisCheckpointServiceError(
                409,
                'IDEMPOTENCY_KEY_REUSE',
                'Idempotency-Key was already used for a different quarterly review command.'
              );
            }
            return { draft: locked, result: toQuarterlyReviewCommandResult(receipt) };
          }
        }
        if (locked.savedAt !== null) {
          throw new AnalysisCheckpointServiceError(
            409,
            'DRAFT_ALREADY_SAVED',
            'A saved draft is immutable. Start a new draft from its reference to correct it.'
          );
        }
        if (locked.version !== mutation.expectedVersion) {
          throw new AnalysisCheckpointServiceError(
            412,
            'DRAFT_VERSION_CONFLICT',
            'The draft changed since it was read.',
            { expectedVersion: mutation.expectedVersion, currentVersion: locked.version }
          );
        }

        let updateValues;
        let currentRosterId: number | null = null;
        if (input.operation === 'economics_reference_replace') {
          const economicsMutation = input.mutation;
          const [roster] = await tx
            .select()
            .from(quarterlyReviewRosters)
            .where(
              and(
                eq(quarterlyReviewRosters.analysisDraftId, locked.draftId),
                eq(quarterlyReviewRosters.fundId, locked.fundId),
                eq(quarterlyReviewRosters.draftVersion, locked.version),
                eq(quarterlyReviewRosters.financialFactsSnapshotId, locked.financialFactsSnapshotId)
              )
            )
            .limit(1);
          if (!roster) {
            throw new AnalysisCheckpointServiceError(
              409,
              'QUARTERLY_REVIEW_ROSTER_MISSING',
              'Quarterly review requires refresh.'
            );
          }
          const members = await tx
            .select({ id: quarterlyReviewCompanies.id })
            .from(quarterlyReviewCompanies)
            .where(
              and(
                eq(quarterlyReviewCompanies.fundId, locked.fundId),
                eq(quarterlyReviewCompanies.quarterlyReviewRosterId, roster.id)
              )
            );
          if (members.length !== roster.companyCount) {
            throw new AnalysisCheckpointServiceError(
              409,
              'QUARTERLY_REVIEW_ROSTER_CORRUPT',
              'Quarterly review roster membership does not match its marker.',
              {
                draftId: locked.draftId,
                draftVersion: locked.version,
                financialFactsSnapshotId: locked.financialFactsSnapshotId,
                expectedCompanyCount: roster.companyCount,
                actualCompanyCount: members.length,
              }
            );
          }
          currentRosterId = roster.id;
          if (locked.economicsReferenceId === economicsMutation.economicsReferenceId) {
            if (!input.command) return { draft: locked, result: null };
            const [receipt] = await tx
              .insert(quarterlyReviewCommandReceipts)
              .values({
                fundId: locked.fundId,
                analysisDraftId: locked.draftId,
                rosterId: roster.id,
                operation: 'economics_reference_replace',
                idempotencyKey: input.command.idempotencyKey,
                requestHash: input.command.requestHash,
                responseStatus: 200,
                resultKind: 'draft',
                resultDraftVersion: locked.version,
                actorId: input.command.actorId,
              })
              .returning();
            if (!receipt) throw new Error('Economics receipt write failed.');
            return { draft: locked, result: toQuarterlyReviewCommandResult(receipt) };
          }
          if (economicsMutation.economicsReferenceId !== null) {
            const [run] = await tx
              .select({ runState: internalLpEconomicsRuns.runState })
              .from(internalLpEconomicsRuns)
              .where(
                and(
                  eq(internalLpEconomicsRuns.id, economicsMutation.economicsReferenceId),
                  eq(internalLpEconomicsRuns.fundId, economicsMutation.fundId)
                )
              )
              .limit(1);
            if (!run) {
              throw new AnalysisCheckpointServiceError(
                404,
                'ECONOMICS_RUN_NOT_FOUND',
                'Economics run not found.'
              );
            }
            if (run.runState !== 'completed') {
              throw new AnalysisCheckpointServiceError(
                409,
                'ECONOMICS_RUN_NOT_COMPLETED',
                'Only completed economics runs can be attached.'
              );
            }
          }
          updateValues = {
            economicsReferenceId: economicsMutation.economicsReferenceId,
            version: sql`${internalAnalysisDrafts.version} + 1`,
            updatedAt: new Date(),
          };
        } else {
          const refreshMutation = input.mutation;
          updateValues = {
            knowledgeCutoff: refreshMutation.basis.knowledgeCutoff,
            financialFactsSnapshotId: refreshMutation.basis.financialFactsSnapshotId,
            forecastFundSnapshotId: refreshMutation.basis.forecastFundSnapshotId,
            economicsReferenceId: null,
            version: sql`${internalAnalysisDrafts.version} + 1`,
            updatedAt: new Date(),
          };
        }

        const updated = await tx
          .update(internalAnalysisDrafts)
          .set(updateValues)
          .where(
            and(
              eq(internalAnalysisDrafts.id, mutation.draftId),
              eq(internalAnalysisDrafts.fundId, mutation.fundId),
              eq(internalAnalysisDrafts.version, mutation.expectedVersion),
              isNull(internalAnalysisDrafts.savedAt)
            )
          )
          .returning();

        const row = updated[0];
        if (!row) {
          throw new AnalysisCheckpointServiceError(
            412,
            'DRAFT_VERSION_CONFLICT',
            'The draft changed since it was read.',
            { expectedVersion: mutation.expectedVersion }
          );
        }
        const draft = toDraftRecord(row);
        const rosterId = await seedQuarterlyReviewRoster(tx, draft, input.command?.actorId ?? null);
        if (input.operation === 'refresh') {
          await tx.insert(internalAnalysisRevisionEvents).values({
            fundId: draft.fundId,
            draftId: draft.draftId,
            referenceId: null,
            eventType: 'refreshed',
            detail: {
              knowledgeCutoff: draft.knowledgeCutoff.toISOString(),
              financialFactsSnapshotId: draft.financialFactsSnapshotId,
              forecastFundSnapshotId: draft.forecastFundSnapshotId,
              economicsReferenceCleared: locked.economicsReferenceId !== null,
              version: draft.version,
            },
            actorId: input.mutation.actorId,
          });
        }
        if (!input.command) return { draft, result: null };
        const [receipt] = await tx
          .insert(quarterlyReviewCommandReceipts)
          .values({
            fundId: draft.fundId,
            analysisDraftId: draft.draftId,
            rosterId: input.operation === 'refresh' ? rosterId : (rosterId ?? currentRosterId),
            operation:
              input.operation === 'refresh' ? 'draft_refresh' : 'economics_reference_replace',
            idempotencyKey: input.command.idempotencyKey,
            requestHash: input.command.requestHash,
            responseStatus: 200,
            resultKind: 'draft',
            resultDraftVersion: draft.version,
            actorId: input.command.actorId,
          })
          .returning();
        if (!receipt) throw new Error('Draft transition receipt write failed.');
        return { draft, result: toQuarterlyReviewCommandResult(receipt) };
      });
    },

    async findQuarterlyReviewReceipt(fundId, idempotencyKey) {
      const [receipt] = await database
        .select()
        .from(quarterlyReviewCommandReceipts)
        .where(
          and(
            eq(quarterlyReviewCommandReceipts.fundId, fundId),
            eq(quarterlyReviewCommandReceipts.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      return receipt
        ? { requestHash: receipt.requestHash, result: toQuarterlyReviewCommandResult(receipt) }
        : null;
    },

    async rebuildBasis(input) {
      // ONE canonical facts snapshot at the server-assigned cutoff...
      const snapshot = await buildFinancialFactsSnapshot({
        fundId: input.fundId,
        asOfDate: input.asOfDate,
        actorId: input.actorId ?? 0,
        idempotencyKey: input.idempotencyKey,
        database,
      });

      // buildFinancialFactsSnapshot returns the wire contract, which carries no row
      // id. Resolve it deterministically through the fund-scoped identity unique
      // (fund_id, snapshot_input_hash) rather than re-reading "the latest", which
      // would be racy.
      const [snapshotRow] = await database
        .select({ id: financialFactsSnapshots.id })
        .from(financialFactsSnapshots)
        .where(
          and(
            eq(financialFactsSnapshots.fundId, input.fundId),
            eq(financialFactsSnapshots.snapshotInputHash, snapshot.snapshotInputHash)
          )
        )
        .limit(1);

      if (!snapshotRow) {
        throw new AnalysisCheckpointServiceError(
          500,
          'FACTS_SNAPSHOT_NOT_RESOLVED',
          'The facts snapshot was built but could not be resolved by identity hash.'
        );
      }

      const knowledgeCutoff = new Date(snapshot.knowledgeCutoff);

      // ...and every consumer rebuilt from that same snapshot (defect D6).
      let forecastFundSnapshotId: number | null = null;
      try {
        const receipt = await runCurrentForecastV2WithReceipt({
          fundId: input.fundId,
          financialFactsSnapshotId: String(snapshotRow.id),
          clock: knowledgeCutoff.toISOString(),
          database,
        });
        forecastFundSnapshotId = receipt.fundSnapshotId;
      } catch (error) {
        // A fund without an accepted current plan has no forecast to pin yet. The
        // reference is still valid on its facts basis alone; the panel renders the
        // absence rather than fabricating a number.
        log.warn(
          { err: error, fundId: input.fundId },
          'Current-forecast rebuild unavailable; leaving the forecast pin empty'
        );
      }

      return {
        financialFactsSnapshotId: snapshotRow.id,
        knowledgeCutoff,
        forecastFundSnapshotId,
      };
    },

    async readComponentBasis(input) {
      if (input.component === 'forecast') {
        const rows = await database
          .select({ payload: fundSnapshots.payload })
          .from(fundSnapshots)
          .where(and(eq(fundSnapshots.id, input.id), eq(fundSnapshots.fundId, input.fundId)))
          .limit(1);
        const payload = rows[0]?.payload as { financialFactsSnapshotId?: unknown } | undefined;
        // The forecast records its basis inside the JSON payload as a string --
        // fund_snapshots has no relational basis column.
        const raw = payload?.financialFactsSnapshotId;
        if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number.parseInt(raw, 10);
        if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
        return null;
      }
      if (input.component === 'economics') {
        const rows = await database
          .select({ factsSnapshotId: internalLpEconomicsRuns.factsSnapshotId })
          .from(internalLpEconomicsRuns)
          .where(
            and(
              eq(internalLpEconomicsRuns.id, input.id),
              eq(internalLpEconomicsRuns.fundId, input.fundId)
            )
          )
          .limit(1);
        return rows[0]?.factsSnapshotId ?? null;
      }
      // Reserve linkage has not landed, so its basis remains unproven.
      return null;
    },

    async commitReference(input) {
      return database.transaction(async (tx) => {
        const [lockedDraft] = await tx
          .select()
          .from(internalAnalysisDrafts)
          .where(
            and(
              eq(internalAnalysisDrafts.id, input.draft.draftId),
              eq(internalAnalysisDrafts.fundId, input.fundId)
            )
          )
          .for('update')
          .limit(1);
        if (!lockedDraft) {
          throw new AnalysisCheckpointServiceError(
            404,
            'DRAFT_NOT_FOUND',
            'Analysis draft not found.'
          );
        }

        if (input.command) {
          const [receipt] = await tx
            .select()
            .from(quarterlyReviewCommandReceipts)
            .where(
              and(
                eq(quarterlyReviewCommandReceipts.fundId, input.fundId),
                eq(quarterlyReviewCommandReceipts.idempotencyKey, input.command.idempotencyKey)
              )
            )
            .limit(1);
          if (receipt) {
            if (receipt.requestHash !== input.command.requestHash) {
              throw new AnalysisCheckpointServiceError(
                409,
                'IDEMPOTENCY_KEY_REUSE',
                'Idempotency-Key was already used for a different quarterly review command.'
              );
            }
            if (receipt.resultReferenceId === null) {
              throw new AnalysisCheckpointServiceError(
                409,
                'QUARTERLY_REVIEW_RECEIPT_CORRUPT',
                'Save receipt has no reference result.'
              );
            }
            const [existingReference] = await tx
              .select()
              .from(internalAnalysisReferences)
              .where(
                and(
                  eq(internalAnalysisReferences.id, receipt.resultReferenceId),
                  eq(internalAnalysisReferences.fundId, input.fundId)
                )
              )
              .limit(1);
            if (!existingReference) {
              throw new AnalysisCheckpointServiceError(
                409,
                'QUARTERLY_REVIEW_RECEIPT_CORRUPT',
                'Save receipt reference could not be resolved.'
              );
            }
            return toReferenceRecord(existingReference);
          }
        }

        if (lockedDraft.savedAt !== null || lockedDraft.version !== input.expectedVersion) {
          throw new AnalysisCheckpointServiceError(
            lockedDraft.savedAt !== null ? 409 : 412,
            lockedDraft.savedAt !== null ? 'DRAFT_ALREADY_SAVED' : 'DRAFT_VERSION_CONFLICT',
            lockedDraft.savedAt !== null
              ? 'This draft has already been saved.'
              : 'The draft changed since it was read.',
            { expectedVersion: input.expectedVersion, currentVersion: lockedDraft.version }
          );
        }

        const [roster] = await tx
          .select()
          .from(quarterlyReviewRosters)
          .where(
            and(
              eq(quarterlyReviewRosters.analysisDraftId, lockedDraft.id),
              eq(quarterlyReviewRosters.fundId, input.fundId),
              eq(quarterlyReviewRosters.draftVersion, lockedDraft.version),
              eq(
                quarterlyReviewRosters.financialFactsSnapshotId,
                lockedDraft.financialFactsSnapshotId
              )
            )
          )
          .limit(1)
          .for('update');
        if (!roster) {
          throw new AnalysisCheckpointServiceError(
            409,
            'QUARTERLY_REVIEW_ROSTER_MISSING',
            'Quarterly review requires refresh.',
            {
              draftId: lockedDraft.id,
              draftVersion: lockedDraft.version,
              financialFactsSnapshotId: lockedDraft.financialFactsSnapshotId,
            }
          );
        }

        const companies = await tx
          .select()
          .from(quarterlyReviewCompanies)
          .where(
            and(
              eq(quarterlyReviewCompanies.fundId, input.fundId),
              eq(quarterlyReviewCompanies.quarterlyReviewRosterId, roster.id)
            )
          )
          .orderBy(quarterlyReviewCompanies.id)
          .for('update');
        if (companies.length !== roster.companyCount) {
          throw new AnalysisCheckpointServiceError(
            409,
            'QUARTERLY_REVIEW_ROSTER_CORRUPT',
            'Quarterly review roster membership does not match its marker.',
            {
              draftId: lockedDraft.id,
              draftVersion: lockedDraft.version,
              financialFactsSnapshotId: lockedDraft.financialFactsSnapshotId,
              expectedCompanyCount: roster.companyCount,
              actualCompanyCount: companies.length,
            }
          );
        }

        const items =
          companies.length === 0
            ? []
            : await tx
                .select()
                .from(quarterlyReviewItems)
                .where(
                  and(
                    eq(quarterlyReviewItems.fundId, input.fundId),
                    inArray(
                      quarterlyReviewItems.quarterlyReviewCompanyId,
                      companies.map((company) => company.id)
                    )
                  )
                )
                .orderBy(quarterlyReviewItems.id)
                .for('update');
        const pendingCompanies = companies.flatMap((company) => {
          if (company.waivedAt !== null) return [];
          const stateByCategory = new Map(
            items
              .filter((item) => item.quarterlyReviewCompanyId === company.id)
              .map((item) => [item.category, item.state] as const)
          );
          const pendingCategories = QUARTERLY_REVIEW_CATEGORIES.filter(
            (category) => (stateByCategory.get(category) ?? 'pending') === 'pending'
          );
          return pendingCategories.length === 0
            ? []
            : [{ companyId: company.id, pendingCategories: [...pendingCategories] }];
        });
        if (pendingCompanies.length > 0) {
          throw new AnalysisCheckpointServiceError(
            409,
            'QUARTERLY_REVIEW_INCOMPLETE',
            'Quarterly review is incomplete.',
            {
              draftId: lockedDraft.id,
              draftVersion: lockedDraft.version,
              financialFactsSnapshotId: lockedDraft.financialFactsSnapshotId,
              pendingCompanyCount: pendingCompanies.length,
              pendingItemCount: pendingCompanies.reduce(
                (count, company) => count + company.pendingCategories.length,
                0
              ),
              companies: pendingCompanies,
            }
          );
        }

        const closed = await tx
          .update(internalAnalysisDrafts)
          .set({ savedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(internalAnalysisDrafts.id, input.draft.draftId),
              eq(internalAnalysisDrafts.fundId, input.fundId),
              eq(internalAnalysisDrafts.version, input.expectedVersion),
              isNull(internalAnalysisDrafts.savedAt)
            )
          )
          .returning();

        if (!closed[0]) {
          throw new AnalysisCheckpointServiceError(
            412,
            'DRAFT_VERSION_CONFLICT',
            'The draft changed since it was read.',
            { expectedVersion: input.expectedVersion }
          );
        }

        const inserted = await tx
          .insert(internalAnalysisReferences)
          .values({
            fundId: input.fundId,
            periodKind: input.draft.period.periodKind,
            periodStart: input.draft.period.periodStart,
            periodEnd: input.draft.period.periodEnd,
            knowledgeCutoff: input.draft.knowledgeCutoff,
            financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
            forecastFundSnapshotId: input.draft.forecastFundSnapshotId,
            reserveReferenceId: input.draft.reserveReferenceId,
            economicsReferenceId: input.draft.economicsReferenceId,
            mixedBasisAtSave: input.mixedBasisAtSave,
            supersedesReferenceId: input.supersedesReferenceId,
            sourceDraftId: input.draft.draftId,
            createdBy: input.actorId,
            idempotencyKey: input.idempotencyKey,
            requestHash: sha256Hex(input.idempotencyKey),
          })
          .returning();

        const row = inserted[0];
        if (!row) {
          throw new AnalysisCheckpointServiceError(
            500,
            'REFERENCE_WRITE_FAILED',
            'Failed to persist the analysis reference.'
          );
        }
        if (input.command) {
          const [receipt] = await tx
            .insert(quarterlyReviewCommandReceipts)
            .values({
              fundId: input.fundId,
              analysisDraftId: input.draft.draftId,
              rosterId: roster.id,
              operation: 'draft_save',
              idempotencyKey: input.command.idempotencyKey,
              requestHash: input.command.requestHash,
              responseStatus: 201,
              resultKind: 'reference',
              resultReferenceId: row.id,
              actorId: input.command.actorId,
            })
            .returning({ id: quarterlyReviewCommandReceipts.id });
          if (!receipt) {
            throw new AnalysisCheckpointServiceError(
              500,
              'QUARTERLY_REVIEW_RECEIPT_WRITE_FAILED',
              'Failed to persist save receipt.'
            );
          }
        }

        if (input.mixedBasisAtSave) {
          await tx.insert(internalAnalysisRevisionEvents).values({
            fundId: input.fundId,
            draftId: input.draft.draftId,
            referenceId: row.id,
            eventType: 'mixed_basis_acknowledged',
            detail: {
              financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
              mismatches: input.mismatches,
            },
            actorId: input.actorId,
          });
        }
        await tx.insert(internalAnalysisRevisionEvents).values({
          fundId: input.fundId,
          draftId: input.draft.draftId,
          referenceId: row.id,
          eventType: 'saved',
          detail: {
            period: input.draft.period,
            financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
            mixedBasisAtSave: input.mixedBasisAtSave,
            supersedesReferenceId: input.supersedesReferenceId,
          },
          actorId: input.actorId,
        });
        return toReferenceRecord(row);
      });
    },

    async listRevisionEvents(fundId, referenceId) {
      const rows = await database
        .select()
        .from(internalAnalysisRevisionEvents)
        .where(
          and(
            eq(internalAnalysisRevisionEvents.fundId, fundId),
            eq(internalAnalysisRevisionEvents.referenceId, referenceId)
          )
        )
        .orderBy(internalAnalysisRevisionEvents.createdAt);
      return rows.map(toRevisionEventContract);
    },

    async listReferences(fundId) {
      const rows = await database
        .select()
        .from(internalAnalysisReferences)
        .where(eq(internalAnalysisReferences.fundId, fundId))
        .orderBy(
          desc(internalAnalysisReferences.periodStart),
          desc(internalAnalysisReferences.createdAt)
        );
      return rows.map(toReferenceRecord);
    },

    async getReferenceById(fundId, referenceId) {
      const rows = await database
        .select()
        .from(internalAnalysisReferences)
        .where(
          and(
            eq(internalAnalysisReferences.id, referenceId),
            eq(internalAnalysisReferences.fundId, fundId)
          )
        )
        .limit(1);
      return rows[0] ? toReferenceRecord(rows[0]) : null;
    },

    async recordRevisionEvent(input) {
      await database.insert(internalAnalysisRevisionEvents).values({
        fundId: input.fundId,
        draftId: input.draftId,
        referenceId: input.referenceId,
        eventType: input.eventType,
        detail: input.detail,
        actorId: input.actorId,
      });
    },

    async enqueueQuarterlyJob(input) {
      const inserted = await database
        .insert(jobOutbox)
        .values({
          jobType: QUARTERLY_ANALYSIS_JOB_TYPE,
          dedupeKey: quarterlyDedupeKey(
            input.fundId,
            input.period.periodStart,
            input.period.periodEnd
          ),
          payload: {
            kind: QUARTERLY_ANALYSIS_JOB_TYPE,
            fundId: input.fundId,
            periodKind: input.period.periodKind,
            periodStart: input.period.periodStart,
            periodEnd: input.period.periodEnd,
          },
          status: 'pending',
          attemptCount: 0,
          maxAttempts: 3,
          priority: 0,
          scheduledFor: input.now,
          nextRunAt: input.now,
        })
        .onConflictDoNothing()
        .returning();
      return inserted[0] !== undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// job_outbox lifecycle (planner + SKIP LOCKED claim + processor)
// ---------------------------------------------------------------------------

interface QuarterlyJobPayload {
  kind: typeof QUARTERLY_ANALYSIS_JOB_TYPE;
  fundId: number;
  periodKind: AnalysisPeriod['periodKind'];
  periodStart: string;
  periodEnd: string;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(label: string, work: () => Promise<T> | T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${DEFAULT_STEP_TIMEOUT_MS}ms`));
    }, DEFAULT_STEP_TIMEOUT_MS);
    void Promise.resolve()
      .then(work)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function toRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function mapJobRow(row: Record<string, unknown>): JobOutbox {
  return {
    id: String(row['id']),
    jobType: String(row['jobType'] ?? row['job_type']),
    dedupeKey: (row['dedupeKey'] ?? row['dedupe_key'] ?? null) as string | null,
    payload: row['payload'] as Record<string, unknown>,
    status: String(row['status']) as JobOutbox['status'],
    priority: Number(row['priority'] ?? 0),
    attemptCount: Number(row['attemptCount'] ?? row['attempt_count'] ?? 0),
    maxAttempts: Number(row['maxAttempts'] ?? row['max_attempts'] ?? 3),
    scheduledFor: (row['scheduledFor'] ?? row['scheduled_for'] ?? null) as Date | null,
    processingAt: (row['processingAt'] ?? row['processing_at'] ?? null) as Date | null,
    nextRunAt: (row['nextRunAt'] ?? row['next_run_at'] ?? null) as Date | null,
    completedAt: (row['completedAt'] ?? row['completed_at'] ?? null) as Date | null,
    errorMessage: (row['errorMessage'] ?? row['error_message'] ?? null) as string | null,
    createdAt: (row['createdAt'] ?? row['created_at'] ?? new Date()) as Date,
    updatedAt: (row['updatedAt'] ?? row['updated_at'] ?? new Date()) as Date,
  };
}

function parseQuarterlyJobPayload(payload: unknown): QuarterlyJobPayload | null {
  const candidate = payload as Partial<QuarterlyJobPayload> | null;
  if (!candidate || candidate.kind !== QUARTERLY_ANALYSIS_JOB_TYPE) return null;
  if (typeof candidate.fundId !== 'number' || !Number.isInteger(candidate.fundId)) return null;
  if (typeof candidate.periodStart !== 'string' || typeof candidate.periodEnd !== 'string') {
    return null;
  }
  if (candidate.periodKind !== 'quarterly' && candidate.periodKind !== 'manual') return null;
  return candidate as QuarterlyJobPayload;
}

export class InternalAnalysisCheckpointService {
  private plannerTimer: NodeJS.Timeout | null = null;
  private processorTimer: NodeJS.Timeout | null = null;
  private plannerInFlight = false;
  private processorInFlight = false;
  private enabled = false;

  start(options?: {
    enabled?: boolean;
    plannerIntervalMs?: number;
    processorIntervalMs?: number;
  }): void {
    const shouldEnable =
      options?.enabled ??
      (process.env['NODE_ENV'] !== 'test' && process.env['ENABLE_QUARTERLY_ANALYSIS'] !== '0');

    if (!shouldEnable) {
      this.enabled = false;
      log.info('Quarterly analysis draft scheduler disabled');
      return;
    }
    if (this.enabled) {
      log.debug('Quarterly analysis draft scheduler already started');
      return;
    }

    this.enabled = true;
    const plannerIntervalMs =
      options?.plannerIntervalMs ??
      parsePositiveIntEnv('QUARTERLY_ANALYSIS_PLANNER_INTERVAL_MS', DEFAULT_PLANNER_INTERVAL_MS);
    const processorIntervalMs =
      options?.processorIntervalMs ??
      parsePositiveIntEnv(
        'QUARTERLY_ANALYSIS_PROCESSOR_INTERVAL_MS',
        DEFAULT_PROCESSOR_INTERVAL_MS
      );

    this.plannerTimer = setInterval(() => void this.runPlannerCycle(), plannerIntervalMs);
    this.processorTimer = setInterval(() => void this.runProcessorCycle(), processorIntervalMs);

    // Startup catch-up: enqueue any past-due quarters immediately (R33-b).
    void this.runPlannerCycle();
    void this.runProcessorCycle();
    log.info({ plannerIntervalMs, processorIntervalMs }, 'Quarterly analysis scheduler started');
  }

  stop(): void {
    this.enabled = false;
    if (this.plannerTimer) {
      clearInterval(this.plannerTimer);
      this.plannerTimer = null;
    }
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
      this.processorTimer = null;
    }
  }

  planQuarterlyJobs(
    now = new Date(),
    options?: { catchupDays?: number; period?: AnalysisPeriod }
  ): Promise<{ enqueued: number; periods: AnalysisPeriod[] }> {
    return planQuarterlyDrafts(createAnalysisCheckpointPorts(), now, options);
  }

  async claimNextQuarterlyJob(): Promise<JobOutbox | null> {
    const result = await db.execute(sql`
      WITH next_job AS (
        SELECT id
        FROM job_outbox
        WHERE job_type = ${QUARTERLY_ANALYSIS_JOB_TYPE}
          AND status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= NOW())
          AND (next_run_at IS NULL OR next_run_at <= NOW())
        ORDER BY next_run_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE job_outbox AS j
      SET status = 'processing',
          processing_at = NOW(),
          attempt_count = COALESCE(j.attempt_count, 0) + 1,
          updated_at = NOW()
      FROM next_job
      WHERE j.id = next_job.id
      RETURNING
        j.id, j.job_type AS "jobType", j.dedupe_key AS "dedupeKey", j.payload, j.status,
        j.priority, j.attempt_count AS "attemptCount", j.max_attempts AS "maxAttempts",
        j.scheduled_for AS "scheduledFor", j.processing_at AS "processingAt",
        j.next_run_at AS "nextRunAt", j.completed_at AS "completedAt",
        j.error_message AS "errorMessage", j.created_at AS "createdAt", j.updated_at AS "updatedAt"
    `);
    const row = toRows(result)[0];
    return row ? mapJobRow(row) : null;
  }

  async processQuarterlyJob(job: JobOutbox): Promise<void> {
    const payload = parseQuarterlyJobPayload(job.payload);
    if (payload === null) {
      await this.markJobCancelled(job.id, 'Invalid quarterly analysis draft job payload');
      return;
    }

    const draft = await createDraftForPeriod(createAnalysisCheckpointPorts(), {
      fundId: payload.fundId,
      period: {
        periodKind: payload.periodKind,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
      },
      actorId: null,
    });

    await this.markJobCompleted(job.id);
    log.info(
      {
        event: 'quarterly-analysis.processor.completed',
        jobId: job.id,
        fundId: payload.fundId,
        draftId: draft.draftId,
      },
      'Created quarterly analysis draft'
    );
  }

  private async runPlannerCycle(): Promise<void> {
    if (!this.enabled || this.plannerInFlight) return;
    this.plannerInFlight = true;
    try {
      await withTimeout('planQuarterlyJobs', () => this.planQuarterlyJobs());
    } catch (error) {
      log.error({ err: error }, 'Quarterly analysis planner cycle failed');
    } finally {
      this.plannerInFlight = false;
    }
  }

  private async runProcessorCycle(): Promise<void> {
    if (!this.enabled || this.processorInFlight) return;
    this.processorInFlight = true;
    let claimed: JobOutbox | null = null;
    try {
      claimed = await this.claimNextQuarterlyJob();
      if (!claimed) return;
      // Bounded: the facts-snapshot build and forecast rebuild are the slowest
      // things this process does, and a hang would leave processorInFlight true
      // and wedge every later quarterly job. On timeout the catch below routes
      // the claimed job through the normal failure/retry path.
      const job = claimed;
      await withTimeout('processQuarterlyJob', () => this.processQuarterlyJob(job));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processor error';
      if (claimed) await this.handleJobFailure(claimed, message);
      log.error({ err: error }, 'Quarterly analysis processor cycle failed');
    } finally {
      this.processorInFlight = false;
    }
  }

  private async markJobCompleted(jobId: string): Promise<void> {
    await db
      .update(jobOutbox)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobOutbox.id, jobId));
  }

  private async markJobCancelled(jobId: string, errorMessage: string): Promise<void> {
    await db
      .update(jobOutbox)
      .set({ status: 'cancelled', errorMessage, processingAt: null, updatedAt: new Date() })
      .where(eq(jobOutbox.id, jobId));
    log.warn(
      { event: 'quarterly-analysis.processor.cancelled', jobId, errorMessage },
      'Cancelled quarterly analysis job'
    );
  }

  private async handleJobFailure(job: JobOutbox, errorMessage: string): Promise<void> {
    const terminal = (job.attemptCount ?? 0) >= (job.maxAttempts ?? 3);
    await db
      .update(jobOutbox)
      .set({
        status: terminal ? 'failed' : 'pending',
        processingAt: null,
        nextRunAt: terminal ? job.nextRunAt : new Date(),
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, job.id));
    log.error(
      { event: 'quarterly-analysis.processor.failed', jobId: job.id, terminal, errorMessage },
      'Quarterly analysis job failed'
    );
  }
}

export const internalAnalysisCheckpointService = new InternalAnalysisCheckpointService();
