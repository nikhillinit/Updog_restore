/**
 * R1 import-batch staging service (PLAN_61 Wave C, Task 6).
 *
 * Stages CSV observed-actual observations from a retained `source_artifacts`
 * payload through a pinned `import_mapping_profiles` row. Clean-only: any
 * normalization rejection, in-batch duplicate, future-dated row, or accepted-hash
 * collision refuses the whole batch and writes nothing. Idempotent on
 * `(fundId, Idempotency-Key)`; the replay receipt is reconstructed from
 * persisted rows and never reparses the artifact.
 *
 * Pure decision cores (gates, preview hash, receipt assembly) are exported and
 * unit-tested; the multi-table locked transaction is exercised by integration
 * tests (§16 concurrency).
 *
 * @module server/services/financial-observations/import-batch-staging-service
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import { runIdempotentCommand, IdempotentCommandError } from '../../lib/idempotent-command';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  IMPORT_V2_CONTRACT_VERSION,
  NORMALIZED_PAYLOAD_SCHEMA_VERSION,
  FINGERPRINT_VERSION,
  type NormalizationResultV2,
  type NormalizedCandidateV2,
} from '../../../shared/contracts/financial-observations/normalization.contract';
import {
  IMPORT_DATA_BASIS,
  StageImportBatchReceiptSchema,
  dependencyGroupKeyForObservation,
  type StageImportBatchReceipt,
} from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import type { ImportMappingProfileV1 } from '../../../shared/contracts/financial-observations/import-profile.contract';
import {
  importBatches,
  importMappingProfiles,
  reconciliationCases,
  sourceArtifacts,
  sourceObservations,
  type ImportBatch,
  type ImportMappingProfile,
  type SourceArtifact,
  type SourceObservation,
} from '../../../shared/schema/financial-observations';
import { normalizeCsvObservations } from './csv-adapter';
import { ReconciliationApiError } from './reconciliation-errors';
import {
  classifyStagedObservation,
  type IdentityClassification,
} from './identity-resolution-service';

const STAGING_CONTRACT_VERSION = IMPORT_V2_CONTRACT_VERSION;

/** Descriptor targets forbidden on an observed-actual R1 profile; `source_label` is allowed. */
export const DESCRIPTOR_DISALLOWED_TARGETS = ['memo', 'description', 'note', 'label'] as const;
const MEASURE_KEY_TARGET = 'measure_key';

type StagingDatabase = typeof db;

export interface StageImportBatchInput {
  fundId: number;
  sourceArtifactId: number;
  mappingProfileId: number;
  dataBasis: typeof IMPORT_DATA_BASIS;
  idempotencyKey: string;
  actorId: number | null;
  database?: StagingDatabase;
}

// ---------------------------------------------------------------------------
// Pure decision cores (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Profile-shape gates that must pass before the frozen adapter runs (§6):
 * descriptor minimization and the required single `measure_key` mapping. Gating
 * before the adapter closes its silent `?? 'initial_investment'` default at the
 * staging boundary without touching Task 5a (fourth-review finding 3).
 */
export function assertProfileMappingGates(profile: Pick<ImportMappingProfile, 'mappings'>): void {
  const disallowed = new Set<string>(DESCRIPTOR_DISALLOWED_TARGETS);
  for (const rule of profile.mappings) {
    if (disallowed.has(rule.targetField)) {
      throw new ReconciliationApiError(
        422,
        'DESCRIPTOR_MAPPING_NOT_ALLOWED',
        'Observed-actual profiles may not map descriptor fields (memo/description/note/label).',
        { targetField: rule.targetField }
      );
    }
  }
  const measureKeyCount = profile.mappings.filter(
    (rule) => rule.targetField === MEASURE_KEY_TARGET
  ).length;
  if (measureKeyCount !== 1) {
    throw new ReconciliationApiError(
      422,
      'MEASURE_KEY_MAPPING_REQUIRED',
      'The profile must contain exactly one measure_key mapping; no measure is defaulted.',
      { measureKeyCount }
    );
  }
}

/** Client-safe diagnostic: code/row/field only, never a raw input value (§6). */
export interface StagingDiagnostic {
  code: string;
  row?: number;
  field?: string;
}

function toSafeDiagnostics(result: NormalizationResultV2): StagingDiagnostic[] {
  const diagnostics: StagingDiagnostic[] = [];
  const push = (issues: NormalizationResultV2['issues']) => {
    for (const issue of issues) {
      diagnostics.push({
        code: issue.code,
        ...(issue.row !== undefined && { row: issue.row }),
        ...(issue.field !== undefined && { field: issue.field }),
      });
    }
  };
  push(result.issues);
  for (const candidate of result.candidates) {
    if (candidate.outcome === 'rejected') push(candidate.issues);
  }
  return diagnostics;
}

interface StagedCandidate {
  normalizedPayload: Record<string, unknown>;
  observationHash: string;
  candidateFingerprint: string;
  effectiveDate: string;
  sourceLocator: string;
}

/**
 * Reject a batch on any rejection, future date, or in-batch duplicate hash and
 * return the clean staged candidates in adapter (CSV) order. `txDate` is the
 * transaction-stable UTC date used for the future-date guard.
 */
export function collectStagedCandidates(
  result: NormalizationResultV2,
  txDate: string
): StagedCandidate[] {
  if (result.outcome === 'rejected' || result.candidates.some((c) => c.outcome === 'rejected')) {
    throw new ReconciliationApiError(
      422,
      'NORMALIZATION_REJECTED',
      'The CSV batch contains rejected rows; correct them before staging.',
      { diagnostics: toSafeDiagnostics(result) }
    );
  }

  const staged: StagedCandidate[] = [];
  const seenHashes = new Set<string>();
  for (const candidate of result.candidates) {
    const parsed = requireStagedFields(candidate);
    if (parsed.effectiveDate > txDate) {
      throw new ReconciliationApiError(
        422,
        'FUTURE_EFFECTIVE_DATE_UNSUPPORTED',
        'An observation effective date is in the future; observed-actual only.',
        { sourceLocator: parsed.sourceLocator }
      );
    }
    if (seenHashes.has(parsed.observationHash)) {
      throw new ReconciliationApiError(
        422,
        'DUPLICATE_OBSERVATION_IN_BATCH',
        'Two rows normalize to the same observation; batches must be exact-hash unique.'
      );
    }
    seenHashes.add(parsed.observationHash);
    staged.push(parsed);
  }
  return staged;
}

function requireStagedFields(candidate: NormalizedCandidateV2): StagedCandidate {
  if (
    candidate.outcome !== 'staged' ||
    candidate.normalizedPayload === undefined ||
    candidate.observationHash === undefined ||
    candidate.candidateFingerprint === undefined ||
    candidate.effectiveDate === undefined ||
    candidate.sourceLocator === undefined
  ) {
    throw new ReconciliationApiError(
      422,
      'NORMALIZATION_REJECTED',
      'A staged candidate is missing required normalized fields.'
    );
  }
  return {
    normalizedPayload: candidate.normalizedPayload,
    observationHash: candidate.observationHash,
    candidateFingerprint: candidate.candidateFingerprint,
    effectiveDate: candidate.effectiveDate,
    sourceLocator: candidate.sourceLocator,
  };
}

export interface PreviewHashInput {
  artifactPayloadSha256: string;
  mappingProfileId: number;
  profileVersion: number;
  orderedCandidates: ReadonlyArray<
    Pick<StagedCandidate, 'sourceLocator' | 'observationHash' | 'candidateFingerprint'>
  >;
}

/**
 * Content-addressed preview digest. Server-side preimage embeds the row hashes;
 * the client only ever receives the opaque digest (§6, finding 5). Candidate
 * order follows adapter/CSV row order.
 */
export function computePreviewHash(input: PreviewHashInput): string {
  return canonicalSha256({
    algorithm: 'task6-preview/1',
    artifactPayloadSha256: input.artifactPayloadSha256,
    mappingProfileId: input.mappingProfileId,
    profileVersion: input.profileVersion,
    normalizedPayloadSchemaVersion: NORMALIZED_PAYLOAD_SCHEMA_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    orderedCandidates: input.orderedCandidates.map((candidate) => ({
      sourceLocator: candidate.sourceLocator,
      observationHash: candidate.observationHash,
      candidateFingerprint: candidate.candidateFingerprint,
    })),
  });
}

/**
 * Assemble the immutable R1 receipt from persisted rows. Observations are
 * ordered by ascending ID (monotonic in CSV order) and case IDs ascending, so
 * the initial response and a post-purge replay are deeply identical
 * (finding 10). Row hashes are never included (finding 5).
 */
export function buildStageReceipt(
  batch: Pick<
    ImportBatch,
    'id' | 'sourceArtifactId' | 'mappingProfileId' | 'previewHash' | 'purgeAfter'
  >,
  observations: ReadonlyArray<
    Pick<SourceObservation, 'id' | 'sourceLocator' | 'dependencyGroupKey'>
  >,
  caseIds: readonly number[]
): StageImportBatchReceipt {
  const ordered = [...observations].sort((a, b) => a.id - b.id);
  return StageImportBatchReceiptSchema.parse({
    batchId: batch.id,
    sourceArtifactId: batch.sourceArtifactId,
    mappingProfileId: batch.mappingProfileId,
    dataBasis: IMPORT_DATA_BASIS,
    previewHash: batch.previewHash,
    purgeAfter: batch.purgeAfter.toISOString(),
    observations: ordered.map((observation) => ({
      id: observation.id,
      sourceLocator: observation.sourceLocator,
      dependencyGroupKey: observation.dependencyGroupKey,
    })),
    initialCaseIds: [...caseIds].sort((a, b) => a - b),
  });
}

// ---------------------------------------------------------------------------
// Orchestration (integration-tested)
// ---------------------------------------------------------------------------

function profileToV1(profile: ImportMappingProfile): ImportMappingProfileV1 {
  return {
    name: profile.name,
    sourceType: profile.sourceType as ImportMappingProfileV1['sourceType'],
    domain: profile.domain as ImportMappingProfileV1['domain'],
    version: profile.version,
    mappings: profile.mappings,
    identitySemanticsHash: profile.identitySemanticsHash,
  };
}

export async function stageImportBatch(
  input: StageImportBatchInput
): Promise<{ receipt: StageImportBatchReceipt; replayed: boolean }> {
  const database = input.database ?? db;
  const request = {
    fundId: input.fundId,
    contractVersion: STAGING_CONTRACT_VERSION,
    sourceArtifactId: input.sourceArtifactId,
    mappingProfileId: input.mappingProfileId,
    dataBasis: input.dataBasis,
  };

  // Resolve immutable replay before touching retained payload bytes. A purged
  // artifact must still replay the persisted receipt for the original request.
  const existing = await loadExistingBatch(database, input.fundId, input.idempotencyKey);
  if (existing) {
    const requestHash = canonicalSha256({
      ...request,
      fundId: input.fundId,
      contractVersion: STAGING_CONTRACT_VERSION,
    });
    if (existing.requestHash !== requestHash) {
      throw new IdempotentCommandError(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used for a different request.',
        { idempotencyKey: input.idempotencyKey }
      );
    }
    const receiptData = await loadReceiptData(database, input.fundId, existing.id);
    return {
      receipt: buildStageReceipt(existing, receiptData.observations, receiptData.caseIds),
      replayed: true,
    };
  }

  const command = await runIdempotentCommand<ImportBatch>({
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    contractVersion: STAGING_CONTRACT_VERSION,
    request,
    loadExisting: async () => {
      const concurrent = await loadExistingBatch(database, input.fundId, input.idempotencyKey);
      return concurrent ? { row: concurrent, requestHash: concurrent.requestHash } : null;
    },
    insert: (requestHash) => stageInsert(database, input, requestHash),
  });

  const receiptData = await loadReceiptData(database, input.fundId, command.row.id);
  return {
    receipt: buildStageReceipt(command.row, receiptData.observations, receiptData.caseIds),
    replayed: command.replayed,
  };
}

async function stageInsert(
  database: StagingDatabase,
  input: StageImportBatchInput,
  requestHash: string
): Promise<ImportBatch | null> {
  return database.transaction(async (tx) => {
    const [artifact] = await tx
      .select()
      .from(sourceArtifacts)
      .where(
        and(
          eq(sourceArtifacts.id, input.sourceArtifactId),
          eq(sourceArtifacts.fundId, input.fundId)
        )
      )
      .for('update')
      .limit(1);
    if (!artifact) {
      throw new ReconciliationApiError(
        404,
        'ARTIFACT_NOT_FOUND',
        'Source artifact not found in fund.'
      );
    }

    const [profile] = await tx
      .select()
      .from(importMappingProfiles)
      .where(
        and(
          eq(importMappingProfiles.id, input.mappingProfileId),
          eq(importMappingProfiles.fundId, input.fundId)
        )
      )
      .limit(1);
    if (!profile) {
      throw new ReconciliationApiError(
        404,
        'MAPPING_PROFILE_NOT_FOUND',
        'Mapping profile not found in fund.'
      );
    }

    assertSourceTypesCsv(artifact, profile);
    if (artifact.payload === null || artifact.payload === undefined) {
      throw new ReconciliationApiError(
        422,
        'ARTIFACT_PAYLOAD_UNAVAILABLE',
        'Artifact payload has been purged.'
      );
    }
    assertProfileMappingGates(profile);

    const txDate = await transactionUtcDate(tx);
    const normalization = normalizeCsvObservations({
      buffer: artifact.payload,
      profile: profileToV1(profile),
      domain: profile.domain as ImportMappingProfileV1['domain'],
      fundId: input.fundId,
    });
    const staged = collectStagedCandidates(normalization, txDate);

    const orderedHashes = [...staged.map((c) => c.observationHash)].sort();
    for (const hash of orderedHashes) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${hash}))`);
    }
    const accepted = await tx
      .select({ observationHash: sourceObservations.observationHash })
      .from(sourceObservations)
      .where(
        and(
          eq(sourceObservations.fundId, input.fundId),
          eq(sourceObservations.status, 'accepted'),
          inArray(sourceObservations.observationHash, orderedHashes)
        )
      );
    if (accepted.length > 0) {
      throw new ReconciliationApiError(
        409,
        'OBSERVATION_ALREADY_ACCEPTED',
        'An observation with this hash is already accepted in the fund.'
      );
    }

    const previewHash = computePreviewHash({
      artifactPayloadSha256: artifact.payloadSha256,
      mappingProfileId: profile.id,
      profileVersion: profile.version,
      orderedCandidates: staged,
    });

    const [batch] = await tx
      .insert(importBatches)
      .values({
        fundId: input.fundId,
        sourceArtifactId: artifact.id,
        mappingProfileId: profile.id,
        status: 'staged',
        previewHash,
        purgeAfter: artifact.purgeAfter,
        version: 1,
        createdBy: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      })
      .onConflictDoNothing({ target: [importBatches.fundId, importBatches.idempotencyKey] })
      .returning();
    if (!batch) return null;

    await insertObservationsAndCases(tx, input, profile, artifact, batch, staged);
    return batch;
  });
}

async function insertObservationsAndCases(
  tx: StagingDatabase,
  input: StageImportBatchInput,
  profile: ImportMappingProfile,
  artifact: SourceArtifact,
  batch: ImportBatch,
  staged: readonly StagedCandidate[]
): Promise<void> {
  for (const candidate of staged) {
    // Preallocate in adapter order so the dependency key is present in the
    // single INSERT. PostgreSQL cannot update a row inserted by the same
    // statement through a writable CTE.
    const observationId = readInsertedId(
      await tx.execute(sql`SELECT nextval('source_observations_id_seq') AS id`)
    );
    const insertedId = readInsertedId(
      await tx.execute(sql`
        INSERT INTO source_observations (
          id, fund_id, import_batch_id, source_artifact_id, mapping_profile_id,
          domain, source_type, effective_date, normalized_payload,
          observation_hash, candidate_fingerprint, source_locator,
          dependency_group_key, status
        ) VALUES (
          ${observationId}, ${input.fundId}, ${batch.id}, ${artifact.id}, ${profile.id},
          ${profile.domain}, 'csv', ${candidate.effectiveDate},
          ${JSON.stringify(candidate.normalizedPayload)}::jsonb,
          ${candidate.observationHash}, ${candidate.candidateFingerprint},
          ${candidate.sourceLocator}, ${dependencyGroupKeyForObservation(observationId)}, 'staged'
        )
        RETURNING id
      `)
    );
    if (insertedId !== observationId) {
      throw new ReconciliationApiError(
        500,
        'NORMALIZATION_REJECTED',
        'Observation insert returned an unexpected id.'
      );
    }

    const classification = await classifyStagedObservation(tx, {
      fundId: input.fundId,
      observationId,
      profile,
      normalizedPayload: candidate.normalizedPayload,
      observationHash: candidate.observationHash,
      candidateFingerprint: candidate.candidateFingerprint,
    });
    await openInitialCases(tx, input.fundId, batch.id, observationId, candidate, classification);
  }
}

async function openInitialCases(
  tx: StagingDatabase,
  fundId: number,
  batchId: number,
  observationId: number,
  candidate: StagedCandidate,
  classification: IdentityClassification
): Promise<void> {
  if (classification.needsIdentityCase) {
    await tx.insert(reconciliationCases).values({
      fundId,
      importBatchId: batchId,
      sourceObservationId: observationId,
      caseType: 'identity_resolution',
      status: 'open',
      observationHash: candidate.observationHash,
      candidateFingerprint: candidate.candidateFingerprint,
      history: [{ at: new Date().toISOString(), event: 'opened' }],
    });
  }
  if (classification.duplicateFingerprintCase) {
    await tx.insert(reconciliationCases).values({
      fundId,
      importBatchId: batchId,
      sourceObservationId: observationId,
      caseType: 'observation_match',
      status: 'open',
      observationHash: candidate.observationHash,
      candidateFingerprint: candidate.candidateFingerprint,
      history: [{ at: new Date().toISOString(), event: 'opened' }],
    });
  }
}

async function loadExistingBatch(
  database: StagingDatabase,
  fundId: number,
  idempotencyKey: string
): Promise<ImportBatch | null> {
  const [existing] = await database
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.fundId, fundId), eq(importBatches.idempotencyKey, idempotencyKey)))
    .limit(1);
  return existing ?? null;
}

async function loadReceiptData(
  database: StagingDatabase,
  fundId: number,
  batchId: number
): Promise<{
  observations: Array<Pick<SourceObservation, 'id' | 'sourceLocator' | 'dependencyGroupKey'>>;
  caseIds: number[];
}> {
  const observations = await database
    .select({
      id: sourceObservations.id,
      sourceLocator: sourceObservations.sourceLocator,
      dependencyGroupKey: sourceObservations.dependencyGroupKey,
    })
    .from(sourceObservations)
    .where(
      and(eq(sourceObservations.fundId, fundId), eq(sourceObservations.importBatchId, batchId))
    )
    .orderBy(asc(sourceObservations.id));

  const cases = await database
    .select({ id: reconciliationCases.id })
    .from(reconciliationCases)
    .where(
      and(eq(reconciliationCases.fundId, fundId), eq(reconciliationCases.importBatchId, batchId))
    )
    .orderBy(asc(reconciliationCases.id));

  return {
    observations: observations.map((o) => ({
      id: o.id,
      sourceLocator: o.sourceLocator ?? dependencyGroupKeyForObservation(o.id),
      dependencyGroupKey: o.dependencyGroupKey ?? dependencyGroupKeyForObservation(o.id),
    })),
    caseIds: cases.map((c) => c.id),
  };
}

function assertSourceTypesCsv(artifact: SourceArtifact, profile: ImportMappingProfile): void {
  if (artifact.sourceType !== 'csv') {
    throw new ReconciliationApiError(
      422,
      'ARTIFACT_SOURCE_TYPE_UNSUPPORTED',
      'R1 accepts CSV artifacts only.'
    );
  }
  if (profile.sourceType !== 'csv') {
    throw new ReconciliationApiError(
      422,
      'PROFILE_SOURCE_TYPE_UNSUPPORTED',
      'R1 accepts CSV mapping profiles only.'
    );
  }
}

async function transactionUtcDate(tx: StagingDatabase): Promise<string> {
  const result = await tx.execute(
    sql`SELECT timezone('UTC', transaction_timestamp())::date AS tx_date`
  );
  const rows = readRows(result);
  const value = rows[0]?.['tx_date'];
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  throw new ReconciliationApiError(
    500 as number,
    'NORMALIZATION_REJECTED',
    'Could not resolve transaction date.'
  );
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function readInsertedId(result: unknown): number {
  const rows = readRows(result);
  const id = rows[0]?.['id'];
  if (typeof id === 'number') return id;
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number.parseInt(id, 10);
  throw new ReconciliationApiError(
    500 as number,
    'NORMALIZATION_REJECTED',
    'Observation insert returned no id.'
  );
}

export { IdempotentCommandError };
