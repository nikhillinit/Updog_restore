import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  contractFingerprint,
  dormantCandidateFingerprint,
  orphanResolutionFingerprint,
  SurfaceMatrixDocumentSchema,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';

const mocks = vi.hoisted(() => ({
  validateMatrix: vi.fn(async () => ({})),
  validateOffRowFingerprints: vi.fn(() => []),
  validateRowIntegrity: vi.fn(() => []),
  validateClosedPhaseInvariants: vi.fn(() => []),
  matchRequirementFamilies: vi.fn(() => []),
  coverageObligations: vi.fn(() => []),
  closureReport: vi.fn(() => ({ passed: true, issues: {}, families: [] })),
  renderMatrix: vi.fn(() => '# synthetic render\n'),
}));

vi.mock('../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs', () => mocks);
vi.mock('../../../audit/surface-contract-matrix/scripts/render-matrix.mjs', () => ({
  renderMatrix: mocks.renderMatrix,
}));

const repoRoot = process.cwd();
const matrixDir = path.join(repoRoot, 'audit/surface-contract-matrix');
const matrixPath = path.join(matrixDir, 'matrix.json');
const inventoryPath = path.join(matrixDir, 'source-inventory.json');
const temporaryReviewPath = path.join(matrixDir, '.g1-review-test.json');

type ApproveModule =
  typeof import('../../../audit/surface-contract-matrix/scripts/approve-matrix.mjs');
let approveModule: ApproveModule;

beforeAll(async () => {
  approveModule = await import('../../../audit/surface-contract-matrix/scripts/approve-matrix.mjs');
});

beforeEach(() => {
  mocks.validateMatrix.mockReset().mockResolvedValue({});
  mocks.validateOffRowFingerprints.mockReset().mockReturnValue([]);
  mocks.validateRowIntegrity.mockReset().mockReturnValue([]);
  mocks.validateClosedPhaseInvariants.mockReset().mockReturnValue([]);
  mocks.matchRequirementFamilies.mockReset().mockReturnValue([]);
  mocks.coverageObligations.mockReset().mockReturnValue([]);
  mocks.closureReport.mockReset().mockReturnValue({ passed: true, issues: {}, families: [] });
  mocks.renderMatrix.mockReset().mockReturnValue('# synthetic render\n');
  if (fs.existsSync(temporaryReviewPath)) fs.rmSync(temporaryReviewPath, { force: true });
});

afterAll(() => {
  if (fs.existsSync(temporaryReviewPath)) fs.rmSync(temporaryReviewPath, { force: true });
});

function currentState() {
  const matrix = SurfaceMatrixDocumentSchema.parse(JSON.parse(fs.readFileSync(matrixPath, 'utf8')));
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    snapshot_id: string;
    source_hashes: Record<string, string>;
    row_to_sources: Record<string, string[]>;
  };
  return { matrix, inventory };
}

function rowSourceFingerprints(
  row: { id: string; source_mapping?: Record<string, unknown> },
  inventory: ReturnType<typeof currentState>['inventory']
) {
  const sources = new Set(
    [
      ...(inventory.row_to_sources[row.id] ?? []),
      row.source_mapping?.source_file,
      row.source_mapping?.function_file,
      row.source_mapping?.handler_file,
    ].filter((value): value is string => typeof value === 'string')
  );
  return [...sources]
    .sort((left, right) => left.localeCompare(right))
    .map((source) =>
      inventory.source_hashes[source] ? `${source}=${inventory.source_hashes[source]}` : undefined
    )
    .filter((value): value is string => Boolean(value));
}

function writeReview(overrides: Record<string, unknown> = {}) {
  const { matrix, inventory } = currentState();
  const row =
    matrix.rows.find((entry) => rowSourceFingerprints(entry, inventory).length > 0) ??
    matrix.rows[0];
  const review = {
    schema_version: '1.0.0',
    review_id: 'fixture-g1',
    snapshot_id: inventory.snapshot_id,
    source_fingerprints: inventory.source_hashes,
    approver_id: 'fixture-approver',
    evidence_ref: 'fixture-evidence',
    persona_mappings: AUTH_IDENTITY_PERSONA_MAPPING,
    rows: {
      [row.id]: {
        row_id: row.id,
        contract_fingerprint: contractFingerprint(row),
        source_fingerprints: rowSourceFingerprints(row, inventory),
        reviewed_fields: {
          closure_owner: 'fixture-owner',
          closure_gate: 'fixture-gate',
          closure_acceptance: 'fixture-acceptance',
        },
      },
    },
    ...overrides,
  };
  fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
  return { review, row };
}

describe('surface contract matrix approval closure safety', () => {
  it('applies review-manifest row fields and recomputes dependent state in dry-run', async () => {
    const { row } = writeReview();
    const result = await approveModule.approveMatrix([
      '--review-file',
      temporaryReviewPath,
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
      '--dry-run',
    ]);
    expect(result).toMatchObject({ command: 'approve', reviewed_rows: 1, manifest_rows: 1 });
    expect(mocks.renderMatrix).toHaveBeenCalledOnce();
    expect(row.id).toBeTruthy();
  });

  it('binds none-reviewed coverage fingerprints after closure fields are applied', async () => {
    const { review, row } = writeReview();
    review.rows[row.id].reviewed_fields = {};
    review.rows[row.id].exposure_attestations = Object.fromEntries(
      (row.exposures ?? []).map((exposure) => [
        `${exposure.deployment}|${exposure.runtime}`,
        { test_coverage: 'none-reviewed', evidence: 'reviewed-none' },
      ])
    );
    review.closure = {
      rows: {
        [row.id]: {
          closure_owner: 'closure-owner',
          closure_gate: 'closure-gate',
          closure_acceptance: 'closure-acceptance',
        },
      },
    };
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    const actualValidation = await vi.importActual<
      typeof import('../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs')
    >('../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs');
    mocks.validateRowIntegrity.mockImplementation(actualValidation.validateRowIntegrity);

    const result = await approveModule.approveMatrix([
      '--review-file',
      temporaryReviewPath,
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
      '--dry-run',
    ]);
    expect(result).toMatchObject({ reviewed_rows: 1, coverage_obligations: expect.any(Number) });
  });

  it('does not rebind prior coverage attestations when current manifest omits them', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'audit/surface-contract-matrix/scripts/approve-matrix.mjs'),
      'utf8'
    );
    const start = source.indexOf('const bindCoverageFingerprints =');
    const end = source.indexOf('const reviewEntryByKey =', start);
    const body = `${source.slice(start, end)}\nglobalThis.__bindCoverageFingerprints = bindCoverageFingerprints;`;
    const context = vm.createContext({
      canonicalRowId: (value: string) => value,
      contractFingerprint,
    });
    new vm.Script(body).runInContext(context);
    const bindCoverageFingerprints = (
      context as unknown as {
        __bindCoverageFingerprints: (state: Record<string, unknown>, keys: Set<string>) => void;
      }
    ).__bindCoverageFingerprints;
    const { matrix } = currentState();
    const row = matrix.rows[0];
    const exposure = row.exposures[0];
    if (!exposure) throw new Error('Expected exposure fixture');
    const key = `${row.id}|${exposure.deployment}|${exposure.runtime}`;
    const stale = {
      matrix: {
        rows: [{ ...row, closure_owner: 'new-owner' }],
        coverage_review: {
          [key]: {
            test_coverage: 'none-reviewed',
            contract_fingerprint: 'old-fingerprint',
            evidence: 'old-review',
          },
        },
      },
    } as {
      matrix: {
        rows: typeof matrix.rows;
        coverage_review: Record<string, { contract_fingerprint: string }>;
      };
    };
    bindCoverageFingerprints(stale, new Set());
    expect(stale.matrix.coverage_review[key].contract_fingerprint).toBe('old-fingerprint');
  });

  it('rejects stale source fingerprints and CLI-vs-manifest identity mismatches', async () => {
    const { review } = writeReview({
      source_fingerprints: {
        ...reviewSourceFingerprints(),
        'package.json#scripts': '0'.repeat(64),
      },
    });
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('Review manifest source fingerprints or snapshot are stale');

    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    const valid = writeReview();
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'wrong-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('--approver does not match manifest approver_id');
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(valid.review, null, 2)}\n`);
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'wrong-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('--evidence does not match manifest evidence_ref');
  });

  it('requires complete persona mappings identical to the locked G1 table', async () => {
    const { review } = writeReview({
      persona_mappings: { admin: AUTH_IDENTITY_PERSONA_MAPPING.admin },
    });
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('Persona mappings must be complete and match the locked G1 persona table');
  });

  it('does not permit manifest edits to source-derived auth evidence', async () => {
    const { review, row } = writeReview();
    review.rows[row.id].reviewed_fields = { auth_evidence: [] };
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow(`Unsupported reviewed row field ${row.id}:auth_evidence`);
  });

  it('initializes requirement and orphan review entries with current fingerprints', async () => {
    await approveModule.approveMatrix(['init-review', '--review-file', temporaryReviewPath]);
    const review = JSON.parse(fs.readFileSync(temporaryReviewPath, 'utf8')) as {
      off_row_dispositions?: {
        requirements?: Record<string, { contract_fingerprint?: string }>;
        orphans?: Record<string, { resolution_fingerprint?: string }>;
      };
    };
    const requirementEntries = Object.values(review.off_row_dispositions?.requirements ?? {});
    expect(requirementEntries.length).toBeGreaterThan(0);
    expect(
      requirementEntries.every((entry) => typeof entry.contract_fingerprint === 'string')
    ).toBe(true);
    const orphanEntries = Object.values(review.off_row_dispositions?.orphans ?? {});
    const trackedOrphans = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'orphans.json'), 'utf8')
    ) as Array<Record<string, unknown> & { id: string }>;
    expect(orphanEntries.length).toBe(trackedOrphans.length);
    expect(orphanEntries.every((entry) => typeof entry.resolution_fingerprint === 'string')).toBe(
      true
    );
    expect(orphanEntries[0]?.resolution_fingerprint).toBe(
      orphanResolutionFingerprint(trackedOrphans[0])
    );
  });

  it('schema-validates mutated off-row artifacts before any write', async () => {
    const { review } = writeReview();
    const candidates = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'dormant-candidates.json'), 'utf8')
    ) as Array<Record<string, unknown> & { path: string }>;
    const candidate = candidates[0];
    if (!candidate) throw new Error('Expected dormant candidate fixture');
    review.off_row_dispositions = {
      candidates: {
        [candidate.path]: {
          path: candidate.path,
          disposition: { malformed: true },
          contract_fingerprint: dormantCandidateFingerprint(candidate),
        },
      },
    };
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    const trackedPaths = [
      matrixPath,
      path.join(matrixDir, 'requirements.json'),
      path.join(matrixDir, 'listener-dispositions.json'),
      path.join(matrixDir, 'dormant-candidates.json'),
      path.join(matrixDir, 'runtime-exclusions.json'),
      path.join(matrixDir, 'orphans.json'),
      path.join(matrixDir, 'MATRIX.md'),
    ];
    const before = trackedPaths.map((file) => fs.readFileSync(file));
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('candidate/off-row schema validation');
    expectByteSnapshotsUnchanged(trackedPaths, before);
  }, 60_000);

  it('rejects stale off-row review fingerprints before applying dispositions', async () => {
    const { review } = writeReview();
    const candidates = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'dormant-candidates.json'), 'utf8')
    ) as Array<Record<string, unknown> & { path: string }>;
    const candidate = candidates[0];
    if (!candidate) throw new Error('Expected dormant candidate fixture');
    review.off_row_dispositions = {
      candidates: {
        [candidate.path]: {
          path: candidate.path,
          disposition: 'promote',
          contract_fingerprint: '0'.repeat(64),
        },
      },
    };
    fs.writeFileSync(temporaryReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    await expect(
      approveModule.approveMatrix([
        '--review-file',
        temporaryReviewPath,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ])
    ).rejects.toThrow('Off-row manifest fingerprint is stale candidates:');
  });

  it('refuses writes when full pre-write validation reports a closure failure', async () => {
    writeReview();
    mocks.closureReport.mockReturnValue({
      passed: false,
      issues: { missing_closure_fields: ['fixture-row'] },
      families: [],
    });
    const trackedPaths = [
      matrixPath,
      path.join(matrixDir, 'requirements.json'),
      path.join(matrixDir, 'listener-dispositions.json'),
      path.join(matrixDir, 'dormant-candidates.json'),
      path.join(matrixDir, 'runtime-exclusions.json'),
      path.join(matrixDir, 'orphans.json'),
      path.join(matrixDir, 'MATRIX.md'),
    ];
    const before = trackedPaths.map((file) => fs.readFileSync(file));
    const originalReadFileSync = fs.readFileSync.bind(fs);
    const authoringMatrix = {
      ...currentState().matrix,
      phase: 'authoring',
    };
    const readFileSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(((file, ...args) => {
      if (path.resolve(String(file)) === matrixPath) {
        return `${JSON.stringify(authoringMatrix, null, 2)}\n`;
      }
      return originalReadFileSync(file, ...args);
    }) as typeof fs.readFileSync);
    try {
      await expect(
        approveModule.approveMatrix([
          '--review-file',
          temporaryReviewPath,
          '--approver',
          'fixture-approver',
          '--evidence',
          'fixture-evidence',
          '--close-g1',
        ])
      ).rejects.toThrow('Approval validation failed');
    } finally {
      readFileSpy.mockRestore();
    }
    expectByteSnapshotsUnchanged(trackedPaths, before);
  }, 60_000);

  it('preserves originals when atomic rename fails before backup or between backup and install', () => {
    const runFailure = (failureAt: number) => {
      const files = new Map<string, string>([
        [path.join(matrixDir, 'fixture-a.json'), 'old-a'],
        [path.join(matrixDir, 'fixture-b.json'), 'old-b'],
        [path.join(matrixDir, 'fixture-c.json'), 'old-c'],
      ]);
      let tempId = 0;
      let renameCount = 0;
      const fsApi = {
        mkdtempSync: (prefix: string) => `${prefix}${(tempId += 1)}`,
        mkdirSync: () => undefined,
        writeFileSync: (file: string, value: string) => {
          files.set(file, value);
        },
        existsSync: (file: string) => files.has(file),
        renameSync: (from: string, to: string) => {
          renameCount += 1;
          if (renameCount === failureAt) throw new Error(`injected rename failure ${failureAt}`);
          const value = files.get(from);
          if (value === undefined) throw new Error(`missing virtual file ${from}`);
          files.delete(from);
          files.set(to, value);
        },
        rmSync: (target: string, options?: { recursive?: boolean }) => {
          if (options?.recursive) {
            for (const file of [...files.keys()]) if (file.startsWith(target)) files.delete(file);
          } else files.delete(target);
        },
      };
      const before = new Map(files);
      expect(() =>
        approveModule.atomicWriteSet({
          writes: [
            [path.join(matrixDir, 'fixture-a.json'), 'new-a'],
            [path.join(matrixDir, 'fixture-b.json'), 'new-b'],
          ],
          deletes: [path.join(matrixDir, 'fixture-c.json')],
          fsApi,
        })
      ).toThrow('Atomic matrix transaction rolled back');
      expect(files).toEqual(before);
    };

    runFailure(1); // before any original target is backed up
    runFailure(4); // after all backups, before any replacement is installed
    runFailure(5); // after one replacement is installed
  });

  it('fresh reset clears row review fields in memory before write planning', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'audit/surface-contract-matrix/scripts/approve-matrix.mjs'),
      'utf8'
    );
    const start = source.indexOf('const resetRowReview =');
    const end = source.indexOf('const validateCandidate =', start);
    const body = `${source.slice(start, end)}\nglobalThis.__freshState = freshState;`;
    const context = vm.createContext({
      clone: structuredClone,
      structuredClone,
      contractFingerprint,
    });
    new vm.Script(body).runInContext(context);
    const freshState = (
      context as unknown as {
        __freshState: (state: Record<string, unknown>) => Record<string, unknown>;
      }
    ).__freshState;
    const state = {
      matrix: {
        phase: 'closed',
        coverage_review: { stale: true },
        g1_closure: { owner: 'old' },
        rows: [
          {
            id: 'api:GET:/fixture',
            personas: ['admin'],
            persistence: 'writes',
            destructive: 'soft',
            environment: 'staged-only',
            owner: 'gp-team',
            classification: 'classified',
            decision: 'in-contract',
            decision_suggestion: 'keep-and-prove',
            decision_status: 'approved',
            approved_source_hashes: ['old'],
            decision_evidence: 'old',
            seam_override: 'old',
            closure_owner: 'old',
            closure_gate: 'old',
            closure_acceptance: 'old',
            test_evidence: { derived: [], manual: [{ layer: 'unit' }] },
            machine_suggestions: {
              personas: ['unknown'],
              persistence: 'unknown',
              destructive: 'unknown',
              owner: 'unassigned',
            },
          },
        ],
      },
      listeners: [{ decision_status: 'approved', decision_evidence: 'old', fingerprint: 'old' }],
      candidates: [
        {
          disposition: 'promote',
          decision_status: 'approved',
          decision_evidence: 'old',
          contract_fingerprint: 'old',
        },
      ],
      exclusions: [
        {
          id: 'old-exclusion',
          disposition: 'keep',
          resolution: 'retain',
          decision_status: 'approved',
          decision_evidence: 'old',
          disposition_evidence: 'old',
          resolution_evidence: 'old',
          contract_fingerprint: 'old',
          fingerprint: 'old',
        },
      ],
      orphans: [
        {
          id: 'old-orphan',
          resolution: 'retained',
          decision_status: 'approved',
          decision_evidence: 'old',
          disposition: 'retain',
          disposition_evidence: 'old',
          resolution_evidence: 'old',
          resolution_fingerprint: 'old',
          contract_fingerprint: 'old',
          last_contract_fingerprint: 'old',
        },
      ],
      requirements: {
        families: [
          {
            absence_evidence: { status: 'approved', fingerprint: 'old', result: 'No row present.' },
          },
        ],
      },
    };
    const reset = freshState(state);
    const row = (reset.matrix as { rows: Array<Record<string, unknown>> }).rows[0];
    expect(reset.matrix).toMatchObject({ phase: 'authoring', coverage_review: {} });
    expect((reset.matrix as { g1_closure?: unknown }).g1_closure).toBeUndefined();
    expect(row).toMatchObject({
      decision_status: 'proposed',
      classification: 'unclassified',
      approved_source_hashes: [],
      personas: ['unknown'],
      persistence: 'unknown',
      destructive: 'unknown',
      owner: 'unassigned',
    });
    expect(row.decision_evidence).toBeUndefined();
    expect(row.closure_owner).toBeUndefined();
    expect(reset.listeners).toEqual([]);
    expect((reset.candidates as Array<Record<string, unknown>>)[0].disposition).toBeUndefined();
    expect(
      (reset.candidates as Array<Record<string, unknown>>)[0].decision_evidence
    ).toBeUndefined();
    expect((reset.exclusions as Array<Record<string, unknown>>)[0].disposition).toBeUndefined();
    expect((reset.exclusions as Array<Record<string, unknown>>)[0].resolution).toBeUndefined();
    expect(
      (reset.exclusions as Array<Record<string, unknown>>)[0].decision_evidence
    ).toBeUndefined();
    expect((reset.orphans as Array<Record<string, unknown>>)[0].resolution).toBeUndefined();
    expect(
      (reset.orphans as Array<Record<string, unknown>>)[0].resolution_evidence
    ).toBeUndefined();
    expect(
      (reset.orphans as Array<Record<string, unknown>>)[0].last_contract_fingerprint
    ).toBeUndefined();
    expect(
      (reset.requirements as { families: Array<Record<string, unknown>> }).families[0]
        .absence_evidence
    ).toEqual({
      status: 'proposed',
      result: 'No row present.',
    });
  });

  it('uses reset-safe validation before KG regeneration', async () => {
    mocks.validateMatrix.mockRejectedValue(new Error('knowledge graph unavailable'));
    await expect(approveModule.approveMatrix(['--fresh', '--dry-run'])).resolves.toMatchObject({
      command: 'fresh',
      dry_run: true,
    });
    expect(mocks.validateMatrix).not.toHaveBeenCalled();
  });
});

function reviewSourceFingerprints() {
  return currentState().inventory.source_hashes;
}

function expectByteSnapshotsUnchanged(paths: string[], before: Buffer[]) {
  const after = paths.map((file) => fs.readFileSync(file));
  expect(after).toHaveLength(before.length);
  after.forEach((snapshot, index) => {
    expect(snapshot.equals(before[index])).toBe(true);
  });
}
