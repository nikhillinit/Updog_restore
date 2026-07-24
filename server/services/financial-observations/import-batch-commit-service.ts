/**
 * R6 acceptance-only commit service (PLAN_61 Wave C, Task 6).
 *
 * Accepts singleton dependency groups (staged -> accepted). Writes NO canonical
 * cash-flow/valuation/current-plan/forecast row (§10, third-review finding 3);
 * accepted evidence is calculation-inactive until Wave D. `requireIfMatch()`
 * (428) is enforced at the route before this runs; here a stale If-Match is 412
 * unless the exact accepted-state replay applies. Each accept uses the
 * `status='staged'` expected-state predicate (finding 2).
 *
 * @module server/services/financial-observations/import-batch-commit-service
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import { parseETag, rowVersionETag } from '../../lib/http-preconditions';
import {
  DEPENDENCY_GROUP_KEY_PREFIX,
  ImportBatchStatusResponseSchema,
  dependencyGroupKeyForObservation,
  type CommitImportBatchResponse,
  type ImportBatchStatusResponse,
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
  type ReconciliationCase,
  type SourceObservation,
} from '../../../shared/schema/financial-observations';
import { normalizeCsvObservations } from './csv-adapter';
import { collectStagedCandidates, computePreviewHash } from './import-batch-staging-service';
import { assertImportBatchNotExpired, isImportBatchExpired } from './import-batch-expiry';
import { ReconciliationApiError } from './reconciliation-errors';

type CommitDatabase = typeof db;

export interface CommitImportBatchInput {
  fundId: number;
  batchId: number;
  ifMatch: string;
  previewHash: string;
  requestedGroupKeys: string[];
  actorId: number | null;
  database?: CommitDatabase;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export function batchEtag(version: number): string {
  return rowVersionETag(version);
}

/** Map requested group keys to observation IDs, rejecting empties/dupes/malformed. */
export function requestedObservationIds(requestedGroupKeys: readonly string[]): number[] {
  if (requestedGroupKeys.length === 0) {
    throw new ReconciliationApiError(
      422,
      'DEPENDENCY_GROUP_INCOMPLETE',
      'No group keys requested.'
    );
  }
  const ids: number[] = [];
  const seen = new Set<string>();
  for (const key of requestedGroupKeys) {
    if (seen.has(key)) {
      throw new ReconciliationApiError(422, 'UNKNOWN_GROUP_KEY', 'Duplicate requested group key.', {
        key,
      });
    }
    seen.add(key);
    const match = new RegExp(`^${DEPENDENCY_GROUP_KEY_PREFIX}:(\\d+)$`).exec(key);
    if (!match) {
      throw new ReconciliationApiError(
        422,
        'UNKNOWN_GROUP_KEY',
        'Malformed dependency group key.',
        { key }
      );
    }
    ids.push(Number.parseInt(match[1]!, 10));
  }
  return ids;
}

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

// ---------------------------------------------------------------------------
// R6 commit
// ---------------------------------------------------------------------------

export async function commitImportBatch(
  input: CommitImportBatchInput
): Promise<{ response: CommitImportBatchResponse; httpStatus: 200 }> {
  const database = input.database ?? db;
  const requestedIds = requestedObservationIds(input.requestedGroupKeys);

  return database.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, input.batchId), eq(importBatches.fundId, input.fundId)))
      .for('update')
      .limit(1);
    if (!batch) {
      throw new ReconciliationApiError(
        404,
        'ARTIFACT_NOT_FOUND',
        'Import batch not found in fund.'
      );
    }
    if (batch.sourceArtifactId !== null) {
      await tx
        .select({ id: sourceArtifacts.id })
        .from(sourceArtifacts)
        .where(
          and(
            eq(sourceArtifacts.id, batch.sourceArtifactId),
            eq(sourceArtifacts.fundId, input.fundId)
          )
        )
        .for('update')
        .limit(1);
    }

    const requested = await loadRequestedObservations(tx, input.fundId, batch.id, requestedIds);

    // Exact accepted-state replay: previewHash matches and all requested groups
    // already accepted -> 200 no mutation, even if the If-Match value is stale.
    const allAccepted = requested.every((o) => o.status === 'accepted');
    if (batch.previewHash === input.previewHash && allAccepted) {
      return finalize(tx, input.fundId, batch);
    }

    if (parseETag(input.ifMatch) !== parseETag(batchEtag(batch.version))) {
      throw new ReconciliationApiError(412, 'PRECONDITION_FAILED', 'Batch ETag is stale.');
    }
    await assertImportBatchNotExpired(tx, input.fundId, batch.id);

    await assertPreviewHashMatches(tx, input, batch);
    await assertDependencyGroupsComplete(tx, input.fundId, requested);

    const staged = requested.filter((o) => o.status === 'staged');
    const orderedHashes = staged.map((o) => o.observationHash).sort();
    for (const hash of orderedHashes) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${hash}))`);
    }
    await assertNoAcceptedHashCollision(tx, input.fundId, staged);

    for (const observation of staged) {
      await acceptObservation(tx, input.fundId, observation.id);
    }

    const remainingStaged = await countStaged(tx, input.fundId, batch.id);
    const nextStatus = remainingStaged > 0 ? 'partially_committed' : 'committed';
    const [updated] = await tx
      .update(importBatches)
      .set({ status: nextStatus, version: batch.version + 1 })
      .where(
        and(
          eq(importBatches.id, batch.id),
          eq(importBatches.fundId, input.fundId),
          eq(importBatches.version, batch.version)
        )
      )
      .returning();
    if (!updated) {
      throw new ReconciliationApiError(412, 'PRECONDITION_FAILED', 'Batch changed during commit.');
    }
    return finalize(tx, input.fundId, updated);
  });
}

async function finalize(
  tx: CommitDatabase,
  fundId: number,
  batch: ImportBatch
): Promise<{ response: CommitImportBatchResponse; httpStatus: 200 }> {
  const response = await loadImportBatchStatus(tx, fundId, batch.id);
  return { response: { batch: response }, httpStatus: 200 };
}

async function assertPreviewHashMatches(
  tx: CommitDatabase,
  input: CommitImportBatchInput,
  batch: ImportBatch
): Promise<void> {
  if (batch.sourceArtifactId === null || batch.mappingProfileId === null) {
    throw new ReconciliationApiError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Batch is missing its source references.'
    );
  }
  const [artifact] = await tx
    .select()
    .from(sourceArtifacts)
    .where(
      and(eq(sourceArtifacts.id, batch.sourceArtifactId), eq(sourceArtifacts.fundId, input.fundId))
    )
    .limit(1);
  if (!artifact || artifact.payload === null) {
    throw new ReconciliationApiError(
      409,
      'BATCH_EXPIRED',
      'Artifact payload unavailable for reparse.'
    );
  }
  const [profile] = await tx
    .select()
    .from(importMappingProfiles)
    .where(
      and(
        eq(importMappingProfiles.id, batch.mappingProfileId),
        eq(importMappingProfiles.fundId, input.fundId)
      )
    )
    .limit(1);
  if (!profile) {
    throw new ReconciliationApiError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Pinned mapping profile unavailable.'
    );
  }
  const normalization = normalizeCsvObservations({
    buffer: artifact.payload,
    profile: profileToV1(profile),
    domain: profile.domain as ImportMappingProfileV1['domain'],
    fundId: input.fundId,
  });
  const txDate = await transactionUtcDate(tx);
  const staged = collectStagedCandidates(normalization, txDate);
  const recomputed = computePreviewHash({
    artifactPayloadSha256: artifact.payloadSha256,
    mappingProfileId: profile.id,
    profileVersion: profile.version,
    orderedCandidates: staged,
  });
  if (recomputed !== batch.previewHash || recomputed !== input.previewHash) {
    throw new ReconciliationApiError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Recomputed preview hash does not match.'
    );
  }
}

/**
 * Every requested observation must have no open/expired case (either axis), and
 * a resolved identity UNLESS it resolved as a confirmed duplicate (finding 1).
 */
async function assertDependencyGroupsComplete(
  tx: CommitDatabase,
  fundId: number,
  requested: readonly SourceObservation[]
): Promise<void> {
  const observationIds = requested.map((o) => o.id);
  const cases = await tx
    .select()
    .from(reconciliationCases)
    .where(
      and(
        eq(reconciliationCases.fundId, fundId),
        inArray(reconciliationCases.sourceObservationId, observationIds)
      )
    )
    .for('update');

  const blockers: Array<{ observationId: number; reason: string }> = [];
  const casesByObs = new Map<number, ReconciliationCase[]>();
  for (const c of cases) {
    if (c.sourceObservationId === null) continue;
    const list = casesByObs.get(c.sourceObservationId) ?? [];
    list.push(c);
    casesByObs.set(c.sourceObservationId, list);
  }

  for (const observation of requested) {
    const obsCases = casesByObs.get(observation.id) ?? [];
    for (const c of obsCases) {
      if (c.status === 'open' || c.status === 'expired_unresolved') {
        blockers.push({ observationId: observation.id, reason: `case:${c.id}:${c.status}` });
      }
    }
    if (observation.companyIdentityId === null && !isConfirmedDuplicate(obsCases)) {
      blockers.push({ observationId: observation.id, reason: 'IDENTITY_UNRESOLVED' });
    }
  }

  if (blockers.length > 0) {
    throw new ReconciliationApiError(
      422,
      'DEPENDENCY_GROUP_INCOMPLETE',
      'One or more requested groups are incomplete.',
      { blockers }
    );
  }
}

function isConfirmedDuplicate(cases: readonly ReconciliationCase[]): boolean {
  return cases.some(
    (c) =>
      c.caseType === 'observation_match' &&
      c.status === 'resolved' &&
      c.resolution?.action === 'confirm_match'
  );
}

async function assertNoAcceptedHashCollision(
  tx: CommitDatabase,
  fundId: number,
  staged: readonly SourceObservation[]
): Promise<void> {
  if (staged.length === 0) return;
  const hashes = staged.map((o) => o.observationHash);
  const accepted = await tx
    .select({ observationHash: sourceObservations.observationHash })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.fundId, fundId),
        eq(sourceObservations.status, 'accepted'),
        inArray(sourceObservations.observationHash, hashes)
      )
    );
  if (accepted.length > 0) {
    throw new ReconciliationApiError(
      409,
      'OBSERVATION_ALREADY_ACCEPTED',
      'An observation hash is already accepted in the fund.'
    );
  }
}

async function acceptObservation(
  tx: CommitDatabase,
  fundId: number,
  observationId: number
): Promise<void> {
  try {
    const updated = await tx
      .update(sourceObservations)
      .set({ status: 'accepted' })
      .where(
        and(
          eq(sourceObservations.id, observationId),
          eq(sourceObservations.fundId, fundId),
          eq(sourceObservations.status, 'staged')
        )
      )
      .returning({ id: sourceObservations.id });
    if (updated.length !== 1) {
      throw new ReconciliationApiError(
        409,
        'OBSERVATION_NOT_STAGED',
        'Observation was not in staged state.'
      );
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ReconciliationApiError(
        409,
        'OBSERVATION_ALREADY_ACCEPTED',
        'A concurrent accept won the partial unique index.'
      );
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
  );
}

async function loadRequestedObservations(
  tx: CommitDatabase,
  fundId: number,
  batchId: number,
  requestedIds: readonly number[]
): Promise<SourceObservation[]> {
  const rows = await tx
    .select()
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.fundId, fundId),
        eq(sourceObservations.importBatchId, batchId),
        inArray(sourceObservations.id, [...requestedIds])
      )
    )
    .for('update')
    .orderBy(asc(sourceObservations.id));
  if (rows.length !== requestedIds.length) {
    throw new ReconciliationApiError(
      422,
      'UNKNOWN_GROUP_KEY',
      'A requested group key is not in this batch.'
    );
  }
  return rows;
}

async function countStaged(tx: CommitDatabase, fundId: number, batchId: number): Promise<number> {
  const rows = await tx
    .select({ id: sourceObservations.id })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.fundId, fundId),
        eq(sourceObservations.importBatchId, batchId),
        eq(sourceObservations.status, 'staged')
      )
    );
  return rows.length;
}

async function transactionUtcDate(tx: CommitDatabase): Promise<string> {
  const result = await tx.execute(
    sql`SELECT timezone('UTC', transaction_timestamp())::date AS tx_date`
  );
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const value = rows[0]?.['tx_date'];
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  throw new ReconciliationApiError(
    409,
    'PREVIEW_HASH_MISMATCH',
    'Could not resolve transaction date.'
  );
}

// ---------------------------------------------------------------------------
// Shared batch-status builder (R2 + R6 response)
// ---------------------------------------------------------------------------

export async function loadImportBatchStatus(
  database: CommitDatabase,
  fundId: number,
  batchId: number
): Promise<ImportBatchStatusResponse> {
  const [batch] = await database
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.fundId, fundId)))
    .limit(1);
  if (!batch) {
    throw new ReconciliationApiError(404, 'ARTIFACT_NOT_FOUND', 'Import batch not found in fund.');
  }

  const observations = await database
    .select()
    .from(sourceObservations)
    .where(
      and(eq(sourceObservations.fundId, fundId), eq(sourceObservations.importBatchId, batchId))
    )
    .orderBy(asc(sourceObservations.id));
  const cases = await database
    .select()
    .from(reconciliationCases)
    .where(
      and(eq(reconciliationCases.fundId, fundId), eq(reconciliationCases.importBatchId, batchId))
    )
    .orderBy(asc(reconciliationCases.id));

  const casesByObs = new Map<number, ReconciliationCase[]>();
  for (const c of cases) {
    if (c.sourceObservationId === null) continue;
    const list = casesByObs.get(c.sourceObservationId) ?? [];
    list.push(c);
    casesByObs.set(c.sourceObservationId, list);
  }

  const groups = observations.map((observation) => {
    const obsCases = casesByObs.get(observation.id) ?? [];
    return {
      dependencyGroupKey:
        observation.dependencyGroupKey ?? dependencyGroupKeyForObservation(observation.id),
      observationId: observation.id,
      observationStatus: observation.status as 'staged' | 'accepted' | 'purged',
      sourceLocator: observation.sourceLocator ?? dependencyGroupKeyForObservation(observation.id),
      caseIds: obsCases.map((c) => c.id).sort((a, b) => a - b),
      accepted: observation.status === 'accepted',
    };
  });

  const blockers = cases
    .filter((c) => c.status === 'open' || c.status === 'expired_unresolved')
    .map((c) => ({
      caseId: c.id,
      caseType: c.caseType as 'identity_resolution' | 'observation_match',
      status: c.status as 'open' | 'expired_unresolved',
      observationId: c.sourceObservationId,
    }));

  const expired = await isImportBatchExpired(database, fundId, batchId);

  return ImportBatchStatusResponseSchema.parse({
    batchId: batch.id,
    sourceArtifactId: batch.sourceArtifactId,
    mappingProfileId: batch.mappingProfileId,
    status: batch.status,
    dataBasis: 'observed_actual',
    previewHash: batch.previewHash,
    purgeAfter: batch.purgeAfter.toISOString(),
    retentionExtendedUntil: batch.retentionExtendedUntil
      ? batch.retentionExtendedUntil.toISOString()
      : null,
    purgedAt: batch.purgedAt ? batch.purgedAt.toISOString() : null,
    expired,
    version: batch.version,
    etag: batchEtag(batch.version),
    groups,
    blockers,
  });
}
