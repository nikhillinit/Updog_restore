/**
 * Source-linked narrative drafts and append-only notes (PLAN_61 Task 19, Wave G).
 *
 * A narrative is a STRUCTURED LIST OF CLAIMS built on a Task 18 anchor (a draft or a
 * reference) and its one coherent facts basis. Every generated claim carries exactly
 * one typed source; user commentary may be uncited but is labelled. Provenance rides
 * with the content through `renderNarrativeCopyBlock` in the contract -- this service
 * never renders, it only preserves the claim/source structure that renderer needs.
 *
 * Lifecycle (append-only lineage, mirroring the Task 18 draft/reference discipline):
 * - GENERATE builds fresh generated claims from the anchor's basis. When a narrative
 *   already exists it starts a new revision that SUPERSEDES the terminal and CARRIES
 *   FORWARD every user_authored_commentary claim -- regeneration never overwrites the
 *   operator's edits (defect: edits must survive a rebuild).
 * - REVISE persists the operator's full submitted claim list as a new revision.
 * - Notes are APPEND-ONLY: a correction supersedes via `supersedesNoteId`, nothing
 *   mutates.
 *
 * Ports-driven so every branch is unit-testable without a database. There is
 * deliberately no recipient, send, approval, or export path anywhere here, and
 * `tests/unit/source/internal-analysis-boundary.test.ts` keeps it that way.
 *
 * @module server/services/internal-analysis/internal-narrative-draft-service
 */
import { createHash } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import {
  INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION,
  type InternalAnalysisNoteV1,
  type InternalNarrativeDraftV1,
  type NarrativeAnchor,
  type NarrativeClaim,
  type NarrativeClaimInput,
} from '../../../shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import {
  internalAnalysisNotes,
  internalNarrativeClaims,
  internalNarrativeDrafts,
} from '../../../shared/schema/internal-analysis';
import {
  internalAnalysisDrafts,
  internalAnalysisReferences,
} from '../../../shared/schema/internal-analysis';
import { db } from '../../db';
import {
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';

export class InternalNarrativeServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'InternalNarrativeServiceError';
    this.status = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Pure decision core (unit-tested, no DB)
// ---------------------------------------------------------------------------

/** The facts basis a narrative inherits from its Task 18 anchor. */
export interface NarrativeGenerationBasis {
  financialFactsSnapshotId: number;
  knowledgeCutoff: Date;
  forecastFundSnapshotId: number | null;
}

/**
 * Build the generated (sourced) claims for a narrative from its anchor basis. Each
 * claim carries EXACTLY ONE typed source: the facts snapshot is always present, the
 * forecast fund snapshot only when the anchor pinned one. A claim that would need
 * two sources is split into two claims -- there is never a claim without a source or
 * with more than one (defect D36). These are starting-point drafts the operator then
 * edits; the value is the provenance structure, not the prose.
 */
export function buildGeneratedClaims(basis: NarrativeGenerationBasis): NarrativeClaimInput[] {
  const claims: NarrativeClaimInput[] = [
    {
      body: `Financial facts are pinned to snapshot #${basis.financialFactsSnapshotId} at knowledge cutoff ${basis.knowledgeCutoff.toISOString()}.`,
      authorship: 'generated',
      source: { kind: 'facts_snapshot', id: basis.financialFactsSnapshotId },
    },
  ];

  if (basis.forecastFundSnapshotId !== null) {
    claims.push({
      body: `The current forecast is pinned to fund snapshot #${basis.forecastFundSnapshotId}, derived from that same facts basis.`,
      authorship: 'generated',
      source: { kind: 'fund_snapshot', id: basis.forecastFundSnapshotId },
    });
  }

  return claims;
}

/**
 * Assign the server-owned `ordinal` (array order) and `marker` to a claim list.
 * Generated claims get `S1..Sn` in order -- the inline `[S1]` markers the copy block
 * maps back to each typed source; commentary gets `C1..Cn`. Assigning markers here,
 * never accepting them from the client, is what keeps the source map unspoofable.
 */
export function materializeClaims(inputs: readonly NarrativeClaimInput[]): NarrativeClaim[] {
  let generatedSeq = 0;
  let commentarySeq = 0;
  return inputs.map((input, index) => {
    const marker =
      input.authorship === 'generated' ? `S${(generatedSeq += 1)}` : `C${(commentarySeq += 1)}`;
    return {
      ordinal: index,
      marker,
      body: input.body,
      authorship: input.authorship,
      source: input.source,
    };
  });
}

/** The user_authored_commentary claims of a revision, stripped back to edit inputs. */
function carryForwardCommentary(claims: readonly NarrativeClaim[]): NarrativeClaimInput[] {
  return claims
    .filter((claim) => claim.authorship === 'user_authored_commentary')
    .map((claim) => ({ body: claim.body, authorship: claim.authorship, source: claim.source }));
}

function sameAnchor(a: NarrativeAnchor, b: NarrativeAnchor): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Deterministic idempotency key so a double-submit of the same revision is a no-op. */
export function narrativeIdempotencyKey(
  operation: 'generate' | 'revise',
  fundId: number,
  anchor: NarrativeAnchor,
  revision: number
): string {
  return `internal-narrative:${operation}:${fundId}:${anchor.kind}:${anchor.id}:r${revision}`;
}

// ---------------------------------------------------------------------------
// Ports (DB seam -- unit tests inject fakes, production wires the adapter below)
// ---------------------------------------------------------------------------

export interface NarrativeDraftRecord {
  narrativeDraftId: number;
  fundId: number;
  anchor: NarrativeAnchor;
  revision: number;
  supersedesDraftId: number | null;
  createdBy: number | null;
  createdAt: Date;
  claims: NarrativeClaim[];
}

export interface NoteRecord {
  noteId: number;
  fundId: number;
  anchor: NarrativeAnchor;
  body: string;
  supersedesNoteId: number | null;
  createdBy: number | null;
  createdAt: Date;
}

export interface InternalNarrativePorts {
  /** The anchor's facts basis, or null when the anchor is not in this fund. */
  getAnchorBasis(fundId: number, anchor: NarrativeAnchor): Promise<NarrativeGenerationBasis | null>;
  /** A `fund_snapshot` source has a PLAIN FK, so its fund ownership is code-checked. */
  assertFundSnapshotOwned(fundId: number, fundSnapshotId: number): Promise<void>;
  /** The terminal narrative for an anchor (highest revision), claims included. */
  getLatestNarrative(fundId: number, anchor: NarrativeAnchor): Promise<NarrativeDraftRecord | null>;
  insertNarrative(input: {
    fundId: number;
    anchor: NarrativeAnchor;
    revision: number;
    supersedesDraftId: number | null;
    claims: NarrativeClaim[];
    actorId: number | null;
    idempotencyKey: string;
  }): Promise<NarrativeDraftRecord>;
  getNoteById(fundId: number, noteId: number): Promise<NoteRecord | null>;
  listNotes(fundId: number, anchor: NarrativeAnchor): Promise<NoteRecord[]>;
  insertNote(input: {
    fundId: number;
    anchor: NarrativeAnchor;
    body: string;
    supersedesNoteId: number | null;
    actorId: number | null;
    idempotencyKey: string;
  }): Promise<NoteRecord>;
}

// ---------------------------------------------------------------------------
// Operations (ports-driven, so every branch is unit-testable without a DB)
// ---------------------------------------------------------------------------

async function assertFundSnapshotSources(
  ports: InternalNarrativePorts,
  fundId: number,
  claims: readonly NarrativeClaimInput[]
): Promise<void> {
  for (const claim of claims) {
    if (claim.source?.kind === 'fund_snapshot') {
      await ports.assertFundSnapshotOwned(fundId, claim.source.id);
    }
  }
}

async function requireAnchorBasis(
  ports: InternalNarrativePorts,
  fundId: number,
  anchor: NarrativeAnchor
): Promise<NarrativeGenerationBasis> {
  const basis = await ports.getAnchorBasis(fundId, anchor);
  if (basis === null) {
    throw new InternalNarrativeServiceError(
      404,
      'ANCHOR_NOT_FOUND',
      'The analysis draft or reference this narrative anchors to was not found in this fund.'
    );
  }
  return basis;
}

/**
 * Generate (or regenerate) a narrative. Regeneration starts a new revision that
 * supersedes the terminal and carries every user_authored_commentary claim forward,
 * so an operator's edits survive a rebuild of the generated claims.
 */
export async function generateNarrative(
  ports: InternalNarrativePorts,
  input: { fundId: number; anchor: NarrativeAnchor; actorId: number | null }
): Promise<NarrativeDraftRecord> {
  const basis = await requireAnchorBasis(ports, input.fundId, input.anchor);
  const generated = buildGeneratedClaims(basis);
  await assertFundSnapshotSources(ports, input.fundId, generated);

  const terminal = await ports.getLatestNarrative(input.fundId, input.anchor);
  const carried = terminal === null ? [] : carryForwardCommentary(terminal.claims);
  const claims = materializeClaims([...generated, ...carried]);
  const revision = terminal === null ? 1 : terminal.revision + 1;

  return ports.insertNarrative({
    fundId: input.fundId,
    anchor: input.anchor,
    revision,
    supersedesDraftId: terminal === null ? null : terminal.narrativeDraftId,
    claims,
    actorId: input.actorId,
    idempotencyKey: narrativeIdempotencyKey('generate', input.fundId, input.anchor, revision),
  });
}

/** Persist an operator edit as a new revision superseding the terminal. */
export async function reviseNarrative(
  ports: InternalNarrativePorts,
  input: {
    fundId: number;
    anchor: NarrativeAnchor;
    claims: readonly NarrativeClaimInput[];
    actorId: number | null;
  }
): Promise<NarrativeDraftRecord> {
  await requireAnchorBasis(ports, input.fundId, input.anchor);
  await assertFundSnapshotSources(ports, input.fundId, input.claims);

  const terminal = await ports.getLatestNarrative(input.fundId, input.anchor);
  const revision = terminal === null ? 1 : terminal.revision + 1;
  const claims = materializeClaims(input.claims);

  return ports.insertNarrative({
    fundId: input.fundId,
    anchor: input.anchor,
    revision,
    supersedesDraftId: terminal === null ? null : terminal.narrativeDraftId,
    claims,
    actorId: input.actorId,
    idempotencyKey: narrativeIdempotencyKey('revise', input.fundId, input.anchor, revision),
  });
}

/** The terminal narrative for an anchor plus its basis; both null-safe for an empty anchor. */
export async function getNarrativeForAnchor(
  ports: InternalNarrativePorts,
  input: { fundId: number; anchor: NarrativeAnchor }
): Promise<{ narrative: NarrativeDraftRecord | null; basis: NarrativeGenerationBasis }> {
  const basis = await requireAnchorBasis(ports, input.fundId, input.anchor);
  const narrative = await ports.getLatestNarrative(input.fundId, input.anchor);
  return { narrative, basis };
}

/** Append a note. A correction supersedes an existing note in the SAME anchor. */
export async function appendNote(
  ports: InternalNarrativePorts,
  input: {
    fundId: number;
    anchor: NarrativeAnchor;
    body: string;
    supersedesNoteId: number | null;
    actorId: number | null;
    idempotencyKey: string;
  }
): Promise<NoteRecord> {
  await requireAnchorBasis(ports, input.fundId, input.anchor);

  if (input.supersedesNoteId !== null) {
    const prior = await ports.getNoteById(input.fundId, input.supersedesNoteId);
    if (prior === null) {
      throw new InternalNarrativeServiceError(
        404,
        'NOTE_NOT_FOUND',
        'The note this correction supersedes was not found in this fund.'
      );
    }
    if (!sameAnchor(prior.anchor, input.anchor)) {
      throw new InternalNarrativeServiceError(
        409,
        'NOTE_ANCHOR_MISMATCH',
        'A note may only supersede another note on the same anchor.'
      );
    }
  }

  return ports.insertNote({
    fundId: input.fundId,
    anchor: input.anchor,
    body: input.body,
    supersedesNoteId: input.supersedesNoteId,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function listNotesForAnchor(
  ports: InternalNarrativePorts,
  input: { fundId: number; anchor: NarrativeAnchor }
): Promise<NoteRecord[]> {
  await requireAnchorBasis(ports, input.fundId, input.anchor);
  return ports.listNotes(input.fundId, input.anchor);
}

// ---------------------------------------------------------------------------
// Contract mapping (pure)
// ---------------------------------------------------------------------------

export function toNarrativeContract(
  record: NarrativeDraftRecord,
  basis: NarrativeGenerationBasis
): InternalNarrativeDraftV1 {
  return {
    contractVersion: INTERNAL_NARRATIVE_DRAFT_CONTRACT_VERSION,
    narrativeDraftId: record.narrativeDraftId,
    fundId: record.fundId,
    anchor: record.anchor,
    revision: record.revision,
    supersedesDraftId: record.supersedesDraftId,
    basis: {
      financialFactsSnapshotId: basis.financialFactsSnapshotId,
      knowledgeCutoff: basis.knowledgeCutoff.toISOString(),
      forecastFundSnapshotId: basis.forecastFundSnapshotId,
    },
    claims: record.claims,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toNoteContract(record: NoteRecord): InternalAnalysisNoteV1 {
  return {
    noteId: record.noteId,
    fundId: record.fundId,
    anchor: record.anchor,
    body: record.body,
    supersedesNoteId: record.supersedesNoteId,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DB-backed ports
// ---------------------------------------------------------------------------

type Database = typeof db;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function anchorOf(row: {
  analysisDraftId: number | null;
  analysisReferenceId: number | null;
}): NarrativeAnchor {
  return row.analysisDraftId !== null
    ? { kind: 'analysis_draft', id: row.analysisDraftId }
    : { kind: 'analysis_reference', id: row.analysisReferenceId as number };
}

function rowToClaim(row: typeof internalNarrativeClaims.$inferSelect): NarrativeClaim {
  const source: NarrativeClaim['source'] =
    row.sourceFactsSnapshotId !== null
      ? { kind: 'facts_snapshot', id: row.sourceFactsSnapshotId }
      : row.sourceFundSnapshotId !== null
        ? { kind: 'fund_snapshot', id: row.sourceFundSnapshotId }
        : row.sourceObservationId !== null
          ? { kind: 'observation', id: row.sourceObservationId }
          : row.sourceAnalysisReferenceId !== null
            ? { kind: 'analysis_reference', id: row.sourceAnalysisReferenceId }
            : null;

  return {
    ordinal: row.ordinal,
    marker: row.marker,
    body: row.body,
    authorship: row.authorship,
    source,
  };
}

function claimSourceColumns(source: NarrativeClaim['source']): {
  sourceFactsSnapshotId: number | null;
  sourceFundSnapshotId: number | null;
  sourceObservationId: number | null;
  sourceAnalysisReferenceId: number | null;
} {
  return {
    sourceFactsSnapshotId: source?.kind === 'facts_snapshot' ? source.id : null,
    sourceFundSnapshotId: source?.kind === 'fund_snapshot' ? source.id : null,
    sourceObservationId: source?.kind === 'observation' ? source.id : null,
    sourceAnalysisReferenceId: source?.kind === 'analysis_reference' ? source.id : null,
  };
}

function toNoteRecord(row: typeof internalAnalysisNotes.$inferSelect): NoteRecord {
  return {
    noteId: row.id,
    fundId: row.fundId,
    anchor: anchorOf(row),
    body: row.body,
    supersedesNoteId: row.supersedesNoteId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function createInternalNarrativePorts(database: Database = db): InternalNarrativePorts {
  async function readClaims(narrativeDraftId: number): Promise<NarrativeClaim[]> {
    const rows = await database
      .select()
      .from(internalNarrativeClaims)
      .where(eq(internalNarrativeClaims.narrativeDraftId, narrativeDraftId))
      .orderBy(internalNarrativeClaims.ordinal);
    return rows.map(rowToClaim);
  }

  function toNarrativeRecord(
    row: typeof internalNarrativeDrafts.$inferSelect,
    claims: NarrativeClaim[]
  ): NarrativeDraftRecord {
    return {
      narrativeDraftId: row.id,
      fundId: row.fundId,
      anchor: anchorOf(row),
      revision: row.revision,
      supersedesDraftId: row.supersedesDraftId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      claims,
    };
  }

  return {
    async getAnchorBasis(fundId, anchor) {
      if (anchor.kind === 'analysis_draft') {
        const rows = await database
          .select({
            financialFactsSnapshotId: internalAnalysisDrafts.financialFactsSnapshotId,
            knowledgeCutoff: internalAnalysisDrafts.knowledgeCutoff,
            forecastFundSnapshotId: internalAnalysisDrafts.forecastFundSnapshotId,
          })
          .from(internalAnalysisDrafts)
          .where(
            and(eq(internalAnalysisDrafts.id, anchor.id), eq(internalAnalysisDrafts.fundId, fundId))
          )
          .limit(1);
        const row = rows[0];
        return row ?? null;
      }

      const rows = await database
        .select({
          financialFactsSnapshotId: internalAnalysisReferences.financialFactsSnapshotId,
          knowledgeCutoff: internalAnalysisReferences.knowledgeCutoff,
          forecastFundSnapshotId: internalAnalysisReferences.forecastFundSnapshotId,
        })
        .from(internalAnalysisReferences)
        .where(
          and(
            eq(internalAnalysisReferences.id, anchor.id),
            eq(internalAnalysisReferences.fundId, fundId)
          )
        )
        .limit(1);
      const row = rows[0];
      return row ?? null;
    },

    async assertFundSnapshotOwned(fundId, fundSnapshotId) {
      await assertOwnedByFund({
        db: database as unknown as FundScopedOwnershipDatabase,
        fundId,
        ref: { kind: 'fund_snapshot', id: fundSnapshotId },
      });
    },

    async getLatestNarrative(fundId, anchor) {
      const anchorColumn =
        anchor.kind === 'analysis_draft'
          ? internalNarrativeDrafts.analysisDraftId
          : internalNarrativeDrafts.analysisReferenceId;

      const rows = await database
        .select()
        .from(internalNarrativeDrafts)
        .where(and(eq(internalNarrativeDrafts.fundId, fundId), eq(anchorColumn, anchor.id)))
        .orderBy(desc(internalNarrativeDrafts.revision), desc(internalNarrativeDrafts.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return toNarrativeRecord(row, await readClaims(row.id));
    },

    async insertNarrative(input) {
      return database.transaction(async (tx) => {
        const inserted = await tx
          .insert(internalNarrativeDrafts)
          .values({
            fundId: input.fundId,
            analysisDraftId: input.anchor.kind === 'analysis_draft' ? input.anchor.id : null,
            analysisReferenceId:
              input.anchor.kind === 'analysis_reference' ? input.anchor.id : null,
            revision: input.revision,
            supersedesDraftId: input.supersedesDraftId,
            createdBy: input.actorId,
            idempotencyKey: input.idempotencyKey,
            requestHash: sha256Hex(input.idempotencyKey),
          })
          .onConflictDoNothing()
          .returning();

        const narrativeRow = inserted[0];
        if (!narrativeRow) {
          // Either an idempotent replay (same key) or a concurrent regeneration lost
          // the supersession race. Replay returns the existing revision; a genuine
          // race surfaces as a conflict so the caller refetches and retries.
          const existing = await tx
            .select()
            .from(internalNarrativeDrafts)
            .where(
              and(
                eq(internalNarrativeDrafts.fundId, input.fundId),
                eq(internalNarrativeDrafts.idempotencyKey, input.idempotencyKey)
              )
            )
            .limit(1);
          const existingRow = existing[0];
          if (existingRow) {
            const claims = await tx
              .select()
              .from(internalNarrativeClaims)
              .where(eq(internalNarrativeClaims.narrativeDraftId, existingRow.id))
              .orderBy(internalNarrativeClaims.ordinal);
            return toNarrativeRecord(existingRow, claims.map(rowToClaim));
          }
          throw new InternalNarrativeServiceError(
            409,
            'NARRATIVE_REVISION_CONFLICT',
            'The narrative changed since it was read. Refetch and retry.'
          );
        }

        if (input.claims.length > 0) {
          await tx.insert(internalNarrativeClaims).values(
            input.claims.map((claim) => ({
              fundId: input.fundId,
              narrativeDraftId: narrativeRow.id,
              ordinal: claim.ordinal,
              marker: claim.marker,
              body: claim.body,
              authorship: claim.authorship,
              ...claimSourceColumns(claim.source),
            }))
          );
        }

        return toNarrativeRecord(narrativeRow, input.claims);
      });
    },

    async getNoteById(fundId, noteId) {
      const rows = await database
        .select()
        .from(internalAnalysisNotes)
        .where(and(eq(internalAnalysisNotes.id, noteId), eq(internalAnalysisNotes.fundId, fundId)))
        .limit(1);
      const row = rows[0];
      return row ? toNoteRecord(row) : null;
    },

    async listNotes(fundId, anchor) {
      const anchorColumn =
        anchor.kind === 'analysis_draft'
          ? internalAnalysisNotes.analysisDraftId
          : internalAnalysisNotes.analysisReferenceId;

      const rows = await database
        .select()
        .from(internalAnalysisNotes)
        .where(and(eq(internalAnalysisNotes.fundId, fundId), eq(anchorColumn, anchor.id)))
        .orderBy(internalAnalysisNotes.createdAt);
      return rows.map(toNoteRecord);
    },

    async insertNote(input) {
      const inserted = await database
        .insert(internalAnalysisNotes)
        .values({
          fundId: input.fundId,
          analysisDraftId: input.anchor.kind === 'analysis_draft' ? input.anchor.id : null,
          analysisReferenceId: input.anchor.kind === 'analysis_reference' ? input.anchor.id : null,
          body: input.body,
          supersedesNoteId: input.supersedesNoteId,
          createdBy: input.actorId,
          idempotencyKey: input.idempotencyKey,
          requestHash: sha256Hex(input.idempotencyKey),
        })
        .onConflictDoNothing()
        .returning();

      const row = inserted[0];
      if (row) return toNoteRecord(row);

      const existing = await database
        .select()
        .from(internalAnalysisNotes)
        .where(
          and(
            eq(internalAnalysisNotes.fundId, input.fundId),
            eq(internalAnalysisNotes.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      const existingRow = existing[0];
      if (existingRow) return toNoteRecord(existingRow);

      throw new InternalNarrativeServiceError(
        409,
        'NOTE_SUPERSEDED_CONFLICT',
        'That note was already superseded. Refetch and retry.'
      );
    },
  };
}
