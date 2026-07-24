/**
 * Identity resolution service (PLAN_61 Wave C, Task 6).
 *
 * Two independent classification axes (§7, fourth-review finding 1):
 *  - identity axis: durable external identity -> exact-profile alias -> open
 *    `identity_resolution` case; sets `company_identity_id` (never a fingerprint).
 *  - duplicate axis: a same-fund `candidate_fingerprint` with a different
 *    observation hash opens an `observation_match` case; never touches identity.
 *
 * All version-less mutations to `source_observations`/`company_identities` pair
 * their lock with an expected-state WHERE predicate and an exact affected-row
 * assertion (finding 2). Same-fund merges only.
 *
 * @module server/services/financial-observations/identity-resolution-service
 */
import { and, eq, ne, sql } from 'drizzle-orm';

import type { db } from '../../db';
import {
  resolveIdentityMergeChain,
  type MergeChainIdentity,
} from '../../../shared/contracts/financial-observations/financial-observation.contract';
import {
  companyExternalIdentities,
  sourceObservations,
  type ImportMappingProfile,
} from '../../../shared/schema/financial-observations';
import { ReconciliationApiError } from './reconciliation-errors';
import {
  CANONICALIZE_IDENTITY_LABEL_VERSION,
  IdentityLabelEmptyError,
  canonicalizeIdentityLabel,
} from './normalization-service';

type IdentityDatabase = typeof db;

export interface IdentityClassification {
  companyIdentityId: number | null;
  needsIdentityCase: boolean;
  duplicateFingerprintCase: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export type ObservationIdentityDescriptor =
  | { kind: 'external'; system: string; externalId: string }
  | { kind: 'name'; canonicalName: string };

/** Extract the durable/name identity descriptor from a normalized payload. */
export function identityDescriptorFromPayload(
  normalizedPayload: Record<string, unknown>
): ObservationIdentityDescriptor | null {
  const identity = normalizedPayload['companyIdentity'];
  if (identity === null || typeof identity !== 'object') return null;
  const record = identity as Record<string, unknown>;
  if (record['kind'] === 'external') {
    const system = record['system'];
    const externalId = record['externalId'];
    if (typeof system === 'string' && typeof externalId === 'string') {
      return { kind: 'external', system, externalId };
    }
  }
  if (record['kind'] === 'name') {
    const canonicalName = record['canonicalName'];
    if (typeof canonicalName === 'string') {
      return { kind: 'name', canonicalName };
    }
  }
  return null;
}

function sourceLabelFromPayload(normalizedPayload: Record<string, unknown>): string | undefined {
  const descriptor = normalizedPayload['descriptor'];
  if (descriptor === null || typeof descriptor !== 'object') return undefined;
  const value = (descriptor as Record<string, unknown>)['sourceLabel'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Versioned alias `system` namespace. The exact profile ID + semantics hash key
 * makes old immutable profile rows safe without migration; the `/v1` tag pins
 * the canonicalizer so a future rule change cannot silently re-map aliases.
 */
export function profileAliasSystem(
  profile: Pick<ImportMappingProfile, 'id' | 'identitySemanticsHash'>
): string {
  return `profile-alias/v${CANONICALIZE_IDENTITY_LABEL_VERSION}:${profile.id}:${profile.identitySemanticsHash}`;
}

/** Canonical alias lookup value for a name-identity candidate (throws on empty). */
export function profileAliasValue(
  normalizedPayload: Record<string, unknown>,
  canonicalName: string
): string {
  return canonicalizeIdentityLabel(sourceLabelFromPayload(normalizedPayload) ?? canonicalName);
}

// ---------------------------------------------------------------------------
// DB helpers (integration-tested)
// ---------------------------------------------------------------------------

/** Resolve a fund identity's merge-chain head with cycle detection. */
export async function resolveIdentityHead(
  database: IdentityDatabase,
  fundId: number,
  startId: number
): Promise<number> {
  const rows = readRows(
    await database.execute(sql`
      WITH RECURSIVE chain AS (
        SELECT id, merged_into_identity_id
        FROM company_identities WHERE id = ${startId} AND fund_id = ${fundId}
        UNION ALL
        SELECT c.id, c.merged_into_identity_id
        FROM company_identities c
        JOIN chain ch ON c.id = ch.merged_into_identity_id AND c.fund_id = ${fundId}
      )
      SELECT id, merged_into_identity_id FROM chain
    `)
  );
  const byId = new Map<number, MergeChainIdentity>();
  for (const row of rows) {
    const id = asNumber(row['id']);
    const merged = row['merged_into_identity_id'];
    byId.set(id, { mergedIntoIdentityId: merged === null ? null : asNumber(merged) });
  }
  if (byId.size === 0) {
    throw new ReconciliationApiError(
      404,
      'IDENTITY_NOT_FOUND',
      'Company identity not found in fund.'
    );
  }
  return resolveIdentityMergeChain(byId, startId);
}

/**
 * Attach an identity head to a staged observation with an expected-state
 * predicate: only when `company_identity_id IS NULL`; zero rows -> already
 * resolved concurrently (finding 2).
 */
export async function attachObservationIdentity(
  database: IdentityDatabase,
  fundId: number,
  observationId: number,
  identityId: number
): Promise<void> {
  const updated = await database
    .update(sourceObservations)
    .set({ companyIdentityId: identityId })
    .where(
      and(
        eq(sourceObservations.id, observationId),
        eq(sourceObservations.fundId, fundId),
        sql`${sourceObservations.companyIdentityId} IS NULL`
      )
    )
    .returning({ id: sourceObservations.id });
  if (updated.length !== 1) {
    throw new ReconciliationApiError(
      409,
      'IDENTITY_ALREADY_RESOLVED',
      'The observation identity was resolved concurrently.'
    );
  }
}

async function lookupExternalIdentityHead(
  database: IdentityDatabase,
  fundId: number,
  system: string,
  value: string
): Promise<number | null> {
  const [row] = await database
    .select({ companyIdentityId: companyExternalIdentities.companyIdentityId })
    .from(companyExternalIdentities)
    .where(
      and(
        eq(companyExternalIdentities.fundId, fundId),
        eq(companyExternalIdentities.system, system),
        eq(companyExternalIdentities.value, value)
      )
    )
    .limit(1);
  if (!row) return null;
  return resolveIdentityHead(database, fundId, row.companyIdentityId);
}

/**
 * Two-axis classification during staging. Attaches an identity head when a
 * durable external identity or exact-profile alias resolves; otherwise flags an
 * identity case. Independently flags a duplicate-fingerprint case. Never lets a
 * fingerprint set identity.
 */
export async function classifyStagedObservation(
  database: IdentityDatabase,
  input: {
    fundId: number;
    observationId: number;
    profile: Pick<ImportMappingProfile, 'id' | 'identitySemanticsHash'>;
    normalizedPayload: Record<string, unknown>;
    observationHash: string;
    candidateFingerprint: string;
  }
): Promise<IdentityClassification> {
  const descriptor = identityDescriptorFromPayload(input.normalizedPayload);
  let companyIdentityId: number | null = null;

  if (descriptor?.kind === 'external') {
    companyIdentityId = await lookupExternalIdentityHead(
      database,
      input.fundId,
      descriptor.system,
      descriptor.externalId
    );
  }
  if (companyIdentityId === null && descriptor?.kind === 'name') {
    const aliasValue = safeAliasValue(input.normalizedPayload, descriptor.canonicalName);
    if (aliasValue !== null) {
      companyIdentityId = await lookupExternalIdentityHead(
        database,
        input.fundId,
        profileAliasSystem(input.profile),
        aliasValue
      );
    }
  }

  if (companyIdentityId !== null) {
    await attachObservationIdentity(database, input.fundId, input.observationId, companyIdentityId);
  }

  const duplicateFingerprintCase = await hasDifferentHashSameFingerprint(
    database,
    input.fundId,
    input.observationId,
    input.candidateFingerprint,
    input.observationHash
  );

  return {
    companyIdentityId,
    needsIdentityCase: companyIdentityId === null,
    duplicateFingerprintCase,
  };
}

function safeAliasValue(
  normalizedPayload: Record<string, unknown>,
  canonicalName: string
): string | null {
  try {
    return profileAliasValue(normalizedPayload, canonicalName);
  } catch (error) {
    if (error instanceof IdentityLabelEmptyError) return null;
    throw error;
  }
}

async function hasDifferentHashSameFingerprint(
  database: IdentityDatabase,
  fundId: number,
  observationId: number,
  candidateFingerprint: string,
  observationHash: string
): Promise<boolean> {
  const [row] = await database
    .select({ id: sourceObservations.id })
    .from(sourceObservations)
    .where(
      and(
        eq(sourceObservations.fundId, fundId),
        eq(sourceObservations.candidateFingerprint, candidateFingerprint),
        ne(sourceObservations.observationHash, observationHash),
        ne(sourceObservations.id, observationId)
      )
    )
    .limit(1);
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// low-level result readers
// ---------------------------------------------------------------------------

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  throw new ReconciliationApiError(500, 'IDENTITY_NOT_FOUND', 'Unexpected identity id shape.');
}
