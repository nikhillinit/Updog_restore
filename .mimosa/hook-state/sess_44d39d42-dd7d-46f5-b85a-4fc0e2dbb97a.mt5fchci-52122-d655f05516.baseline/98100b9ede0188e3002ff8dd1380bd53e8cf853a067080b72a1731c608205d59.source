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
import { tasks } from './operating-objects';
import { portfolioCompanies } from './portfolio';
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

export const quarterlyReviewRosters = pgTable(
  'quarterly_review_rosters',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    analysisDraftId: integer('analysis_draft_id').notNull(),
    draftVersion: integer('draft_version').notNull(),
    financialFactsSnapshotId: integer('financial_facts_snapshot_id').notNull(),
    companyCount: integer('company_count').notNull(),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'quarterly_review_rosters_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    draftFundFk: foreignKey({
      columns: [table.analysisDraftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'quarterly_review_rosters_draft_fund_fk',
    }).onDelete('cascade'),
    factsFundFk: foreignKey({
      columns: [table.financialFactsSnapshotId, table.fundId],
      foreignColumns: [financialFactsSnapshots.id, financialFactsSnapshots.fundId],
      name: 'quarterly_review_rosters_facts_fund_fk',
    }).onDelete('restrict'),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'quarterly_review_rosters_created_by_fk',
    }).onDelete('restrict'),
    idFundUnique: unique('quarterly_review_rosters_id_fund_unique').on(table.id, table.fundId),
    exactBasisUnique: unique('quarterly_review_rosters_exact_basis_unique').on(
      table.analysisDraftId,
      table.draftVersion,
      table.financialFactsSnapshotId
    ),
    companyCountCheck: check(
      'quarterly_review_rosters_company_count_check',
      sql`${table.companyCount} >= 0`
    ),
  })
);

export const quarterlyReviewCompanies = pgTable(
  'quarterly_review_companies',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    quarterlyReviewRosterId: integer('quarterly_review_roster_id').notNull(),
    portfolioCompanyId: integer('portfolio_company_id').notNull(),
    waivedAt: timestamp('waived_at', { withTimezone: true }),
    waivedBy: integer('waived_by'),
    waiverReason: text('waiver_reason'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'quarterly_review_companies_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    rosterFundFk: foreignKey({
      columns: [table.quarterlyReviewRosterId, table.fundId],
      foreignColumns: [quarterlyReviewRosters.id, quarterlyReviewRosters.fundId],
      name: 'quarterly_review_companies_roster_fund_fk',
    }).onDelete('cascade'),
    portfolioCompanyFundFk: foreignKey({
      columns: [table.portfolioCompanyId, table.fundId],
      foreignColumns: [portfolioCompanies.id, portfolioCompanies.fundId],
      name: 'quarterly_review_companies_portfolio_company_fund_fk',
    }).onDelete('restrict'),
    waivedByFk: foreignKey({
      columns: [table.waivedBy],
      foreignColumns: [users.id],
      name: 'quarterly_review_companies_waived_by_fk',
    }).onDelete('restrict'),
    idFundUnique: unique('quarterly_review_companies_id_fund_unique').on(table.id, table.fundId),
    rosterCompanyUnique: unique('quarterly_review_companies_roster_company_unique').on(
      table.quarterlyReviewRosterId,
      table.portfolioCompanyId
    ),
    waiverCouplingCheck: check(
      'quarterly_review_companies_waiver_coupling_check',
      sql`(num_nonnulls(${table.waivedAt}, ${table.waivedBy}, ${table.waiverReason}) = 0) OR (num_nonnulls(${table.waivedAt}, ${table.waivedBy}, ${table.waiverReason}) = 3 AND length(btrim(${table.waiverReason})) > 0)`
    ),
    versionCheck: check('quarterly_review_companies_version_check', sql`${table.version} >= 1`),
  })
);

export const quarterlyReviewItems = pgTable(
  'quarterly_review_items',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    quarterlyReviewCompanyId: integer('quarterly_review_company_id').notNull(),
    category: varchar('category', { length: 32 }).notNull(),
    state: varchar('state', { length: 24 }).notNull().default('pending'),
    note: text('note'),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    changeRefKind: varchar('change_ref_kind', { length: 32 }),
    changeRefPath: varchar('change_ref_path', { length: 512 }),
    changeRefLabel: varchar('change_ref_label', { length: 120 }),
    followUpTaskId: integer('follow_up_task_id'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fundFk: foreignKey({
      columns: [table.fundId],
      foreignColumns: [funds.id],
      name: 'quarterly_review_items_fund_id_funds_id_fk',
    }).onDelete('cascade'),
    companyFundFk: foreignKey({
      columns: [table.quarterlyReviewCompanyId, table.fundId],
      foreignColumns: [quarterlyReviewCompanies.id, quarterlyReviewCompanies.fundId],
      name: 'quarterly_review_items_company_fund_fk',
    }).onDelete('cascade'),
    reviewedByFk: foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: 'quarterly_review_items_reviewed_by_fk',
    }).onDelete('restrict'),
    followUpTaskFundFk: foreignKey({
      columns: [table.followUpTaskId, table.fundId],
      foreignColumns: [tasks.id, tasks.fundId],
      name: 'quarterly_review_items_follow_up_task_fund_fk',
    }).onDelete('restrict'),
    companyCategoryUnique: unique('quarterly_review_items_company_category_unique').on(
      table.quarterlyReviewCompanyId,
      table.category
    ),
    categoryCheck: check(
      'quarterly_review_items_category_check',
      sql`${table.category} IN ('cases_probabilities','kpis','valuation_fmv','reserve_plan','qualitative_risks')`
    ),
    stateCheck: check(
      'quarterly_review_items_state_check',
      sql`${table.state} IN ('pending','changed','reviewed_no_change')`
    ),
    stateCouplingCheck: check(
      'quarterly_review_items_state_coupling_check',
      sql`(${table.state} = 'pending' AND num_nonnulls(${table.note}, ${table.reviewedBy}, ${table.reviewedAt}, ${table.changeRefKind}, ${table.changeRefPath}, ${table.changeRefLabel}, ${table.followUpTaskId}) = 0) OR (${table.state} = 'reviewed_no_change' AND ${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0 AND ${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND num_nonnulls(${table.changeRefKind}, ${table.changeRefPath}, ${table.changeRefLabel}, ${table.followUpTaskId}) = 0) OR (${table.state} = 'changed' AND ${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0 AND ${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND ${table.changeRefKind} IS NOT NULL AND ${table.changeRefKind} = 'internal_route' AND ${table.changeRefPath} IS NOT NULL AND ${table.changeRefLabel} IS NOT NULL)`
    ),
    versionCheck: check('quarterly_review_items_version_check', sql`${table.version} >= 1`),
  })
);

export const quarterlyReviewCommandReceipts = pgTable(
  'quarterly_review_command_receipts',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id').notNull(),
    analysisDraftId: integer('analysis_draft_id').notNull(),
    rosterId: integer('roster_id').notNull(),
    operation: varchar('operation', { length: 40 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status').notNull(),
    resultKind: varchar('result_kind', { length: 16 }).notNull(),
    resultItemId: integer('result_item_id'),
    resultCompanyId: integer('result_company_id'),
    resultReferenceId: integer('result_reference_id'),
    resultDraftVersion: integer('result_draft_version'),
    resultRowVersion: integer('result_row_version'),
    actorId: integer('actor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    draftFundFk: foreignKey({
      columns: [table.analysisDraftId, table.fundId],
      foreignColumns: [internalAnalysisDrafts.id, internalAnalysisDrafts.fundId],
      name: 'quarterly_review_command_receipts_draft_fund_fk',
    }).onDelete('cascade'),
    rosterFundFk: foreignKey({
      columns: [table.rosterId, table.fundId],
      foreignColumns: [quarterlyReviewRosters.id, quarterlyReviewRosters.fundId],
      name: 'quarterly_review_command_receipts_roster_fund_fk',
    }).onDelete('cascade'),
    actorFk: foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: 'quarterly_review_command_receipts_actor_fk',
    }).onDelete('restrict'),
    fundIdempotencyUnique: unique('quarterly_review_command_receipts_fund_idempotency_unique').on(
      table.fundId,
      table.idempotencyKey
    ),
    operationCheck: check(
      'quarterly_review_command_receipts_operation_check',
      sql`${table.operation} IN ('draft_refresh','economics_reference_replace','review_item_update','company_waive','draft_save')`
    ),
    resultCouplingCheck: check(
      'quarterly_review_command_receipts_result_coupling_check',
      sql`(${table.operation} IN ('draft_refresh','economics_reference_replace') AND ${table.resultKind} = 'draft' AND ${table.responseStatus} = 200 AND ${table.resultDraftVersion} IS NOT NULL AND num_nonnulls(${table.resultItemId}, ${table.resultCompanyId}, ${table.resultReferenceId}, ${table.resultRowVersion}) = 0) OR (${table.operation} = 'review_item_update' AND ${table.resultKind} = 'item' AND ${table.responseStatus} = 200 AND ${table.resultItemId} IS NOT NULL AND ${table.resultRowVersion} IS NOT NULL AND num_nonnulls(${table.resultCompanyId}, ${table.resultReferenceId}, ${table.resultDraftVersion}) = 0) OR (${table.operation} = 'company_waive' AND ${table.resultKind} = 'company' AND ${table.responseStatus} = 200 AND ${table.resultCompanyId} IS NOT NULL AND ${table.resultRowVersion} IS NOT NULL AND num_nonnulls(${table.resultItemId}, ${table.resultReferenceId}, ${table.resultDraftVersion}) = 0) OR (${table.operation} = 'draft_save' AND ${table.resultKind} = 'reference' AND ${table.responseStatus} = 201 AND ${table.resultReferenceId} IS NOT NULL AND num_nonnulls(${table.resultItemId}, ${table.resultCompanyId}, ${table.resultDraftVersion}, ${table.resultRowVersion}) = 0)`
    ),
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
export type QuarterlyReviewRosterRow = typeof quarterlyReviewRosters.$inferSelect;
export type QuarterlyReviewCompanyRow = typeof quarterlyReviewCompanies.$inferSelect;
export type QuarterlyReviewItemRow = typeof quarterlyReviewItems.$inferSelect;
export type QuarterlyReviewCommandReceiptRow = typeof quarterlyReviewCommandReceipts.$inferSelect;
