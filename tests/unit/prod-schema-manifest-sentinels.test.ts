import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pgIdentifier } from '../../scripts/db-push-core.mjs';

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
  constraints?: string[];
  indexes?: string[];
}

interface DropObject {
  kind: 'index' | 'constraint';
  table?: string;
  name: string;
}

interface Manifest {
  name: string;
  sqlFiles?: string[];
  expectedTables?: ManifestTable[];
  dropObjects?: DropObject[];
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
    ]);
  });

  it('every referenced sqlFile exists in the repo', () => {
    for (const { file, manifest } of manifests) {
      for (const sqlFile of manifest.sqlFiles ?? []) {
        expect(fs.existsSync(path.join(repoRoot, sqlFile)), `${file} -> ${sqlFile}`).toBe(true);
      }
    }
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
});
