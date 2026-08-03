import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  quarterPeriod,
  quarterlyDedupeKey,
  type AnalysisPeriod,
} from '../../../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import type { QuarterlyReviewCommandResult } from '../../../../shared/contracts/internal-analysis/quarterly-review-v1.contract';
import {
  AnalysisCheckpointServiceError,
  QUARTERLY_ANALYSIS_JOB_TYPE,
  QUARTERLY_ANALYSIS_STARTUP_CATCHUP_DAYS,
  type AnalysisCheckpointPorts,
  type DraftRecord,
  type PinnedComponentKind,
  type ReferenceRecord,
  classifyBundleCoherence,
  createDraftForPeriod,
  draftIdempotencyKey,
  listReferences,
  planQuarterlyDrafts,
  replaceDraftEconomicsReference,
  replaceDraftEconomicsReferenceWithReceipt,
  refreshDraft,
  refreshDraftWithReceipt,
  saveDraft,
  saveDraftWithReceipt,
  selectTerminalReferences,
  startCorrectionDraft,
} from '../../../../server/services/internal-analysis/analysis-checkpoint-service';

const Q2_2026 = quarterPeriod(2026, 2);
const Q1_2026 = quarterPeriod(2026, 1);
const FUND = 7;
const OTHER_FUND = 8;

function etagForDraft(draft: DraftRecord): string {
  return `W/"${createHash('sha256')
    .update(`internal-analysis-draft:${draft.fundId}:${draft.draftId}:${draft.version}`)
    .digest('hex')
    .slice(0, 16)}"`;
}

interface RevisionEvent {
  fundId: number;
  draftId: number | null;
  referenceId: number | null;
  eventType: string;
  detail: Record<string, unknown>;
}

/**
 * In-memory ports. Mirrors the real adapter's observable behaviour (fund scoping,
 * the open-draft uniqueness, version bumping) without a database, so every branch
 * of the decision core is exercised deterministically.
 */
class FakePorts implements AnalysisCheckpointPorts {
  drafts: DraftRecord[] = [];
  references: ReferenceRecord[] = [];
  receipts = new Map<string, { requestHash: string; result: QuarterlyReviewCommandResult }>();
  events: RevisionEvent[] = [];
  enqueued: Array<{ fundId: number; dedupeKey: string }> = [];
  fundIds = [FUND];

  /** Facts snapshot ids handed out by successive rebuilds. */
  nextSnapshotId = 100;
  nextForecastId = 900;
  /** Persisted basis per forecast fund_snapshot id -- the coherence oracle. */
  forecastBasis = new Map<number, number | null>();
  economicsRuns = new Map<
    number,
    { fundId: number; runState: 'completed' | 'failed'; factsSnapshotId: number }
  >();
  rebuildCalls: Array<{ fundId: number; asOfDate: string; idempotencyKey: string }> = [];
  insertDraftWithRosterCalls = 0;
  mutateOpenDraftWithRosterCalls: Array<'refresh' | 'economics_reference_replace'> = [];

  /** Mirrors the fund-scoped idempotency uniques the real tables enforce. */
  private draftKeys = new Map<number, string>();
  private referenceKeys = new Map<number, string>();
  private draftSeq = 1;
  private referenceSeq = 1;
  private clock = new Date('2026-07-01T00:00:00.000Z');

  private tick(): Date {
    this.clock = new Date(this.clock.getTime() + 1000);
    return this.clock;
  }

  async listActiveFundIds() {
    return this.fundIds;
  }

  /** The live row, for mutation by the write paths. */
  private findDraft(fundId: number, draftId: number): DraftRecord | undefined {
    return this.drafts.find((draft) => draft.draftId === draftId && draft.fundId === fundId);
  }

  // Reads hand back COPIES, the way a real row read does. Sharing the live
  // object would let a caller holding a "stale" draft observe a concurrent
  // refresh's mutations, hiding exactly the interleaving the version guard is
  // there to catch.
  async getOpenDraft(fundId: number, period: AnalysisPeriod) {
    const found = this.drafts.find(
      (draft) =>
        draft.fundId === fundId &&
        draft.period.periodStart === period.periodStart &&
        draft.period.periodEnd === period.periodEnd &&
        draft.savedAt === null
    );
    return found ? { ...found } : null;
  }

  async getDraftById(fundId: number, draftId: number) {
    const found = this.findDraft(fundId, draftId);
    return found ? { ...found } : null;
  }

  async insertDraft(input: Parameters<AnalysisCheckpointPorts['insertDraftWithRoster']>[0]) {
    // Mirrors internal_analysis_drafts_fund_idempotency_unique. Without this the
    // fake silently accepted the correction-draft key collision that the real
    // table rejects.
    if (
      this.drafts.some(
        (existing) =>
          existing.fundId === input.fundId &&
          this.draftKeys.get(existing.draftId) === input.idempotencyKey
      )
    ) {
      throw new Error('internal_analysis_drafts_fund_idempotency_unique');
    }

    const draft: DraftRecord = {
      draftId: this.draftSeq++,
      fundId: input.fundId,
      period: input.period,
      knowledgeCutoff: input.basis.knowledgeCutoff,
      financialFactsSnapshotId: input.basis.financialFactsSnapshotId,
      forecastFundSnapshotId: input.basis.forecastFundSnapshotId,
      reserveReferenceId: null,
      economicsReferenceId: null,
      sourceReferenceId: input.sourceReferenceId,
      savedAt: null,
      version: 1,
      createdAt: this.tick(),
      updatedAt: this.tick(),
    };
    this.drafts.push(draft);
    this.draftKeys.set(draft.draftId, input.idempotencyKey);
    return draft;
  }

  async insertDraftWithRoster(
    input: Parameters<AnalysisCheckpointPorts['insertDraftWithRoster']>[0]
  ) {
    this.insertDraftWithRosterCalls += 1;
    return this.insertDraft(input);
  }

  async updateDraftBasis(
    input: Extract<
      Parameters<AnalysisCheckpointPorts['mutateOpenDraftWithRoster']>[0],
      { operation: 'refresh' }
    >['mutation']
  ) {
    const draft = this.findDraft(input.fundId, input.draftId);
    if (!draft || draft.savedAt !== null || draft.version !== input.expectedVersion) {
      throw new AnalysisCheckpointServiceError(
        412,
        'DRAFT_VERSION_CONFLICT',
        'The draft changed since it was read.'
      );
    }
    draft.knowledgeCutoff = input.basis.knowledgeCutoff;
    draft.financialFactsSnapshotId = input.basis.financialFactsSnapshotId;
    draft.forecastFundSnapshotId = input.basis.forecastFundSnapshotId;
    draft.economicsReferenceId = null;
    draft.version += 1;
    draft.updatedAt = this.tick();
    return { ...draft };
  }

  async mutateOpenDraftWithRoster(
    input:
      | {
          operation: 'refresh';
          mutation: Extract<
            Parameters<AnalysisCheckpointPorts['mutateOpenDraftWithRoster']>[0],
            { operation: 'refresh' }
          >['mutation'];
        }
      | {
          operation: 'economics_reference_replace';
          mutation: Extract<
            Parameters<AnalysisCheckpointPorts['mutateOpenDraftWithRoster']>[0],
            { operation: 'economics_reference_replace' }
          >['mutation'];
        }
  ) {
    this.mutateOpenDraftWithRosterCalls.push(input.operation);
    if (input.command) {
      const replay = this.receipts.get(input.command.idempotencyKey);
      if (replay) {
        if (replay.requestHash !== input.command.requestHash) {
          throw new AnalysisCheckpointServiceError(
            409,
            'IDEMPOTENCY_KEY_REUSE',
            'Idempotency-Key was already used.'
          );
        }
        const replayDraft = await this.getDraftById(input.mutation.fundId, input.mutation.draftId);
        if (!replayDraft) {
          throw new AnalysisCheckpointServiceError(
            404,
            'DRAFT_NOT_FOUND',
            'Analysis draft not found.'
          );
        }
        return { draft: replayDraft, result: replay.result };
      }
    }
    const current = await this.getDraftById(input.mutation.fundId, input.mutation.draftId);
    const draft =
      input.operation === 'economics_reference_replace' &&
      current?.economicsReferenceId === input.mutation.economicsReferenceId
        ? current
        : await (input.operation === 'refresh'
            ? this.updateDraftBasis(input.mutation)
            : this.replaceDraftEconomicsReference(input.mutation));
    if (input.operation === 'refresh') {
      this.events.push({
        fundId: draft.fundId,
        draftId: draft.draftId,
        referenceId: null,
        eventType: 'refreshed',
        detail: {
          knowledgeCutoff: draft.knowledgeCutoff.toISOString(),
          financialFactsSnapshotId: draft.financialFactsSnapshotId,
          forecastFundSnapshotId: draft.forecastFundSnapshotId,
          economicsReferenceCleared: current?.economicsReferenceId !== null,
          version: draft.version,
        },
      });
    }
    if (!input.command) return { draft, result: null };
    const result: QuarterlyReviewCommandResult = {
      receiptId: this.receipts.size + 1,
      operation: input.operation === 'refresh' ? 'draft_refresh' : 'economics_reference_replace',
      draftId: draft.draftId,
      targetId: draft.draftId,
      resultingDraftVersion: draft.version,
    };
    this.receipts.set(input.command.idempotencyKey, {
      requestHash: input.command.requestHash,
      result,
    });
    return { draft, result };
  }

  async findQuarterlyReviewReceipt(_fundId: number, idempotencyKey: string) {
    return this.receipts.get(idempotencyKey) ?? null;
  }

  async listDrafts(fundId: number) {
    return this.drafts.filter((draft) => draft.fundId === fundId);
  }

  async listRevisionEvents(fundId: number, referenceId: number) {
    return this.events
      .filter((event) => event.fundId === fundId && event.referenceId === referenceId)
      .map((event, index) => ({
        eventId: index + 1,
        fundId: event.fundId,
        draftId: event.draftId,
        referenceId: event.referenceId,
        eventType: event.eventType as
          'created' | 'refreshed' | 'saved' | 'mixed_basis_acknowledged',
        detail: event.detail,
        actorId: null,
        createdAt: '2026-07-02T00:00:00.000Z',
      }));
  }

  async rebuildBasis(input: Parameters<AnalysisCheckpointPorts['rebuildBasis']>[0]) {
    this.rebuildCalls.push({
      fundId: input.fundId,
      asOfDate: input.asOfDate,
      idempotencyKey: input.idempotencyKey,
    });
    const financialFactsSnapshotId = this.nextSnapshotId++;
    const forecastFundSnapshotId = this.nextForecastId++;
    // The rebuild is the ONE place a basis is minted, so the forecast it produces
    // is coherent by construction.
    this.forecastBasis.set(forecastFundSnapshotId, financialFactsSnapshotId);
    return {
      financialFactsSnapshotId,
      knowledgeCutoff: new Date(
        Date.UTC(2026, 6, 1) + (financialFactsSnapshotId - 100) * 86_400_000
      ),
      forecastFundSnapshotId,
    };
  }

  async readComponentBasis(input: { fundId: number; component: PinnedComponentKind; id: number }) {
    if (input.component === 'forecast') return this.forecastBasis.get(input.id) ?? null;
    if (input.component === 'economics') {
      const run = this.economicsRuns.get(input.id);
      return run?.fundId === input.fundId ? run.factsSnapshotId : null;
    }
    return null;
  }

  async replaceDraftEconomicsReference(
    input: Extract<
      Parameters<AnalysisCheckpointPorts['mutateOpenDraftWithRoster']>[0],
      { operation: 'economics_reference_replace' }
    >['mutation']
  ) {
    if (input.economicsReferenceId !== null) {
      const run = this.economicsRuns.get(input.economicsReferenceId);
      if (!run || run.fundId !== input.fundId) {
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

    const draft = this.findDraft(input.fundId, input.draftId);
    if (!draft) {
      throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
    }
    if (draft.savedAt !== null) {
      throw new AnalysisCheckpointServiceError(
        409,
        'DRAFT_ALREADY_SAVED',
        'Saved draft is immutable.'
      );
    }
    if (draft.version !== input.expectedVersion) {
      throw new AnalysisCheckpointServiceError(
        412,
        'DRAFT_VERSION_CONFLICT',
        'The draft changed since it was read.'
      );
    }

    draft.economicsReferenceId = input.economicsReferenceId;
    draft.version += 1;
    draft.updatedAt = this.tick();
    return { ...draft };
  }

  /**
   * Mirrors the adapter's transaction: close the draft under its expected
   * version FIRST, then insert. A replay whose draft is already closed gets the
   * reference that attempt produced rather than a duplicate.
   */
  async commitReference(input: Parameters<AnalysisCheckpointPorts['commitReference']>[0]) {
    const draft = this.findDraft(input.fundId, input.draft.draftId);
    if (!draft || draft.savedAt !== null || draft.version !== input.expectedVersion) {
      const existing = this.references.find(
        (candidate) =>
          candidate.fundId === input.fundId &&
          this.referenceKeys.get(candidate.referenceId) === input.idempotencyKey
      );
      if (existing) return existing;
      throw new AnalysisCheckpointServiceError(
        412,
        'DRAFT_VERSION_CONFLICT',
        'The draft changed since it was read.'
      );
    }
    draft.savedAt = this.tick();

    const reference: ReferenceRecord = {
      referenceId: this.referenceSeq++,
      fundId: input.fundId,
      period: input.draft.period,
      knowledgeCutoff: input.draft.knowledgeCutoff,
      financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
      forecastFundSnapshotId: input.draft.forecastFundSnapshotId,
      reserveReferenceId: input.draft.reserveReferenceId,
      economicsReferenceId: input.draft.economicsReferenceId,
      mixedBasisAtSave: input.mixedBasisAtSave,
      supersedesReferenceId: input.supersedesReferenceId,
      sourceDraftId: input.draft.draftId,
      createdBy: input.actorId,
      createdAt: this.tick(),
    };
    this.references.push(reference);
    this.referenceKeys.set(reference.referenceId, input.idempotencyKey);
    if (input.mixedBasisAtSave) {
      this.events.push({
        fundId: input.fundId,
        draftId: input.draft.draftId,
        referenceId: reference.referenceId,
        eventType: 'mixed_basis_acknowledged',
        detail: {
          financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
          mismatches: [
            {
              component: 'forecast',
              id: input.draft.forecastFundSnapshotId,
              financialFactsSnapshotId:
                input.draft.forecastFundSnapshotId === null
                  ? null
                  : (this.forecastBasis.get(input.draft.forecastFundSnapshotId) ?? null),
            },
          ],
        },
      });
    }
    this.events.push({
      fundId: input.fundId,
      draftId: input.draft.draftId,
      referenceId: reference.referenceId,
      eventType: 'saved',
      detail: {
        period: input.draft.period,
        financialFactsSnapshotId: input.draft.financialFactsSnapshotId,
        mixedBasisAtSave: input.mixedBasisAtSave,
        supersedesReferenceId: input.supersedesReferenceId,
      },
    });
    if (input.command) {
      this.receipts.set(input.command.idempotencyKey, {
        requestHash: input.command.requestHash,
        result: {
          receiptId: this.receipts.size + 1,
          operation: 'draft_save',
          draftId: input.draft.draftId,
          targetId: reference.referenceId,
        },
      });
    }
    return reference;
  }

  async listReferences(fundId: number) {
    return this.references.filter((reference) => reference.fundId === fundId);
  }

  async getReferenceById(fundId: number, referenceId: number) {
    return (
      this.references.find(
        (reference) => reference.referenceId === referenceId && reference.fundId === fundId
      ) ?? null
    );
  }

  async recordRevisionEvent(input: Parameters<AnalysisCheckpointPorts['recordRevisionEvent']>[0]) {
    this.events.push({
      fundId: input.fundId,
      draftId: input.draftId,
      referenceId: input.referenceId,
      eventType: input.eventType,
      detail: input.detail,
    });
  }

  async enqueueQuarterlyJob(input: { fundId: number; period: AnalysisPeriod; now: Date }) {
    const dedupeKey = quarterlyDedupeKey(
      input.fundId,
      input.period.periodStart,
      input.period.periodEnd
    );
    // The unique (job_type, dedupe_key) index makes replay a no-op.
    if (this.enqueued.some((job) => job.dedupeKey === dedupeKey)) return false;
    this.enqueued.push({ fundId: input.fundId, dedupeKey });
    return true;
  }
}

let ports: FakePorts;

beforeEach(() => {
  ports = new FakePorts();
});

describe('analysis checkpoint service', () => {
  it('pins the job type and startup catch-up bound', () => {
    expect(QUARTERLY_ANALYSIS_JOB_TYPE).toBe('quarterly_analysis_draft');
    expect(QUARTERLY_ANALYSIS_STARTUP_CATCHUP_DAYS).toBe(30);
  });

  describe('classifyBundleCoherence (defect D6)', () => {
    it('is coherent when nothing is pinned -- Waves E/F are optional', () => {
      expect(classifyBundleCoherence(41, [])).toEqual({ coherent: true, mismatches: [] });
    });

    it('is coherent when every pinned component resolves to the same snapshot', () => {
      const result = classifyBundleCoherence(41, [
        { component: 'forecast', id: 900, financialFactsSnapshotId: 41 },
      ]);
      expect(result.coherent).toBe(true);
    });

    it('flags a component built on a different snapshot', () => {
      const result = classifyBundleCoherence(41, [
        { component: 'forecast', id: 900, financialFactsSnapshotId: 40 },
      ]);
      expect(result.coherent).toBe(false);
      expect(result.mismatches).toEqual([
        { component: 'forecast', id: 900, financialFactsSnapshotId: 40 },
      ]);
    });

    it('treats an unreadable basis as a mismatch -- coherence must be proven', () => {
      const result = classifyBundleCoherence(41, [
        { component: 'reserve', id: 5, financialFactsSnapshotId: null },
      ]);
      expect(result.coherent).toBe(false);
    });
  });

  describe('selectTerminalReferences', () => {
    it('drops every superseded member of a chain', () => {
      const chain = [
        { referenceId: 1, supersedesReferenceId: null },
        { referenceId: 2, supersedesReferenceId: 1 },
        { referenceId: 3, supersedesReferenceId: 2 },
      ];
      expect(selectTerminalReferences(chain)).toEqual([
        { referenceId: 3, supersedesReferenceId: 2 },
      ]);
    });

    it('keeps independent chains side by side', () => {
      const refs = [
        { referenceId: 1, supersedesReferenceId: null },
        { referenceId: 2, supersedesReferenceId: 1 },
        { referenceId: 9, supersedesReferenceId: null },
      ];
      expect(selectTerminalReferences(refs).map((r) => r.referenceId)).toEqual([2, 9]);
    });
  });

  describe('planQuarterlyDrafts', () => {
    it('enqueues the immediately preceding quarter per fund', async () => {
      const result = await planQuarterlyDrafts(ports, new Date('2026-07-01T00:00:00.000Z'));

      expect(result.enqueued).toBe(1);
      expect(result.periods).toEqual([Q2_2026]);
      expect(ports.enqueued).toEqual([
        { fundId: FUND, dedupeKey: 'quarterly:7:2026-04-01:2026-06-30' },
      ]);
    });

    it('is a no-op on replay -- the dedupe key absorbs it', async () => {
      const now = new Date('2026-07-01T00:00:00.000Z');
      await planQuarterlyDrafts(ports, now);
      const replay = await planQuarterlyDrafts(ports, now);

      expect(replay.enqueued).toBe(0);
      expect(ports.enqueued).toHaveLength(1);
    });

    it('enqueues every missed window, not just the latest (defect D5)', async () => {
      const result = await planQuarterlyDrafts(ports, new Date('2026-07-27T00:00:00.000Z'), {
        catchupDays: 400,
      });

      expect(result.periods.length).toBeGreaterThan(1);
      expect(result.enqueued).toBe(result.periods.length);
      expect(ports.enqueued.map((job) => job.dedupeKey)).toContain(
        'quarterly:7:2026-04-01:2026-06-30'
      );
      expect(ports.enqueued.map((job) => job.dedupeKey)).toContain(
        'quarterly:7:2025-07-01:2025-09-30'
      );
    });

    it('fans out across every fund', async () => {
      ports.fundIds = [FUND, OTHER_FUND];
      const result = await planQuarterlyDrafts(ports, new Date('2026-07-01T00:00:00.000Z'));

      expect(result.enqueued).toBe(2);
      expect(ports.enqueued.map((job) => job.fundId).sort()).toEqual([FUND, OTHER_FUND]);
    });

    it('enqueues nothing when no quarter is due', async () => {
      const result = await planQuarterlyDrafts(ports, new Date('2026-06-30T00:00:00.000Z'));

      expect(result).toEqual({ enqueued: 0, periods: [] });
      expect(ports.enqueued).toHaveLength(0);
    });

    it('honours an explicit period from the admin trigger', async () => {
      const result = await planQuarterlyDrafts(ports, new Date('2026-07-01T00:00:00.000Z'), {
        period: Q1_2026,
      });

      expect(result.periods).toEqual([Q1_2026]);
      expect(ports.enqueued[0]?.dedupeKey).toBe('quarterly:7:2026-01-01:2026-03-31');
    });
  });

  describe('createDraftForPeriod', () => {
    it('creates draft v1 only through insertDraftWithRoster', async () => {
      await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });

      expect(ports.insertDraftWithRosterCalls).toBe(1);
    });

    it('builds a draft on a freshly minted basis and logs the creation', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });

      expect(draft.period).toEqual(Q2_2026);
      expect(draft.version).toBe(1);
      expect(draft.financialFactsSnapshotId).toBe(100);
      expect(draft.forecastFundSnapshotId).toBe(900);
      expect(ports.events.map((event) => event.eventType)).toEqual(['created']);
    });

    it('derives the as-of date from the period end', async () => {
      await createDraftForPeriod(ports, { fundId: FUND, period: Q2_2026, actorId: null });

      expect(ports.rebuildCalls[0]?.asOfDate).toBe('2026-06-30');
      expect(ports.rebuildCalls[0]?.idempotencyKey).toBe(draftIdempotencyKey(FUND, Q2_2026));
    });

    it('returns the existing open draft instead of creating a second one', async () => {
      const first = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      const replay = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });

      expect(replay.draftId).toBe(first.draftId);
      expect(ports.drafts).toHaveLength(1);
      expect(ports.rebuildCalls).toHaveLength(1);
      expect(ports.insertDraftWithRosterCalls).toBe(1);
    });

    it('returns a legacy open conflict without implicitly seeding a roster', async () => {
      const legacy: DraftRecord = {
        draftId: 99,
        fundId: FUND,
        period: Q2_2026,
        knowledgeCutoff: new Date('2026-07-01T00:00:00.000Z'),
        financialFactsSnapshotId: 40,
        forecastFundSnapshotId: null,
        reserveReferenceId: null,
        economicsReferenceId: null,
        sourceReferenceId: null,
        savedAt: null,
        version: 1,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      };
      ports.drafts.push(legacy);

      const returned = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });

      expect(returned.draftId).toBe(99);
      expect(ports.insertDraftWithRosterCalls).toBe(0);
      expect(ports.rebuildCalls).toHaveLength(0);
    });
  });

  describe('refreshDraft', () => {
    it('replays exact refresh receipt before stale ETag and rebuild work', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      const input = {
        fundId: FUND,
        draftId: draft.draftId,
        actorId: 5,
        idempotencyKey: 'refresh-replay',
        rawIfMatch: etagForDraft(draft),
      };

      const first = await refreshDraftWithReceipt(ports, input);
      const replay = await refreshDraftWithReceipt(ports, input);

      expect(replay).toEqual(first);
      expect(ports.rebuildCalls).toHaveLength(2); // create basis + one refresh basis
      expect(ports.drafts[0]?.version).toBe(2);
      expect(ports.events.filter((event) => event.eventType === 'refreshed')).toHaveLength(1);
    });

    it('rejects refresh caller-key hash conflict before current-state validation', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      await refreshDraftWithReceipt(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        actorId: 5,
        idempotencyKey: 'refresh-conflict',
        rawIfMatch: etagForDraft(draft),
      });

      await expect(
        refreshDraftWithReceipt(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          actorId: 5,
          idempotencyKey: 'refresh-conflict',
          rawIfMatch: 'W/"different"',
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', statusCode: 409 });
    });

    it('routes every refresh transition through mutateOpenDraftWithRoster', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });

      await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: draft.version,
        actorId: 5,
      });

      expect(ports.mutateOpenDraftWithRosterCalls).toEqual(['refresh']);
    });

    it('advances the cutoff and rebuilds every consumer from ONE new basis (D6)', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      const before = draft.knowledgeCutoff.getTime();

      const refreshed = await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        actorId: 5,
      });

      expect(refreshed.knowledgeCutoff.getTime()).toBeGreaterThan(before);
      expect(refreshed.financialFactsSnapshotId).toBe(101);
      expect(refreshed.forecastFundSnapshotId).toBe(901);
      // The repinned forecast resolves to the repinned facts snapshot.
      expect(ports.forecastBasis.get(901)).toBe(101);
      expect(refreshed.version).toBe(2);
    });

    it('never changes the period', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      const refreshed = await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        actorId: null,
      });

      expect(refreshed.period).toEqual(Q2_2026);
    });

    it('logs the refresh in the revision history', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        actorId: null,
      });

      expect(ports.events.map((event) => event.eventType)).toEqual(['created', 'refreshed']);
      expect(ports.events.at(-1)?.detail).toMatchObject({ economicsReferenceCleared: false });
    });

    it('clears an economics pin in the same refresh mutation and records it', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      ports.economicsRuns.set(21, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });
      await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        economicsReferenceId: 21,
      });

      const refreshed = await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 2,
        actorId: null,
      });

      expect(refreshed.economicsReferenceId).toBeNull();
      expect(refreshed.version).toBe(3);
      expect(ports.events.at(-1)?.detail).toMatchObject({ economicsReferenceCleared: true });
    });

    it('rejects a stale expected version', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        actorId: null,
      });

      await expect(
        refreshDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 412, code: 'DRAFT_VERSION_CONFLICT' });
    });

    it('rejects a draft owned by another fund', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });

      await expect(
        refreshDraft(ports, {
          fundId: OTHER_FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'DRAFT_NOT_FOUND' });
    });
  });

  describe('replaceDraftEconomicsReference', () => {
    it('receipts same-value economics without rotating draft version and replays exactly', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      ports.economicsRuns.set(88, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });
      await replaceDraftEconomicsReferenceWithReceipt(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        economicsReferenceId: 88,
        actorId: 5,
        idempotencyKey: 'econ-attach',
        rawIfMatch: etagForDraft(draft),
      });
      const attached = await ports.getDraftById(FUND, draft.draftId);
      expect(attached).not.toBeNull();
      const input = {
        fundId: FUND,
        draftId: draft.draftId,
        economicsReferenceId: 88,
        actorId: 5,
        idempotencyKey: 'econ-noop',
        rawIfMatch: etagForDraft(attached as DraftRecord),
      };

      const first = await replaceDraftEconomicsReferenceWithReceipt(ports, input);
      const replay = await replaceDraftEconomicsReferenceWithReceipt(ports, input);

      expect(first.resultingDraftVersion).toBe(2);
      expect(replay).toEqual(first);
      expect(ports.drafts[0]?.version).toBe(2);
    });

    it('routes economics transitions through mutateOpenDraftWithRoster', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      ports.economicsRuns.set(88, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });

      await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: draft.version,
        economicsReferenceId: 88,
      });

      expect(ports.mutateOpenDraftWithRosterCalls).toEqual(['economics_reference_replace']);
    });

    async function openDraft() {
      return createDraftForPeriod(ports, { fundId: FUND, period: Q2_2026, actorId: 5 });
    }

    it('attaches, treats the same value as a no-op, and clears', async () => {
      const draft = await openDraft();
      ports.economicsRuns.set(21, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });

      const attached = await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        economicsReferenceId: 21,
      });
      const sameValue = await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 2,
        economicsReferenceId: 21,
      });
      const cleared = await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 2,
        economicsReferenceId: null,
      });

      expect(attached).toMatchObject({ economicsReferenceId: 21, version: 2 });
      expect(sameValue).toMatchObject({ economicsReferenceId: 21, version: 2 });
      expect(cleared).toMatchObject({ economicsReferenceId: null, version: 3 });
      expect(cleared.updatedAt.getTime()).toBeGreaterThan(sameValue.updatedAt.getTime());
    });

    it.each([
      ['missing', undefined, 404, 'ECONOMICS_RUN_NOT_FOUND'],
      [
        'cross-fund',
        { fundId: OTHER_FUND, runState: 'completed' as const, factsSnapshotId: 100 },
        404,
        'ECONOMICS_RUN_NOT_FOUND',
      ],
      [
        'failed',
        { fundId: FUND, runState: 'failed' as const, factsSnapshotId: 100 },
        409,
        'ECONOMICS_RUN_NOT_COMPLETED',
      ],
    ])('rejects a %s target', async (_label, run, statusCode, code) => {
      const draft = await openDraft();
      if (run) ports.economicsRuns.set(21, run);

      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          economicsReferenceId: 21,
        })
      ).rejects.toMatchObject({ statusCode, code });
    });

    it('rejects a saved draft without changing the pin', async () => {
      const draft = await openDraft();
      ports.economicsRuns.set(21, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });
      await saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: 5,
      });

      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          economicsReferenceId: 21,
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'DRAFT_ALREADY_SAVED' });
    });
  });

  describe('saveDraft', () => {
    it('replays a save receipt before rejecting the now-saved draft', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      const rawIfMatch = etagForDraft(draft);

      const first = await saveDraftWithReceipt(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        acknowledgeMixedBasis: false,
        actorId: 5,
        idempotencyKey: 'save-replay',
        rawIfMatch,
      });
      const replay = await saveDraftWithReceipt(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        acknowledgeMixedBasis: false,
        actorId: 5,
        idempotencyKey: 'save-replay',
        rawIfMatch,
      });

      expect(replay.referenceId).toBe(first.referenceId);
      expect(ports.references).toHaveLength(1);
      expect(ports.events.filter((event) => event.eventType === 'saved')).toHaveLength(1);
    });

    it('records one saved revision event when identical saves race into commit', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      const input = {
        fundId: FUND,
        draftId: draft.draftId,
        acknowledgeMixedBasis: false,
        actorId: 5,
        idempotencyKey: 'save-concurrent-replay',
        rawIfMatch: etagForDraft(draft),
      };

      const results = await Promise.all([
        saveDraftWithReceipt(ports, input),
        saveDraftWithReceipt(ports, input),
      ]);

      expect(results[0]?.referenceId).toBe(results[1]?.referenceId);
      expect(ports.events.filter((event) => event.eventType === 'saved')).toHaveLength(1);
    });

    it('rejects save key reuse with different caller body', async () => {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: 5,
      });
      const rawIfMatch = etagForDraft(draft);
      await saveDraftWithReceipt(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        acknowledgeMixedBasis: false,
        actorId: 5,
        idempotencyKey: 'save-conflict',
        rawIfMatch,
      });

      await expect(
        saveDraftWithReceipt(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          acknowledgeMixedBasis: true,
          actorId: 5,
          idempotencyKey: 'save-conflict',
          rawIfMatch,
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', statusCode: 409 });
    });

    async function openDraft() {
      return createDraftForPeriod(ports, { fundId: FUND, period: Q2_2026, actorId: 5 });
    }

    it('creates an immutable reference from a coherent bundle', async () => {
      const draft = await openDraft();

      const reference = await saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: 5,
      });

      expect(reference.mixedBasisAtSave).toBe(false);
      expect(reference.supersedesReferenceId).toBeNull();
      expect(reference.financialFactsSnapshotId).toBe(draft.financialFactsSnapshotId);
      expect(ports.events.at(-1)?.eventType).toBe('saved');
    });

    it('copies the economics pin into the immutable reference and compares its facts basis', async () => {
      const draft = await openDraft();
      ports.economicsRuns.set(21, {
        fundId: FUND,
        runState: 'completed',
        factsSnapshotId: draft.financialFactsSnapshotId,
      });
      await replaceDraftEconomicsReference(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        economicsReferenceId: 21,
      });

      const reference = await saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 2,
        acknowledgeMixedBasis: false,
        actorId: 5,
      });

      expect(reference.economicsReferenceId).toBe(21);
      expect(reference.mixedBasisAtSave).toBe(false);
    });

    it('closes the draft so it can no longer be refreshed or re-saved', async () => {
      const draft = await openDraft();
      await saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: null,
      });

      await expect(
        refreshDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          actorId: null,
        })
      ).rejects.toMatchObject({ code: 'DRAFT_ALREADY_SAVED' });

      await expect(
        saveDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          acknowledgeMixedBasis: false,
          actorId: null,
        })
      ).rejects.toMatchObject({ code: 'DRAFT_ALREADY_SAVED' });
    });

    it('rejects a mixed-basis bundle with MIXED_FACTS_BASIS', async () => {
      const draft = await openDraft();
      // Simulate a forecast pin that was built on an older facts snapshot.
      ports.forecastBasis.set(draft.forecastFundSnapshotId as number, 99);

      await expect(
        saveDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          acknowledgeMixedBasis: false,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'MIXED_FACTS_BASIS' });

      expect(ports.references).toHaveLength(0);
    });

    it('persists and logs an explicit mixed-basis save (R34-d)', async () => {
      const draft = await openDraft();
      ports.forecastBasis.set(draft.forecastFundSnapshotId as number, 99);

      const reference = await saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: true,
        actorId: 5,
      });

      // Persisted on the reference, so the warning can render on EVERY load.
      expect(reference.mixedBasisAtSave).toBe(true);
      expect(ports.events.map((event) => event.eventType)).toEqual([
        'created',
        'mixed_basis_acknowledged',
        'saved',
      ]);
      const acknowledged = ports.events.find(
        (event) => event.eventType === 'mixed_basis_acknowledged'
      );
      expect(acknowledged?.detail['mismatches']).toEqual([
        { component: 'forecast', id: draft.forecastFundSnapshotId, financialFactsSnapshotId: 99 },
      ]);
    });

    it('rejects a stale expected version', async () => {
      const draft = await openDraft();
      await refreshDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        actorId: null,
      });

      await expect(
        saveDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          acknowledgeMixedBasis: false,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 412, code: 'DRAFT_VERSION_CONFLICT' });
    });

    it('loses to a refresh that lands between the coherence read and the commit', async () => {
      const draft = await openDraft();

      // Simulate the interleaving: the basis moves on after saveDraft has read
      // the draft but before it commits. The commit is version-guarded, so no
      // reference may be written from the basis the draft no longer has.
      const originalRead = ports.readComponentBasis.bind(ports);
      ports.readComponentBasis = async (input) => {
        const result = await originalRead(input);
        await refreshDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          actorId: null,
        });
        return result;
      };

      await expect(
        saveDraft(ports, {
          fundId: FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          acknowledgeMixedBasis: false,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 412, code: 'DRAFT_VERSION_CONFLICT' });

      expect(ports.references).toHaveLength(0);
      expect((await ports.getDraftById(FUND, draft.draftId))?.savedAt).toBeNull();
    });

    it('rejects a draft owned by another fund', async () => {
      const draft = await openDraft();

      await expect(
        saveDraft(ports, {
          fundId: OTHER_FUND,
          draftId: draft.draftId,
          expectedVersion: 1,
          acknowledgeMixedBasis: false,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'DRAFT_NOT_FOUND' });
    });
  });

  describe('late correction and reference selection', () => {
    async function saveInitialReference() {
      const draft = await createDraftForPeriod(ports, {
        fundId: FUND,
        period: Q2_2026,
        actorId: null,
      });
      return saveDraft(ports, {
        fundId: FUND,
        draftId: draft.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: null,
      });
    }

    it('starts a new draft from a saved reference for the same period', async () => {
      const reference = await saveInitialReference();

      const correction = await startCorrectionDraft(ports, {
        fundId: FUND,
        referenceId: reference.referenceId,
        actorId: null,
      });

      expect(correction.period).toEqual(reference.period);
      expect(correction.sourceReferenceId).toBe(reference.referenceId);
      expect(correction.savedAt).toBeNull();
    });

    it('sets supersedesReferenceId when the correction is saved', async () => {
      const original = await saveInitialReference();
      const correction = await startCorrectionDraft(ports, {
        fundId: FUND,
        referenceId: original.referenceId,
        actorId: null,
      });

      const successor = await saveDraft(ports, {
        fundId: FUND,
        draftId: correction.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: null,
      });

      expect(successor.supersedesReferenceId).toBe(original.referenceId);
    });

    it('selects only the terminal reference of the chain by default', async () => {
      const original = await saveInitialReference();
      const correction = await startCorrectionDraft(ports, {
        fundId: FUND,
        referenceId: original.referenceId,
        actorId: null,
      });
      const successor = await saveDraft(ports, {
        fundId: FUND,
        draftId: correction.draftId,
        expectedVersion: 1,
        acknowledgeMixedBasis: false,
        actorId: null,
      });

      const terminal = await listReferences(ports, { fundId: FUND });
      expect(terminal.map((reference) => reference.referenceId)).toEqual([successor.referenceId]);

      const all = await listReferences(ports, { fundId: FUND, includeSuperseded: true });
      expect(all.map((reference) => reference.referenceId).sort()).toEqual([
        original.referenceId,
        successor.referenceId,
      ]);
    });

    it('keys the correction draft off the reference, not the period alone', async () => {
      const original = await saveInitialReference();

      const correction = await startCorrectionDraft(ports, {
        fundId: FUND,
        referenceId: original.referenceId,
        actorId: null,
      });

      // Period-only keys collide with the saved original on the fund-scoped
      // idempotency unique, and make the facts rebuild replay the ORIGINAL
      // snapshot instead of building one at the new cutoff.
      const keys = ports.rebuildCalls.map((call) => call.idempotencyKey);
      expect(keys[0]).toBe(draftIdempotencyKey(FUND, Q2_2026, null));
      expect(keys[1]).toBe(draftIdempotencyKey(FUND, Q2_2026, original.referenceId));
      expect(keys[0]).not.toBe(keys[1]);
      expect(correction.financialFactsSnapshotId).not.toBe(original.financialFactsSnapshotId);
    });

    it('rejects a correction against another fund reference', async () => {
      const reference = await saveInitialReference();

      await expect(
        startCorrectionDraft(ports, {
          fundId: OTHER_FUND,
          referenceId: reference.referenceId,
          actorId: null,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'REFERENCE_NOT_FOUND' });
    });

    it('never leaks another fund references into a listing', async () => {
      await saveInitialReference();
      expect(await listReferences(ports, { fundId: OTHER_FUND })).toEqual([]);
    });
  });
});
