import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMON_API_ROUTE_MANIFEST } from '../../../shared/routes/api-route-manifest.ts';
import { API_RUNTIME_SPECIFIC_MANIFEST } from '../../../shared/routes/api-runtime-specific-manifest.ts';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  EnvironmentSchema,
  ListenerDispositionsSchema,
  RuntimeExclusionsSchema,
  SourceInventorySchema,
  SurfaceMatrixDocumentSchema,
  canonicalRowId,
  contractFingerprint,
  discoverDormantCandidates,
  discoverHttpListenerCandidates,
  scanBullmqConstructors,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import {
  closureReport,
  matchRequirementFamilies,
  validateClosedPhaseInvariants,
  validateOffRowFingerprints,
  validateRowIntegrity,
} from '../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs';
import { renderMatrix } from '../../../audit/surface-contract-matrix/scripts/render-matrix.mjs';

const root = path.resolve(process.cwd());
const matrixDir = path.join(root, 'audit/surface-contract-matrix');
const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(matrixDir, file), 'utf8')) as Record<string, unknown>;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  return value;
};
const stableJson = (value: unknown) => JSON.stringify(stableValue(value));
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
const excludedSource = (file: string) =>
  /(?:^|\/)(?:__tests__|tests?|specs?|fixtures?)(?:\/|$)/i.test(file) ||
  /\.(?:test|spec|stories)\.[^.]+$/i.test(file);
const fileMatches = (file: string, pattern: string) =>
  pattern === 'server/routes/**/*.ts'
    ? file.startsWith('server/routes/') && file.endsWith('.ts')
    : pattern === 'api/**/*.ts'
      ? file.startsWith('api/') && file.endsWith('.ts')
      : pattern === 'workers/**'
        ? file.startsWith('workers/')
        : pattern === 'server/workers/**'
          ? file.startsWith('server/workers/')
          : pattern === 'ml-service/**' && file.startsWith('ml-service/');

describe('surface contract matrix CI gate', () => {
  it('keeps the seeded development-only classification valid', () => {
    const seedScript = fs.readFileSync(path.join(matrixDir, 'scripts/seed-matrix.mjs'), 'utf8');

    expect(seedScript).toContain("environment: 'development-only'");
    expect(EnvironmentSchema.parse('development-only')).toBe('development-only');
  });

  it('validates tracked artifacts, discovery sets, hashes, requirements, and render determinism', async () => {
    const matrix = SurfaceMatrixDocumentSchema.parse(readJson('matrix.json'));
    const inventory = SourceInventorySchema.parse(readJson('source-inventory.json'));
    const requirements = readJson('requirements.json') as {
      families: Array<Record<string, unknown>>;
    };
    const listeners = ListenerDispositionsSchema.parse(readJson('listener-dispositions.json'));
    const candidates = readJson('dormant-candidates.json') as Array<Record<string, unknown>>;
    const exclusions = RuntimeExclusionsSchema.parse(readJson('runtime-exclusions.json'));
    const orphans = readJson('orphans.json') as Array<Record<string, unknown>>;
    const errors: string[] = [];
    const policyRegistry = (
      await import(path.join(root, 'server/route-policy/api-route-policy-registry.ts'))
    ).API_ROUTE_POLICY_REGISTRY as Array<{ id: string; method?: string; path: string }>;
    const governanceRegistry = (
      await import(path.join(root, 'shared/routes/route-governance-registry.ts'))
    ).ROUTE_GOVERNANCE_REGISTRY as Array<{ path: string }>;
    const rowIds = matrix.rows.map((row) => canonicalRowId(row.id));
    expect(new Set(rowIds).size, 'canonical row ids must be unique').toBe(rowIds.length);
    expect(
      (matrix as Record<string, unknown>).orphans,
      'orphans.json is sole authoritative source'
    ).toBeUndefined();
    expect([...rowIds].sort((left, right) => left.localeCompare(right))).toEqual(
      [...inventory.row_ids].sort((left, right) => left.localeCompare(right))
    );

    const reverse: Record<string, string[]> = {};
    for (const [source, ids] of Object.entries(inventory.source_to_rows))
      for (const id of ids) reverse[id] = [...(reverse[id] ?? []), source];
    for (const [id, sources] of Object.entries(inventory.row_to_sources))
      expect([...new Set(sources)].sort()).toEqual([...new Set(reverse[id] ?? [])].sort());
    for (const entry of policyRegistry) {
      const id = entry.id.startsWith('client:')
        ? canonicalRowId(entry.id)
        : canonicalRowId(`api:${entry.method}:${entry.path}`);
      expect(inventory.source_to_rows[`policy:${entry.id}`]).toEqual([id]);
      expect(rowIds).toContain(id);
    }
    for (const entry of governanceRegistry) {
      const id = canonicalRowId(`client:${entry.path}`);
      expect(inventory.source_to_rows[`governance:${entry.path}`]).toEqual([id]);
      expect(rowIds).toContain(id);
    }
    for (const entry of COMMON_API_ROUTE_MANIFEST) {
      const mapped = inventory.source_to_rows[`manifest:${entry.id}`] ?? [];
      expect(mapped.length, `common manifest mapping: ${entry.id}`).toBeGreaterThan(0);
      for (const id of mapped) expect(rowIds).toContain(id);
    }
    for (const entry of API_RUNTIME_SPECIFIC_MANIFEST) {
      const mapped = inventory.source_to_rows[`runtime-manifest:${entry.id}`] ?? [];
      expect(mapped.length, `runtime manifest mapping: ${entry.id}`).toBeGreaterThan(0);
      for (const id of mapped) expect(rowIds).toContain(id);
    }
    for (const entry of (await import(path.join(root, 'server/queues/registry.ts')))
      .QUEUE_CATALOG as Array<{ key: string; queueName: string }>) {
      const mapped = inventory.source_to_rows[`QUEUE_CATALOG:${entry.key}`] ?? [];
      expect(mapped).toEqual([canonicalRowId(`worker:${entry.queueName}`)]);
    }

    const packageData = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const registryExports: Record<string, [string, string]> = {
      'shared/routes/api-route-manifest.ts#normalized-runtime-export': [
        'shared/routes/api-route-manifest.ts',
        'COMMON_API_ROUTE_MANIFEST',
      ],
      'shared/routes/api-runtime-specific-manifest.ts#normalized-runtime-export': [
        'shared/routes/api-runtime-specific-manifest.ts',
        'API_RUNTIME_SPECIFIC_MANIFEST',
      ],
      'server/route-policy/api-route-policy-registry.ts#normalized-runtime-export': [
        'server/route-policy/api-route-policy-registry.ts',
        'API_ROUTE_POLICY_REGISTRY',
      ],
      'shared/routes/route-governance-registry.ts#normalized-runtime-export': [
        'shared/routes/route-governance-registry.ts',
        'ROUTE_GOVERNANCE_REGISTRY',
      ],
    };
    for (const [key, expected] of Object.entries(inventory.source_hashes)) {
      let actual: string;
      if (key.startsWith('snapshot:')) actual = key;
      else if (key === 'package.json#scripts')
        actual = sha256(
          stableJson(
            Object.fromEntries(
              Object.entries(packageData.scripts ?? {}).sort(([left], [right]) =>
                left.localeCompare(right)
              )
            )
          )
        );
      else if (registryExports[key]) {
        const [file, exportName] = registryExports[key];
        const imported = await import(path.join(root, file));
        actual = sha256(stableJson(imported[exportName]));
      } else {
        const source = key.split('#', 1)[0];
        actual = sha256(fs.readFileSync(path.join(root, source)));
      }
      if (actual !== expected) errors.push(`source hash mismatch: ${key}`);
    }
    const tracked = trackedFiles();
    for (const [category, files] of Object.entries(inventory.source_membership ?? {})) {
      for (const file of files) {
        if (file.startsWith('snapshot:')) continue;
        const source = file.split('#', 1)[0];
        expect(
          fs.existsSync(path.join(root, source)),
          `${category} membership file exists: ${source}`
        ).toBe(true);
        expect(
          inventory.source_hashes[file],
          `${category} membership is hashed: ${file}`
        ).toBeTruthy();
      }
      if (category.startsWith('universe:'))
        expect(files).toEqual(
          tracked.filter(
            (file) => fileMatches(file, category.slice('universe:'.length)) && !excludedSource(file)
          )
        );
    }
    expect(inventory.source_membership?.['client-pages-v2']).toEqual(
      tracked.filter((file) => file.startsWith('client/src/pages/v2/'))
    );

    const discoveredDormant = discoverDormantCandidates({ rootDir: root }).map(
      (candidate) => candidate.path
    );
    expect(discoveredDormant).toEqual(
      candidates.map((candidate) => candidate.path).sort((left, right) => left.localeCompare(right))
    );
    const discoveredListeners = discoverHttpListenerCandidates({ rootDir: root })
      .map((candidate) => candidate.path)
      .sort((left, right) => left.localeCompare(right));
    expect(discoveredListeners).toEqual(
      listeners
        .map((listener) => listener.candidate_path)
        .sort((left, right) => left.localeCompare(right))
    );
    const queueNames = [
      ...new Set(scanBullmqConstructors({ rootDir: root }).map((finding) => finding.queue_name)),
    ].sort((left, right) => left.localeCompare(right));
    expect(queueNames).toContain('capital-call-status');
    expect(queueNames).toContain('lp-view-refresh');
    for (const queueName of queueNames)
      expect(rowIds).toContain(canonicalRowId(`worker:${queueName}`));
    expect(matrix.rows.find((row) => row.id === 'worker:capital-call-status')?.reachability).toBe(
      'railway'
    );

    for (const row of matrix.rows)
      if (row.decision_status === 'approved')
        expect(row.contract_fingerprint).toBe(contractFingerprint(row));
    for (const [key, review] of Object.entries(matrix.coverage_review ?? {})) {
      const row = matrix.rows.find((entry) => entry.id === key.split('|', 1)[0]);
      expect(row, `coverage review row exists: ${key}`).toBeDefined();
      expect(review.contract_fingerprint).toBe(contractFingerprint(row!));
    }
    for (const row of matrix.rows) {
      const items = [...(row.test_evidence.derived ?? []), ...(row.test_evidence.manual ?? [])];
      for (const evidence of items) {
        if (!evidence.assertion_confirmed || !evidence.test_file_sha256) continue;
        const evidencePath = String(evidence.assertion_evidence ?? '').split(':', 1)[0];
        expect(evidencePath, `confirmed evidence needs a file path on row ${row.id}`).toBeTruthy();
        expect(
          sha256(fs.readFileSync(path.join(root, evidencePath))),
          `confirmed test evidence hash stale on row ${row.id}: ${evidencePath}`
        ).toBe(evidence.test_file_sha256);
      }
    }
    const derivedEvidenceCount = matrix.rows.reduce(
      (total, row) => total + row.test_evidence.derived.length,
      0
    );
    expect(
      derivedEvidenceCount,
      'seed must ingest KG TESTS edges into derived evidence'
    ).toBeGreaterThan(0);
    const backtesting = matrix.rows.find((row) => row.id === 'worker:backtesting-jobs');
    expect(
      backtesting?.exposures.map((exposure) => `${exposure.deployment}|${exposure.runtime}`)
    ).toEqual(['local-process|worker_process']);

    const families = matchRequirementFamilies(requirements, matrix.rows);
    for (const family of families) {
      if (family.matched_ids.length === 0)
        expect(
          family.optional_when_absent && family.absence_evidence,
          `${family.id} requires approved absence evidence once closed`
        ).toBeTruthy();
    }
    const closure = closureReport({
      document: matrix,
      requirements,
      listeners,
      candidates,
      orphans,
      discoveredRoles: Object.keys(AUTH_IDENTITY_PERSONA_MAPPING),
    });
    expect(
      validateOffRowFingerprints({
        listeners,
        candidates,
        exclusions,
        orphans,
        requirements,
        discoveredListeners: discoverHttpListenerCandidates({ rootDir: root }),
      })
    ).toEqual([]);
    if (matrix.phase === 'authoring')
      process.stderr.write(
        `surface matrix authoring closure report: ${JSON.stringify(Object.fromEntries(Object.entries(closure.issues).map(([key, values]) => [key, values.length])))}\n`
      );
    else expect(closure.passed, JSON.stringify(closure.issues)).toBe(true);
    if (matrix.phase === 'closed') {
      expect(validateClosedPhaseInvariants({ document: matrix, requirements, families })).toEqual(
        []
      );
      expect(
        matrix.rows.every(
          (row) => row.decision_status === 'approved' && row.classification === 'classified'
        )
      ).toBe(true);
      expect(listeners.every((listener) => listener.decision_status === 'approved')).toBe(true);
      expect(
        candidates.every(
          (candidate) =>
            ['not-surface', 'promote'].includes(candidate.disposition) &&
            candidate.decision_status === 'approved'
        )
      ).toBe(true);
      expect(
        orphans.every(
          (orphan) =>
            ['pruned', 'retained'].includes(orphan.resolution) &&
            orphan.decision_status === 'approved'
        )
      ).toBe(true);
      expect(
        families.every((family) =>
          family.matched_ids.length > 0
            ? family.matched_ids.every(
                (id) => matrix.rows.find((row) => row.id === id)?.decision_status === 'approved'
              )
            : family.absence_evidence?.status === 'approved'
        )
      ).toBe(true);
    }

    const priorRef = process.env.SURFACE_MATRIX_PRIOR_REF;
    if (priorRef) {
      let prior: { phase: string } | undefined;
      try {
        prior = JSON.parse(
          execFileSync('git', ['show', `${priorRef}:audit/surface-contract-matrix/matrix.json`], {
            cwd: root,
          }).toString()
        ) as { phase: string };
      } catch (error) {
        if (matrix.phase === 'closed' && !closure.passed) throw error;
      }
      if (prior?.phase === 'closed') expect(matrix.phase).toBe('closed');
    }

    const rendered = renderMatrix({
      matrix,
      requirements,
      listeners,
      candidates,
      exclusions,
      orphans,
    });
    expect(errors, errors.join('\n')).toEqual([]);

    const renderedAgain = renderMatrix({
      matrix,
      requirements,
      listeners,
      candidates,
      exclusions,
      orphans,
    });
    expect(renderedAgain).toBe(rendered);
    expect(fs.readFileSync(path.join(matrixDir, 'MATRIX.md'), 'utf8')).toBe(rendered);
  });

  it('fails closed tamper invariants for off-row fingerprints, requirements, and coverage', () => {
    const candidate = { path: 'client/src/pages/synthetic.tsx', importer_evidence: [] };
    const listener = {
      candidate_path: 'server/synthetic.ts',
      listener_id: 'synthetic-listener',
      disposition: 'non-product-tooling',
      rationale: 'fixture tooling listener',
      evidence: ['fixture evidence'],
      fingerprint: '0'.repeat(64),
    };
    const orphan = {
      id: 'api:GET:/synthetic',
      resolution: 'pruned',
      last_contract_fingerprint: 'source-fingerprint',
      resolution_evidence: 'fixture evidence',
      resolution_fingerprint: '0'.repeat(64),
    };
    const exclusion = {
      id: 'synthetic-exclusion',
      matched_layer: 'layer',
      rule: 'fixture rule',
      evidence: 'fixture evidence',
      fingerprint: '0'.repeat(64),
    };
    const requirements = {
      families: [
        {
          id: 'optional',
          selector: { kind: 'explicit', ids: [] },
          absence_evidence: {
            status: 'approved',
            search_selector: 'fixture',
            result: 'absent',
            fingerprint: '0'.repeat(64),
          },
        },
      ],
    };
    const errors = validateOffRowFingerprints({
      listeners: [listener],
      candidates: [{ ...candidate, contract_fingerprint: '0'.repeat(64) }],
      exclusions: [exclusion],
      orphans: [orphan],
      requirements,
      discoveredListeners: [{ path: listener.candidate_path, patterns: [] }],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'listener disposition fingerprint mismatch: synthetic-listener',
        'dormant candidate fingerprint mismatch: client/src/pages/synthetic.tsx',
        'orphan resolution fingerprint mismatch: api:GET:/synthetic',
        'runtime exclusion fingerprint mismatch: synthetic-exclusion',
        'absence evidence fingerprint mismatch: optional',
      ])
    );

    const missingFingerprintErrors = validateOffRowFingerprints({
      listeners: [{ ...listener, fingerprint: undefined }],
      candidates: [{ ...candidate, decision_status: 'approved' }],
      exclusions: [{ ...exclusion, decision_status: 'approved', fingerprint: undefined }],
      orphans: [{ ...orphan, decision_status: 'approved', resolution_fingerprint: undefined }],
      requirements: {
        families: [
          {
            ...requirements.families[0],
            absence_evidence: {
              ...requirements.families[0].absence_evidence,
              fingerprint: undefined,
            },
          },
        ],
      },
      discoveredListeners: [{ path: listener.candidate_path, patterns: [] }],
    });
    expect(missingFingerprintErrors).toEqual(
      expect.arrayContaining([
        'listener disposition fingerprint missing: synthetic-listener',
        'dormant candidate fingerprint missing: client/src/pages/synthetic.tsx',
        'runtime exclusion fingerprint missing: synthetic-exclusion',
        'orphan resolution fingerprint missing: api:GET:/synthetic',
        'absence evidence fingerprint missing: optional',
      ])
    );

    const closedDocument = {
      phase: 'closed',
      g1_closure: { requirements_sha256: 'wrong', families: { optional: ['api:GET:/wrong'] } },
      coverage_review: { 'api:GET:/synthetic': { test_coverage: 'none-reviewed' } },
      rows: [
        {
          id: 'api:GET:/synthetic',
          exposures: [{ deployment: 'vercel-api', runtime: 'make_app' }],
          test_evidence: {
            derived: [
              {
                layer: 'unit',
                assertion_confirmed: true,
                assertion_evidence: 'tests/unit/synthetic.test.ts',
              },
            ],
            manual: [],
          },
        },
      ],
    };
    const closedErrors = validateClosedPhaseInvariants({
      document: closedDocument,
      requirements,
      families: [{ id: 'optional', matched_ids: [] }],
    });
    expect(closedErrors).toEqual(
      expect.arrayContaining([
        'closed matrix requirements content hash mismatch',
        'closed matrix requirement match set mismatch: optional',
        'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/synthetic/vercel-api/make_app',
      ])
    );
    expect(
      closureReport({
        document: closedDocument,
        requirements,
        exclusions: [exclusion],
      }).issues.unresolved_exclusions
    ).toEqual(['synthetic-exclusion']);

    const closeFixture = {
      matrix: {
        phase: 'authoring',
        rows: [
          {
            id: 'api:GET:/close-fixture',
            decision_status: 'approved',
            classification: 'classified',
            personas: ['gp'],
            persistence: 'reads-only',
            destructive: 'none',
            environment: 'prod-safe',
            owner: 'gp-team',
            decision: 'in-contract',
            exposures: [{ deployment: 'vercel-api', runtime: 'make_app', boot_status: 'proven' }],
          },
        ],
        coverage_review: {},
      },
      requirements: {
        families: [
          {
            id: 'close-family',
            selector: { kind: 'explicit', ids: ['api:GET:/close-fixture'] },
            matched_ids: ['api:GET:/close-fixture'],
          },
        ],
      },
      listeners: [],
      candidates: [],
      exclusions: [],
      orphans: [],
      listenerCandidates: [],
      discoveredRoles: ['admin', 'partner', 'analyst', 'lp', 'service', 'public'],
    };
    const closeErrors = validateClosedPhaseInvariants({
      document: { ...closeFixture.matrix, phase: 'closed' },
      requirements: closeFixture.requirements,
      families: [{ id: 'close-family', matched_ids: ['api:GET:/close-fixture'] }],
    });
    expect(closeErrors).toContain(
      'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/close-fixture/vercel-api/make_app'
    );
    expect(closeErrors.length).toBeGreaterThan(0);

    const staleRow = {
      ...closeFixture.matrix.rows[0],
      contract_fingerprint: '0'.repeat(64),
    };
    const staleFixture = {
      ...closeFixture,
      matrix: {
        phase: 'authoring',
        rows: [staleRow],
        coverage_review: {
          'api:GET:/close-fixture|vercel-api|make_app': {
            test_coverage: 'none-reviewed',
            contract_fingerprint: contractFingerprint(staleRow),
          },
        },
      },
    };
    expect(
      validateClosedPhaseInvariants({
        document: { ...staleFixture.matrix, phase: 'closed' },
        requirements: staleFixture.requirements,
        families: [{ id: 'close-family', matched_ids: ['api:GET:/close-fixture'] }],
      })
    ).toEqual(
      expect.arrayContaining([
        'closed matrix requirements content hash mismatch',
        'closed matrix requirement match set mismatch: close-family',
        'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/close-fixture/vercel-api/make_app',
      ])
    );
    expect(validateRowIntegrity({ document: staleFixture.matrix, inventory: undefined })).toContain(
      'approved fingerprint mismatch: api:GET:/close-fixture'
    );
  });
});
