import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import { runIdempotentCommand } from '../../lib/idempotent-command';
import type { FINANCIAL_OBSERVATION_SOURCES } from '../../../shared/contracts/financial-observations';
import { FinancialObservationSourceSchema } from '../../../shared/contracts/financial-observations';
import {
  sourceArtifacts,
  type SourceArtifact,
} from '../../../shared/schema/financial-observations';

export const ARTIFACT_MAX_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_RETENTION_DAYS = 400;
export const ARTIFACT_RAW_MEDIA_TYPES = [
  'application/octet-stream',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export const SOURCE_ARTIFACT_CONTRACT_VERSION = '1.0.0';

interface RouteRequestShape {
  method: string;
  path: string;
}

export function isArtifactUploadRequest(request: RouteRequestShape): boolean {
  return (
    request.method === 'POST' && /^\/api\/funds\/[^/]+\/imports\/artifacts\/?$/.test(request.path)
  );
}

export function isMappingProfileCreateRequest(request: RouteRequestShape): boolean {
  return (
    request.method === 'POST' &&
    /^\/api\/funds\/[^/]+\/imports\/mapping-profiles\/?$/.test(request.path)
  );
}

export const SourceArtifactJsonEnvelopeSchema = z
  .object({
    sourceType: z.enum(['structured_paste', 'manual']),
    fileName: z.string().nullable(),
    content: z.string().max(200_000),
  })
  .strict();

export const SourceArtifactResponseSchema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    sourceType: FinancialObservationSourceSchema,
    fileName: z.string().nullable(),
    mediaType: z.string().min(1),
    byteCount: z.number().int().nonnegative(),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    purgeAfter: z.string().datetime(),
    createdBy: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    replayed: z.boolean(),
  })
  .strict();

export type SourceArtifactJsonEnvelope = z.infer<typeof SourceArtifactJsonEnvelopeSchema>;
export type SourceArtifactResponse = z.infer<typeof SourceArtifactResponseSchema>;
export type FinancialObservationSource = (typeof FINANCIAL_OBSERVATION_SOURCES)[number];

type SourceArtifactDatabase = typeof db;

export type SourceArtifactServiceErrorCode = 'EMPTY_ARTIFACT' | 'ARTIFACT_TOO_LARGE';

export class SourceArtifactServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: SourceArtifactServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SourceArtifactServiceError';
    this.statusCode = status;
  }
}

export interface CreateSourceArtifactInput {
  fundId: number;
  sourceType: FinancialObservationSource;
  fileName: string | null;
  mediaType: string;
  payload: Buffer;
  actorId: number | null;
  idempotencyKey: string;
  database?: SourceArtifactDatabase;
  now?: Date;
}

function sourceArtifactFromRow(row: SourceArtifact, replayed: boolean): SourceArtifactResponse {
  return SourceArtifactResponseSchema.parse({
    id: row.id,
    fundId: row.fundId,
    sourceType: row.sourceType,
    fileName: row.fileName,
    mediaType: row.mediaType,
    byteCount: row.byteCount,
    payloadSha256: row.payloadSha256,
    purgeAfter: row.purgeAfter.toISOString(),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    replayed,
  });
}

export async function createSourceArtifact(
  input: CreateSourceArtifactInput
): Promise<SourceArtifactResponse> {
  if (input.payload.byteLength === 0) {
    throw new SourceArtifactServiceError(
      400,
      'EMPTY_ARTIFACT',
      'Artifact payload must not be empty.'
    );
  }
  if (input.payload.byteLength > ARTIFACT_MAX_BYTES) {
    throw new SourceArtifactServiceError(
      413,
      'ARTIFACT_TOO_LARGE',
      `Artifact payload must not exceed ${ARTIFACT_MAX_BYTES} bytes.`
    );
  }

  const database = input.database ?? db;
  const now = input.now ?? new Date();
  const byteCount = input.payload.byteLength;
  const payloadSha256 = createHash('sha256').update(input.payload).digest('hex');
  const purgeAfter = new Date(now.getTime() + ARTIFACT_RETENTION_DAYS * 86_400_000);

  const result = await runIdempotentCommand<SourceArtifact>({
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    contractVersion: SOURCE_ARTIFACT_CONTRACT_VERSION,
    request: {
      fundId: input.fundId,
      contractVersion: SOURCE_ARTIFACT_CONTRACT_VERSION,
      sourceType: input.sourceType,
      fileName: input.fileName,
      mediaType: input.mediaType,
      payloadSha256,
      byteCount,
      actorId: input.actorId,
    },
    loadExisting: async () => {
      const [existing] = await database
        .select()
        .from(sourceArtifacts)
        .where(
          and(
            eq(sourceArtifacts.fundId, input.fundId),
            eq(sourceArtifacts.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      return existing ? { row: existing, requestHash: existing.requestHash } : null;
    },
    insert: async (requestHash) => {
      const [inserted] = await database
        .insert(sourceArtifacts)
        .values({
          fundId: input.fundId,
          sourceType: input.sourceType,
          fileName: input.fileName,
          mediaType: input.mediaType,
          byteCount,
          payloadSha256,
          payload: input.payload,
          purgeAfter,
          retentionExtendedUntil: null,
          retentionExtensionReason: null,
          purgedAt: null,
          createdBy: input.actorId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [sourceArtifacts.fundId, sourceArtifacts.idempotencyKey],
        })
        .returning();
      return inserted ?? null;
    },
  });

  return sourceArtifactFromRow(result.row, result.replayed);
}
