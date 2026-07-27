import { beforeEach, describe, expect, it } from 'vitest';

import {
  quarterPeriod,
  quarterlyDedupeKey,
  type AnalysisPeriod,
} from '../../../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
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
  refreshDraft,
  saveDraft,
  selectTerminalReferences,
  startCorrectionDraft,
} from '../../../../server/services/internal-analysis/analysis-checkpoint-service';

const Q2_2026 = quarterPeriod(2026, 2);
const Q1_2026 = quarterPeriod(2026, 1);
const FUND = 7;
const OTHER_FUND = 8;

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
  events: RevisionEvent[] = [];
  enqueued: Array<{ fundId: number; dedupeKey: string }> = [];
  fundIds = [FUND];

  /** Facts snapshot ids handed out by successive rebuilds. */
  nextSnapshotId = 100;
  nextForecastId = 900;
  /** Persisted basis per forecast fund_snapshot id -- the coherence oracle. */
  forecastBasis = new Map<number, number | null>();
  rebuildCalls: Array<{ fundId: number; asOfDate: string; idempotencyKey: string }> = [];

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

  async getOpenDraft(fundId: number, period: AnalysisPeriod) {
    return (
      this.drafts.find(
        (draft) =>
          draft.fundId === fundId &&
          draft.period.periodStart === period.periodStart &&
          draft.period.periodEnd === period.periodEnd &&
          draft.savedAt === null
      ) ?? null
    );
  }

  async getDraftById(fundId: number, draftId: number) {
    return (
      this.drafts.find((draft) => draft.draftId === draftId && draft.fundId === fundId) ?? null
    );
  }

  async insertDraft(input: Parameters<AnalysisCheckpointPorts['insertDraft']>[0]) {
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
    return draft;
  }

  async updateDraftBasis(input: Parameters<AnalysisCheckpointPorts['updateDraftBasis']>[0]) {
    const draft = await this.getDraftById(input.fundId, input.draftId);
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
    draft.version += 1;
    draft.updatedAt = this.tick();
    return draft;
  }

  async markDraftSaved(input: { fundId: number; draftId: number; savedAt: Date }) {
    const draft = await this.getDraftById(input.fundId, input.draftId);
    if (draft) draft.savedAt = input.savedAt;
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
    return null;
  }

  async insertReference(input: Parameters<AnalysisCheckpointPorts['insertReference']>[0]) {
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
    });
  });

  describe('refreshDraft', () => {
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

  describe('saveDraft', () => {
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
