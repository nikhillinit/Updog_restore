import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  contractFingerprint,
  discoverDormantCandidates,
  mergeDormantCandidates,
  mergeMatrix,
  scanBullmqConstructors,
  SurfaceMatrixDocumentSchema,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import { mergeListenerDispositions } from '../../../audit/surface-contract-matrix/scripts/seed-matrix.mjs';

const repoRoot = process.cwd();
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const temporaryRoot = temporaryRoots.pop();
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function makeRow(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'api:GET:/api/synthetic',
    seam: 'synthetic',
    interface: 'http-api',
    personas: ['unknown'],
    reachability: 'railway',
    proven_reachability: 'none',
    exposures: [
      {
        deployment: 'railway-api',
        runtime: 'create_server',
        mount_evidence: 'server/server.ts:1',
        ingresses: [
          {
            external_path: '/api/synthetic',
            express_path: '/api/synthetic',
            rewrite_evidence: 'synthetic',
          },
        ],
        conditions: [],
        definitions: [
          {
            site: 'server/routes/synthetic.ts:10',
            role: 'handler',
            effective_mount_order: 1,
          },
        ],
        boot_status: 'failed',
        boot_evidence: {
          command_or_artifact: 'dist/index.js',
          probe: 'GET /health',
          result: 'failed',
          observed_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
    persistence: 'reads-only',
    destructive: 'none',
    environment: 'staged-only',
    owner: 'unassigned',
    evidence: ['server/routes/synthetic.ts:10'],
    source_mapping: { source: 'synthetic' },
    queue_roles: { producers: [], consumers: [] },
    auth_roles: [],
    behavior_flags: [],
    test_evidence: { derived: [], manual: [] },
    classification: 'unclassified',
    decision: 'keep-and-prove',
    decision_suggestion: 'keep-and-prove',
    decision_status: 'proposed',
    approved_source_hashes: [],
    machine_suggestions: { personas: ['unknown'], persistence: 'reads-only' },
    ...overrides,
  };
  return { ...row, contract_fingerprint: contractFingerprint(row) };
}

function makeDocument(rows: unknown[], overrides: Record<string, unknown> = {}) {
  return SurfaceMatrixDocumentSchema.parse({
    schema_version: '1.0.0',
    phase: 'authoring',
    provenance: { git_head: 'synthetic', snapshot_id: 'synthetic' },
    rows,
    coverage_review: {},
    ...overrides,
  });
}

function createTrackedFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-contract-merge-'));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

describe('surface contract matrix merge engine', () => {
  it('is idempotent and preserves observed_at only for unchanged boot outcomes', () => {
    const row = makeRow();
    const seeded = makeDocument([row]);
    const first = mergeMatrix(makeDocument([]), seeded);
    const second = mergeMatrix(first, seeded);
    expect(second.rows[0].exposures[0].boot_evidence.observed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(second).toEqual(first);

    const flippedRow = makeRow({
      proven_reachability: 'railway',
      exposures: [
        {
          ...row.exposures[0],
          boot_status: 'proven',
          boot_evidence: {
            ...row.exposures[0].boot_evidence,
            result: 'proven',
            observed_at: '2026-01-02',
          },
        },
      ],
    });
    const flipped = mergeMatrix(first, makeDocument([flippedRow]));
    expect(flipped.rows[0].exposures[0].boot_evidence.observed_at).toBe('2026-01-02');
  });

  it('preserves human fields while replacing machine fields and recomputing decisions', () => {
    const previousRow = makeRow({
      personas: ['admin'],
      persistence: 'writes',
      seam_override: 'human-seam',
      decision_override: 'in-contract',
      decision_status: 'approved',
      decision_evidence: 'G1 approval',
    });
    const approved = makeDocument([previousRow]);
    const seededRow = makeRow({
      seam: 'new-machine-seam',
      evidence: ['new-source.ts:20'],
      persistence: 'reads-only',
      decision_override: undefined,
      decision_status: 'proposed',
    });
    const merged = mergeMatrix(approved, makeDocument([seededRow]));
    expect(merged.rows[0]).toMatchObject({
      seam: 'new-machine-seam',
      seam_override: 'human-seam',
      evidence: ['new-source.ts:20'],
      personas: ['admin'],
      persistence: 'writes',
      decision_override: 'in-contract',
      decision: 'in-contract',
      decision_evidence: 'G1 approval',
    });
    expect(merged.rows[0].decision_status).toBe('proposed');
  });

  it('demotes approved rows for fingerprint drift, defining-source hash drift, and machine suggestions', () => {
    const base = makeRow({
      decision_status: 'approved',
      approved_source_hashes: ['server/routes/synthetic.ts=sha-old'],
    });
    const approved = makeDocument([base]);

    const lineDrift = makeRow({
      decision_status: 'proposed',
      approved_source_hashes: ['server/routes/synthetic.ts=sha-old'],
      exposures: [
        {
          ...base.exposures[0],
          definitions: [
            { ...base.exposures[0].definitions[0], site: 'server/routes/other.ts:999' },
          ],
        },
      ],
    });
    expect(mergeMatrix(approved, makeDocument([lineDrift])).rows[0].decision_status).toBe(
      'approved'
    );

    const contractDrift = makeRow({
      behavior_flags: ['new-machine-branch'],
      decision_status: 'proposed',
      approved_source_hashes: ['server/routes/synthetic.ts=sha-old'],
    });
    expect(mergeMatrix(approved, makeDocument([contractDrift])).rows[0].decision_status).toBe(
      'proposed'
    );

    const sourceDrift = makeRow({
      decision_status: 'proposed',
      approved_source_hashes: ['server/routes/synthetic.ts=sha-new'],
    });
    expect(mergeMatrix(approved, makeDocument([sourceDrift])).rows[0].decision_status).toBe(
      'proposed'
    );

    const suggestionDrift = makeRow({
      decision_status: 'proposed',
      approved_source_hashes: ['server/routes/synthetic.ts=sha-old'],
      machine_suggestions: { personas: ['admin'], persistence: 'reads-only' },
    });
    expect(mergeMatrix(approved, makeDocument([suggestionDrift])).rows[0].decision_status).toBe(
      'proposed'
    );
  });

  it('demotes approved rows for proven flips in both directions and handles same-id definitions', () => {
    const failed = makeRow({ decision_status: 'approved' });
    const proven = makeRow({
      proven_reachability: 'railway',
      decision_status: 'proposed',
      exposures: [
        {
          ...failed.exposures[0],
          boot_status: 'proven',
          boot_evidence: { ...failed.exposures[0].boot_evidence, result: 'proven' },
        },
      ],
    });
    const provenApproved = makeDocument([makeRow({ ...proven, decision_status: 'approved' })]);
    expect(mergeMatrix(provenApproved, makeDocument([failed])).rows[0].decision_status).toBe(
      'proposed'
    );
    expect(
      mergeMatrix(makeDocument([failed]), makeDocument([proven])).rows[0].decision_status
    ).toBe('proposed');

    const secondDefinition = makeRow({
      exposures: [
        {
          ...failed.exposures[0],
          deployment: 'vercel-api',
          runtime: 'make_app',
          definitions: [{ site: 'server/app.ts:20', role: 'shadowed', effective_mount_order: 2 }],
        },
      ],
    });
    const merged = mergeMatrix(makeDocument([]), makeDocument([failed, secondDefinition]));
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].exposures).toHaveLength(2);
  });

  it('hard-fails canonical collisions, emits orphans, and re-enters retained replacements as proposed', () => {
    expect(() =>
      mergeMatrix(
        makeDocument([]),
        makeDocument([
          makeRow({ id: 'api:GET /api/collision' }),
          makeRow({ id: 'api:get:/api/collision' }),
        ])
      )
    ).toThrow('Canonical row-id collision');

    const vanished = makeRow();
    const emitted = mergeMatrix(makeDocument([vanished]), makeDocument([]));
    expect(emitted.rows).toHaveLength(0);
    expect(emitted.orphans[0]).toMatchObject({ id: vanished.id, resolution: 'unresolved' });

    const retained = {
      ...emitted,
      orphans: [
        {
          ...emitted.orphans[0],
          resolution: 'retained',
          replacement_row: makeRow({ evidence: ['replacement.ts:1'] }),
        },
      ],
    };
    const reentered = mergeMatrix(retained, makeDocument([]));
    expect(reentered.rows).toHaveLength(1);
    expect(reentered.rows[0].decision_status).toBe('proposed');
    expect(reentered.rows[0].evidence).toEqual(['replacement.ts:1']);
  });

  it('preserves valid coverage reviews, invalidates fingerprint drift, and protects closed phase', () => {
    const row = makeRow();
    const key = `${row.id}|railway-api|create_server`;
    const previous = makeDocument([row], {
      phase: 'closed',
      coverage_review: {
        [key]: { test_coverage: 'none-reviewed', contract_fingerprint: row.contract_fingerprint },
      },
    });
    const preserved = mergeMatrix(previous, makeDocument([row], { phase: 'closed' }));
    expect(preserved.coverage_review[key]).toBeDefined();
    expect(() => mergeMatrix(previous, makeDocument([row], { phase: 'authoring' }))).toThrow(
      'Cannot write authoring matrix over closed matrix'
    );

    const changed = makeRow({ behavior_flags: ['changed-machine-branch'] });
    const invalidated = mergeMatrix(previous, makeDocument([changed], { phase: 'closed' }));
    expect(invalidated.coverage_review[key]).toBeUndefined();

    const removed = mergeMatrix(previous, makeDocument([], { phase: 'closed' }));
    expect(removed.orphans[0]).toMatchObject({ id: row.id, resolution: 'unresolved' });
    expect(removed.coverage_review[key]).toBeUndefined();
  });
});

describe('surface contract matrix dormant candidates', () => {
  it('follows lazy, alias, named, and wrapper imports while ignoring type/test/story imports', () => {
    const root = createTrackedFixture({
      'client/src/app/app-routes.tsx': `
        import { NamedScreen } from '@/pages/named';
        import Wrapper from '@/components/Wrapper';
        import type { TypeOnly } from '@/pages/type-only';
        import { type TypeOnlyNamed } from '@/pages/type-only-named';
        const Lazy = React.lazy(() => import('@/pages/lazy'));
        export const routes = [NamedScreen, Wrapper, Lazy];
      `,
      'client/src/components/Wrapper.tsx': `import Wrapped from '@/pages/wrapped'; export default Wrapped;`,
      'client/src/pages/named.tsx': `export function NamedScreen() { return null; }`,
      'client/src/pages/lazy.tsx': `export default function Lazy() { return null; }`,
      'client/src/pages/wrapped.tsx': `export default function Wrapped() { return null; }`,
      'client/src/pages/type-only.tsx': `export default function TypeOnly() { return null; }`,
      'client/src/pages/type-only-named.tsx': `export default function TypeOnlyNamed() { return null; }`,
      'client/src/pages/unwired.tsx': `export default function Unwired() { return null; }`,
      'client/src/pages/only-test.tsx': `export default function OnlyTest() { return null; }`,
      'tests/only-test.test.ts': `import '@/pages/only-test';`,
      'client/src/pages/demo.stories.tsx': `export default function Story() { return null; }`,
    });
    const candidates = discoverDormantCandidates({ rootDir: root });
    expect(candidates.map((candidate) => candidate.path)).toEqual([
      'client/src/pages/only-test.tsx',
      'client/src/pages/type-only-named.tsx',
      'client/src/pages/type-only.tsx',
      'client/src/pages/unwired.tsx',
    ]);

    const merged = mergeDormantCandidates(
      [{ path: 'client/src/pages/unwired.tsx', disposition: 'promote', evidence: 'G1' }],
      candidates
    );
    expect(merged.find((candidate) => candidate.path.endsWith('/unwired.tsx'))).toMatchObject({
      disposition: 'promote',
      evidence: 'G1',
      exists: true,
    });
  });
});

describe('surface contract matrix listener disposition merge', () => {
  it('preserves approved human lifecycle fields while refreshing machine evidence', () => {
    const previous = [
      {
        candidate_path: 'server/synthetic-listener.ts',
        listener_id: 'synthetic-listener',
        disposition: 'non-product-tooling',
        rationale: 'human tooling decision',
        evidence: ['G1 evidence'],
        decision_status: 'approved',
        decision_evidence: 'G1 approval',
        fingerprint: '0'.repeat(64),
      },
    ];
    const discovered = [
      {
        candidate_path: 'server/synthetic-listener.ts',
        listener_id: 'synthetic-listener',
        disposition: 'non-product-tooling',
        rationale: 'machine rationale',
        evidence: ['server/synthetic-listener.ts:10'],
        fingerprint: '0'.repeat(64),
      },
    ];
    const merged = mergeListenerDispositions(previous, discovered, [
      {
        path: 'server/synthetic-listener.ts',
        patterns: [{ kind: 'node-listen', line: 10, text: 'app.listen(1)' }],
      },
    ]);
    expect(merged[0]).toMatchObject({
      rationale: 'human tooling decision',
      evidence: ['G1 evidence'],
      decision_status: 'proposed',
      decision_evidence: 'G1 approval',
    });
    expect(merged[0].fingerprint).not.toBe('0'.repeat(64));
  });
});

describe('surface contract matrix BullMQ discovery', () => {
  it('finds quarantined constructor-default queue names absent from the active catalog', () => {
    const findings = scanBullmqConstructors({ rootDir: repoRoot });
    const defaults = findings.filter((finding) => finding.queue_name === 'lp-view-refresh');
    expect(defaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queue_name: 'lp-view-refresh', source: 'parameter-default' }),
      ])
    );
    expect(findings.some((finding) => finding.queue_name === 'capital-call-status')).toBe(true);
    expect(defaults.every((finding) => !finding.path.includes('/tests/'))).toBe(true);
  });
});
