/**
 * T-A4 (WP-L3 Phase A): Drizzle parity for migration 0045.
 *
 * The schema module `shared/schema/internal-economics.ts` must match
 * `migrations/0045_internal_economics_policy_runs.sql` name-for-name so the
 * journaled migration and a Drizzle push produce byte-identical catalogs (G5
 * idiom). Composite-FK targets are declared as plain `unique()` constraints,
 * never `uniqueIndex` (drizzle-kit 42830 lesson); the ONE partial unique
 * (`internal_lp_economics_runs_result_snapshot_unique`) is correctly a
 * `uniqueIndex().where(...)` because nothing FKs it.
 */
// Default import on purpose: node-setup.ts vi.mock('fs') stubs named exports,
// while its actual-module spread preserves `default` as the real fs module.
import fs from 'node:fs';
import path from 'node:path';

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import { fundSnapshots } from '@shared/schema/fund';
import {
  internalCapitalEnvelopeVersions,
  internalEconomicsPolicyVersions,
  internalLpEconomicsRuns,
} from '@shared/schema/internal-economics';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'migrations',
  '0045_internal_economics_policy_runs.sql'
);

const tableEntries = [
  ['internal_capital_envelope_versions', internalCapitalEnvelopeVersions],
  ['internal_economics_policy_versions', internalEconomicsPolicyVersions],
  ['internal_lp_economics_runs', internalLpEconomicsRuns],
] as const;

type OwnedTableName = (typeof tableEntries)[number][0];

const tableConfigs = new Map(
  tableEntries.map(([name, table]) => [name, getTableConfig(table)] as const)
);
const dialect = new PgDialect();

function configFor(tableName: OwnedTableName) {
  const config = tableConfigs.get(tableName);
  if (!config) {
    throw new Error(`Missing table config: ${tableName}`);
  }
  return config;
}

function constraintNames(tableName: OwnedTableName): string[] {
  const config = configFor(tableName);
  return [
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.name ?? ''),
    ...config.checks.map((constraint) => constraint.name),
  ];
}

function checkSql(tableName: OwnedTableName, checkName: string): string {
  const check = configFor(tableName).checks.find((candidate) => candidate.name === checkName);
  if (!check) {
    throw new Error(`Missing CHECK ${checkName}`);
  }
  // Strip the table qualifier Drizzle renders on column refs so assertions
  // match the migration's unqualified in-table CHECK text.
  return dialect.sqlToQuery(check.value).sql.replaceAll(`"${tableName}".`, '');
}

function migrationSql(): string {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

interface MigrationTableBlock {
  readonly name: string;
  readonly body: string;
}

function migrationTableBlocks(): Map<string, MigrationTableBlock> {
  const blocks = new Map<string, MigrationTableBlock>();
  for (const match of migrationSql().matchAll(
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"([a-z0-9_]+)"\s*\(([\s\S]*?)\);/gi
  )) {
    blocks.set(match[1]!, { name: match[1]!, body: match[2]! });
  }
  return blocks;
}

function blockFor(tableName: OwnedTableName): MigrationTableBlock {
  const block = migrationTableBlocks().get(tableName);
  if (!block) {
    throw new Error(`Migration 0045 has no CREATE TABLE block for ${tableName}`);
  }
  return block;
}

function sqlConstraintNames(tableName: OwnedTableName): string[] {
  return [...blockFor(tableName).body.matchAll(/CONSTRAINT\s+"([a-z0-9_]+)"/g)].map(
    (match) => match[1]!
  );
}

function sqlColumnNames(tableName: OwnedTableName): string[] {
  return [...blockFor(tableName).body.matchAll(/^\s{2}"([a-z0-9_]+)"\s/gm)].map(
    (match) => match[1]!
  );
}

function normalizeTypeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(\s*/g, '(')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\)/g, ')');
}

describe('internal economics Drizzle schema (T-A4)', () => {
  it('exports all three tables through the runtime schema barrel', () => {
    expect(runtimeSchema.internalCapitalEnvelopeVersions).toBe(internalCapitalEnvelopeVersions);
    expect(runtimeSchema.internalEconomicsPolicyVersions).toBe(internalEconomicsPolicyVersions);
    expect(runtimeSchema.internalLpEconomicsRuns).toBe(internalLpEconomicsRuns);
  });

  it('matches migration 0045 constraint names exactly, per table, both directions', () => {
    for (const [tableName] of tableEntries) {
      const declared = [...constraintNames(tableName)].sort();
      const journaled = [...sqlConstraintNames(tableName)].sort();
      expect(declared, `${tableName} constraint drift`).toEqual(journaled);
    }
  });

  it('matches migration 0045 column names exactly, per table, both directions', () => {
    for (const [tableName] of tableEntries) {
      const declared = configFor(tableName)
        .columns.map((column) => column.name)
        .sort();
      const journaled = [...sqlColumnNames(tableName)].sort();
      expect(declared, `${tableName} column drift`).toEqual(journaled);
    }
  });

  it('declares every column with the exact journaled SQL type', () => {
    for (const [tableName] of tableEntries) {
      const body = normalizeTypeText(blockFor(tableName).body);
      for (const column of configFor(tableName).columns) {
        const sqlType = normalizeTypeText(column.getSQLType());
        expect(body, `${tableName}.${column.name} type drift`).toContain(
          `"${column.name}" ${sqlType}`
        );
      }
    }
  });

  it('fund-scopes every table with a required cascading fund FK', () => {
    for (const [tableName] of tableEntries) {
      const config = configFor(tableName);
      const fundId = config.columns.find((column) => column.name === 'fund_id');
      const fundFk = config.foreignKeys.find((foreignKey) =>
        foreignKey.getName().endsWith('_fund_id_funds_id_fk')
      );

      expect(fundId?.notNull, `${tableName}.fund_id`).toBe(true);
      expect(fundFk, `${tableName} fund FK`).toBeDefined();
      expect(fundFk?.onDelete, `${tableName} fund FK delete action`).toBe('cascade');
    }
  });

  it('declares every basis-version FK as ON DELETE restrict (L3-Q2 ruling)', () => {
    const restrictFksByTable = {
      internal_capital_envelope_versions: [
        'internal_capital_envelope_versions_vehicle_fund_fk',
        'internal_capital_envelope_versions_source_artifact_fund_fk',
      ],
      internal_economics_policy_versions: ['internal_economics_policy_versions_envelope_fund_fk'],
      internal_lp_economics_runs: [
        'internal_lp_economics_runs_policy_version_fund_fk',
        'internal_lp_economics_runs_facts_snapshot_fund_fk',
        'internal_lp_economics_runs_plan_version_fk',
        'internal_lp_economics_runs_forecast_snapshot_type_fk',
        'internal_lp_economics_runs_result_snapshot_type_fk',
      ],
    } as const;

    for (const [tableName, names] of Object.entries(restrictFksByTable)) {
      const foreignKeys = configFor(tableName as OwnedTableName).foreignKeys;
      for (const name of names) {
        const foreignKey = foreignKeys.find((candidate) => candidate.getName() === name);
        expect(foreignKey, name).toBeDefined();
        expect(foreignKey?.onDelete, `${name} delete action`).toBe('restrict');
      }
    }
  });

  it('keeps version-lineage self-FKs at NO ACTION, not restrict', () => {
    const parentFks = [
      ['internal_capital_envelope_versions', 'internal_capital_envelope_versions_parent_fund_fk'],
      ['internal_economics_policy_versions', 'internal_economics_policy_versions_parent_fund_fk'],
    ] as const;

    for (const [tableName, name] of parentFks) {
      const foreignKey = configFor(tableName).foreignKeys.find(
        (candidate) => candidate.getName() === name
      );
      expect(foreignKey, name).toBeDefined();
      expect(foreignKey?.onDelete ?? 'no action', `${name} delete action`).toBe('no action');
    }
  });

  it('declares composite-FK targets as unique() constraints, never uniqueIndex (42830)', () => {
    for (const [tableName] of tableEntries) {
      const config = configFor(tableName);
      const uniqueNames = config.uniqueConstraints.map((constraint) => constraint.name);
      expect(uniqueNames).toContain(`${tableName}_id_fund_unique`);
      expect(uniqueNames).toContain(`${tableName}_fund_idempotency_unique`);
      const indexNames = config.indexes.map((index) => index.config.name);
      expect(indexNames).not.toContain(`${tableName}_id_fund_unique`);
    }
    expect(
      configFor('internal_capital_envelope_versions').uniqueConstraints.map((c) => c.name)
    ).toContain('internal_capital_envelope_versions_fund_version_unique');
    expect(
      configFor('internal_economics_policy_versions').uniqueConstraints.map((c) => c.name)
    ).toContain('internal_economics_policy_versions_fund_version_unique');
  });

  it('declares the one-result-snapshot-per-run rule as a partial uniqueIndex', () => {
    const config = configFor('internal_lp_economics_runs');
    const partial = config.indexes.find(
      (index) => index.config.name === 'internal_lp_economics_runs_result_snapshot_unique'
    );
    expect(partial).toBeDefined();
    expect(partial?.config.unique).toBe(true);
    expect(partial?.config.where).toBeDefined();
    expect(config.indexes.map((index) => index.config.name)).toContain(
      'idx_internal_lp_economics_runs_fund_created'
    );
  });

  it('adds fund_snapshots_id_type_unique to fund_snapshots as a unique() constraint', () => {
    const config = getTableConfig(fundSnapshots);
    const unique = config.uniqueConstraints.find(
      (constraint) => constraint.name === 'fund_snapshots_id_type_unique'
    );
    expect(unique).toBeDefined();
    expect(unique?.columns.map((column) => column.name)).toEqual(['id', 'type']);
    expect(config.indexes.map((index) => index.config.name)).not.toContain(
      'fund_snapshots_id_type_unique'
    );
    expect(migrationSql()).toContain(
      'ADD CONSTRAINT "fund_snapshots_id_type_unique" UNIQUE ("id", "type")'
    );
  });

  it('pins the P-D5 state-coupling and literal CHECK vocabularies', () => {
    const coupling = checkSql(
      'internal_lp_economics_runs',
      'internal_lp_economics_runs_state_coupling_check'
    );
    for (const fragment of [
      "'completed'",
      "'failed'",
      '"result_snapshot_id" is not null',
      '"result_snapshot_type" is not null',
      '"result_status" is not null',
      '"result_hash" is not null',
      '"failure_code" is null',
      '"failure_context" is null',
    ]) {
      expect(coupling.toLowerCase()).toContain(fragment);
    }

    const resultStatus = checkSql(
      'internal_lp_economics_runs',
      'internal_lp_economics_runs_result_status_check'
    );
    expect(resultStatus).toContain("'indicative'");
    expect(resultStatus).toContain("'unavailable'");
    expect(resultStatus).not.toContain("'available'");

    expect(
      checkSql('internal_lp_economics_runs', 'internal_lp_economics_runs_terminal_mode_check')
    ).toContain("'liquidate_at_horizon'");
    expect(
      checkSql(
        'internal_lp_economics_runs',
        'internal_lp_economics_runs_forecast_snapshot_type_check'
      )
    ).toContain("'CURRENT_FORECAST_V2'");
    expect(
      checkSql(
        'internal_lp_economics_runs',
        'internal_lp_economics_runs_result_snapshot_type_check'
      )
    ).toContain("'INTERNAL_LP_ECONOMICS'");

    const sum = checkSql(
      'internal_capital_envelope_versions',
      'internal_capital_envelope_versions_commitment_sum_check'
    );
    expect(sum.toLowerCase()).toContain(
      '"lp_commitment_usd" + "gp_commitment_usd" = "total_commitment_usd"'
    );
    expect(
      checkSql(
        'internal_capital_envelope_versions',
        'internal_capital_envelope_versions_currency_check'
      )
    ).toContain("'USD'");
  });

  it('matches the migration trigger and index surface by name', () => {
    const sql = migrationSql();
    for (const trigger of [
      'internal_capital_envelope_versions_forbid_update_trigger',
      'internal_economics_policy_versions_forbid_update_trigger',
      'internal_lp_economics_runs_forbid_update_trigger',
      'fund_snapshots_internal_economics_forbid_update_trigger',
    ]) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS "${trigger}"`);
      expect(sql).toContain(`CREATE TRIGGER "${trigger}"`);
    }
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "internal_economics_forbid_update"()');
    expect(sql).toContain(
      'WHEN (OLD."type" = \'INTERNAL_LP_ECONOMICS\' OR NEW."type" = \'INTERNAL_LP_ECONOMICS\')'
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "internal_lp_economics_runs_result_snapshot_unique"'
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_internal_lp_economics_runs_fund_created"'
    );
  });

  it('keeps every new identifier within the PG 63-byte limit', () => {
    const sql = migrationSql();
    const identifiers = new Set<string>();
    for (const match of sql.matchAll(/"([a-z0-9_]+)"/g)) {
      identifiers.add(match[1]!);
    }
    for (const [tableName] of tableEntries) {
      for (const name of [...constraintNames(tableName), tableName]) {
        identifiers.add(name);
      }
    }
    const overlong = [...identifiers].filter((name) => Buffer.byteLength(name, 'utf8') > 63);
    expect(overlong).toEqual([]);
  });
});
