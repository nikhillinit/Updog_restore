import { z } from 'zod';

import { canonicalSha256 } from '../../lib/canonical-hash';
import {
  FINANCIAL_OBSERVATION_DOMAINS,
  FINANCIAL_OBSERVATION_SOURCES,
  Sha256HexSchema,
} from './financial-observation.contract';

export const ALLOWED_MAPPING_TRANSFORMS = [
  'trim',
  'normalize_whitespace',
  'parse_decimal',
  'parse_date_iso',
  'parse_date_us',
  'negate',
] as const;
export const IDENTITY_TARGET_FIELDS = ['company_name', 'company_external_id'] as const;

export const AllowedMappingTransformSchema = z.enum(ALLOWED_MAPPING_TRANSFORMS);
export type AllowedMappingTransform = z.infer<typeof AllowedMappingTransformSchema>;
export const MappingRuleV1Schema = z
  .object({
    sourceColumn: z.string().min(1),
    targetField: z.string().min(1),
    transforms: z.array(AllowedMappingTransformSchema),
  })
  .strict();

export const ImportMappingProfileV1Schema = z
  .object({
    name: z.string().min(1),
    sourceType: z.enum(FINANCIAL_OBSERVATION_SOURCES),
    domain: z.enum(FINANCIAL_OBSERVATION_DOMAINS),
    version: z.number().int().positive(),
    mappings: z.array(MappingRuleV1Schema),
    identitySemanticsHash: Sha256HexSchema,
  })
  .strict();

export type MappingRuleV1 = z.infer<typeof MappingRuleV1Schema>;
export type ImportMappingProfileV1 = z.infer<typeof ImportMappingProfileV1Schema>;

const identityTargetFields = new Set<string>(IDENTITY_TARGET_FIELDS);

export function buildIdentitySemanticsHash(mappings: readonly MappingRuleV1[]): string {
  const identityMappings = mappings
    .map((mapping) => MappingRuleV1Schema.parse(mapping))
    .filter((mapping) => identityTargetFields.has(mapping.targetField))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return canonicalSha256(identityMappings);
}
