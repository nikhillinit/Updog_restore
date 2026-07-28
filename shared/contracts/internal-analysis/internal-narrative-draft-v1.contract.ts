/**
 * Internal analysis -- source-linked narrative drafts and append-only notes.
 *
 * PLAN_61 Task 19 (Wave G). Builds on the Task 18 draft/reference substrate.
 * Generated output is a STRUCTURED LIST OF CLAIMS, never an untraceable text blob:
 * every generated claim carries exactly one typed source, and a claim that would
 * need several sources is split into several claims (defect D36). User commentary
 * may be uncited but is explicitly labelled `user_authored_commentary`.
 *
 * Provenance travels WITH the content (defect D33): {@link renderNarrativeCopyBlock}
 * is the single pure function that emits the internal notice, the facts-basis line,
 * and every claim with its inline `[S1]`-style marker as ONE copyable block. The
 * server and the panel both render through it, so the text a GP copies is provably
 * the text they see -- the marker map cannot drift from the source map.
 *
 * These are INTERNAL reference artifacts. There is deliberately no recipient, send
 * action, approval state, or export shape anywhere in this contract, and
 * `tests/unit/source/internal-analysis-boundary.test.ts` keeps it that way.
 *
 * @module shared/contracts/internal-analysis/internal-narrative-draft-v1.contract
 */

import { z } from 'zod';

export const INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION = 'internal-narrative-draft-v1' as const;

/**
 * Notice rendered at the head of every copyable narrative block. It restates the
 * exit gate in the copied text itself, so a block that leaves this tool still says
 * what it is (and is not).
 */
export const INTERNAL_NARRATIVE_NOTICE =
  'INTERNAL DRAFT -- a source-linked working narrative. Never a close, restatement, or approved report.' as const;

const PositiveIntSchema = z.number().int().positive();
const IsoDateTimeSchema = z.string().datetime();

/** Which typed table a claim's single source points at (mirrors the four FK columns). */
export const NARRATIVE_SOURCE_KINDS = [
  'facts_snapshot',
  'fund_snapshot',
  'observation',
  'analysis_reference',
] as const;
export const NarrativeSourceKindSchema = z.enum(NARRATIVE_SOURCE_KINDS);

/** The anchor a narrative or note hangs off: exactly one of a draft or a reference. */
export const NARRATIVE_ANCHOR_KINDS = ['analysis_draft', 'analysis_reference'] as const;
export const NarrativeAnchorKindSchema = z.enum(NARRATIVE_ANCHOR_KINDS);

export const NARRATIVE_CLAIM_AUTHORSHIPS = ['generated', 'user_authored_commentary'] as const;
export const NarrativeClaimAuthorshipSchema = z.enum(NARRATIVE_CLAIM_AUTHORSHIPS);

/**
 * A claim's single typed source. Modelled as ONE nullable `{ kind, id }` rather than
 * four nullable id columns, which makes "at most one source" structural: there is no
 * shape in which two sources coexist. The database CHECK
 * `internal_narrative_claims_exactly_one_source_check` is the relational mirror.
 */
export const NarrativeClaimSourceSchema = z
  .object({
    kind: NarrativeSourceKindSchema,
    id: PositiveIntSchema,
  })
  .strict();

export const NarrativeAnchorSchema = z
  .object({
    kind: NarrativeAnchorKindSchema,
    id: PositiveIntSchema,
  })
  .strict();

/** The facts basis a narrative inherits from its anchor; drives the copy-block basis line. */
export const NarrativeBasisSchema = z
  .object({
    financialFactsSnapshotId: PositiveIntSchema,
    knowledgeCutoff: IsoDateTimeSchema,
    forecastFundSnapshotId: PositiveIntSchema.nullable(),
  })
  .strict();

/**
 * The exactly-one-source rule at the claim level: a `generated` claim MUST carry a
 * typed source; `user_authored_commentary` MAY be uncited. Shared by the persisted
 * claim schema and the edit-input schema so both ends enforce the same invariant
 * the database CHECK enforces at write time.
 */
function refineGeneratedRequiresSource(
  claim: { authorship: NarrativeClaimAuthorship; source: NarrativeClaimSource | null },
  ctx: z.RefinementCtx
): void {
  if (claim.authorship === 'generated' && claim.source === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source'],
      message: 'A generated claim must carry exactly one typed source.',
    });
  }
}

/** Exactly one of `analysisDraftId` / `analysisReferenceId` (mirrors the anchor CHECK). */
function refineExactlyOneAnchor(
  value: { analysisDraftId?: number | undefined; analysisReferenceId?: number | undefined },
  ctx: z.RefinementCtx
): void {
  const provided =
    (value.analysisDraftId !== undefined ? 1 : 0) +
    (value.analysisReferenceId !== undefined ? 1 : 0);
  if (provided !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['analysisReferenceId'],
      message: 'Provide exactly one of analysisDraftId or analysisReferenceId.',
    });
  }
}

/** A persisted claim: server-assigned `ordinal` + `marker`, plus its typed source. */
export const NarrativeClaimSchema = z
  .object({
    ordinal: z.number().int().nonnegative(),
    marker: z.string().min(1),
    body: z.string().min(1),
    authorship: NarrativeClaimAuthorshipSchema,
    source: NarrativeClaimSourceSchema.nullable(),
  })
  .strict()
  .superRefine(refineGeneratedRequiresSource);

/**
 * A claim as submitted on an edit. `ordinal` and `marker` are SERVER-assigned (never
 * client-supplied), so markers stay deterministic across revisions and the copied
 * `[S1]` map cannot be spoofed or collide.
 */
export const NarrativeClaimInputSchema = z
  .object({
    body: z.string().min(1),
    authorship: NarrativeClaimAuthorshipSchema,
    source: NarrativeClaimSourceSchema.nullable(),
  })
  .strict()
  .superRefine(refineGeneratedRequiresSource);

export const InternalNarrativeDraftV1Schema = z
  .object({
    contractVersion: z.literal(INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION),
    narrativeDraftId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    anchor: NarrativeAnchorSchema,
    /** Monotonic within a supersession chain; a fresh generation starts at 1. */
    revision: PositiveIntSchema,
    /** The narrative revision this one replaced; null for the first in a chain. */
    supersedesDraftId: PositiveIntSchema.nullable(),
    basis: NarrativeBasisSchema,
    claims: z.array(NarrativeClaimSchema),
    createdBy: PositiveIntSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

/** An append-only note. A correction SUPERSEDES via `supersedesNoteId`; nothing mutates. */
export const InternalAnalysisNoteV1Schema = z
  .object({
    noteId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    anchor: NarrativeAnchorSchema,
    body: z.string().min(1),
    supersedesNoteId: PositiveIntSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const NarrativeGenerateRequestSchema = z
  .object({
    analysisDraftId: PositiveIntSchema.optional(),
    analysisReferenceId: PositiveIntSchema.optional(),
  })
  .strict()
  .superRefine(refineExactlyOneAnchor);

/** Editing submits the full revised claim list; saving it creates a new revision. */
export const NarrativeReviseRequestSchema = z
  .object({
    analysisDraftId: PositiveIntSchema.optional(),
    analysisReferenceId: PositiveIntSchema.optional(),
    claims: z.array(NarrativeClaimInputSchema).min(1),
  })
  .strict()
  .superRefine(refineExactlyOneAnchor);

export const NarrativeNoteCreateRequestSchema = z
  .object({
    analysisDraftId: PositiveIntSchema.optional(),
    analysisReferenceId: PositiveIntSchema.optional(),
    body: z.string().min(1),
    supersedesNoteId: PositiveIntSchema.optional(),
  })
  .strict()
  .superRefine(refineExactlyOneAnchor);

export const InternalNarrativeDraftDetailResponseSchema = z
  .object({ narrative: InternalNarrativeDraftV1Schema.nullable() })
  .strict();

export const InternalNarrativeDraftListResponseSchema = z
  .object({ narratives: z.array(InternalNarrativeDraftV1Schema) })
  .strict();

export const InternalAnalysisNoteListResponseSchema = z
  .object({ notes: z.array(InternalAnalysisNoteV1Schema) })
  .strict();

// ---------------------------------------------------------------------------
// Provenance-in-content: the single pure renderer both server and panel use.
// ---------------------------------------------------------------------------

const NARRATIVE_SOURCE_LABELS: Record<NarrativeSourceKind, string> = {
  facts_snapshot: 'financial facts snapshot',
  fund_snapshot: 'forecast fund snapshot',
  observation: 'source observation',
  analysis_reference: 'internal analysis reference',
};

/** Human-readable one-liner for a typed source, e.g. `financial facts snapshot #12`. */
export function describeNarrativeSource(source: NarrativeClaimSource): string {
  return `${NARRATIVE_SOURCE_LABELS[source.kind]} #${source.id}`;
}

/** The facts-basis line rendered inside every copyable block. */
export function renderNarrativeBasisLine(basis: {
  financialFactsSnapshotId: number;
  knowledgeCutoff: string;
}): string {
  return `Basis: financial facts snapshot #${basis.financialFactsSnapshotId}, knowledge cutoff ${basis.knowledgeCutoff}.`;
}

/** Structural input for {@link renderNarrativeCopyBlock}; a full draft satisfies it. */
export interface NarrativeCopyBlockInput {
  basis: { financialFactsSnapshotId: number; knowledgeCutoff: string };
  claims: readonly NarrativeClaim[];
}

/**
 * Render notice + basis line + every claim (in ordinal order) with its inline source
 * marker as ONE string. This is the provenance-in-content guarantee (defect D33):
 * the panel displays exactly this string and copies exactly this string, and the
 * server asserts against exactly this function, so the copied text cannot drift from
 * the rendered text or from the underlying typed sources.
 */
export function renderNarrativeCopyBlock(input: NarrativeCopyBlockInput): string {
  const lines: string[] = [INTERNAL_NARRATIVE_NOTICE, renderNarrativeBasisLine(input.basis), ''];
  const ordered = [...input.claims].sort((a, b) => a.ordinal - b.ordinal);
  const cited: NarrativeClaim[] = [];

  for (const claim of ordered) {
    if (claim.authorship === 'generated') {
      lines.push(`${claim.body} [${claim.marker}]`);
      if (claim.source !== null) cited.push(claim);
    } else {
      lines.push(`${claim.body} (user commentary)`);
    }
  }

  if (cited.length > 0) {
    lines.push('', 'Sources:');
    for (const claim of cited) {
      if (claim.source !== null) {
        lines.push(`[${claim.marker}] ${describeNarrativeSource(claim.source)}`);
      }
    }
  }

  return lines.join('\n');
}

export type NarrativeSourceKind = z.infer<typeof NarrativeSourceKindSchema>;
export type NarrativeAnchorKind = z.infer<typeof NarrativeAnchorKindSchema>;
export type NarrativeClaimAuthorship = z.infer<typeof NarrativeClaimAuthorshipSchema>;
export type NarrativeClaimSource = z.infer<typeof NarrativeClaimSourceSchema>;
export type NarrativeAnchor = z.infer<typeof NarrativeAnchorSchema>;
export type NarrativeBasis = z.infer<typeof NarrativeBasisSchema>;
export type NarrativeClaim = z.infer<typeof NarrativeClaimSchema>;
export type NarrativeClaimInput = z.infer<typeof NarrativeClaimInputSchema>;
export type InternalNarrativeDraftV1 = z.infer<typeof InternalNarrativeDraftV1Schema>;
export type InternalAnalysisNoteV1 = z.infer<typeof InternalAnalysisNoteV1Schema>;
export type NarrativeGenerateRequest = z.infer<typeof NarrativeGenerateRequestSchema>;
export type NarrativeReviseRequest = z.infer<typeof NarrativeReviseRequestSchema>;
export type NarrativeNoteCreateRequest = z.infer<typeof NarrativeNoteCreateRequestSchema>;
export type InternalNarrativeDraftDetailResponse = z.infer<
  typeof InternalNarrativeDraftDetailResponseSchema
>;
export type InternalNarrativeDraftListResponse = z.infer<
  typeof InternalNarrativeDraftListResponseSchema
>;
export type InternalAnalysisNoteListResponse = z.infer<
  typeof InternalAnalysisNoteListResponseSchema
>;
