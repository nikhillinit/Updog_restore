// Default import on purpose: node-setup.ts vi.mock('fs') stubs named exports,
// while its actual-module spread preserves `default` as the real fs module.
import fs from 'node:fs';

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  FINANCIAL_OBSERVATION_DOMAINS,
  FINANCIAL_OBSERVATION_SOURCES,
  IDENTITY_LINK_TYPES,
  IMPORT_BATCH_STATUSES,
  SOURCE_OBSERVATION_STATUSES,
} from '@shared/contracts/financial-observations/financial-observation.contract';
import {
  RECONCILIATION_CASE_STATUSES,
  RECONCILIATION_CASE_TYPES,
} from '@shared/contracts/financial-observations/reconciliation.contract';
import { FINANCIAL_FACTS_CONSUMER_KEYS } from '@shared/contracts/financial-facts-consumer-policies';
import * as runtimeSchema from '@shared/schema';
import {
  companyExternalIdentities,
  companyIdentities,
  importBatches,
  importMappingProfiles,
  portfolioCompanyIdentityLinks,
  reconciliationCases,
  sourceArtifacts,
  sourceObservations,
  workingValueSelections,
} from '@shared/schema/financial-observations';

const tableEntries = [
  ['source_artifacts', sourceArtifacts],
  ['import_mapping_profiles', importMappingProfiles],
  ['import_batches', importBatches],
  ['company_identities', companyIdentities],
  ['company_external_identities', companyExternalIdentities],
  ['portfolio_company_identity_links', portfolioCompanyIdentityLinks],
  ['source_observations', sourceObservations],
  ['reconciliation_cases', reconciliationCases],
  ['working_value_selections', workingValueSelections],
] as const;

const tableConfigs = new Map(
  tableEntries.map(([name, table]) => [name, getTableConfig(table)] as const)
);
const dialect = new PgDialect();

function configFor(tableName: (typeof tableEntries)[number][0]) {
  const config = tableConfigs.get(tableName);
  if (!config) {
    throw new Error(`Missing table config: ${tableName}`);
  }
  return config;
}

function constraintNames(tableName: (typeof tableEntries)[number][0]): string[] {
  const config = configFor(tableName);
  return [
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.name),
    ...config.checks.map((constraint) => constraint.name),
  ];
}

function indexNames(tableName: (typeof tableEntries)[number][0]): string[] {
  return configFor(tableName).indexes.map((index) => index.config.name);
}

function checkSql(tableName: (typeof tableEntries)[number][0], checkName: string): string {
  const check = configFor(tableName).checks.find((candidate) => candidate.name === checkName);
  if (!check) {
    throw new Error(`Missing CHECK ${checkName}`);
  }
  return dialect.sqlToQuery(check.value).sql;
}

function quotedValues(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

describe('financial observations Drizzle schema', () => {
  it('exports all nine tables through the runtime schema barrel', () => {
    expect(runtimeSchema.sourceArtifacts).toBe(sourceArtifacts);
    expect(runtimeSchema.importMappingProfiles).toBe(importMappingProfiles);
    expect(runtimeSchema.importBatches).toBe(importBatches);
    expect(runtimeSchema.companyIdentities).toBe(companyIdentities);
    expect(runtimeSchema.companyExternalIdentities).toBe(companyExternalIdentities);
    expect(runtimeSchema.portfolioCompanyIdentityLinks).toBe(portfolioCompanyIdentityLinks);
    expect(runtimeSchema.sourceObservations).toBe(sourceObservations);
    expect(runtimeSchema.reconciliationCases).toBe(reconciliationCases);
    expect(runtimeSchema.workingValueSelections).toBe(workingValueSelections);
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

  it('uses plain composite unique constraints as every new-table FK target', () => {
    const targetNames = [
      'source_artifacts_id_fund_unique',
      'import_mapping_profiles_id_fund_unique',
      'import_batches_id_fund_unique',
      'source_observations_id_fund_unique',
      'company_identities_id_fund_unique',
    ];
    const actualNames = tableEntries.flatMap(([tableName]) =>
      configFor(tableName).uniqueConstraints.map((constraint) => constraint.name)
    );

    expect(actualNames).toEqual(expect.arrayContaining(targetNames));
    for (const name of targetNames) {
      expect(tableEntries.flatMap(([tableName]) => indexNames(tableName))).not.toContain(name);
    }
  });

  it('pins same-fund composite FKs across the evidence graph', () => {
    const expectedByTable = {
      import_mapping_profiles: ['import_mapping_profiles_superseded_fund_fk'],
      import_batches: [
        'import_batches_source_artifact_fund_fk',
        'import_batches_mapping_profile_fund_fk',
      ],
      source_observations: [
        'source_observations_import_batch_fund_fk',
        'source_observations_source_artifact_fund_fk',
        'source_observations_mapping_profile_fund_fk',
        'source_observations_company_identity_fund_fk',
      ],
      reconciliation_cases: [
        'reconciliation_cases_import_batch_fund_fk',
        'reconciliation_cases_source_observation_fund_fk',
      ],
      working_value_selections: [
        'working_value_selections_observation_fund_fk',
        'working_value_selections_identity_fund_fk',
        'working_value_selections_superseded_fund_fk',
      ],
      company_external_identities: ['company_external_identities_identity_fund_fk'],
      portfolio_company_identity_links: ['pc_identity_links_identity_fund_fk'],
    } as const;

    for (const [tableName, names] of Object.entries(expectedByTable)) {
      expect(
        configFor(tableName as keyof typeof expectedByTable).foreignKeys.map((foreignKey) =>
          foreignKey.getName()
        )
      ).toEqual(expect.arrayContaining([...names]));
    }
  });

  it('keeps deliberate plain-FK exceptions for cross-fund merges and legacy companies', () => {
    expect(constraintNames('company_identities')).toContain('company_identities_merged_into_fk');
    expect(constraintNames('portfolio_company_identity_links')).toContain(
      'pc_identity_links_portfolio_company_fk'
    );
  });

  it('declares idempotency, accepted-head, selection-head, and identity uniqueness', () => {
    expect(constraintNames('source_artifacts')).toContain(
      'source_artifacts_fund_idempotency_unique'
    );
    expect(constraintNames('import_mapping_profiles')).toEqual(
      expect.arrayContaining([
        'import_mapping_profiles_fund_idempotency_unique',
        'import_mapping_profiles_fund_name_version_unique',
      ])
    );
    expect(constraintNames('import_batches')).toContain('import_batches_fund_idempotency_unique');
    expect(constraintNames('company_external_identities')).toContain(
      'company_external_identities_fund_system_value_unique'
    );
    expect(indexNames('import_mapping_profiles')).toContain(
      'import_mapping_profiles_fund_name_head_unique'
    );
    expect(indexNames('source_observations')).toContain(
      'source_observations_fund_hash_accepted_unique'
    );
    expect(indexNames('working_value_selections')).toContain(
      'working_value_selections_scope_head_unique'
    );
    expect(indexNames('company_identities')).toContain('company_identities_source_pc_unique');
    expect(indexNames('portfolio_company_identity_links')).toContain(
      'pc_identity_links_active_company_unique'
    );
  });

  it('pins append-only lineage and versioned supersession columns', () => {
    expect(configFor('source_observations').columns.map((column) => column.name)).not.toContain(
      'updated_at'
    );
    expect(constraintNames('import_mapping_profiles')).toContain(
      'import_mapping_profiles_superseded_fund_fk'
    );
    expect(constraintNames('working_value_selections')).toContain(
      'working_value_selections_superseded_fund_fk'
    );
    expect(
      configFor('working_value_selections').columns.find((column) => column.name === 'version')
        ?.notNull
    ).toBe(true);
  });

  it('uses required varchar(64) columns for persisted SHA-256 hashes', () => {
    const requiredHashes = {
      source_artifacts: ['payload_sha256', 'request_hash'],
      import_mapping_profiles: ['identity_semantics_hash', 'request_hash'],
      source_observations: ['observation_hash', 'candidate_fingerprint'],
    } as const;

    for (const [tableName, columnNames] of Object.entries(requiredHashes)) {
      const config = configFor(tableName as keyof typeof requiredHashes);
      for (const columnName of columnNames) {
        const column = config.columns.find((candidate) => candidate.name === columnName) as
          { notNull: boolean; length?: number } | undefined;
        expect(column?.notNull, `${tableName}.${columnName}`).toBe(true);
        expect(column?.length, `${tableName}.${columnName} length`).toBe(64);
      }
    }
  });

  it('keeps the retention quartet on source artifacts and import batches', () => {
    const retentionColumns = [
      'purge_after',
      'retention_extended_until',
      'retention_extension_reason',
      'purged_at',
    ];

    for (const tableName of ['source_artifacts', 'import_batches'] as const) {
      expect(configFor(tableName).columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(retentionColumns)
      );
    }
  });

  it('declares selection, merge, and typed-link guards', () => {
    expect(constraintNames('working_value_selections')).toContain(
      'working_value_selections_deviation_reason_check'
    );
    expect(constraintNames('company_identities')).toContain(
      'company_identities_no_self_merge_check'
    );
    expect(constraintNames('portfolio_company_identity_links')).toEqual(
      expect.arrayContaining([
        'pc_identity_links_link_type_check',
        'pc_identity_links_active_deactivated_check',
      ])
    );
  });

  it('keeps every enum CHECK value list equal to its contract constant', () => {
    expect(checkSql('source_artifacts', 'source_artifacts_source_type_check')).toContain(
      `IN (${quotedValues(FINANCIAL_OBSERVATION_SOURCES)})`
    );
    expect(
      checkSql('import_mapping_profiles', 'import_mapping_profiles_source_type_check')
    ).toContain(`IN (${quotedValues(FINANCIAL_OBSERVATION_SOURCES)})`);
    expect(checkSql('import_mapping_profiles', 'import_mapping_profiles_domain_check')).toContain(
      `IN (${quotedValues(FINANCIAL_OBSERVATION_DOMAINS)})`
    );
    expect(checkSql('import_batches', 'import_batches_status_check')).toContain(
      `IN (${quotedValues(IMPORT_BATCH_STATUSES)})`
    );
    expect(checkSql('source_observations', 'source_observations_source_type_check')).toContain(
      `IN (${quotedValues(FINANCIAL_OBSERVATION_SOURCES)})`
    );
    expect(checkSql('source_observations', 'source_observations_domain_check')).toContain(
      `IN (${quotedValues(FINANCIAL_OBSERVATION_DOMAINS)})`
    );
    expect(checkSql('source_observations', 'source_observations_status_check')).toContain(
      `IN (${quotedValues(SOURCE_OBSERVATION_STATUSES)})`
    );
    expect(checkSql('reconciliation_cases', 'reconciliation_cases_case_type_check')).toContain(
      `IN (${quotedValues(RECONCILIATION_CASE_TYPES)})`
    );
    expect(checkSql('reconciliation_cases', 'reconciliation_cases_status_check')).toContain(
      `IN (${quotedValues(RECONCILIATION_CASE_STATUSES)})`
    );
    expect(
      checkSql('working_value_selections', 'working_value_selections_consumer_check')
    ).toContain(`IN (${quotedValues(FINANCIAL_FACTS_CONSUMER_KEYS)})`);
    expect(checkSql('working_value_selections', 'working_value_selections_domain_check')).toContain(
      `IN (${quotedValues(FINANCIAL_OBSERVATION_DOMAINS)})`
    );
    expect(
      checkSql('portfolio_company_identity_links', 'pc_identity_links_link_type_check')
    ).toContain(`IN (${quotedValues(IDENTITY_LINK_TYPES)})`);
  });

  it('keeps every table, constraint, and index identifier within PostgreSQL limit', () => {
    const names = tableEntries.flatMap(([tableName]) => [
      tableName,
      ...constraintNames(tableName),
      ...indexNames(tableName),
    ]);

    for (const name of names) {
      expect(Buffer.byteLength(name, 'utf8'), name).toBeLessThanOrEqual(63);
    }
  });
});

describe('financial observations migration and production sync set', () => {
  it('authors replay-safe journal migration 0039 in topological order', () => {
    const migration = fs.readFileSync('migrations/0039_financial_observations.sql', 'utf8');
    const expectedOrder = [
      'source_artifacts',
      'import_mapping_profiles',
      'import_batches',
      'company_identities',
      'company_external_identities',
      'portfolio_company_identity_links',
      'source_observations',
      'reconciliation_cases',
      'working_value_selections',
    ];

    expect(migration).toContain('-- @drift-patch');
    expect(migration).toContain('-- Reason: Task 3 (D3/D27/D30) — immutable financial evidence,');

    let priorPosition = -1;
    for (const tableName of expectedOrder) {
      const marker = `CREATE TABLE IF NOT EXISTS "${tableName}"`;
      const position = migration.indexOf(marker);
      expect(position, marker).toBeGreaterThan(priorPosition);
      priorPosition = position;
    }

    expect(migration).toContain(
      'INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)'
    );
    expect(migration).toContain(
      'INSERT INTO portfolio_company_identity_links (fund_id, portfolio_company_id, company_identity_id, link_type, active)'
    );
    expect(migration).toContain(
      'NOT EXISTS (SELECT 1 FROM company_identities ci WHERE ci.source_portfolio_company_id = pc.id)'
    );
    expect(migration).toMatch(
      /NOT EXISTS \(SELECT 1 FROM portfolio_company_identity_links l\s+WHERE l\.portfolio_company_id = ci\.source_portfolio_company_id\)/
    );
    expect(migration).toContain('SELECT count(*) FROM portfoliocompanies WHERE fund_id IS NULL');
    expect(migration).toMatch(/RAISE NOTICE/);
  });

  it('journals migration 0039 at idx 40', () => {
    const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string; breakpoints: boolean }>;
    };

    expect(journal.entries.at(-1)).toMatchObject({
      idx: 40,
      tag: '0039_financial_observations',
      breakpoints: true,
    });
  });

  it('keeps manifest constraint and index names byte-identical to migration DDL', () => {
    const migration = fs.readFileSync('migrations/0039_financial_observations.sql', 'utf8');
    const manifest = JSON.parse(
      fs.readFileSync('scripts/prod-schema-manifests/13-financial-observations.json', 'utf8')
    ) as {
      expectedTables: Array<{
        constraints: string[];
        indexes: string[];
      }>;
    };
    const migrationConstraints = [...migration.matchAll(/CONSTRAINT "([^"]+)"/g)].map(
      (match) => match[1]
    );
    const migrationIndexes = [
      ...migration.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "([^"]+)"/g),
    ].map((match) => match[1]);
    const manifestConstraints = manifest.expectedTables.flatMap((table) => table.constraints);
    const manifestIndexes = manifest.expectedTables.flatMap((table) => table.indexes);

    expect(new Set(manifestConstraints)).toEqual(new Set(migrationConstraints));
    expect(new Set(manifestIndexes)).toEqual(new Set(migrationIndexes));
  });
});
