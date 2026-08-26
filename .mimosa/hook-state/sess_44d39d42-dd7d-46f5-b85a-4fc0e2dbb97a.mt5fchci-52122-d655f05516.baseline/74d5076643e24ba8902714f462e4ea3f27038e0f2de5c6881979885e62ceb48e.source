import { createHash } from 'node:crypto';

import { EmbeddedFundAccountingStateSnapshotRefV1_1Schema } from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0,
  FundAccountingStateObservationV1_1Schema,
  type FundAccountingStateObservationV1_1,
  type FundAccountingStateSnapshotRefV1_1,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';

export interface OpeningAccountingStateArtifactRow {
  id: number;
  fundId: number;
  sourceType: string;
  mediaType: string;
  payloadSha256: string;
  payload: Buffer | null;
  purgedAt: Date | null;
  createdAt: Date;
}

export type OpeningAccountingStateArtifactErrorCode =
  | 'OPENING_ACCOUNTING_STATE_ARTIFACT_NOT_FOUND'
  | 'OPENING_ACCOUNTING_STATE_ARTIFACT_PURGED'
  | 'OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID'
  | 'OPENING_ACCOUNTING_STATE_AFTER_CUTOFF'
  | 'OPENING_ACCOUNTING_STATE_AS_OF_MISMATCH';

export class OpeningAccountingStateArtifactError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: OpeningAccountingStateArtifactErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OpeningAccountingStateArtifactError';
    this.statusCode = status;
  }
}

function invalidArtifact(message: string): never {
  throw new OpeningAccountingStateArtifactError(
    422,
    'OPENING_ACCOUNTING_STATE_ARTIFACT_INVALID',
    message
  );
}

function compareRfc3339UtcInstants(left: string, right: string): number {
  const pattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;
  const leftMatch = pattern.exec(left);
  const rightMatch = pattern.exec(right);
  if (!leftMatch || !rightMatch) {
    invalidArtifact('Opening accounting-state chronology must use RFC3339 UTC instants.');
  }

  const leftSecond = leftMatch[1]!;
  const rightSecond = rightMatch[1]!;
  if (leftSecond < rightSecond) return -1;
  if (leftSecond > rightSecond) return 1;

  const leftFraction = (leftMatch[2] ?? '').replace(/0+$/, '');
  const rightFraction = (rightMatch[2] ?? '').replace(/0+$/, '');
  const precision = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = leftFraction.padEnd(precision, '0');
  const normalizedRight = rightFraction.padEnd(precision, '0');
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

/**
 * Best-effort extraction of a JSON value's `contractVersion` field, used only
 * to add version context to the INVALID error below. Never throws; an
 * unreadable shape simply reports as "unknown".
 */
function observedContractVersion(rawObservation: unknown): string {
  if (
    typeof rawObservation === 'object' &&
    rawObservation !== null &&
    !Array.isArray(rawObservation) &&
    'contractVersion' in rawObservation
  ) {
    const value = (rawObservation as Record<string, unknown>)['contractVersion'];
    if (typeof value === 'string') return value;
  }
  return 'unknown';
}

export function parseOpeningAccountingStateArtifact(input: {
  row: OpeningAccountingStateArtifactRow | null | undefined;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
  actorId: number;
}): FundAccountingStateSnapshotRefV1_1 {
  const { row } = input;
  if (row == null || row.fundId !== input.fundId) {
    throw new OpeningAccountingStateArtifactError(
      404,
      'OPENING_ACCOUNTING_STATE_ARTIFACT_NOT_FOUND',
      'Opening accounting-state artifact was not found in the requested fund.'
    );
  }
  if (row.payload === null || row.purgedAt !== null) {
    throw new OpeningAccountingStateArtifactError(
      422,
      'OPENING_ACCOUNTING_STATE_ARTIFACT_PURGED',
      'Opening accounting-state artifact payload has been purged.'
    );
  }
  if (!['manual', 'structured_paste'].includes(row.sourceType)) {
    invalidArtifact('Opening accounting-state artifact source type is not supported.');
  }
  if (row.mediaType !== 'application/json') {
    invalidArtifact('Opening accounting-state artifact media type must be application/json.');
  }

  const actualPayloadSha256 = createHash('sha256').update(row.payload).digest('hex');
  if (actualPayloadSha256 !== row.payloadSha256) {
    invalidArtifact('Opening accounting-state artifact digest does not match its stored bytes.');
  }

  let rawObservation: unknown;
  try {
    rawObservation = JSON.parse(row.payload.toString('utf8'));
  } catch {
    invalidArtifact('Opening accounting-state artifact bytes are not valid JSON.');
  }

  // Frozen raw-input boundary (Brief 1, WP-L3 section 7 R10): the v1.1
  // observation contract's strict input shape derives
  // lpUnreturnedContributedCapitalUsd rather than accepting it, and rejects
  // any older (e.g. v1.0.0) artifact outright. A stored v1 artifact failing
  // this parse is the normal, expected path for pre-migration data, not a
  // bug -- the historical artifact row itself remains stored and untouched;
  // the operator must re-attest a v1.1 artifact to resolve opening state for
  // new snapshots.
  const parsedObservation = FundAccountingStateObservationV1_1Schema.safeParse(rawObservation);
  if (!parsedObservation.success) {
    invalidArtifact(
      `Opening accounting-state artifact bytes do not satisfy the ${FUND_ACCOUNTING_STATE_OBSERVATION_VERSION_1_1_0} observation contract (observed contractVersion "${observedContractVersion(
        rawObservation
      )}"). Re-attest a v1.1 artifact.`
    );
  }
  const observation: FundAccountingStateObservationV1_1 = parsedObservation.data;

  const cutoff = new Date(input.knowledgeCutoff);
  if (
    row.createdAt.getTime() > cutoff.getTime() ||
    compareRfc3339UtcInstants(observation.cutoverInstant, input.knowledgeCutoff) > 0
  ) {
    throw new OpeningAccountingStateArtifactError(
      422,
      'OPENING_ACCOUNTING_STATE_AFTER_CUTOFF',
      'Opening accounting-state artifact or observation is after the knowledge cutoff.'
    );
  }
  if (observation.cutoverInstant.slice(0, 10) !== input.asOfDate) {
    throw new OpeningAccountingStateArtifactError(
      422,
      'OPENING_ACCOUNTING_STATE_AS_OF_MISMATCH',
      'Opening accounting-state cutover date must equal the snapshot as-of date.'
    );
  }

  // Resolved/persisted embedding boundary (WP-L3 section 7 R10): `observation`
  // already carries the frozen schema's derived lpUnreturnedContributedCapitalUsd,
  // so the ref is emitted through Commit A's idempotent adapter rather than
  // the frozen ref schema directly (which would reject the derived field on
  // a second pass). The adapter re-delegates to the same frozen schema and
  // requires the derived value to match its own recomputation byte-for-byte.
  return EmbeddedFundAccountingStateSnapshotRefV1_1Schema.parse({
    sourceArtifactId: row.id,
    sourceArtifactSha256: row.payloadSha256,
    sourceArtifactCreatedAt: row.createdAt.toISOString(),
    attestedByActorId: input.actorId,
    observation,
  });
}
