import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import type { MappingRuleV1 } from '../contracts/financial-observations/import-profile.contract';
import type {
  ReconciliationCaseHistoryEntryV1,
  ReconciliationResolutionV1,
} from '../contracts/financial-observations/reconciliation.contract';
import { funds } from './fund';
import { portfolioCompanies } from './portfolio';
import { users } from './user';

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: unknown): Buffer {
    return value as Buffer;
  },
  fromDriver(value: unknown): Buffer {
    return value as Buffer;
  },
});

export const sourceArtifacts = pgTable(
  'source_artifacts',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    sourceType: text('source_type').notNull(),
    fileName: text('file_name'),
    mediaType: text('media_type').notNull(),
    byteCount: integer('byte_count').notNull(),
    payloadSha256: varchar('payload_sha256', { length: 64 }).notNull(),
    payload: bytea('payload'),
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
    retentionExtendedUntil: timestamp('retention_extended_until', {
      withTimezone: true,
    }),
    retentionExtensionReason: text('retention_extension_reason'),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'source_artifacts_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'source_artifacts_created_by_fk',
    }),
    sourceTypeCheck: check(
      'source_artifacts_source_type_check',
      sql`${table.sourceType} IN ('csv','xlsx','structured_paste','manual')`
    ),
    payloadPurgedCheck: check(
      'source_artifacts_payload_purged_check',
      sql`(${table.payload} IS NULL AND ${table.purgedAt} IS NOT NULL)
          OR (${table.payload} IS NOT NULL AND ${table.purgedAt} IS NULL)`
    ),
    idFundUnique: unique('source_artifacts_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('source_artifacts_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundCreatedIdx: index('idx_source_artifacts_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
    purgeAfterIdx: index('idx_source_artifacts_purge_after')
      .on(table.purgeAfter)
      .where(sql`${table.purgedAt} IS NULL`),
  })
);

export const importMappingProfiles = pgTable(
  'import_mapping_profiles',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    name: text('name').notNull(),
    sourceType: text('source_type').notNull(),
    domain: text('domain').notNull(),
    version: integer('version').notNull().default(1),
    mappings: jsonb('mappings').notNull().$type<MappingRuleV1[]>(),
    identitySemanticsHash: varchar('identity_semantics_hash', { length: 64 }).notNull(),
    supersededByProfileId: integer('superseded_by_profile_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'import_mapping_profiles_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    supersededFundFk: foreignKey({
      columns: [table.supersededByProfileId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'import_mapping_profiles_superseded_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'import_mapping_profiles_created_by_fk',
    }),
    sourceTypeCheck: check(
      'import_mapping_profiles_source_type_check',
      sql`${table.sourceType} IN ('csv','xlsx','structured_paste','manual')`
    ),
    domainCheck: check(
      'import_mapping_profiles_domain_check',
      sql`${table.domain} IN ('ledger_event','valuation','ownership')`
    ),
    versionPositiveCheck: check(
      'import_mapping_profiles_version_positive_check',
      sql`${table.version} >= 1`
    ),
    idFundUnique: unique('import_mapping_profiles_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('import_mapping_profiles_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundNameVersionUnique: unique('import_mapping_profiles_fund_name_version_unique').on(
      table.fundId,
      table.name,
      table.version
    ),
    fundNameHeadUnique: uniqueIndex('import_mapping_profiles_fund_name_head_unique')
      .on(table.fundId, table.name)
      .where(sql`${table.supersededByProfileId} IS NULL`),
  })
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    sourceArtifactId: integer('source_artifact_id'),
    mappingProfileId: integer('mapping_profile_id'),
    status: text('status').notNull().default('staged'),
    previewHash: varchar('preview_hash', { length: 64 }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
    retentionExtendedUntil: timestamp('retention_extended_until', {
      withTimezone: true,
    }),
    retentionExtensionReason: text('retention_extension_reason'),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'import_batches_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    sourceArtifactFundFk: foreignKey({
      columns: [table.sourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'import_batches_source_artifact_fund_fk',
    }),
    mappingProfileFundFk: foreignKey({
      columns: [table.mappingProfileId, table.fundId],
      foreignColumns: [importMappingProfiles.id, importMappingProfiles.fundId],
      name: 'import_batches_mapping_profile_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'import_batches_created_by_fk',
    }),
    statusCheck: check(
      'import_batches_status_check',
      sql`${table.status} IN ('staged','partially_committed','committed','expired')`
    ),
    idFundUnique: unique('import_batches_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('import_batches_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    fundCreatedIdx: index('idx_import_batches_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
    purgeAfterIdx: index('idx_import_batches_purge_after')
      .on(table.purgeAfter)
      .where(sql`${table.purgedAt} IS NULL`),
  })
);

export const companyIdentities = pgTable(
  'company_identities',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    canonicalName: text('canonical_name').notNull(),
    mergedIntoIdentityId: integer('merged_into_identity_id'),
    sourcePortfolioCompanyId: integer('source_portfolio_company_id'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'company_identities_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    mergedIntoFk: foreignKey({
      columns: [table.mergedIntoIdentityId],
      foreignColumns: [table.id],
      name: 'company_identities_merged_into_fk',
    }),
    sourcePortfolioCompanyFk: foreignKey({
      columns: [table.sourcePortfolioCompanyId],
      foreignColumns: [portfolioCompanies.id],
      name: 'company_identities_source_portfolio_company_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'company_identities_created_by_fk',
    }),
    noSelfMergeCheck: check(
      'company_identities_no_self_merge_check',
      sql`${table.mergedIntoIdentityId} IS NULL OR ${table.mergedIntoIdentityId} <> ${table.id}`
    ),
    idFundUnique: unique('company_identities_id_fund_unique').on(table.id, table.fundId),
    sourcePortfolioCompanyUnique: uniqueIndex('company_identities_source_pc_unique')
      .on(table.sourcePortfolioCompanyId)
      .where(sql`${table.sourcePortfolioCompanyId} IS NOT NULL`),
    fundIdx: index('idx_company_identities_fund').on(table.fundId),
  })
);

export const companyExternalIdentities = pgTable(
  'company_external_identities',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    companyIdentityId: integer('company_identity_id').notNull(),
    system: text('system').notNull(),
    value: text('value').notNull(),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'company_external_identities_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'company_external_identities_identity_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'company_external_identities_created_by_fk',
    }),
    fundSystemValueUnique: unique('company_external_identities_fund_system_value_unique').on(
      table.fundId,
      table.system,
      table.value
    ),
  })
);

export const portfolioCompanyIdentityLinks = pgTable(
  'portfolio_company_identity_links',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    portfolioCompanyId: integer('portfolio_company_id').notNull(),
    companyIdentityId: integer('company_identity_id').notNull(),
    linkType: text('link_type').notNull(),
    active: boolean('active').notNull().default(true),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'pc_identity_links_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    portfolioCompanyFk: foreignKey({
      columns: [table.portfolioCompanyId],
      foreignColumns: [portfolioCompanies.id],
      name: 'pc_identity_links_portfolio_company_fk',
    }),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'pc_identity_links_identity_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'pc_identity_links_created_by_fk',
    }),
    linkTypeCheck: check(
      'pc_identity_links_link_type_check',
      sql`${table.linkType} IN ('backfill','operator_resolution','import_resolution')`
    ),
    activeDeactivatedCheck: check(
      'pc_identity_links_active_deactivated_check',
      sql`(${table.active} AND ${table.deactivatedAt} IS NULL)
          OR (NOT ${table.active} AND ${table.deactivatedAt} IS NOT NULL)`
    ),
    activeCompanyUnique: uniqueIndex('pc_identity_links_active_company_unique')
      .on(table.portfolioCompanyId)
      .where(sql`${table.active} = true`),
  })
);

export const sourceObservations = pgTable(
  'source_observations',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    importBatchId: integer('import_batch_id'),
    sourceArtifactId: integer('source_artifact_id'),
    mappingProfileId: integer('mapping_profile_id'),
    companyIdentityId: integer('company_identity_id'),
    domain: text('domain').notNull(),
    sourceType: text('source_type').notNull(),
    effectiveDate: date('effective_date').notNull(),
    normalizedPayload: jsonb('normalized_payload').notNull().$type<Record<string, unknown>>(),
    observationHash: varchar('observation_hash', { length: 64 }).notNull(),
    candidateFingerprint: varchar('candidate_fingerprint', { length: 64 }).notNull(),
    sourceLocator: text('source_locator'),
    dependencyGroupKey: text('dependency_group_key'),
    status: text('status').notNull().default('staged'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'source_observations_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    importBatchFundFk: foreignKey({
      columns: [table.importBatchId, table.fundId],
      foreignColumns: [importBatches.id, importBatches.fundId],
      name: 'source_observations_import_batch_fund_fk',
    }),
    sourceArtifactFundFk: foreignKey({
      columns: [table.sourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'source_observations_source_artifact_fund_fk',
    }),
    mappingProfileFundFk: foreignKey({
      columns: [table.mappingProfileId, table.fundId],
      foreignColumns: [importMappingProfiles.id, importMappingProfiles.fundId],
      name: 'source_observations_mapping_profile_fund_fk',
    }),
    companyIdentityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'source_observations_company_identity_fund_fk',
    }),
    domainCheck: check(
      'source_observations_domain_check',
      sql`${table.domain} IN ('ledger_event','valuation','ownership')`
    ),
    sourceTypeCheck: check(
      'source_observations_source_type_check',
      sql`${table.sourceType} IN ('csv','xlsx','structured_paste','manual')`
    ),
    statusCheck: check(
      'source_observations_status_check',
      sql`${table.status} IN ('staged','accepted','purged')`
    ),
    idFundUnique: unique('source_observations_id_fund_unique').on(table.id, table.fundId),
    fundHashAcceptedUnique: uniqueIndex('source_observations_fund_hash_accepted_unique')
      .on(table.fundId, table.observationHash)
      .where(sql`${table.status} = 'accepted'`),
    fundEffectiveDateIdx: index('idx_source_observations_fund_effective_date').on(
      table.fundId,
      table.effectiveDate
    ),
    fundCandidateFingerprintIdx: index('idx_source_observations_fund_candidate_fingerprint').on(
      table.fundId,
      table.candidateFingerprint
    ),
    importBatchIdx: index('idx_source_observations_import_batch').on(table.importBatchId),
  })
);

export const reconciliationCases = pgTable(
  'reconciliation_cases',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    importBatchId: integer('import_batch_id'),
    sourceObservationId: integer('source_observation_id'),
    caseType: text('case_type').notNull(),
    status: text('status').notNull().default('open'),
    observationHash: varchar('observation_hash', { length: 64 }),
    candidateFingerprint: varchar('candidate_fingerprint', { length: 64 }),
    resolution: jsonb('resolution').$type<ReconciliationResolutionV1>(),
    resolvedBy: integer('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    history: jsonb('history')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<ReconciliationCaseHistoryEntryV1[]>(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'reconciliation_cases_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    importBatchFundFk: foreignKey({
      columns: [table.importBatchId, table.fundId],
      foreignColumns: [importBatches.id, importBatches.fundId],
      name: 'reconciliation_cases_import_batch_fund_fk',
    }),
    sourceObservationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'reconciliation_cases_source_observation_fund_fk',
    }),
    resolvedByFk: foreignKey({
      columns: [table.resolvedBy],
      foreignColumns: [users.id],
      name: 'reconciliation_cases_resolved_by_fk',
    }),
    caseTypeCheck: check(
      'reconciliation_cases_case_type_check',
      sql`${table.caseType} IN ('identity_resolution','observation_match')`
    ),
    statusCheck: check(
      'reconciliation_cases_status_check',
      sql`${table.status} IN ('open','resolved','expired_unresolved')`
    ),
    resolvedFieldsCheck: check(
      'reconciliation_cases_resolved_fields_check',
      sql`(${table.status} = 'resolved'
            AND ${table.resolution} IS NOT NULL
            AND ${table.resolvedAt} IS NOT NULL)
          OR (${table.status} <> 'resolved'
            AND ${table.resolution} IS NULL
            AND ${table.resolvedAt} IS NULL
            AND ${table.resolvedBy} IS NULL)`
    ),
    fundStatusIdx: index('idx_reconciliation_cases_fund_status').on(table.fundId, table.status),
  })
);

export const workingValueSelections = pgTable(
  'working_value_selections',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    consumer: text('consumer').notNull(),
    companyIdentityId: integer('company_identity_id'),
    domain: text('domain').notNull(),
    measureKey: text('measure_key').notNull(),
    asOfDate: date('as_of_date').notNull(),
    selectedObservationId: integer('selected_observation_id').notNull(),
    isDefault: boolean('is_default').notNull(),
    reason: text('reason'),
    version: integer('version').notNull().default(1),
    supersededBySelectionId: integer('superseded_by_selection_id'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'working_value_selections_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    observationFundFk: foreignKey({
      columns: [table.selectedObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'working_value_selections_observation_fund_fk',
    }),
    identityFundFk: foreignKey({
      columns: [table.companyIdentityId, table.fundId],
      foreignColumns: [companyIdentities.id, companyIdentities.fundId],
      name: 'working_value_selections_identity_fund_fk',
    }),
    supersededFundFk: foreignKey({
      columns: [table.supersededBySelectionId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'working_value_selections_superseded_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'working_value_selections_created_by_fk',
    }),
    consumerCheck: check(
      'working_value_selections_consumer_check',
      sql`${table.consumer} IN ('forecast','reserve','economics','periodic_analysis')`
    ),
    domainCheck: check(
      'working_value_selections_domain_check',
      sql`${table.domain} IN ('ledger_event','valuation','ownership')`
    ),
    deviationReasonCheck: check(
      'working_value_selections_deviation_reason_check',
      sql`${table.isDefault} OR ${table.reason} IS NOT NULL`
    ),
    scopeHeadUnique: uniqueIndex('working_value_selections_scope_head_unique')
      .on(
        table.fundId,
        table.consumer,
        table.domain,
        table.measureKey,
        table.asOfDate,
        sql`COALESCE(${table.companyIdentityId}, 0)`
      )
      .where(sql`${table.supersededBySelectionId} IS NULL`),
  })
);

export type SourceArtifact = typeof sourceArtifacts.$inferSelect;
export type InsertSourceArtifact = typeof sourceArtifacts.$inferInsert;
export type ImportMappingProfile = typeof importMappingProfiles.$inferSelect;
export type InsertImportMappingProfile = typeof importMappingProfiles.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = typeof importBatches.$inferInsert;
export type CompanyIdentity = typeof companyIdentities.$inferSelect;
export type InsertCompanyIdentity = typeof companyIdentities.$inferInsert;
export type CompanyExternalIdentity = typeof companyExternalIdentities.$inferSelect;
export type InsertCompanyExternalIdentity = typeof companyExternalIdentities.$inferInsert;
export type PortfolioCompanyIdentityLink = typeof portfolioCompanyIdentityLinks.$inferSelect;
export type InsertPortfolioCompanyIdentityLink = typeof portfolioCompanyIdentityLinks.$inferInsert;
export type SourceObservation = typeof sourceObservations.$inferSelect;
export type InsertSourceObservation = typeof sourceObservations.$inferInsert;
export type ReconciliationCase = typeof reconciliationCases.$inferSelect;
export type InsertReconciliationCase = typeof reconciliationCases.$inferInsert;
export type WorkingValueSelection = typeof workingValueSelections.$inferSelect;
export type InsertWorkingValueSelection = typeof workingValueSelections.$inferInsert;
