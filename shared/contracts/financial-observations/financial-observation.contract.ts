import { z } from 'zod';

import { FinancialFactsConsumerKeySchema } from '../financial-facts-consumer-policies';

export const FINANCIAL_OBSERVATION_SOURCES = ['csv', 'xlsx', 'structured_paste', 'manual'] as const;
export const FINANCIAL_OBSERVATION_DOMAINS = ['ledger_event', 'valuation', 'ownership'] as const;
export const SOURCE_OBSERVATION_STATUSES = ['staged', 'accepted', 'purged'] as const;
export const IMPORT_BATCH_STATUSES = [
  'staged',
  'partially_committed',
  'committed',
  'expired',
] as const;
export const IDENTITY_LINK_TYPES = [
  'backfill',
  'operator_resolution',
  'import_resolution',
] as const;

export const FinancialObservationSourceSchema = z.enum(FINANCIAL_OBSERVATION_SOURCES);
export const FinancialObservationDomainSchema = z.enum(FINANCIAL_OBSERVATION_DOMAINS);
export type FinancialObservationSource = z.infer<typeof FinancialObservationSourceSchema>;
export type FinancialObservationDomain = z.infer<typeof FinancialObservationDomainSchema>;
export const SourceObservationStatusSchema = z.enum(SOURCE_OBSERVATION_STATUSES);
export const ImportBatchStatusSchema = z.enum(IMPORT_BATCH_STATUSES);
export const IdentityLinkTypeSchema = z.enum(IDENTITY_LINK_TYPES);
export const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

const PositiveIntegerSchema = z.number().int().positive();
const NullablePositiveIntegerSchema = PositiveIntegerSchema.nullable();
const CreatedAtSchema = z.string().datetime();

export const SourceObservationV1Schema = z
  .object({
    id: PositiveIntegerSchema,
    fundId: PositiveIntegerSchema,
    importBatchId: NullablePositiveIntegerSchema,
    sourceArtifactId: NullablePositiveIntegerSchema,
    mappingProfileId: NullablePositiveIntegerSchema,
    companyIdentityId: NullablePositiveIntegerSchema,
    domain: FinancialObservationDomainSchema,
    sourceType: FinancialObservationSourceSchema,
    effectiveDate: z.string().date(),
    normalizedPayload: z.record(z.string(), z.unknown()),
    observationHash: Sha256HexSchema,
    candidateFingerprint: Sha256HexSchema,
    sourceLocator: z.string().min(1).nullable(),
    dependencyGroupKey: z.string().min(1).nullable(),
    status: SourceObservationStatusSchema,
    createdAt: CreatedAtSchema,
  })
  .strict();

export const WorkingValueSelectionV1Schema = z
  .object({
    id: PositiveIntegerSchema,
    fundId: PositiveIntegerSchema,
    consumer: FinancialFactsConsumerKeySchema,
    companyIdentityId: NullablePositiveIntegerSchema,
    domain: FinancialObservationDomainSchema,
    measureKey: z.string().min(1),
    asOfDate: z.string().date(),
    selectedObservationId: PositiveIntegerSchema,
    isDefault: z.boolean(),
    reason: z.string().min(1).nullable(),
    version: PositiveIntegerSchema,
    supersededBySelectionId: NullablePositiveIntegerSchema,
    createdBy: NullablePositiveIntegerSchema,
    createdAt: CreatedAtSchema,
  })
  .strict();

export const CompanyIdentityV1Schema = z
  .object({
    id: PositiveIntegerSchema,
    fundId: PositiveIntegerSchema,
    canonicalName: z.string().min(1),
    mergedIntoIdentityId: NullablePositiveIntegerSchema,
    sourcePortfolioCompanyId: NullablePositiveIntegerSchema,
    createdBy: NullablePositiveIntegerSchema,
    createdAt: CreatedAtSchema,
  })
  .strict();

export const CompanyExternalIdentityV1Schema = z
  .object({
    id: PositiveIntegerSchema,
    fundId: PositiveIntegerSchema,
    companyIdentityId: PositiveIntegerSchema,
    system: z.string().min(1),
    value: z.string().min(1),
    createdBy: NullablePositiveIntegerSchema,
    createdAt: CreatedAtSchema,
  })
  .strict();

export const PortfolioCompanyIdentityLinkV1Schema = z
  .object({
    id: PositiveIntegerSchema,
    fundId: PositiveIntegerSchema,
    portfolioCompanyId: PositiveIntegerSchema,
    companyIdentityId: PositiveIntegerSchema,
    linkType: IdentityLinkTypeSchema,
    active: z.boolean(),
    deactivatedAt: CreatedAtSchema.nullable(),
    createdBy: NullablePositiveIntegerSchema,
    createdAt: CreatedAtSchema,
  })
  .strict();

export type SourceObservationV1 = z.infer<typeof SourceObservationV1Schema>;
export type WorkingValueSelectionV1 = z.infer<typeof WorkingValueSelectionV1Schema>;
export type CompanyIdentityV1 = z.infer<typeof CompanyIdentityV1Schema>;
export type CompanyExternalIdentityV1 = z.infer<typeof CompanyExternalIdentityV1Schema>;
export type PortfolioCompanyIdentityLinkV1 = z.infer<typeof PortfolioCompanyIdentityLinkV1Schema>;

export interface MergeChainIdentity {
  readonly mergedIntoIdentityId: number | null;
}

export function resolveIdentityMergeChain(
  byId: ReadonlyMap<number, MergeChainIdentity>,
  startId: number
): number {
  const visited = new Set<number>();
  let currentId = startId;

  while (true) {
    if (visited.has(currentId)) {
      throw new Error(`Company identity merge cycle detected at ${currentId}`);
    }
    visited.add(currentId);

    const current = byId.get(currentId);
    if (!current) {
      throw new Error(`Company identity ${currentId} is missing from merge chain`);
    }
    if (current.mergedIntoIdentityId === null) {
      return currentId;
    }
    currentId = current.mergedIntoIdentityId;
  }
}
