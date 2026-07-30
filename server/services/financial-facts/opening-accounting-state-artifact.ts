import { createHash } from 'node:crypto';

import {
  FundAccountingStateObservationV1Schema,
  FundAccountingStateSnapshotRefV1Schema,
  type FundAccountingStateSnapshotRefV1,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.contract';

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

export function parseOpeningAccountingStateArtifact(input: {
  row: OpeningAccountingStateArtifactRow | null | undefined;
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: string;
  actorId: number;
}): FundAccountingStateSnapshotRefV1 {
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

  let observation: ReturnType<typeof FundAccountingStateObservationV1Schema.parse>;
  try {
    observation = FundAccountingStateObservationV1Schema.parse(
      JSON.parse(row.payload.toString('utf8'))
    );
  } catch {
    invalidArtifact(
      'Opening accounting-state artifact bytes do not satisfy the observation contract.'
    );
  }

  const cutoff = new Date(input.knowledgeCutoff);
  if (row.createdAt.getTime() > cutoff.getTime() || new Date(observation.cutoverInstant) > cutoff) {
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

  return FundAccountingStateSnapshotRefV1Schema.parse({
    sourceArtifactId: row.id,
    sourceArtifactSha256: row.payloadSha256,
    sourceArtifactCreatedAt: row.createdAt.toISOString(),
    attestedByActorId: input.actorId,
    observation,
  });
}
