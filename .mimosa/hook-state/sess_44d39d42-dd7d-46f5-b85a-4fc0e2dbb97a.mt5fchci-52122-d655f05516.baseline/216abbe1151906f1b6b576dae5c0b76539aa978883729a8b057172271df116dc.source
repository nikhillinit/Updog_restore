import { beforeEach, describe, expect, it } from 'vitest';

import type {
  NarrativeAnchor,
  NarrativeClaim,
  NarrativeClaimInput,
} from '../../../../shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import {
  type InternalNarrativePorts,
  type NarrativeDraftRecord,
  type NarrativeGenerationBasis,
  type NoteRecord,
  appendNote,
  buildGeneratedClaims,
  generateNarrative,
  listNotesForAnchor,
  materializeClaims,
  narrativeIdempotencyKey,
  reviseNarrative,
} from '../../../../server/services/internal-analysis/internal-narrative-draft-service';

const FUND = 7;
const OTHER_FUND = 8;
const ANCHOR: NarrativeAnchor = { kind: 'analysis_reference', id: 88 };
const OTHER_ANCHOR: NarrativeAnchor = { kind: 'analysis_draft', id: 12 };

const CUTOFF = new Date('2026-07-02T00:00:00.000Z');

function anchorKey(fundId: number, anchor: NarrativeAnchor): string {
  return `${fundId}:${anchor.kind}:${anchor.id}`;
}

function cloneClaims(claims: readonly NarrativeClaim[]): NarrativeClaim[] {
  return claims.map((claim) => ({
    ...claim,
    source: claim.source === null ? null : { ...claim.source },
  }));
}

/**
 * In-memory ports mirroring the real tables' observable behaviour: the fund-scoped
 * idempotency unique, the linear supersession unique, the plain-FK fund_snapshot
 * ownership check, and COPY-on-read. A fake that accepts a write the real table
 * rejects makes the tests lie (Task 18 hard-won lesson #1).
 */
class FakePorts implements InternalNarrativePorts {
  narratives: NarrativeDraftRecord[] = [];
  notes: NoteRecord[] = [];
  bases = new Map<string, NarrativeGenerationBasis>();
  ownedFundSnapshots = new Set<number>([902]);
  fundSnapshotChecks: Array<{ fundId: number; id: number }> = [];

  private narrativeKeys = new Map<number, string>();
  private noteKeys = new Map<number, string>();
  private supersededNarratives = new Set<number>();
  private supersededNotes = new Set<number>();
  private narrativeSeq = 1;
  private noteSeq = 1;
  private clock = new Date('2026-07-02T00:00:00.000Z');

  constructor() {
    this.bases.set(anchorKey(FUND, ANCHOR), {
      financialFactsSnapshotId: 41,
      knowledgeCutoff: CUTOFF,
      forecastFundSnapshotId: 902,
    });
    this.bases.set(anchorKey(FUND, OTHER_ANCHOR), {
      financialFactsSnapshotId: 55,
      knowledgeCutoff: CUTOFF,
      forecastFundSnapshotId: null,
    });
  }

  private tick(): Date {
    this.clock = new Date(this.clock.getTime() + 1000);
    return this.clock;
  }

  async getAnchorBasis(fundId: number, anchor: NarrativeAnchor) {
    return this.bases.get(anchorKey(fundId, anchor)) ?? null;
  }

  async assertFundSnapshotOwned(fundId: number, fundSnapshotId: number) {
    this.fundSnapshotChecks.push({ fundId, id: fundSnapshotId });
    if (!this.ownedFundSnapshots.has(fundSnapshotId)) {
      throw Object.assign(new Error('The requested resource was not found in this fund.'), {
        statusCode: 404,
        code: 'FUND_SCOPE_NOT_FOUND',
      });
    }
  }

  async getLatestNarrative(fundId: number, anchor: NarrativeAnchor) {
    const matches = this.narratives.filter(
      (record) =>
        record.fundId === fundId &&
        record.anchor.kind === anchor.kind &&
        record.anchor.id === anchor.id
    );
    if (matches.length === 0) return null;
    const terminal = matches.reduce((best, record) =>
      record.revision > best.revision ? record : best
    );
    return { ...terminal, claims: cloneClaims(terminal.claims) };
  }

  async insertNarrative(input: Parameters<InternalNarrativePorts['insertNarrative']>[0]) {
    const replay = this.narratives.find(
      (record) =>
        record.fundId === input.fundId &&
        this.narrativeKeys.get(record.narrativeDraftId) === input.idempotencyKey
    );
    if (replay) return { ...replay, claims: cloneClaims(replay.claims) };

    // Mirrors internal_narrative_drafts_supersedes_unique: a draft can be superseded
    // at most once, so a concurrent regeneration loses.
    if (
      input.supersedesDraftId !== null &&
      this.supersededNarratives.has(input.supersedesDraftId)
    ) {
      throw Object.assign(new Error('The narrative changed since it was read.'), {
        statusCode: 409,
        code: 'NARRATIVE_REVISION_CONFLICT',
      });
    }

    const record: NarrativeDraftRecord = {
      narrativeDraftId: this.narrativeSeq++,
      fundId: input.fundId,
      anchor: input.anchor,
      revision: input.revision,
      supersedesDraftId: input.supersedesDraftId,
      createdBy: input.actorId,
      createdAt: this.tick(),
      claims: cloneClaims(input.claims),
    };
    this.narratives.push(record);
    this.narrativeKeys.set(record.narrativeDraftId, input.idempotencyKey);
    if (input.supersedesDraftId !== null) this.supersededNarratives.add(input.supersedesDraftId);
    return { ...record, claims: cloneClaims(record.claims) };
  }

  async getNoteById(fundId: number, noteId: number) {
    const found = this.notes.find((note) => note.noteId === noteId && note.fundId === fundId);
    return found ? { ...found, anchor: { ...found.anchor } } : null;
  }

  async listNotes(fundId: number, anchor: NarrativeAnchor) {
    return this.notes
      .filter(
        (note) =>
          note.fundId === fundId && note.anchor.kind === anchor.kind && note.anchor.id === anchor.id
      )
      .map((note) => ({ ...note, anchor: { ...note.anchor } }));
  }

  async insertNote(input: Parameters<InternalNarrativePorts['insertNote']>[0]) {
    const replay = this.notes.find(
      (note) =>
        note.fundId === input.fundId && this.noteKeys.get(note.noteId) === input.idempotencyKey
    );
    if (replay) return { ...replay, anchor: { ...replay.anchor } };

    if (input.supersedesNoteId !== null && this.supersededNotes.has(input.supersedesNoteId)) {
      throw Object.assign(new Error('That note was already superseded.'), {
        statusCode: 409,
        code: 'NOTE_SUPERSEDED_CONFLICT',
      });
    }

    const record: NoteRecord = {
      noteId: this.noteSeq++,
      fundId: input.fundId,
      anchor: input.anchor,
      body: input.body,
      supersedesNoteId: input.supersedesNoteId,
      createdBy: input.actorId,
      createdAt: this.tick(),
    };
    this.notes.push(record);
    this.noteKeys.set(record.noteId, input.idempotencyKey);
    if (input.supersedesNoteId !== null) this.supersededNotes.add(input.supersedesNoteId);
    return { ...record, anchor: { ...record.anchor } };
  }
}

let ports: FakePorts;

beforeEach(() => {
  ports = new FakePorts();
});

describe('internal narrative draft service', () => {
  describe('buildGeneratedClaims (pure)', () => {
    it('emits one facts claim, and a forecast claim only when a forecast is pinned', () => {
      const withForecast = buildGeneratedClaims({
        financialFactsSnapshotId: 41,
        knowledgeCutoff: CUTOFF,
        forecastFundSnapshotId: 902,
      });
      expect(withForecast).toHaveLength(2);
      expect(withForecast.every((claim) => claim.authorship === 'generated')).toBe(true);
      expect(withForecast[0]?.source).toEqual({ kind: 'facts_snapshot', id: 41 });
      expect(withForecast[1]?.source).toEqual({ kind: 'fund_snapshot', id: 902 });

      const noForecast = buildGeneratedClaims({
        financialFactsSnapshotId: 41,
        knowledgeCutoff: CUTOFF,
        forecastFundSnapshotId: null,
      });
      expect(noForecast).toHaveLength(1);
      expect(noForecast[0]?.source).toEqual({ kind: 'facts_snapshot', id: 41 });
    });

    it('never emits a generated claim without exactly one source', () => {
      const claims = buildGeneratedClaims({
        financialFactsSnapshotId: 41,
        knowledgeCutoff: CUTOFF,
        forecastFundSnapshotId: 902,
      });
      expect(claims.every((claim) => claim.source !== null)).toBe(true);
    });
  });

  describe('materializeClaims (pure)', () => {
    it('assigns ordinals by position and S/C markers by authorship', () => {
      const inputs: NarrativeClaimInput[] = [
        { body: 'a', authorship: 'generated', source: { kind: 'facts_snapshot', id: 1 } },
        { body: 'b', authorship: 'user_authored_commentary', source: null },
        { body: 'c', authorship: 'generated', source: { kind: 'observation', id: 2 } },
      ];
      const claims = materializeClaims(inputs);
      expect(claims.map((claim) => claim.ordinal)).toEqual([0, 1, 2]);
      expect(claims.map((claim) => claim.marker)).toEqual(['S1', 'C1', 'S2']);
    });
  });

  describe('generateNarrative', () => {
    it('creates revision 1 with generated claims from the anchor basis', async () => {
      const narrative = await generateNarrative(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        actorId: 5,
      });

      expect(narrative.revision).toBe(1);
      expect(narrative.supersedesDraftId).toBeNull();
      expect(narrative.claims.map((claim) => claim.marker)).toEqual(['S1', 'S2']);
      expect(narrative.claims[1]?.source).toEqual({ kind: 'fund_snapshot', id: 902 });
      // The plain-FK forecast source is fund-scope checked.
      expect(ports.fundSnapshotChecks).toEqual([{ fundId: FUND, id: 902 }]);
    });

    it('rejects an anchor that is not in the fund', async () => {
      await expect(
        generateNarrative(ports, { fundId: OTHER_FUND, anchor: ANCHOR, actorId: null })
      ).rejects.toMatchObject({ statusCode: 404, code: 'ANCHOR_NOT_FOUND' });
    });

    it('rejects a forecast source that is not owned by the fund', async () => {
      ports.ownedFundSnapshots.delete(902);
      await expect(
        generateNarrative(ports, { fundId: FUND, anchor: ANCHOR, actorId: null })
      ).rejects.toMatchObject({ statusCode: 404, code: 'FUND_SCOPE_NOT_FOUND' });
      expect(ports.narratives).toHaveLength(0);
    });
  });

  describe('regeneration never overwrites edits', () => {
    it('carries user commentary forward and rebuilds the generated claims', async () => {
      const first = await generateNarrative(ports, { fundId: FUND, anchor: ANCHOR, actorId: null });

      // Operator edits: rewrite the facts claim and add a piece of commentary.
      const revised = await reviseNarrative(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        claims: [
          {
            body: 'Called capital hit 62% of commitments this quarter.',
            authorship: 'generated',
            source: { kind: 'facts_snapshot', id: 41 },
          },
          {
            body: 'Pacing is ahead of plan.',
            authorship: 'user_authored_commentary',
            source: null,
          },
        ],
        actorId: null,
      });
      expect(revised.revision).toBe(2);
      expect(revised.supersedesDraftId).toBe(first.narrativeDraftId);

      const regenerated = await generateNarrative(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        actorId: null,
      });

      expect(regenerated.revision).toBe(3);
      expect(regenerated.supersedesDraftId).toBe(revised.narrativeDraftId);
      // Commentary survived the rebuild...
      const commentary = regenerated.claims.filter(
        (claim) => claim.authorship === 'user_authored_commentary'
      );
      expect(commentary.map((claim) => claim.body)).toEqual(['Pacing is ahead of plan.']);
      // ...while the generated claims were rebuilt from the basis (the operator's
      // hand-edited generated body is not carried across a regeneration).
      const generated = regenerated.claims.filter((claim) => claim.authorship === 'generated');
      expect(generated).toHaveLength(2);
      expect(generated.some((claim) => claim.body.includes('snapshot #41'))).toBe(true);
      expect(
        regenerated.claims.some((claim) => claim.body.includes('Called capital hit 62%'))
      ).toBe(false);
    });
  });

  describe('revision lineage', () => {
    it('increments revision and threads supersedesDraftId across three writes', async () => {
      const r1 = await generateNarrative(ports, { fundId: FUND, anchor: ANCHOR, actorId: null });
      const r2 = await reviseNarrative(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        claims: [{ body: 'x', authorship: 'user_authored_commentary', source: null }],
        actorId: null,
      });
      const r3 = await reviseNarrative(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        claims: [{ body: 'y', authorship: 'user_authored_commentary', source: null }],
        actorId: null,
      });

      expect([r1.revision, r2.revision, r3.revision]).toEqual([1, 2, 3]);
      expect(r1.supersedesDraftId).toBeNull();
      expect(r2.supersedesDraftId).toBe(r1.narrativeDraftId);
      expect(r3.supersedesDraftId).toBe(r2.narrativeDraftId);
    });

    it('is idempotent on replay of the same revision key', async () => {
      const first = await generateNarrative(ports, { fundId: FUND, anchor: ANCHOR, actorId: null });
      const key = narrativeIdempotencyKey('generate', FUND, ANCHOR, 1);
      const replay = await ports.insertNarrative({
        fundId: FUND,
        anchor: ANCHOR,
        revision: 1,
        supersedesDraftId: null,
        claims: first.claims,
        actorId: null,
        idempotencyKey: key,
      });
      expect(replay.narrativeDraftId).toBe(first.narrativeDraftId);
      expect(ports.narratives).toHaveLength(1);
    });

    it('rejects a second narrative superseding the same revision', async () => {
      const first = await generateNarrative(ports, { fundId: FUND, anchor: ANCHOR, actorId: null });
      await ports.insertNarrative({
        fundId: FUND,
        anchor: ANCHOR,
        revision: 2,
        supersedesDraftId: first.narrativeDraftId,
        claims: [],
        actorId: null,
        idempotencyKey: 'race-a',
      });
      await expect(
        ports.insertNarrative({
          fundId: FUND,
          anchor: ANCHOR,
          revision: 2,
          supersedesDraftId: first.narrativeDraftId,
          claims: [],
          actorId: null,
          idempotencyKey: 'race-b',
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'NARRATIVE_REVISION_CONFLICT' });
    });
  });

  describe('append-only notes', () => {
    it('appends a note and a correction that supersedes it, keeping both', async () => {
      const first = await appendNote(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        body: 'Initial note.',
        supersedesNoteId: null,
        actorId: 5,
        idempotencyKey: 'note-1',
      });
      const correction = await appendNote(ports, {
        fundId: FUND,
        anchor: ANCHOR,
        body: 'Corrected note.',
        supersedesNoteId: first.noteId,
        actorId: 5,
        idempotencyKey: 'note-2',
      });

      expect(correction.supersedesNoteId).toBe(first.noteId);
      const all = await listNotesForAnchor(ports, { fundId: FUND, anchor: ANCHOR });
      // Append-only: the superseded note is NOT deleted.
      expect(all.map((note) => note.body)).toEqual(['Initial note.', 'Corrected note.']);
    });

    it('is idempotent on replay of the same idempotency key', async () => {
      const args = {
        fundId: FUND,
        anchor: ANCHOR,
        body: 'Once.',
        supersedesNoteId: null,
        actorId: null,
        idempotencyKey: 'note-dedupe',
      } as const;
      const a = await appendNote(ports, { ...args });
      const b = await appendNote(ports, { ...args });
      expect(b.noteId).toBe(a.noteId);
      expect(ports.notes).toHaveLength(1);
    });

    it('rejects superseding a missing note', async () => {
      await expect(
        appendNote(ports, {
          fundId: FUND,
          anchor: ANCHOR,
          body: 'x',
          supersedesNoteId: 9999,
          actorId: null,
          idempotencyKey: 'note-missing',
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOTE_NOT_FOUND' });
    });

    it('rejects superseding a note on a different anchor', async () => {
      const onOtherAnchor = await appendNote(ports, {
        fundId: FUND,
        anchor: OTHER_ANCHOR,
        body: 'Other anchor note.',
        supersedesNoteId: null,
        actorId: null,
        idempotencyKey: 'note-other',
      });
      await expect(
        appendNote(ports, {
          fundId: FUND,
          anchor: ANCHOR,
          body: 'x',
          supersedesNoteId: onOtherAnchor.noteId,
          actorId: null,
          idempotencyKey: 'note-cross',
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'NOTE_ANCHOR_MISMATCH' });
    });

    it('rejects a note on an anchor that is not in the fund', async () => {
      await expect(
        listNotesForAnchor(ports, { fundId: OTHER_FUND, anchor: ANCHOR })
      ).rejects.toMatchObject({ statusCode: 404, code: 'ANCHOR_NOT_FOUND' });
    });
  });
});
