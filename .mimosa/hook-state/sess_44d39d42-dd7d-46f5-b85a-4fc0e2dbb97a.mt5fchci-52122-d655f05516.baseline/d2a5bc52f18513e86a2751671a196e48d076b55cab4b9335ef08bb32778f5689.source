import fs from 'node:fs';
import path from 'node:path';

import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import * as runtimeSchemaIndex from '@shared/schema/index';
import {
  quarterlyReviewCommandReceipts,
  quarterlyReviewCompanies,
  quarterlyReviewItems,
  quarterlyReviewRosters,
} from '@shared/schema/internal-analysis';
import { portfolioCompanies } from '@shared/schema/portfolio';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/0048_quarterly_review_workflow.sql'),
  'utf8'
);

const configs = [
  getTableConfig(quarterlyReviewRosters),
  getTableConfig(quarterlyReviewCompanies),
  getTableConfig(quarterlyReviewItems),
  getTableConfig(quarterlyReviewCommandReceipts),
];
const dialect = new PgDialect();

describe('quarterly review schema', () => {
  it('exports all tables and portfolio composite identity', () => {
    expect(runtimeSchema.quarterlyReviewRosters).toBe(quarterlyReviewRosters);
    expect(runtimeSchemaIndex.quarterlyReviewRosters).toBe(quarterlyReviewRosters);
    expect(configs.map((config) => config.name)).toEqual([
      'quarterly_review_rosters',
      'quarterly_review_companies',
      'quarterly_review_items',
      'quarterly_review_command_receipts',
    ]);
    expect(
      getTableConfig(portfolioCompanies).uniqueConstraints.map((constraint) => constraint.name)
    ).toContain('portfoliocompanies_id_fund_unique');
  });

  it('pins named parent uniques, composite foreign keys, and delete actions', () => {
    const names = configs.flatMap((config) => [
      ...config.uniqueConstraints.map((constraint) => constraint.name),
      ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
      ...config.checks.map((check) => check.name),
    ]);
    for (const required of [
      'quarterly_review_rosters_id_fund_unique',
      'quarterly_review_rosters_exact_basis_unique',
      'quarterly_review_rosters_draft_fund_fk',
      'quarterly_review_rosters_facts_fund_fk',
      'quarterly_review_companies_id_fund_unique',
      'quarterly_review_companies_roster_fund_fk',
      'quarterly_review_companies_portfolio_company_fund_fk',
      'quarterly_review_items_company_fund_fk',
      'quarterly_review_items_follow_up_task_fund_fk',
      'quarterly_review_items_state_coupling_check',
      'quarterly_review_command_receipts_draft_fund_fk',
      'quarterly_review_command_receipts_roster_fund_fk',
      'quarterly_review_command_receipts_result_coupling_check',
    ]) {
      expect(names).toContain(required);
      expect(migration).toContain(`"${required}"`);
    }

    const rosterFks = configs[0]!.foreignKeys;
    expect(
      rosterFks.find((fk) => fk.getName() === 'quarterly_review_rosters_draft_fund_fk')?.onDelete
    ).toBe('cascade');
    expect(
      rosterFks.find((fk) => fk.getName() === 'quarterly_review_rosters_facts_fund_fk')?.onDelete
    ).toBe('restrict');
  });

  it('is journaled once and contains no existing-draft backfill', () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'migrations/meta/_journal.json'), 'utf8')
    ) as { entries: Array<{ tag: string }> };
    expect(
      journal.entries.filter(({ tag }) => tag === '0048_quarterly_review_workflow')
    ).toHaveLength(1);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"quarterly_review_rosters"\s+SELECT/i);
    expect(migration).toContain('quarterly_review_command_receipts_forbid_update');
  });

  it('refuses a partial table bundle before idempotent DDL replay', () => {
    expect(migration).toContain('quarterly_review_table_bundle_count');
    expect(migration).toContain('quarterly_review_partial_catalog: expected all four tables');
  });

  it('permits system-created rosters without weakening command actor identity', () => {
    const rosterConfig = configs[0]!;
    const receiptConfig = configs[3]!;
    expect(rosterConfig.columns.find((column) => column.name === 'created_by')?.notNull).toBe(
      false
    );
    expect(receiptConfig.columns.find((column) => column.name === 'actor_id')?.notNull).toBe(true);
    expect(migration).toMatch(/"created_by" integer,\s*\n\s*"created_at"/);
    expect(migration).toContain(
      '"quarterly_review_rosters_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT'
    );
  });

  it('requires non-null internal-route fields for changed items', () => {
    const stateCheck = configs[2]!.checks.find(
      (candidate) => candidate.name === 'quarterly_review_items_state_coupling_check'
    );
    expect(stateCheck).toBeDefined();
    const drizzleCheck = dialect.sqlToQuery(stateCheck!.value).sql;
    expect(drizzleCheck).toContain('change_ref_kind" IS NOT NULL');
    expect(drizzleCheck).toContain('change_ref_path" IS NOT NULL');
    expect(drizzleCheck).toContain('change_ref_label" IS NOT NULL');
    expect(migration).toMatch(
      /"change_ref_kind" IS NOT NULL\s+AND "change_ref_kind" = 'internal_route'/
    );
  });

  it('validates exact all-present catalog semantics before replay', () => {
    expect(migration).toContain('quarterly_review_invalid_columns');
    expect(migration).toContain('quarterly_review_invalid_constraints');
    expect(migration).toContain('pg_get_constraintdef');
    expect(migration).toContain('quarterly_review_all_present_catalog_drift');
    for (const config of configs) {
      for (const constraint of [
        ...config.uniqueConstraints.map((value) => value.name),
        ...config.foreignKeys.map((value) => value.getName()),
        ...config.checks.map((value) => value.name),
      ]) {
        expect(migration).toContain(`('${config.name}', '${constraint}'`);
      }
    }
  });

  it('validates immutable receipt trigger on its target relation', () => {
    expect(migration).toContain("tgrelid = 'public.quarterly_review_command_receipts'::regclass");
    expect(migration).toContain("receipt_trigger_enabled IS DISTINCT FROM 'O'");
    expect(migration).toContain('pg_get_triggerdef');
    expect(migration).toContain('quarterly_review_receipt_trigger_drift');
  });

  it('pins every quarterly-review manifest constraint definition exactly', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'scripts/prod-schema-manifests/25-quarterly-review-workflow.json'),
        'utf8'
      )
    ) as {
      expectedTables: Array<{
        constraints?: string[];
        constraintDefinitions?: Array<{
          name: string;
          expectedDefinition: { exactDefinition?: string };
        }>;
      }>;
    };
    for (const table of manifest.expectedTables) {
      expect(table.constraintDefinitions?.map(({ name }) => name).sort()).toEqual(
        [...(table.constraints ?? [])].sort()
      );
      expect(
        table.constraintDefinitions?.every(
          ({ expectedDefinition }) => expectedDefinition.exactDefinition !== undefined
        )
      ).toBe(true);
    }
  });
});
