import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { funds } from './fund';
import { users } from './user';
import { sourceArtifacts } from './financial-observations';

export const actualsDraftRevisions = pgTable(
  'actuals_draft_revisions',
  {
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id),
    revision: integer('revision').notNull(),
    revisionHash: varchar('revision_hash', { length: 64 }).notNull(),
    priorRevision: integer('prior_revision'),
    priorRevisionHash: varchar('prior_revision_hash', { length: 64 }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    classification: varchar('classification', { length: 11 })
      .notNull()
      .$type<'provisional' | 'synthetic'>(),
    asOfDate: date('as_of_date'),
    sourceNote: text('source_note').notNull(),
    correctionReason: text('correction_reason').notNull(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    ledgerSourceArtifactId: integer('ledger_source_artifact_id').notNull(),
    ledgerTemplateVersion: text('ledger_template_version').notNull(),
    ledgerFileName: text('ledger_file_name').notNull(),
    ledgerPayloadSha256: varchar('ledger_payload_sha256', { length: 64 }).notNull(),
    ledgerByteCount: integer('ledger_byte_count').notNull(),
    ledgerPurgeAfter: timestamp('ledger_purge_after', { withTimezone: true }).notNull(),
    valuationSourceArtifactId: integer('valuation_source_artifact_id'),
    valuationTemplateVersion: text('valuation_template_version'),
    valuationFileName: text('valuation_file_name'),
    valuationPayloadSha256: varchar('valuation_payload_sha256', { length: 64 }),
    valuationByteCount: integer('valuation_byte_count'),
    valuationPurgeAfter: timestamp('valuation_purge_after', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ name: 'actuals_draft_revisions_pk', columns: [table.fundId, table.revision] }),
    identity: unique('actuals_draft_revisions_identity').on(
      table.fundId,
      table.revision,
      table.revisionHash
    ),
    idempotency: unique('actuals_draft_revisions_idempotency').on(
      table.fundId,
      table.idempotencyKey
    ),
    priorFk: foreignKey({
      name: 'actuals_draft_revisions_prior_fk',
      columns: [table.fundId, table.priorRevision, table.priorRevisionHash],
      foreignColumns: [table.fundId, table.revision, table.revisionHash],
    }),
    priorCheck: check(
      'actuals_draft_revisions_prior_check',
      sql`(${table.revision} = 1 AND ${table.priorRevision} IS NULL AND ${table.priorRevisionHash} IS NULL) OR (${table.revision} > 1 AND ${table.priorRevision} IS NOT NULL AND ${table.priorRevision} = ${table.revision} - 1 AND ${table.priorRevisionHash} IS NOT NULL)`
    ),
    ledgerFk: foreignKey({
      name: 'actuals_draft_revisions_ledger_fk',
      columns: [table.ledgerSourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
    }),
    valuationFk: foreignKey({
      name: 'actuals_draft_revisions_valuation_fk',
      columns: [table.valuationSourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
    }),
    revisionCheck: check('actuals_draft_revisions_revision_check', sql`${table.revision} > 0`),
    revisionHashCheck: check(
      'actuals_draft_revisions_revision_hash_check',
      sql`${table.revisionHash} ~ '^[a-f0-9]{64}$'`
    ),
    requestHashCheck: check(
      'actuals_draft_revisions_request_hash_check',
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`
    ),
    classificationCheck: check(
      'actuals_draft_revisions_classification_check',
      sql`${table.classification} IN ('provisional', 'synthetic')`
    ),
    asOfDateCheck: check(
      'actuals_draft_revisions_as_of_date_check',
      sql`${table.asOfDate} IS NULL OR ${table.asOfDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`
    ),
    sourceNoteCheck: check(
      'actuals_draft_revisions_source_note_check',
      sql`length(btrim(${table.sourceNote})) BETWEEN 1 AND 500`
    ),
    correctionReasonCheck: check(
      'actuals_draft_revisions_correction_reason_check',
      sql`length(btrim(${table.correctionReason})) BETWEEN 1 AND 500`
    ),
    ledgerTemplateCheck: check(
      'actuals_draft_revisions_ledger_template_version_check',
      sql`${table.ledgerTemplateVersion} = 'actuals-ledger/1.0.0'`
    ),
    ledgerFileNameCheck: check(
      'actuals_draft_revisions_ledger_file_name_check',
      sql`length(${table.ledgerFileName}) BETWEEN 1 AND 255`
    ),
    ledgerHashCheck: check(
      'actuals_draft_revisions_ledger_payload_sha256_check',
      sql`${table.ledgerPayloadSha256} ~ '^[a-f0-9]{64}$'`
    ),
    ledgerByteCountCheck: check(
      'actuals_draft_revisions_ledger_byte_count_check',
      sql`${table.ledgerByteCount} BETWEEN 0 AND 122880`
    ),
    valuationCheck: check(
      'actuals_draft_revisions_valuation_check',
      sql`
      (${table.valuationSourceArtifactId} IS NULL AND ${table.valuationTemplateVersion} IS NULL
        AND ${table.valuationFileName} IS NULL AND ${table.valuationPayloadSha256} IS NULL
        AND ${table.valuationByteCount} IS NULL AND ${table.valuationPurgeAfter} IS NULL)
      OR (${table.valuationSourceArtifactId} IS NOT NULL
        AND ${table.valuationTemplateVersion} IS NOT NULL AND ${table.valuationTemplateVersion} = 'actuals-valuation/1.0.0'
        AND ${table.valuationFileName} IS NOT NULL AND length(${table.valuationFileName}) BETWEEN 1 AND 255
        AND ${table.valuationPayloadSha256} IS NOT NULL AND ${table.valuationPayloadSha256} ~ '^[a-f0-9]{64}$'
        AND ${table.valuationByteCount} IS NOT NULL AND ${table.valuationByteCount} BETWEEN 0 AND 40960
        AND ${table.valuationPurgeAfter} IS NOT NULL)
    `
    ),
    retentionCheck: check(
      'actuals_draft_revisions_retention_check',
      sql`${table.ledgerPurgeAfter} > ${table.createdAt} AND (${table.valuationPurgeAfter} IS NULL OR ${table.valuationPurgeAfter} > ${table.createdAt})`
    ),
  })
);

export type ActualsDraftRevision = typeof actualsDraftRevisions.$inferSelect;
