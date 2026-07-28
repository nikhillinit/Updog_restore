import { describe, expect, it } from 'vitest';

import {
  INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION,
  INTERNAL_NARRATIVE_NOTICE,
  InternalNarrativeDraftV1Schema,
  NARRATIVE_CLAIM_AUTHORSHIPS,
  NARRATIVE_SOURCE_KINDS,
  NarrativeClaimInputSchema,
  NarrativeClaimSchema,
  NarrativeGenerateRequestSchema,
  NarrativeNoteCreateRequestSchema,
  NarrativeReviseRequestSchema,
  describeNarrativeSource,
  renderNarrativeBasisLine,
  renderNarrativeCopyBlock,
} from '../../../../shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';

const BASIS = {
  financialFactsSnapshotId: 41,
  knowledgeCutoff: '2026-07-02T00:00:00.000Z',
  forecastFundSnapshotId: 902,
};

const GENERATED_CLAIM = {
  ordinal: 0,
  marker: 'S1',
  body: 'Called capital reached 62% of commitments.',
  authorship: 'generated' as const,
  source: { kind: 'facts_snapshot' as const, id: 41 },
};

const COMMENTARY_CLAIM = {
  ordinal: 1,
  marker: 'C1',
  body: 'Pacing is ahead of plan after two strong quarters.',
  authorship: 'user_authored_commentary' as const,
  source: null,
};

describe('internal narrative draft v1 contract', () => {
  it('pins the contract version and internal notice', () => {
    expect(INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION).toBe('internal-narrative-draft-v1');
    expect(NARRATIVE_CLAIM_AUTHORSHIPS).toEqual(['generated', 'user_authored_commentary']);
    expect(NARRATIVE_SOURCE_KINDS).toEqual([
      'facts_snapshot',
      'fund_snapshot',
      'observation',
      'analysis_reference',
    ]);
    // The notice restates the exit gate in the copied text itself.
    expect(INTERNAL_NARRATIVE_NOTICE).toContain('INTERNAL DRAFT');
    expect(INTERNAL_NARRATIVE_NOTICE.toLowerCase()).toContain('never');
  });

  describe('claim source invariants (mirror the DB CHECK)', () => {
    it('rejects a generated claim with no source', () => {
      const result = NarrativeClaimSchema.safeParse({ ...GENERATED_CLAIM, source: null });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes('source'))).toBe(true);
      }
    });

    it('accepts a generated claim with exactly one typed source', () => {
      expect(NarrativeClaimSchema.safeParse(GENERATED_CLAIM).success).toBe(true);
    });

    it('accepts uncited user commentary but labels it', () => {
      expect(NarrativeClaimSchema.safeParse(COMMENTARY_CLAIM).success).toBe(true);
    });

    it('accepts every typed source kind as the single target of the union', () => {
      for (const kind of NARRATIVE_SOURCE_KINDS) {
        const result = NarrativeClaimSchema.safeParse({
          ...GENERATED_CLAIM,
          source: { kind, id: 7 },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects an unknown source kind and a non-object (extra key) source', () => {
      expect(
        NarrativeClaimSchema.safeParse({
          ...GENERATED_CLAIM,
          source: { kind: 'ledger_row', id: 7 },
        }).success
      ).toBe(false);
      expect(
        NarrativeClaimSchema.safeParse({
          ...GENERATED_CLAIM,
          source: { kind: 'facts_snapshot', id: 7, extra: 1 },
        }).success
      ).toBe(false);
    });

    it('applies the same rule to the edit-input schema (no ordinal/marker supplied)', () => {
      expect(
        NarrativeClaimInputSchema.safeParse({
          body: 'x',
          authorship: 'generated',
          source: null,
        }).success
      ).toBe(false);
      expect(
        NarrativeClaimInputSchema.safeParse({
          body: 'x',
          authorship: 'user_authored_commentary',
          source: null,
        }).success
      ).toBe(true);
    });
  });

  describe('a full draft mixes generated claims and user commentary', () => {
    it('validates a draft carrying both authorship kinds', () => {
      const draft = {
        contractVersion: INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION,
        narrativeDraftId: 5,
        fundId: 1,
        anchor: { kind: 'analysis_reference' as const, id: 88 },
        revision: 2,
        supersedesDraftId: 4,
        basis: BASIS,
        claims: [GENERATED_CLAIM, COMMENTARY_CLAIM],
        createdBy: 9,
        createdAt: '2026-07-02T12:00:00.000Z',
      };
      expect(InternalNarrativeDraftV1Schema.safeParse(draft).success).toBe(true);
    });
  });

  describe('renderNarrativeCopyBlock (provenance-in-content)', () => {
    const block = renderNarrativeCopyBlock({
      basis: BASIS,
      claims: [GENERATED_CLAIM, COMMENTARY_CLAIM],
    });

    it('contains the notice, the basis line, and the inline [S1] marker in one block', () => {
      expect(block).toContain(INTERNAL_NARRATIVE_NOTICE);
      expect(block).toContain(renderNarrativeBasisLine(BASIS));
      expect(block).toContain('facts snapshot #41');
      expect(block).toContain('[S1]');
      // The marker appears inline on the claim AND in the sources legend.
      expect(block).toContain(`${GENERATED_CLAIM.body} [S1]`);
      expect(block).toContain(`[S1] ${describeNarrativeSource(GENERATED_CLAIM.source)}`);
    });

    it('labels user commentary as commentary and never invents a source for it', () => {
      expect(block).toContain('(user commentary)');
      expect(block).not.toContain('[C1]');
    });

    it('orders claims by ordinal regardless of input order', () => {
      const reversed = renderNarrativeCopyBlock({
        basis: BASIS,
        claims: [COMMENTARY_CLAIM, GENERATED_CLAIM],
      });
      expect(reversed).toBe(block);
    });

    it('is a pure function of its input (same input, identical output)', () => {
      expect(renderNarrativeCopyBlock({ basis: BASIS, claims: [GENERATED_CLAIM] })).toBe(
        renderNarrativeCopyBlock({ basis: BASIS, claims: [GENERATED_CLAIM] })
      );
    });
  });

  describe('request schemas enforce exactly-one anchor', () => {
    it('generate: rejects zero or two anchors, accepts one', () => {
      expect(NarrativeGenerateRequestSchema.safeParse({}).success).toBe(false);
      expect(
        NarrativeGenerateRequestSchema.safeParse({ analysisDraftId: 1, analysisReferenceId: 2 })
          .success
      ).toBe(false);
      expect(NarrativeGenerateRequestSchema.safeParse({ analysisDraftId: 1 }).success).toBe(true);
      expect(NarrativeGenerateRequestSchema.safeParse({ analysisReferenceId: 2 }).success).toBe(
        true
      );
    });

    it('note create: requires a body and exactly one anchor', () => {
      expect(
        NarrativeNoteCreateRequestSchema.safeParse({ analysisDraftId: 1, body: 'note' }).success
      ).toBe(true);
      expect(
        NarrativeNoteCreateRequestSchema.safeParse({ analysisDraftId: 1, body: '' }).success
      ).toBe(false);
      expect(NarrativeNoteCreateRequestSchema.safeParse({ body: 'note' }).success).toBe(false);
    });

    it('revise: requires a non-empty claim list and exactly one anchor', () => {
      const claims = [{ body: 'x', authorship: 'user_authored_commentary', source: null }];
      expect(
        NarrativeReviseRequestSchema.safeParse({ analysisDraftId: 1, claims: [] }).success
      ).toBe(false);
      // Missing anchor is rejected even with a valid claim list.
      expect(NarrativeReviseRequestSchema.safeParse({ claims }).success).toBe(false);
      expect(NarrativeReviseRequestSchema.safeParse({ analysisDraftId: 1, claims }).success).toBe(
        true
      );
    });
  });
});
