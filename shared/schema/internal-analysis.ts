import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

import type {
  AnalysisPeriodKind,
  AnalysisRevisionEventType,
} from '../contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import { sourceObservations } from './financial-observations';
import { financialFactsSnapshots } from './financial-facts-snapshots';
import { funds, fundSnapshots } from './fund';
import { internalLpEconomicsRuns } from './internal-economics';
import { users } from './user';

/**
 * Internal periodic analysis (PLAN_61 Task 18, Wave G). Drafts are revisable;
 * references are immutable snapshots of one coherent facts basis. These are
 * INTERNAL reference artifacts -- never closes, restatements, or approved reports,
 * so there is deliberately no approval, recipient, or export column anywhere here.
 *
 * Fund scoping is composite throughout, matching the Wave C/D ledger tables: every
 * table carries `fund_id` with `ON DELETE cascade`, a sibling `UNIQUE (id, fund_id)`,
 * and child FKs reference the `(id, fund_id)` pair, so cross-fund leakage is
 * structurally impossible rather than merely checked. The one exception is the
 * forecast pin: `fund_snapshots` has no `(id, fund_id)` sibling key, so that FK is
 * plain and ownership is enforced in code via `assertOwnedByFund` (defect D29).
 *
 * FK names are declared explicitly so the journaled migrations (0044/0047) and
 * a Drizzle push produce byte-identical catalog constraint names.
 */
export const internalAnalysisDrafts = pgTable(
  'internal_analysis_drafts',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    periodKind: varchar('period_kind', { length: 16 }).notNull().$type<AnalysisPeriodKind>(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    knowledgeCutoff: timestamp('knowledge_cutoff', { withTimezone: true }).notNull(),
    financialFactsSnapshotId: integer('financial_facts_snapshot_id').notNull(),
    forecastFundSnapshotId: integer('forecast_fund_snapshot_id'),
    /** Reserve remains unconstrained; economics is fund-scoped by 0047. */
    reserveReferenceId: integer('reserve_reference_id'),
    economicsReferenceId: integer('economics_reference_id'),
    /**
     * The reference a late correction started from. Deliberately NOT an FK: a
     * mutual drafts <-> references FK pair is a dependency cycle, so integrity runs
     * one way (`internalAnalysisReferences.sourceDraftId`) and this direction is
     * enforced in code via `assertOwnedByFund({ kind: 'analysis_reference' })`.
     */
    sourceReferenceId: integer('source_reference_id'),
    /** Set once saved; a saved draft is closed to further refresh. */
    savedAt: timestamp('saved_at', { withTimezone: true }),
    /** Monotonic; backs the ETag. Refresh bumps it. */
    version: integer('version').notNull().default(1),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_analysis_drafts_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    factsSnapshotFundFk: foreignKey({
      columns: [table.financialFactsSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'internal_analysis_drafts_facts_snapshot_fund_fk',
    }),
    forecastSnapshotFk: foreignKey({
      columns: [table.forecastFundSnapshotId],
      foreignColumns: [fundSnapshots.id],
      name: 'internal_analysis_drafts_forecast_snapshot_fk',
    }),
    economicsReferenceFundFk: foreignKey({
      columns: [table.economicsReferenceId, table.fundId],
      foreignColumns: [internalLpEconomicsRuns.id, internalLpEconomicsRuns.fundId],
      name: 'internal_analysis_drafts_economics_reference_fund_fk',
    }).onDelete('restrict'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_analysis_drafts_created_by_fk',
    }),
    idFundUnique: unique('internal_analysis_drafts_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('internal_analysis_drafts_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    periodKindCheck: check(
      'internal_analysis_drafts_period_kind_check',
      sql`${table.periodKind} IN ('quarterly','manual')`
    ),
    periodOrderCheck: check(
      'internal_analysis_drafts_period_order_check',
      sql`${table.periodEnd} >= ${table.periodStart}`
    ),
    versionCheck: check('internal_analysis_drafts_version_check', sql`${table.version} >= 1`),
    /** At most one OPEN draft per fund and period. */
    openPeriodUnique: uniqueIndex('internal_analysis_drafts_open_period_unique')
      .on(table.fundId, table.periodStart, table.periodEnd)
      .where(sql`${table.savedAt} IS NULL`),
    fundPeriodIdx: index('idx_internal_analysis_drafts_fund_period').on(
      table.fundId,
      table.periodStart.desc(),
      table.createdAt.desc()
    ),
  })
);

/**
 * Immutable saved snapshot. `supersedesReferenceId` plus the partial unique index
 * keep each revision chain linear, so the terminal member -- the row no other row
 * supersedes -- is well defined and is what comparison selects by default.
 */
export const internalAnalysisReferences = pgTable(
  'internal_analysis_references',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    periodKind: varchar('period_kind', { length: 16 }).notNull().$type<AnalysisPeriodKind>(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    knowledgeCutoff: timestamp('knowledge_cutoff', { withTimezone: true }).notNull(),
    financialFactsSnapshotId: integer('financial_facts_snapshot_id').notNull(),
    forecastFundSnapshotId: integer('forecast_fund_snapshot_id'),
    reserveReferenceId: integer('reserve_reference_id'),
    economicsReferenceId: integer('economics_reference_id'),
    /**
     * True when the operator knowingly saved a mixed-basis bundle. Consumers MUST
     * render the warning on every load of the reference, not only at save (R34-d).
     */
    mixedBasisAtSave: boolean('mixed_basis_at_save').notNull().default(false),
    supersedesReferenceId: integer('supersedes_reference_id'),
    sourceDraftId: integer('source_draft_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_analysis_references_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    factsSnapshotFundFk: foreignKey({
      columns: [table.financialFactsSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'internal_analysis_references_facts_snapshot_fund_fk',
    }),
    forecastSnapshotFk: foreignKey({
      columns: [table.forecastFundSnapshotId],
      foreignColumns: [fundSnapshots.id],
      name: 'internal_analysis_references_forecast_snapshot_fk',
    }),
    economicsReferenceFundFk: foreignKey({
      columns: [table.economicsReferenceId, table.fundId],
      foreignColumns: [internalLpEconomicsRuns.id, internalLpEconomicsRuns.fundId],
      name: 'internal_analysis_references_economics_reference_fund_fk',
    }).onDelete('restrict'),
    supersedesFundFk: foreignKey({
      columns: [table.supersedesReferenceId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'internal_analysis_references_supersedes_fund_fk',
    }),
    sourceDraftFundFk: foreignKey({
      columns: [table.sourceDraftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'internal_analysis_references_source_draft_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_analysis_references_created_by_fk',
    }),
    idFundUnique: unique('internal_analysis_references_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('internal_analysis_references_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    periodKindCheck: check(
      'internal_analysis_references_period_kind_check',
      sql`${table.periodKind} IN ('quarterly','manual')`
    ),
    periodOrderCheck: check(
      'internal_analysis_references_period_order_check',
      sql`${table.periodEnd} >= ${table.periodStart}`
    ),
    noSelfSupersedeCheck: check(
      'internal_analysis_references_no_self_supersede_check',
      sql`${table.supersedesReferenceId} IS NULL OR ${table.supersedesReferenceId} <> ${table.id}`
    ),
    supersedesUnique: uniqueIndex('internal_analysis_references_supersedes_unique')
      .on(table.supersedesReferenceId)
      .where(sql`${table.supersedesReferenceId} IS NOT NULL`),
    fundPeriodIdx: index('idx_internal_analysis_references_fund_period').on(
      table.fundId,
      table.periodStart.desc(),
      table.createdAt.desc()
    ),
  })
);

/** Append-only history. An explicit mixed-basis save is logged here (R34-d). */
export const internalAnalysisRevisionEvents = pgTable(
  'internal_analysis_revision_events',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    draftId: integer('draft_id'),
    referenceId: integer('reference_id'),
    eventType: varchar('event_type', { length: 32 }).notNull().$type<AnalysisRevisionEventType>(),
    detail: jsonb('detail').notNull().default({}).$type<Record<string, unknown>>(),
    actorId: integer('actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_analysis_revision_events_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    draftFundFk: foreignKey({
      columns: [table.draftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'internal_analysis_revision_events_draft_fund_fk',
    }),
    referenceFundFk: foreignKey({
      columns: [table.referenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'internal_analysis_revision_events_reference_fund_fk',
    }),
    actorFk: foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: 'internal_analysis_revision_events_actor_fk',
    }),
    eventTypeCheck: check(
      'internal_analysis_revision_events_event_type_check',
      sql`${table.eventType} IN ('created','refreshed','saved','mixed_basis_acknowledged')`
    ),
    targetCheck: check(
      'internal_analysis_revision_events_target_check',
      sql`${table.draftId} IS NOT NULL OR ${table.referenceId} IS NOT NULL`
    ),
    fundCreatedIdx: index('idx_internal_analysis_revision_events_fund_created').on(
      table.fundId,
      table.createdAt.desc()
    ),
  })
);

/**
 * DORMANT until PLAN_61 Task 19. Created alongside the Task 18 tables so Wave G
 * mints a single migration, mirroring how 0038 landed ahead of 13.1-svc. Nothing
 * reads or writes these yet.
 */
export const internalNarrativeDrafts = pgTable(
  'internal_narrative_drafts',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    analysisDraftId: integer('analysis_draft_id'),
    analysisReferenceId: integer('analysis_reference_id'),
    revision: integer('revision').notNull().default(1),
    supersedesDraftId: integer('supersedes_draft_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_narrative_drafts_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    analysisDraftFundFk: foreignKey({
      columns: [table.analysisDraftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'internal_narrative_drafts_analysis_draft_fund_fk',
    }),
    analysisReferenceFundFk: foreignKey({
      columns: [table.analysisReferenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'internal_narrative_drafts_analysis_reference_fund_fk',
    }),
    supersedesFundFk: foreignKey({
      columns: [table.supersedesDraftId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'internal_narrative_drafts_supersedes_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_narrative_drafts_created_by_fk',
    }),
    idFundUnique: unique('internal_narrative_drafts_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('internal_narrative_drafts_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    revisionCheck: check('internal_narrative_drafts_revision_check', sql`${table.revision} >= 1`),
    anchorCheck: check(
      'internal_narrative_drafts_anchor_check',
      sql`num_nonnulls(${table.analysisDraftId}, ${table.analysisReferenceId}) = 1`
    ),
    noSelfSupersedeCheck: check(
      'internal_narrative_drafts_no_self_supersede_check',
      sql`${table.supersedesDraftId} IS NULL OR ${table.supersedesDraftId} <> ${table.id}`
    ),
    supersedesUnique: uniqueIndex('internal_narrative_drafts_supersedes_unique')
      .on(table.supersedesDraftId)
      .where(sql`${table.supersedesDraftId} IS NOT NULL`),
  })
);

/**
 * DORMANT until PLAN_61 Task 19. Generated output is a structured list of claims,
 * never an untraceable text blob. Each source is a typed nullable FK column with an
 * exactly-one-target CHECK -- the separate claim-sources table is deliberately
 * collapsed (defect D36). A claim needing multiple sources is split into multiple
 * claims. User commentary may be uncited but is explicitly labelled.
 */
export const internalNarrativeClaims = pgTable(
  'internal_narrative_claims',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    narrativeDraftId: integer('narrative_draft_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    marker: text('marker').notNull(),
    body: text('body').notNull(),
    authorship: varchar('authorship', { length: 32 })
      .notNull()
      .$type<'generated' | 'user_authored_commentary'>(),
    sourceFactsSnapshotId: integer('source_facts_snapshot_id'),
    sourceFundSnapshotId: integer('source_fund_snapshot_id'),
    sourceObservationId: integer('source_observation_id'),
    sourceAnalysisReferenceId: integer('source_analysis_reference_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_narrative_claims_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    draftFundFk: foreignKey({
      columns: [table.narrativeDraftId, table.fundId],
      foreignColumns: [internalNarrativeDrafts.id, internalNarrativeDrafts.fundId],
      name: 'internal_narrative_claims_draft_fund_fk',
    }).onDelete('cascade'),
    sourceFactsSnapshotFundFk: foreignKey({
      columns: [table.sourceFactsSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'internal_narrative_claims_source_facts_snapshot_fund_fk',
    }),
    sourceFundSnapshotFk: foreignKey({
      columns: [table.sourceFundSnapshotId],
      foreignColumns: [fundSnapshots.id],
      name: 'internal_narrative_claims_source_fund_snapshot_fk',
    }),
    sourceObservationFundFk: foreignKey({
      columns: [table.sourceObservationId, table.fundId],
      foreignColumns: [sourceObservations.id, sourceObservations.fundId],
      name: 'internal_narrative_claims_source_observation_fund_fk',
    }),
    sourceAnalysisReferenceFundFk: foreignKey({
      columns: [table.sourceAnalysisReferenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'internal_narrative_claims_source_analysis_reference_fund_fk',
    }),
    draftOrdinalUnique: unique('internal_narrative_claims_draft_ordinal_unique').on(
      table.narrativeDraftId,
      table.ordinal
    ),
    authorshipCheck: check(
      'internal_narrative_claims_authorship_check',
      sql`${table.authorship} IN ('generated','user_authored_commentary')`
    ),
    exactlyOneSourceCheck: check(
      'internal_narrative_claims_exactly_one_source_check',
      sql`num_nonnulls(${table.sourceFactsSnapshotId}, ${table.sourceFundSnapshotId}, ${table.sourceObservationId}, ${table.sourceAnalysisReferenceId}) <= 1
      AND (${table.authorship} <> 'generated' OR num_nonnulls(${table.sourceFactsSnapshotId}, ${table.sourceFundSnapshotId}, ${table.sourceObservationId}, ${table.sourceAnalysisReferenceId}) = 1)`
    ),
    draftOrdinalIdx: index('idx_internal_narrative_claims_draft_ordinal').on(
      table.narrativeDraftId,
      table.ordinal
    ),
  })
);

/** DORMANT until PLAN_61 Task 19. Append-only: a correction supersedes, never mutates. */
export const internalAnalysisNotes = pgTable(
  'internal_analysis_notes',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    analysisDraftId: integer('analysis_draft_id'),
    analysisReferenceId: integer('analysis_reference_id'),
    body: text('body').notNull(),
    supersedesNoteId: integer('supersedes_note_id'),
    createdBy: integer('created_by'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'internal_analysis_notes_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    analysisDraftFundFk: foreignKey({
      columns: [table.analysisDraftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'internal_analysis_notes_analysis_draft_fund_fk',
    }),
    analysisReferenceFundFk: foreignKey({
      columns: [table.analysisReferenceId, table.fundId],
      foreignColumns: [internalAnalysisReferences.id, internalAnalysisReferences.fundId],
      name: 'internal_analysis_notes_analysis_reference_fund_fk',
    }),
    supersedesFundFk: foreignKey({
      columns: [table.supersedesNoteId, table.fundId],
      foreignColumns: [table.id, table.fundId],
      name: 'internal_analysis_notes_supersedes_fund_fk',
    }),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'internal_analysis_notes_created_by_fk',
    }),
    idFundUnique: unique('internal_analysis_notes_id_fund_unique').on(table.id, table.fundId),
    fundIdempotencyUnique: unique('internal_analysis_notes_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    anchorCheck: check(
      'internal_analysis_notes_anchor_check',
      sql`num_nonnulls(${table.analysisDraftId}, ${table.analysisReferenceId}) = 1`
    ),
    noSelfSupersedeCheck: check(
      'internal_analysis_notes_no_self_supersede_check',
      sql`${table.supersedesNoteId} IS NULL OR ${table.supersedesNoteId} <> ${table.id}`
    ),
    supersedesUnique: uniqueIndex('internal_analysis_notes_supersedes_unique')
      .on(table.supersedesNoteId)
      .where(sql`${table.supersedesNoteId} IS NOT NULL`),
  })
);

export type InternalAnalysisDraftRow = typeof internalAnalysisDrafts.$inferSelect;
export type InsertInternalAnalysisDraftRow = typeof internalAnalysisDrafts.$inferInsert;
export type InternalAnalysisReferenceRow = typeof internalAnalysisReferences.$inferSelect;
export type InsertInternalAnalysisReferenceRow = typeof internalAnalysisReferences.$inferInsert;
export type InternalAnalysisRevisionEventRow = typeof internalAnalysisRevisionEvents.$inferSelect;
export type InsertInternalAnalysisRevisionEventRow =
  typeof internalAnalysisRevisionEvents.$inferInsert;
export type InternalNarrativeDraftRow = typeof internalNarrativeDrafts.$inferSelect;
export type InsertInternalNarrativeDraftRow = typeof internalNarrativeDrafts.$inferInsert;
export type InternalNarrativeClaimRow = typeof internalNarrativeClaims.$inferSelect;
export type InsertInternalNarrativeClaimRow = typeof internalNarrativeClaims.$inferInsert;
export type InternalAnalysisNoteRow = typeof internalAnalysisNotes.$inferSelect;
export type InsertInternalAnalysisNoteRow = typeof internalAnalysisNotes.$inferInsert;
