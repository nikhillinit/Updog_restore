/**
 * Trust-Spine PR4 migration 0047 parity.
 *
 * This locks the public schema seam: fail-closed analysis economics ownership,
 * task evidence target coupling, and catalog names shared by SQL, Drizzle, and
 * the production-schema manifest.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import {
  internalAnalysisDrafts,
  internalAnalysisReferences,
} from '@shared/schema/internal-analysis';
import { taskEvidenceLinks, tasks } from '@shared/schema/operating-objects';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'migrations',
  '0047_internal_economics_linkage.sql'
);
const migrationSql = () => fs.readFileSync(MIGRATION_PATH, 'utf8');

function firstExecutableMigrationStatement(sql: string): string {
  return sql
    .split('--> statement-breakpoint')[0]!
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

const draftConfig = getTableConfig(internalAnalysisDrafts);
const referenceConfig = getTableConfig(internalAnalysisReferences);
const taskConfig = getTableConfig(tasks);
const evidenceConfig = getTableConfig(taskEvidenceLinks);
const dialect = new PgDialect();
type LinkageTableConfig =
  | typeof draftConfig
  | typeof referenceConfig
  | typeof taskConfig
  | typeof evidenceConfig;

function constraintNames(config: LinkageTableConfig): string[] {
  return [
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.name ?? ''),
    ...config.checks.map((constraint) => constraint.name),
  ];
}

function checkSql(checkName: string): string {
  const check = evidenceConfig.checks.find((candidate) => candidate.name === checkName);
  if (!check) {
    throw new Error(`Missing CHECK ${checkName}`);
  }
  return dialect.sqlToQuery(check.value).sql;
}

function foreignKey(config: LinkageTableConfig, name: string) {
  const value = config.foreignKeys.find((candidate) => candidate.getName() === name);
  if (!value) {
    throw new Error(`Missing FK ${name}`);
  }
  return value;
}

describe('internal economics linkage Drizzle schema (0047)', () => {
  it('exports task evidence through the runtime schema barrel', () => {
    expect(runtimeSchema.taskEvidenceLinks).toBe(taskEvidenceLinks);
    expect(evidenceConfig.name).toBe('task_evidence_links');
  });

  it('matches migration 0047 task-evidence columns and constraint names', () => {
    expect(evidenceConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'task_id',
      'target_kind',
      'analysis_reference_id',
      'economics_run_id',
      'idempotency_key',
      'request_hash',
      'created_by',
      'created_at',
    ]);
    expect(constraintNames(evidenceConfig).sort()).toEqual(
      [
        'task_evidence_links_fund_id_funds_id_fk',
        'task_evidence_links_task_fund_fk',
        'task_evidence_links_analysis_reference_fund_fk',
        'task_evidence_links_economics_run_fund_fk',
        'task_evidence_links_created_by_fk',
        'task_evidence_links_fund_task_idempotency_unique',
        'task_evidence_links_target_kind_check',
        'task_evidence_links_target_coupling_check',
      ].sort()
    );

    const sql = migrationSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "task_evidence_links"');
    for (const column of evidenceConfig.columns) {
      expect(sql, `${column.name} missing from 0047`).toContain(`"${column.name}"`);
    }
    for (const constraint of constraintNames(evidenceConfig)) {
      expect(sql, `${constraint} missing from 0047`).toContain(`"${constraint}"`);
    }
  });

  it('fund-scopes every linkage FK and preserves exact delete actions', () => {
    expect(
      foreignKey(draftConfig, 'internal_analysis_drafts_economics_reference_fund_fk').onDelete
    ).toBe('restrict');
    expect(
      foreignKey(referenceConfig, 'internal_analysis_references_economics_reference_fund_fk')
        .onDelete
    ).toBe('restrict');

    expect(foreignKey(evidenceConfig, 'task_evidence_links_fund_id_funds_id_fk').onDelete).toBe(
      'cascade'
    );
    expect(foreignKey(evidenceConfig, 'task_evidence_links_task_fund_fk').onDelete).toBe(
      'cascade'
    );
    expect(
      foreignKey(evidenceConfig, 'task_evidence_links_analysis_reference_fund_fk').onDelete
    ).toBe('restrict');
    expect(
      foreignKey(evidenceConfig, 'task_evidence_links_economics_run_fund_fk').onDelete
    ).toBe('restrict');
    expect(foreignKey(evidenceConfig, 'task_evidence_links_created_by_fk').onDelete).toBe(
      'no action'
    );
  });

  it('uses composite unique constraints for all composite FK targets', () => {
    expect(constraintNames(taskConfig)).toContain('tasks_id_fund_unique');
    expect(taskConfig.indexes.map((index) => index.config.name)).not.toContain('tasks_id_fund_unique');
    expect(
      taskConfig.uniqueConstraints
        .find((constraint) => constraint.name === 'tasks_id_fund_unique')
        ?.columns.map((column) => column.name)
    ).toEqual(['id', 'fund_id']);
  });

  it('admits exactly one target matching its target kind and carries the ordered list index', () => {
    const targetKind = checkSql('task_evidence_links_target_kind_check');
    expect(targetKind).toContain("IN ('analysis_reference','internal_economics_run')");

    const coupling = checkSql('task_evidence_links_target_coupling_check');
    expect(coupling).toContain("'analysis_reference'");
    expect(coupling).toContain("'internal_economics_run'");
    expect(coupling).toContain('"task_evidence_links"."analysis_reference_id" IS NOT NULL');
    expect(coupling).toContain('"task_evidence_links"."economics_run_id" IS NOT NULL');
    expect(coupling).toContain('"task_evidence_links"."analysis_reference_id" IS NULL');
    expect(coupling).toContain('"task_evidence_links"."economics_run_id" IS NULL');

    const orderedIndex = evidenceConfig.indexes.find(
      (index) => index.config.name === 'idx_task_evidence_links_fund_task_id'
    );
    expect(orderedIndex?.config.columns.map((column) => column.name)).toEqual([
      'fund_id',
      'task_id',
      'id',
    ]);
  });

  it('pins a lock-first migrator-owned transaction and update-only immutability trigger', () => {
    const sql = migrationSql();
    const lock = sql.indexOf('LOCK TABLE');
    const preflight = sql.indexOf('internal_economics_linkage_preflight_failed');
    const partialCatalog = sql.indexOf('internal_economics_linkage_partial_catalog_state');
    const partialTaskEvidence = sql.indexOf(
      'internal_economics_linkage_partial_task_evidence_state'
    );
    const create = sql.indexOf('CREATE TABLE IF NOT EXISTS "task_evidence_links"');

    expect(sql).toMatch(/^--\s+@drift-patch\b/m);
    expect(sql).toMatch(/^--\s+Reason:\s+\S/m);
    expect(firstExecutableMigrationStatement(sql)).toMatch(/^LOCK TABLE/);
    expect(sql).not.toMatch(/^\s*(?:BEGIN|COMMIT);\s*$/m);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(lock);
    expect(partialCatalog).toBeGreaterThan(lock);
    expect(partialTaskEvidence).toBeGreaterThan(preflight);
    expect(create).toBeGreaterThan(partialTaskEvidence);
    expect(sql).toContain('pg_get_constraintdef');
    expect(sql).toContain('pg_get_serial_sequence');
    expect(sql).toMatch(
      /column_catalog\.column_default IS DISTINCT FROM\s+'nextval\(''task_evidence_links_id_seq''::regclass\)'/
    );
    expect(sql).toMatch(
      /pg_get_serial_sequence\('public\.task_evidence_links', 'id'\)\s+IS DISTINCT FROM 'public\.task_evidence_links_id_seq'/
    );
    expect(sql).not.toContain("column_catalog.column_default NOT LIKE 'nextval(%'");
    expect(sql).toContain('missing, extra, or mismatched required columns');
    expect(sql).toContain('FROM required_column');
    expect(sql).toContain('FROM required_constraint');
    expect(sql).toContain(
      'core 0047 structural objects must be all absent or all present before replay'
    );
    expect(sql).toContain('CREATE TRIGGER "task_evidence_links_forbid_update_trigger"');
    expect(sql).toContain('BEFORE UPDATE ON "task_evidence_links"');
    expect(sql).toContain('EXECUTE FUNCTION "internal_economics_forbid_update"()');
    expect(sql).not.toContain('BEFORE DELETE ON "task_evidence_links"');
  });
});
