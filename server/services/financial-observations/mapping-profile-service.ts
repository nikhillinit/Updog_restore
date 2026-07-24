import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import { runIdempotentCommand } from '../../lib/idempotent-command';
import type {
  FINANCIAL_OBSERVATION_DOMAINS,
  FINANCIAL_OBSERVATION_SOURCES,
} from '../../../shared/contracts/financial-observations';
import {
  buildIdentitySemanticsHash,
  ImportMappingProfileV1Schema,
  MappingRuleV1Schema,
  type MappingRuleV1,
} from '../../../shared/contracts/financial-observations';
import {
  importMappingProfiles,
  type ImportMappingProfile,
} from '../../../shared/schema/financial-observations';

export const MAPPING_PROFILE_CONTRACT_VERSION = '1.0.0';

export const MappingProfileResponseSchema = ImportMappingProfileV1Schema.extend({
  id: z.number().int().positive(),
  fundId: z.number().int().positive(),
  supersededByProfileId: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  replayed: z.boolean(),
}).strict();

export type MappingProfileResponse = z.infer<typeof MappingProfileResponseSchema>;
export type FinancialObservationSource = (typeof FINANCIAL_OBSERVATION_SOURCES)[number];
export type FinancialObservationDomain = (typeof FINANCIAL_OBSERVATION_DOMAINS)[number];

type MappingProfileDatabase = typeof db;

export type MappingProfileServiceErrorCode =
  | 'INVALID_MAPPINGS'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_SUPERSEDED'
  | 'PROFILE_HEAD_CONFLICT'
  | 'PROFILE_NAME_ACTIVE_CONFLICT';

export class MappingProfileServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: MappingProfileServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MappingProfileServiceError';
    this.statusCode = status;
  }
}

export interface CreateMappingProfileVersionInput {
  fundId: number;
  name: string;
  sourceType: FinancialObservationSource;
  domain: FinancialObservationDomain;
  mappings: MappingRuleV1[];
  supersedesProfileId: number | null;
  actorId: number | null;
  idempotencyKey: string;
  database?: MappingProfileDatabase;
}

interface PostgresConstraintError {
  code?: unknown;
  constraint?: unknown;
}

function isActiveNameConflict(error: unknown): boolean {
  const candidate = error as PostgresConstraintError;
  return (
    candidate?.code === '23505' &&
    candidate.constraint === 'import_mapping_profiles_fund_name_head_unique'
  );
}

function mappingProfileFromRow(
  row: ImportMappingProfile,
  replayed: boolean
): MappingProfileResponse {
  return MappingProfileResponseSchema.parse({
    id: row.id,
    fundId: row.fundId,
    name: row.name,
    sourceType: row.sourceType,
    domain: row.domain,
    version: row.version,
    mappings: row.mappings,
    identitySemanticsHash: row.identitySemanticsHash,
    supersededByProfileId: row.supersededByProfileId,
    createdAt: row.createdAt.toISOString(),
    replayed,
  });
}

function parseMappings(mappings: readonly MappingRuleV1[]): MappingRuleV1[] {
  try {
    return mappings.map((mapping) => MappingRuleV1Schema.parse(mapping));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MappingProfileServiceError(
        400,
        'INVALID_MAPPINGS',
        'Mappings contain an invalid source, target, or transform.'
      );
    }
    throw error;
  }
}

function profileMatchesSupersession(
  prior: ImportMappingProfile,
  input: CreateMappingProfileVersionInput
): boolean {
  return (
    prior.name === input.name &&
    prior.sourceType === input.sourceType &&
    prior.domain === input.domain &&
    prior.supersededByProfileId === null
  );
}

export async function createMappingProfileVersion(
  input: CreateMappingProfileVersionInput
): Promise<MappingProfileResponse> {
  const database = input.database ?? db;
  const mappings = parseMappings(input.mappings);
  const identitySemanticsHash = buildIdentitySemanticsHash(mappings);

  const result = await runIdempotentCommand<ImportMappingProfile>({
    db: database,
    fundId: input.fundId,
    idempotencyKey: input.idempotencyKey,
    contractVersion: MAPPING_PROFILE_CONTRACT_VERSION,
    request: {
      fundId: input.fundId,
      contractVersion: MAPPING_PROFILE_CONTRACT_VERSION,
      name: input.name,
      sourceType: input.sourceType,
      domain: input.domain,
      mappings,
      supersedesProfileId: input.supersedesProfileId,
      actorId: input.actorId,
    },
    loadExisting: async () => {
      const [existing] = await database
        .select()
        .from(importMappingProfiles)
        .where(
          and(
            eq(importMappingProfiles.fundId, input.fundId),
            eq(importMappingProfiles.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      return existing ? { row: existing, requestHash: existing.requestHash } : null;
    },
    insert: async (requestHash) => {
      try {
        return await database.transaction(async (transaction) => {
          if (input.supersedesProfileId === null) {
            const [inserted] = await transaction
              .insert(importMappingProfiles)
              .values({
                fundId: input.fundId,
                name: input.name,
                sourceType: input.sourceType,
                domain: input.domain,
                version: 1,
                mappings,
                identitySemanticsHash,
                supersededByProfileId: null,
                createdBy: input.actorId,
                idempotencyKey: input.idempotencyKey,
                requestHash,
              })
              .onConflictDoNothing({
                target: [importMappingProfiles.fundId, importMappingProfiles.idempotencyKey],
              })
              .returning();
            return inserted ?? null;
          }

          // A completed supersession makes its predecessor non-head. Detect the
          // service-owned replay first so the predecessor validation cannot mask it.
          const [idempotentReplay] = await transaction
            .select()
            .from(importMappingProfiles)
            .where(
              and(
                eq(importMappingProfiles.fundId, input.fundId),
                eq(importMappingProfiles.idempotencyKey, input.idempotencyKey)
              )
            )
            .limit(1);
          if (idempotentReplay) return null;

          const [prior] = await transaction
            .select()
            .from(importMappingProfiles)
            .where(
              and(
                eq(importMappingProfiles.id, input.supersedesProfileId),
                eq(importMappingProfiles.fundId, input.fundId)
              )
            )
            .limit(1);
          if (!prior) {
            throw new MappingProfileServiceError(
              404,
              'PROFILE_NOT_FOUND',
              'Mapping profile was not found in this fund.'
            );
          }
          if (!profileMatchesSupersession(prior, input)) {
            throw new MappingProfileServiceError(
              409,
              'PROFILE_SUPERSEDED',
              'Mapping profile is not the active compatible head.'
            );
          }

          const [inserted] = await transaction
            .insert(importMappingProfiles)
            .values({
              fundId: input.fundId,
              name: input.name,
              sourceType: input.sourceType,
              domain: input.domain,
              version: prior.version + 1,
              mappings,
              identitySemanticsHash,
              supersededByProfileId: prior.id,
              createdBy: input.actorId,
              idempotencyKey: input.idempotencyKey,
              requestHash,
            })
            .onConflictDoNothing({
              target: [importMappingProfiles.fundId, importMappingProfiles.idempotencyKey],
            })
            .returning();
          if (!inserted) return null;

          const [superseded] = await transaction
            .update(importMappingProfiles)
            .set({ supersededByProfileId: inserted.id })
            .where(
              and(
                eq(importMappingProfiles.id, prior.id),
                eq(importMappingProfiles.fundId, input.fundId),
                isNull(importMappingProfiles.supersededByProfileId)
              )
            )
            .returning({ id: importMappingProfiles.id });
          if (!superseded) {
            throw new MappingProfileServiceError(
              409,
              'PROFILE_HEAD_CONFLICT',
              'Mapping profile head changed while creating a successor.'
            );
          }

          const [promoted] = await transaction
            .update(importMappingProfiles)
            .set({ supersededByProfileId: null })
            .where(
              and(
                eq(importMappingProfiles.id, inserted.id),
                eq(importMappingProfiles.fundId, input.fundId)
              )
            )
            .returning();
          if (!promoted) {
            throw new MappingProfileServiceError(
              409,
              'PROFILE_HEAD_CONFLICT',
              'Mapping profile successor could not be promoted to head.'
            );
          }
          return promoted;
        });
      } catch (error) {
        if (isActiveNameConflict(error)) {
          throw new MappingProfileServiceError(
            409,
            'PROFILE_NAME_ACTIVE_CONFLICT',
            'An active mapping profile already uses this name.'
          );
        }
        throw error;
      }
    },
  });

  return mappingProfileFromRow(result.row, result.replayed);
}
