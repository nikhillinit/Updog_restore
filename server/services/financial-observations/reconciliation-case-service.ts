/**
 * Reconciliation case resolution service (PLAN_61 Wave C, Task 6).
 *
 * R4 single-case and R5 bulk resolution. Enforces the §8 precedence: exact
 * semantic replay (200 no-op) -> stale If-Match (412) -> non-open (409) ->
 * expiry (409) -> apply side effects + CAS. All version-less identity mutations
 * use expected-state predicates (finding 2). Terminal cases are immutable.
 *
 * @module server/services/financial-observations/reconciliation-case-service
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { parseETag, rowVersionETag } from '../../lib/http-preconditions';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  ReconciliationCaseDtoSchema,
  type BulkResolveResponse,
  type BulkResolveResultItem,
  type ReconciliationCaseDto,
  type ResolveCaseRequest,
} from '../../../shared/contracts/financial-observations/reconciliation-api.contract';
import type { ReconciliationResolutionV1 } from '../../../shared/contracts/financial-observations/reconciliation.contract';
import {
  reconciliationCases,
  sourceObservations,
  type ImportMappingProfile,
  type ReconciliationCase,
  type SourceObservation,
} from '../../../shared/schema/financial-observations';
import { cashFlowEvents, valuationMarks } from '../../../shared/schema/lp-reporting-evidence';
import { importMappingProfiles } from '../../../shared/schema/financial-observations';
import { ReconciliationApiError } from './reconciliation-errors';
import { assertImportBatchNotExpired } from './import-batch-expiry';
import {
  attachObservationIdentity,
  createNameIdentity,
  identityDescriptorFromPayload,
  mergeIdentities,
  profileAliasValue,
  resolveIdentityHead,
  writeProfileAliasForIdentity,
} from './identity-resolution-service';

type CaseDatabase = typeof db;

export interface ResolveCaseInput {
  fundId: number;
  caseId: number;
  ifMatch: string;
  decision: ResolveCaseRequest;
  actorId: number | null;
  database?: CaseDatabase;
}

export interface ResolveCaseResult {
  case: ReconciliationCaseDto;
  httpStatus: 200;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** ETag surfaced on a case DTO and compared on If-Match. */
export function caseEtag(version: number): string {
  return rowVersionETag(version);
}

const CANONICAL_KIND_BY_DOMAIN: Record<string, 'cash_flow_event' | 'valuation_mark' | null> = {
  ledger_event: 'cash_flow_event',
  valuation: 'valuation_mark',
  ownership: null,
};

/** Canonical semantic projection of a resolution decision for exact-replay comparison. */
export function resolutionSemanticKey(
  resolution: ReconciliationResolutionV1 | ResolveCaseRequest
): string {
  return canonicalSha256({
    action: resolution.action,
    targetCompanyIdentityId: resolution.targetCompanyIdentityId,
    memo: resolution.memo,
    sourceCompanyIdentityId: resolution.sourceCompanyIdentityId ?? null,
    canonicalName: resolution.canonicalName ?? null,
    targetCanonicalRecordRef: resolution.targetCanonicalRecordRef ?? null,
  });
}

export function caseToDto(row: ReconciliationCase): ReconciliationCaseDto {
  return ReconciliationCaseDtoSchema.parse({
    id: row.id,
    fundId: row.fundId,
    importBatchId: row.importBatchId,
    sourceObservationId: row.sourceObservationId,
    caseType: row.caseType,
    status: row.status,
    resolution: row.resolution ?? null,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    etag: caseEtag(row.version),
  });
}

// ---------------------------------------------------------------------------
// R4 single resolve
// ---------------------------------------------------------------------------

export async function resolveCase(input: ResolveCaseInput): Promise<ResolveCaseResult> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const [caseRow] = await tx
      .select()
      .from(reconciliationCases)
      .where(
        and(eq(reconciliationCases.id, input.caseId), eq(reconciliationCases.fundId, input.fundId))
      )
      .for('update')
      .limit(1);
    if (!caseRow) {
      throw new ReconciliationApiError(
        404,
        'CASE_NOT_FOUND',
        'Reconciliation case not found in fund.'
      );
    }

    // Exact semantic replay: resolved with an identical decision is a 200 no-op.
    if (
      caseRow.status === 'resolved' &&
      caseRow.resolution !== null &&
      resolutionSemanticKey(caseRow.resolution) === resolutionSemanticKey(input.decision)
    ) {
      return { case: caseToDto(caseRow), httpStatus: 200 };
    }

    // Stale If-Match precedes any business conflict.
    if (parseETag(input.ifMatch) !== parseETag(caseEtag(caseRow.version))) {
      throw new ReconciliationApiError(412, 'PRECONDITION_FAILED', 'Case ETag is stale.');
    }
    if (caseRow.status !== 'open') {
      throw new ReconciliationApiError(409, 'CASE_NOT_OPEN', 'Case is not open.');
    }
    await assertImportBatchNotExpired(tx, input.fundId, caseRow.importBatchId);

    await applyDecisionSideEffects(tx, input, caseRow);

    const resolvedAt = new Date();
    const history = [
      ...caseRow.history,
      { at: resolvedAt.toISOString(), event: 'resolved' as const },
    ];
    const [updated] = await tx
      .update(reconciliationCases)
      .set({
        status: 'resolved',
        resolution: normalizeDecision(input.decision),
        resolvedBy: input.actorId,
        resolvedAt,
        history,
        version: caseRow.version + 1,
      })
      .where(
        and(
          eq(reconciliationCases.id, caseRow.id),
          eq(reconciliationCases.fundId, input.fundId),
          eq(reconciliationCases.version, caseRow.version)
        )
      )
      .returning();
    if (!updated) {
      throw new ReconciliationApiError(
        412,
        'PRECONDITION_FAILED',
        'Case changed during resolution.'
      );
    }
    return { case: caseToDto(updated), httpStatus: 200 };
  });
}

function normalizeDecision(decision: ResolveCaseRequest): ReconciliationResolutionV1 {
  return {
    action: decision.action,
    targetCompanyIdentityId: decision.targetCompanyIdentityId,
    memo: decision.memo,
    ...(decision.sourceCompanyIdentityId !== undefined && {
      sourceCompanyIdentityId: decision.sourceCompanyIdentityId,
    }),
    ...(decision.canonicalName !== undefined && { canonicalName: decision.canonicalName }),
    ...(decision.targetCanonicalRecordRef !== undefined && {
      targetCanonicalRecordRef: decision.targetCanonicalRecordRef,
    }),
  };
}

// ---------------------------------------------------------------------------
// Side effects per case/action matrix (§8)
// ---------------------------------------------------------------------------

async function applyDecisionSideEffects(
  tx: CaseDatabase,
  input: ResolveCaseInput,
  caseRow: ReconciliationCase
): Promise<void> {
  if (caseRow.caseType === 'identity_resolution') {
    await applyIdentityResolution(tx, input, caseRow);
    return;
  }
  await applyObservationMatch(tx, input, caseRow);
}

async function applyIdentityResolution(
  tx: CaseDatabase,
  input: ResolveCaseInput,
  caseRow: ReconciliationCase
): Promise<void> {
  const { decision, fundId, actorId } = input;
  if (caseRow.sourceObservationId === null) {
    throw new ReconciliationApiError(
      422,
      'RESOLUTION_ACTION_INVALID',
      'Identity case has no observation.'
    );
  }
  const observation = await loadObservation(tx, fundId, caseRow.sourceObservationId);

  let identityHead: number;
  if (decision.action === 'confirm_match') {
    if (decision.targetCompanyIdentityId === null) {
      throw new ReconciliationApiError(
        422,
        'RESOLUTION_ACTION_INVALID',
        'confirm_match needs a target identity.'
      );
    }
    identityHead = await resolveIdentityHead(tx, fundId, decision.targetCompanyIdentityId);
  } else if (decision.action === 'create_identity') {
    if (decision.canonicalName === undefined) {
      throw new ReconciliationApiError(
        422,
        'RESOLUTION_ACTION_INVALID',
        'create_identity needs a canonicalName.'
      );
    }
    identityHead = await createNameIdentity(tx, fundId, decision.canonicalName, actorId);
  } else if (decision.action === 'merge_identities') {
    if (
      decision.sourceCompanyIdentityId === undefined ||
      decision.targetCompanyIdentityId === null
    ) {
      throw new ReconciliationApiError(
        422,
        'RESOLUTION_ACTION_INVALID',
        'merge_identities needs source and target.'
      );
    }
    identityHead = await mergeIdentities(
      tx,
      fundId,
      decision.sourceCompanyIdentityId,
      decision.targetCompanyIdentityId
    );
  } else {
    throw new ReconciliationApiError(
      422,
      'RESOLUTION_ACTION_INVALID',
      'reject is not valid for an identity case.'
    );
  }

  await attachObservationIdentity(tx, fundId, observation.id, identityHead);
  await writeAliasForObservation(tx, fundId, observation, identityHead, actorId);
}

async function writeAliasForObservation(
  tx: CaseDatabase,
  fundId: number,
  observation: SourceObservation,
  identityHead: number,
  actorId: number | null
): Promise<void> {
  const descriptor = identityDescriptorFromPayload(observation.normalizedPayload);
  if (descriptor?.kind !== 'name') return; // only name-identity candidates use profile aliases
  if (observation.mappingProfileId === null) return;
  const profile = await loadProfile(tx, fundId, observation.mappingProfileId);
  const aliasValue = safeAliasValue(observation.normalizedPayload, descriptor.canonicalName);
  if (aliasValue === null) return;
  await writeProfileAliasForIdentity(tx, fundId, profile, aliasValue, identityHead, actorId);
}

function safeAliasValue(payload: Record<string, unknown>, canonicalName: string): string | null {
  try {
    return profileAliasValue(payload, canonicalName);
  } catch {
    return null;
  }
}

async function applyObservationMatch(
  tx: CaseDatabase,
  input: ResolveCaseInput,
  caseRow: ReconciliationCase
): Promise<void> {
  const { decision, fundId } = input;
  if (decision.action === 'reject') return; // suggested match rejected as a distinct observation
  if (decision.action !== 'confirm_match') {
    throw new ReconciliationApiError(
      422,
      'RESOLUTION_ACTION_INVALID',
      'observation_match takes confirm_match or reject.'
    );
  }
  if (decision.targetCanonicalRecordRef === undefined) {
    throw new ReconciliationApiError(
      422,
      'CANONICAL_TARGET_INVALID',
      'confirm_match needs a typed canonical target.'
    );
  }
  if (caseRow.sourceObservationId === null) {
    throw new ReconciliationApiError(
      422,
      'RESOLUTION_ACTION_INVALID',
      'Match case has no observation.'
    );
  }
  const observation = await loadObservation(tx, fundId, caseRow.sourceObservationId);
  const expectedKind = CANONICAL_KIND_BY_DOMAIN[observation.domain];
  if (expectedKind === null || decision.targetCanonicalRecordRef.kind !== expectedKind) {
    throw new ReconciliationApiError(
      422,
      'CANONICAL_TARGET_DOMAIN_MISMATCH',
      'Canonical target kind is not compatible with the observation domain.'
    );
  }
  await assertCanonicalTargetExists(tx, fundId, decision.targetCanonicalRecordRef);
}

async function assertCanonicalTargetExists(
  tx: CaseDatabase,
  fundId: number,
  ref: { kind: 'cash_flow_event' | 'valuation_mark'; id: number }
): Promise<void> {
  const rows =
    ref.kind === 'cash_flow_event'
      ? await tx
          .select({ id: cashFlowEvents.id })
          .from(cashFlowEvents)
          .where(and(eq(cashFlowEvents.id, ref.id), eq(cashFlowEvents.fundId, fundId)))
          .limit(1)
      : await tx
          .select({ id: valuationMarks.id })
          .from(valuationMarks)
          .where(and(eq(valuationMarks.id, ref.id), eq(valuationMarks.fundId, fundId)))
          .limit(1);
  if (rows.length !== 1) {
    throw new ReconciliationApiError(
      422,
      'CANONICAL_TARGET_NOT_FOUND',
      'Canonical duplicate target does not exist in this fund.'
    );
  }
}

async function loadObservation(
  tx: CaseDatabase,
  fundId: number,
  observationId: number
): Promise<SourceObservation> {
  const [row] = await tx
    .select()
    .from(sourceObservations)
    .where(and(eq(sourceObservations.id, observationId), eq(sourceObservations.fundId, fundId)))
    .for('update')
    .limit(1);
  if (!row) {
    throw new ReconciliationApiError(404, 'CASE_NOT_FOUND', 'Case observation not found.');
  }
  return row;
}

async function loadProfile(
  tx: CaseDatabase,
  fundId: number,
  profileId: number
): Promise<ImportMappingProfile> {
  const [row] = await tx
    .select()
    .from(importMappingProfiles)
    .where(and(eq(importMappingProfiles.id, profileId), eq(importMappingProfiles.fundId, fundId)))
    .limit(1);
  if (!row) {
    throw new ReconciliationApiError(404, 'MAPPING_PROFILE_NOT_FOUND', 'Alias profile not found.');
  }
  return row;
}

// ---------------------------------------------------------------------------
// R5 bulk resolve
// ---------------------------------------------------------------------------

export interface BulkResolveInput {
  fundId: number;
  items: Array<{ caseId: number; ifMatch: string; decision: ResolveCaseRequest }>;
  actorId: number | null;
  database?: CaseDatabase;
}

export async function bulkResolveCases(input: BulkResolveInput): Promise<BulkResolveResponse> {
  const seen = new Set<number>();
  for (const item of input.items) {
    if (seen.has(item.caseId)) {
      throw new ReconciliationApiError(
        400,
        'DUPLICATE_CASE_ID',
        'Bulk resolve requires unique case IDs.',
        {
          caseId: item.caseId,
        }
      );
    }
    seen.add(item.caseId);
  }

  const results: BulkResolveResultItem[] = [];
  for (const item of input.items) {
    try {
      const resolved = await resolveCase({
        fundId: input.fundId,
        caseId: item.caseId,
        ifMatch: item.ifMatch,
        decision: item.decision,
        actorId: input.actorId,
        ...(input.database !== undefined && { database: input.database }),
      });
      results.push({
        caseId: item.caseId,
        ok: true,
        httpStatus: resolved.httpStatus,
        case: resolved.case,
        error: null,
      });
    } catch (error) {
      if (error instanceof ReconciliationApiError) {
        results.push({
          caseId: item.caseId,
          ok: false,
          httpStatus: error.status,
          case: null,
          error: { code: error.code, message: error.message },
        });
      } else {
        throw error;
      }
    }
  }
  return { results };
}

export async function listCases(
  fundId: number,
  status: ReconciliationCase['status'] | undefined,
  database: CaseDatabase = db
): Promise<ReconciliationCaseDto[]> {
  const rows = await database
    .select()
    .from(reconciliationCases)
    .where(
      status === undefined
        ? eq(reconciliationCases.fundId, fundId)
        : and(eq(reconciliationCases.fundId, fundId), eq(reconciliationCases.status, status))
    )
    .orderBy(asc(reconciliationCases.id));
  return rows.map(caseToDto);
}
