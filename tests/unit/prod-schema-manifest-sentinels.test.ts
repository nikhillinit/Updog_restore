import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';
import {
  loadManifests,
  readManifestSql,
  validateManifestSql,
} from '../../scripts/reconcile-prod-schema.mjs';

// s8.1 slice 3 (ADR-023): reconcile-prod-schema.mjs verifies sentinels BY NAME
// (findMissingSentinels), so a manifest sentinel that its own SQL never creates
// would false-fail every post-apply prod verification. The Docker clone proof
// covers this end-to-end but only fires on schema-path changes; this pin covers
// every manifest edit at unit speed. Prod audit 2026-07-02 (artifact sha256
// 62131f6a...cf72b86) established the C1 manifest tables are NOT YET on prod,
// so self-consistency against the manifests' own SQL is the reconcile target
// until the operator apply happens.

const repoRoot = process.cwd();
const manifestDir = path.join(repoRoot, 'scripts', 'prod-schema-manifests');

interface ManifestTable {
  name: string;
  columns?: Array<{
    name: string;
    type?: string;
    nullable: boolean;
  }>;
  constraints?: string[];
  constraintDefinitions?: Array<{
    name: string;
    expectedDefinition: {
      exactDefinition: string;
      orderedFragments: string[];
      stringLiterals: string[];
    };
  }>;
  indexes?: string[];
}

interface DropObject {
  kind: 'index' | 'constraint';
  table?: string;
  name: string;
}

interface Manifest {
  name: string;
  order?: number;
  missingTablePolicy?: 'create_or_repair' | 'existing_table_required';
  sqlFiles?: string[];
  allowedCreateTables?: string[];
  expectedTables?: ManifestTable[];
  dropObjects?: DropObject[];
  applyPolicy?: {
    allowDropNotNull?: Array<{ table: string; column: string }>;
    allowConstraintReplacements?: Array<{
      table: string;
      name: string;
      expectedDefinition: {
        requiredFragments: string[];
        stringLiterals: string[];
      };
    }>;
  };
}

function loadManifestFiles(): Array<{ file: string; manifest: Manifest }> {
  return fs
    .readdirSync(manifestDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      manifest: JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8')) as Manifest,
    }));
}

// Single alternation, applied left-to-right so each statement is exactly one
// event: DROP alternatives are listed first and consume through the name, so
// the CONSTRAINT-create alternative can never re-match the name inside a
// "DROP CONSTRAINT" statement. Names created after a drop survive (0017's
// scoped replacement pattern); names dropped and never recreated do not
// (review 4621209185 - the pin must reject sentinels the SQL sequence drops).
const SQL_NAME_EVENT =
  /(?<dropIndex>DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?)|(?<dropConstraint>DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?)|(?<createConstraint>CONSTRAINT\s+"?([a-z0-9_]+)"?)|(?<createIndex>CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?)/gi;

function namesSurvivingSql(sqlFiles: string[]): Set<string> {
  const surviving = new Set<string>();

  for (const sqlFile of sqlFiles) {
    const sql = fs.readFileSync(path.join(repoRoot, sqlFile), 'utf8');
    for (const match of sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\);/gi
    )) {
      const tableName = match[1];
      const tableBody = match[2] ?? '';
      if (
        tableName &&
        /^\s*(?!CONSTRAINT\b)"?[a-z0-9_]+"?\s+[^,\n]*\bPRIMARY\s+KEY\b/im.test(tableBody)
      ) {
        surviving.add(pgIdentifier(`${tableName}_pkey`));
      }
    }

    const pattern = new RegExp(SQL_NAME_EVENT.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql)) !== null) {
      const [, , droppedIndexName, , droppedConstraintName, , constraintName, , indexName] = match;
      const dropped = droppedIndexName ?? droppedConstraintName;
      const created = constraintName ?? indexName;
      if (dropped) {
        surviving.delete(pgIdentifier(dropped.toLowerCase()));
      } else if (created) {
        surviving.add(pgIdentifier(created.toLowerCase()));
      }
    }
  }

  return surviving;
}

describe('prod-schema manifest sentinels', () => {
  const manifests = loadManifestFiles();

  it('finds the four PR-1 manifests and all additive production manifests through substrate shadow reconciliations', () => {
    expect(manifests.map((entry) => entry.file)).toEqual([
      '01-cohort.json',
      '02-fund-moic.json',
      '03-operating-tasks.json',
      '04-lp-reporting.json',
      '05-operator-seam.json',
      '06-h9-actionability.json',
      '07-allocation-scenarios.json',
      '08-scenario-case-seed-provenance.json',
      '09-substrate-shadow-reconciliations.json',
      '10-financial-facts-snapshots.json',
      '11-current-plan-versions.json',
      '12-current-forecast-references.json',
      '13-financial-observations.json',
      '14-investment-ledger.json',
      '15-vehicle-financing-participations.json',
      '16-positions-ownership-compat.json',
      '17-position-source-basis-reliefs.json',
      '18-internal-analysis.json',
      '19-user-identity-grants-revocation.json',
      '20-company-scenario-create-requests.json',
      '21-business-time-comparison-lineage.json',
      '22-internal-economics-policy-runs.json',
      '23-internal-economics-certification.json',
      '24-internal-economics-linkage.json',
      '25-quarterly-review-workflow.json',
    ]);
  });

  it('pins manifest 23 to additive certification DDL on the existing run table', () => {
    const certification = manifests.find(
      (entry) => entry.file === '23-internal-economics-certification.json'
    );
    expect(certification).toBeDefined();
    expect(certification!.manifest).toMatchObject({
      name: 'internal-economics-certification',
      order: 23,
      missingTablePolicy: 'existing_table_required',
      sqlFiles: ['migrations/0046_internal_economics_certification.sql'],
      allowedCreateTables: [],
    });

    const runTable = certification!.manifest.expectedTables?.find(
      (table) => table.name === 'internal_lp_economics_runs'
    );
    expect(runTable).toMatchObject({
      columns: [{ name: 'calculation_contract_version', type: 'text', nullable: true }],
      constraints: ['internal_lp_economics_runs_result_status_check'],
    });

    const replacement = certification!.manifest.applyPolicy?.allowConstraintReplacements?.find(
      (candidate) => candidate.name === 'internal_lp_economics_runs_result_status_check'
    );
    expect(replacement?.table).toBe('internal_lp_economics_runs');
    expect(replacement?.expectedDefinition.stringLiterals).toEqual([
      'available',
      'indicative',
      'unavailable',
    ]);
  });

  it('pins manifest 24 to migrator-owned economics ownership and immutable task evidence', () => {
    const linkage = manifests.find((entry) => entry.file === '24-internal-economics-linkage.json');
    expect(linkage).toBeDefined();
    expect(linkage!.manifest).toMatchObject({
      name: 'internal-economics-linkage',
      order: 24,
      missingTablePolicy: 'create_or_repair',
      sqlFiles: ['migrations/0047_internal_economics_linkage.sql'],
      allowedCreateTables: ['task_evidence_links'],
    });
    expect(linkage!.manifest.expectedTables?.map((table) => table.name)).toEqual([
      'internal_analysis_drafts',
      'internal_analysis_references',
      'tasks',
      'task_evidence_links',
    ]);

    const evidence = linkage!.manifest.expectedTables?.find(
      (table) => table.name === 'task_evidence_links'
    );
    expect(evidence?.constraints).toEqual(
      expect.arrayContaining([
        'task_evidence_links_task_fund_fk',
        'task_evidence_links_analysis_reference_fund_fk',
        'task_evidence_links_economics_run_fund_fk',
        'task_evidence_links_target_coupling_check',
      ])
    );
    for (const table of linkage!.manifest.expectedTables ?? []) {
      expect(table.constraintDefinitions?.map((definition) => definition.name).sort()).toEqual(
        [...(table.constraints ?? [])].sort()
      );
    }
    expect(evidence?.indexes).toEqual(['idx_task_evidence_links_fund_task_id']);

    const sql = fs.readFileSync(
      path.join(repoRoot, 'migrations', '0047_internal_economics_linkage.sql'),
      'utf8'
    );
    expect(sql).toMatch(/^--\s+@drift-patch\b/m);
    expect(sql).toMatch(/^--\s+Reason:\s+\S/m);
    const firstExecutableStatement = sql
      .split('--> statement-breakpoint')[0]!
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    expect(firstExecutableStatement).toMatch(/^LOCK TABLE/);
    expect(sql).not.toMatch(/^\s*(?:BEGIN|COMMIT);\s*$/m);
    expect(sql.indexOf('internal_economics_linkage_preflight_failed')).toBeGreaterThan(
      sql.indexOf('LOCK TABLE')
    );
    expect(sql).toContain('CREATE TRIGGER "task_evidence_links_forbid_update_trigger"');
  });

  it('every referenced sqlFile exists in the repo', () => {
    for (const { file, manifest } of manifests) {
      for (const sqlFile of manifest.sqlFiles ?? []) {
        expect(fs.existsSync(path.join(repoRoot, sqlFile)), `${file} -> ${sqlFile}`).toBe(true);
      }
    }
  });

  it('creates the canonical investment-rounds foundation before applying participation lineage', () => {
    const participationManifest = manifests.find(
      (entry) => entry.file === '15-vehicle-financing-participations.json'
    );
    expect(participationManifest).toBeDefined();
    expect(participationManifest!.manifest.sqlFiles).toEqual([
      'scripts/prod-schema-patches/0027_investment_rounds_foundation.sql',
      'migrations/0041_vehicle_financing_participations.sql',
    ]);
    expect(participationManifest!.manifest.allowedCreateTables).toContain('investment_rounds');

    const foundationSql = fs.readFileSync(
      path.join(repoRoot, participationManifest!.manifest.sqlFiles![0]),
      'utf8'
    );
    expect(foundationSql).toMatch(/CREATE TABLE IF NOT EXISTS "investment_rounds"/);
    expect(foundationSql).toContain('CONSTRAINT "investment_rounds_investment_fund_fk"');
    expect(foundationSql).toContain('CONSTRAINT "investment_rounds_id_fund_uq"');
    expect(foundationSql).not.toMatch(/^\s*(?:DROP|DELETE|TRUNCATE)\b/im);
  });

  it('every manifest SQL file begins with a -- @generated or -- @drift-patch marker', () => {
    const offenders: string[] = [];

    for (const { file, manifest } of manifests) {
      for (const sqlFile of manifest.sqlFiles ?? []) {
        const sql = fs.readFileSync(path.join(repoRoot, sqlFile), 'utf8');
        if (!/^--\s*@(generated|drift-patch)\b/m.test(sql)) {
          offenders.push(`${file} -> ${sqlFile}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('every manifest passes production SQL ownership validation', async () => {
    const failures: string[] = [];

    for (const manifest of await loadManifests()) {
      try {
        validateManifestSql(manifest, await readManifestSql(manifest));
      } catch (error) {
        failures.push(
          `${manifest.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('every sentinel name SURVIVES the manifest own SQL sequence (63-byte aware)', () => {
    const failures: string[] = [];

    for (const { file, manifest } of manifests) {
      const surviving = namesSurvivingSql(manifest.sqlFiles ?? []);
      for (const table of manifest.expectedTables ?? []) {
        for (const sentinel of [...(table.constraints ?? []), ...(table.indexes ?? [])]) {
          if (!surviving.has(pgIdentifier(sentinel.toLowerCase()))) {
            failures.push(`${file}: ${sentinel}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('derives PostgreSQL names for both inline primary keys in manifests 19 and 20', () => {
    expect(namesSurvivingSql(['migrations/0031_user_identity_grants_revocation.sql'])).toContain(
      'revoked_tokens_pkey'
    );
    expect(namesSurvivingSql(['migrations/0033_company_scenario_create_requests.sql'])).toContain(
      'company_scenario_create_requests_pkey'
    );
  });

  it('negative control: a dropped-then-replaced name does not survive (0016/0017 case)', () => {
    const fundMoic = manifests.find((entry) => entry.file === '02-fund-moic.json');
    expect(fundMoic).toBeDefined();
    const surviving = namesSurvivingSql(fundMoic!.manifest.sqlFiles ?? []);

    // 0016 creates the global unique; 0017 drops it and adds the fund-scoped
    // replacement. A manifest regression back to the dropped name must FAIL
    // the survival pin, because post-apply reconciliation checks the catalog.
    expect(surviving.has('reconciliation_runs_idempotency_key_unique')).toBe(false);
    expect(surviving.has('reconciliation_runs_fund_id_idempotency_key_unique')).toBe(true);
  });

  it('dropObjects never target a name the manifest own SQL creates', () => {
    for (const { file, manifest } of manifests) {
      const surviving = namesSurvivingSql(manifest.sqlFiles ?? []);
      const incoherent = (manifest.dropObjects ?? [])
        .map((drop) => drop.name)
        .filter((name) => surviving.has(pgIdentifier(name.toLowerCase())));
      expect(incoherent, `${file} drops what its own SQL creates`).toEqual([]);
    }
  });

  it('applyPolicy targets only expected nullable columns and expected constraints', () => {
    for (const { file, manifest } of manifests) {
      const tables = new Map((manifest.expectedTables ?? []).map((table) => [table.name, table]));

      for (const allowed of manifest.applyPolicy?.allowDropNotNull ?? []) {
        const column = tables
          .get(allowed.table)
          ?.columns?.find((candidate) => candidate.name === allowed.column);
        expect(
          column?.nullable,
          `${file} allowDropNotNull ${allowed.table}.${allowed.column}`
        ).toBe(true);
      }

      for (const allowed of manifest.applyPolicy?.allowConstraintReplacements ?? []) {
        const constraints = tables.get(allowed.table)?.constraints ?? [];
        expect(
          constraints,
          `${file} allowConstraintReplacements ${allowed.table}.${allowed.name}`
        ).toContain(allowed.name);
        expect(
          allowed.expectedDefinition.requiredFragments.length,
          `${file} ${allowed.name} required definition fragments`
        ).toBeGreaterThan(0);
        expect(
          allowed.expectedDefinition.stringLiterals.length,
          `${file} ${allowed.name} expected string literals`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('scopes replacement constraint guards to their target tables', () => {
    const cases = [
      {
        sqlFile: 'scripts/prod-schema-patches/0035_substrate_shadow_reconciliations_widening.sql',
        table: 'substrate_shadow_reconciliations',
        replacements: ['substrate_shadow_reconciliations_substrate_state_check'],
        guardedConstraints: ['substrate_shadow_reconciliations_result_hash_state_check'],
      },
      {
        sqlFile: 'migrations/0038_current_forecast_references.sql',
        table: 'substrate_shadow_reconciliations',
        replacements: ['substrate_shadow_reconciliations_substrate_state_check'],
        guardedConstraints: ['substrate_shadow_reconciliations_result_hash_state_check'],
      },
      {
        sqlFile: 'migrations/0042_positions_ownership_compat.sql',
        table: 'investment_lots',
        replacements: ['investment_lots_lot_type_check'],
        guardedConstraints: [],
      },
    ] as const;

    for (const { sqlFile, table, replacements, guardedConstraints } of cases) {
      const sql = fs.readFileSync(path.join(repoRoot, sqlFile), 'utf8');
      for (const constraint of replacements) {
        expect(sql, `${sqlFile} direct target replacement for ${constraint}`).toMatch(
          new RegExp(
            String.raw`ALTER\s+TABLE\s+"${table}"\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"${constraint}";[\s\S]*?ALTER\s+TABLE\s+"${table}"\s+ADD\s+CONSTRAINT\s+"${constraint}"`,
            'i'
          )
        );
      }
      for (const constraint of guardedConstraints) {
        const guards = [
          ...sql.matchAll(
            new RegExp(String.raw`WHERE\s+conname\s*=\s*'${constraint}'([\s\S]*?)\)\s+THEN`, 'gi')
          ),
        ];
        expect(guards.length, `${sqlFile} guard count for ${constraint}`).toBeGreaterThan(0);
        for (const guard of guards) {
          expect(guard[1], `${sqlFile} ${constraint} target scope`).toContain(
            `AND conrelid = 'public.${table}'::regclass`
          );
        }
      }
    }
  });

  it('guards the current-forecast cutover foreign key for partial-drift replay', () => {
    const currentForecast = manifests.find(
      (entry) => entry.file === '12-current-forecast-references.json'
    );
    expect(currentForecast).toBeDefined();

    const sql = fs.readFileSync(
      path.join(repoRoot, currentForecast!.manifest.sqlFiles![0]),
      'utf8'
    );
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1\s*FROM pg_constraint\s*WHERE conname = 'fund_calculation_modes_cutover_reference_fk'\s*AND conrelid = 'public\.fund_calculation_modes'::regclass\s*\)/i
    );
  });

  it('no duplicate sentinel names within a manifest', () => {
    for (const { file, manifest } of manifests) {
      const seen: string[] = [];
      for (const table of manifest.expectedTables ?? []) {
        seen.push(...(table.constraints ?? []), ...(table.indexes ?? []));
      }
      const duplicates = seen.filter((name, index) => seen.indexOf(name) !== index);
      expect(duplicates, `${file} duplicate sentinels`).toEqual([]);
    }
  });

  it('keeps ledgered manifest 16 immutable and isolates additive 0043 in manifest 17', () => {
    const positionsManifest = manifests.find(
      (entry) => entry.file === '16-positions-ownership-compat.json'
    );
    const sourceBasisManifest = manifests.find(
      (entry) => entry.file === '17-position-source-basis-reliefs.json'
    );
    expect(positionsManifest).toBeDefined();
    expect(sourceBasisManifest).toBeDefined();

    expect(positionsManifest!.manifest.sqlFiles).toEqual([
      'migrations/0042_positions_ownership_compat.sql',
    ]);
    expect(positionsManifest!.manifest.allowedCreateTables).not.toContain(
      'position_event_source_basis_reliefs'
    );
    expect(positionsManifest!.manifest.expectedTables?.map((table) => table.name)).not.toContain(
      'position_event_source_basis_reliefs'
    );

    expect(sourceBasisManifest!.manifest.sqlFiles).toEqual([
      'migrations/0043_position_source_basis_reliefs.sql',
    ]);
    expect(sourceBasisManifest!.manifest.allowedCreateTables).toEqual([
      'position_event_source_basis_reliefs',
    ]);
    expect(sourceBasisManifest!.manifest.expectedTables?.map((table) => table.name)).toEqual([
      'position_events',
      'vehicle_financing_participations',
      'financing_events',
      'financing_tranches',
      'position_event_source_basis_reliefs',
    ]);

    const sourceBasisSql = fs.readFileSync(
      path.join(repoRoot, sourceBasisManifest!.manifest.sqlFiles![0]),
      'utf8'
    );
    expect(sourceBasisSql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  });

  it('the Task 11 manifests type every expected column', () => {
    const task11Manifests = manifests.filter((entry) =>
      ['16-positions-ownership-compat.json', '17-position-source-basis-reliefs.json'].includes(
        entry.file
      )
    );
    expect(task11Manifests).toHaveLength(2);

    const missingTypes: string[] = [];

    for (const { file, manifest } of task11Manifests) {
      for (const table of manifest.expectedTables ?? []) {
        for (const column of table.columns ?? []) {
          if (!column.type?.trim()) {
            missingTypes.push(`${file}: ${table.name}.${column.name}`);
          }
        }
      }
    }

    expect(missingTypes).toEqual([]);
  });
});
