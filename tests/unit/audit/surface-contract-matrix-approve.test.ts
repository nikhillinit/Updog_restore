import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  absenceEvidenceFingerprint,
  contractFingerprint,
  dormantCandidateFingerprint,
  listenerDispositionFingerprint,
  orphanResolutionFingerprint,
  runtimeExclusionFingerprint,
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
const temporaryReviewPrefix = path.join(matrixDir, '.g1-review-test-');
let temporaryReviewDirectory = '';
let temporaryReviewPath = '';
let temporaryWorkspaceDirectory = '';

type ApproveModule =
  typeof import('../../../audit/surface-contract-matrix/scripts/approve-matrix.mjs');
let approveModule: ApproveModule;

beforeAll(async () => {
  approveModule = await import('../../../audit/surface-contract-matrix/scripts/approve-matrix.mjs');
});

beforeEach(() => {
  temporaryReviewDirectory = fs.mkdtempSync(temporaryReviewPrefix);
  temporaryReviewPath = path.join(temporaryReviewDirectory, 'review.json');
  mocks.validateMatrix.mockReset().mockResolvedValue({});
  mocks.validateOffRowFingerprints.mockReset().mockReturnValue([]);
  mocks.validateRowIntegrity.mockReset().mockReturnValue([]);
  mocks.validateClosedPhaseInvariants.mockReset().mockReturnValue([]);
  mocks.matchRequirementFamilies.mockReset().mockReturnValue([]);
  mocks.coverageObligations.mockReset().mockReturnValue([]);
  mocks.closureReport.mockReset().mockReturnValue({ passed: true, issues: {}, families: [] });
  mocks.renderMatrix.mockReset().mockReturnValue('# synthetic render\n');
});

afterEach(() => {
  if (temporaryReviewDirectory) fs.rmSync(temporaryReviewDirectory, { recursive: true, force: true });
  temporaryReviewDirectory = '';
  temporaryReviewPath = '';
  if (temporaryWorkspaceDirectory) fs.rmSync(temporaryWorkspaceDirectory, { recursive: true, force: true });
  temporaryWorkspaceDirectory = '';
});

afterAll(() => {
  for (const entry of fs.readdirSync(matrixDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.g1-review-test-')) {
      fs.rmSync(path.join(matrixDir, entry.name), { recursive: true, force: true });
    }
    if (entry.name.startsWith('.g1-approval-workspace-')) {
      fs.rmSync(path.join(matrixDir, entry.name), { recursive: true, force: true });
    }
  }
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

function writeReview(
  overrides: Record<string, unknown> = {},
  reviewPath = temporaryReviewPath,
) {
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
  fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  return { review, row };
}

const workspaceArtifactNames = [
  'matrix.json',
  'source-inventory.json',
  'requirements.json',
  'listener-dispositions.json',
  'dormant-candidates.json',
  'runtime-exclusions.json',
  'orphans.json',
  'MATRIX.md',
];

function createIsolatedWorkspace() {
  temporaryWorkspaceDirectory = fs.mkdtempSync(path.join(matrixDir, '.g1-approval-workspace-'));
  for (const name of workspaceArtifactNames) {
    fs.copyFileSync(path.join(matrixDir, name), path.join(temporaryWorkspaceDirectory, name));
  }
  const files = {
    matrix: path.join(temporaryWorkspaceDirectory, 'matrix.json'),
    inventory: path.join(temporaryWorkspaceDirectory, 'source-inventory.json'),
    requirements: path.join(temporaryWorkspaceDirectory, 'requirements.json'),
    listeners: path.join(temporaryWorkspaceDirectory, 'listener-dispositions.json'),
    candidates: path.join(temporaryWorkspaceDirectory, 'dormant-candidates.json'),
    exclusions: path.join(temporaryWorkspaceDirectory, 'runtime-exclusions.json'),
    orphans: path.join(temporaryWorkspaceDirectory, 'orphans.json'),
    render: path.join(temporaryWorkspaceDirectory, 'MATRIX.md'),
    authOverrides: path.join(temporaryWorkspaceDirectory, 'auth-overrides.json'),
    review: path.join(temporaryWorkspaceDirectory, 'g1-review.json'),
  };
  return { matrixDir: temporaryWorkspaceDirectory, files };
}

describe.sequential('surface contract matrix approval closure safety', () => {
  it('resolves relative review paths from repository root before workspace containment checks', () => {
    const parsed = approveModule.parseArgs([
      '--review-file',
      'audit/surface-contract-matrix/g1-review.json',
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
    ], { matrixDir });
    expect(parsed.reviewFile).toBe(path.join(repoRoot, 'audit/surface-contract-matrix/g1-review.json'));
  });

  it('applies review-manifest row fields and recomputes dependent state in dry-run', async () => {
    const { row } = writeReview();
    const reviewBefore = fs.readFileSync(temporaryReviewPath);
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
    expect(fs.readFileSync(temporaryReviewPath)).toEqual(reviewBefore);
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

  it('rebinds review fingerprints after approval so same manifest can close without weakening stale guards', () => {
    const { review, row } = writeReview();
    const candidateState = structuredClone(currentState()) as ReturnType<typeof currentState>;
    const candidateRow = candidateState.matrix.rows.find((entry) => entry.id === row.id);
    if (!candidateRow) throw new Error(`Missing candidate row ${row.id}`);
    candidateRow.closure_owner = 'fixture-owner';
    candidateRow.closure_gate = 'fixture-gate';
    candidateRow.closure_acceptance = 'fixture-acceptance';
    candidateRow.contract_fingerprint = contractFingerprint(candidateRow);
    const exposure = row.exposures[0];
    if (!exposure) throw new Error(`Missing exposure for ${row.id}`);
    const exposureKey = `${exposure.deployment}|${exposure.runtime}`;
    (review.rows[row.id] as Record<string, unknown>).exposure_attestations = {
      [exposureKey]: {},
    };
    review.exposure_attestations = {
      [`${row.id}|${exposure.deployment}|${exposure.runtime}`]: {},
    };

    const rebound = approveModule.rebindReviewManifest(review, candidateState);
    const reboundEntry = (rebound.rows as Record<string, Record<string, unknown>>)[row.id];
    expect(reboundEntry).toMatchObject({
      row_id: row.id,
      contract_fingerprint: candidateRow.contract_fingerprint,
      source_fingerprints: rowSourceFingerprints(candidateRow, candidateState.inventory),
    });
    expect(
      (reboundEntry.exposure_attestations as Record<string, Record<string, unknown>>)[exposureKey]
        .contract_fingerprint
    ).toBe(candidateRow.contract_fingerprint);
    expect(
      (rebound.exposure_attestations as Record<string, Record<string, unknown>>)[
        `${row.id}|${exposure.deployment}|${exposure.runtime}`
      ].contract_fingerprint
    ).toBe(candidateRow.contract_fingerprint);
    expect(rebound).not.toBe(review);
    expect(review.rows[row.id].contract_fingerprint).not.toBe(candidateRow.contract_fingerprint);
    expect(() => approveModule.verifyManifestKeys(rebound, candidateState, {
      approver: 'fixture-approver',
      evidence: 'fixture-evidence',
    })).not.toThrow();

    const tampered = structuredClone(rebound);
    (tampered.rows as Record<string, Record<string, unknown>>)[row.id].contract_fingerprint = '0'.repeat(64);
    expect(() => approveModule.verifyManifestKeys(tampered, candidateState, {
      approver: 'fixture-approver',
      evidence: 'fixture-evidence',
    })).toThrow(`Review manifest contract fingerprint is stale for ${row.id}`);
  });

  it('rebinds exposure and every off-row fingerprint in same manifest transaction', () => {
    const { review, row } = writeReview();
    const listener = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'listener-dispositions.json'), 'utf8')
    )[0] as Record<string, unknown>;
    const candidate = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'dormant-candidates.json'), 'utf8')
    )[0] as Record<string, unknown>;
    const orphan = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'orphans.json'), 'utf8')
    )[0] as Record<string, unknown>;
    const requirement = JSON.parse(
      fs.readFileSync(path.join(matrixDir, 'requirements.json'), 'utf8')
    ).families[0] as Record<string, unknown>;
    const exclusion = {
      id: 'fixture-exclusion',
      matched_layer: 'fixture-layer',
      rule: 'fixture-rule',
      evidence: ['fixture-exclusion.ts:1'],
    };
    const candidateState = {
      ...structuredClone(currentState()),
      listeners: [listener],
      candidates: [candidate],
      exclusions: [exclusion],
      orphans: [orphan],
      requirements: { families: [requirement] },
      listenerCandidates: [],
    };
    const exposure = row.exposures[0];
    if (!exposure) throw new Error(`Missing exposure for ${row.id}`);
    review.exposure_attestations = {
      [`${row.id}|${exposure.deployment}|${exposure.runtime}`]: {
        contract_fingerprint: 'old-exposure-fingerprint',
      },
    };
    review.off_row_dispositions = {
      listeners: {
        [String(listener.listener_id)]: { listener_id: listener.listener_id, fingerprint: 'old-listener-fingerprint' },
      },
      candidates: {
        [String(candidate.path)]: { path: candidate.path, contract_fingerprint: 'old-candidate-fingerprint' },
      },
      exclusions: {
        [String(exclusion.id)]: { id: exclusion.id, contract_fingerprint: 'old-exclusion-fingerprint' },
      },
      orphans: {
        [String(orphan.id)]: { id: orphan.id, resolution_fingerprint: 'old-orphan-fingerprint', contract_fingerprint: 'old-orphan-fingerprint' },
      },
      requirements: {
        [String(requirement.id)]: { id: requirement.id, contract_fingerprint: 'old-requirement-fingerprint' },
      },
    };

    const rebound = approveModule.rebindReviewManifest(review, candidateState);
    expect(
      (rebound.exposure_attestations as Record<string, Record<string, unknown>>)[
        `${row.id}|${exposure.deployment}|${exposure.runtime}`
      ].contract_fingerprint
    ).toBe(contractFingerprint(row));
    expect(
      (rebound.off_row_dispositions.listeners as Record<string, Record<string, unknown>>)[String(listener.listener_id)].fingerprint
    ).toBe(listenerDispositionFingerprint(listener, undefined));
    expect(
      (rebound.off_row_dispositions.candidates as Record<string, Record<string, unknown>>)[String(candidate.path)].contract_fingerprint
    ).toBe(dormantCandidateFingerprint(candidate));
    expect(
      (rebound.off_row_dispositions.exclusions as Record<string, Record<string, unknown>>)[String(exclusion.id)].contract_fingerprint
    ).toBe(runtimeExclusionFingerprint(exclusion));
    expect(
      (rebound.off_row_dispositions.orphans as Record<string, Record<string, unknown>>)[String(orphan.id)].resolution_fingerprint
    ).toBe(orphanResolutionFingerprint(orphan));
    expect(
      (rebound.off_row_dispositions.requirements as Record<string, Record<string, unknown>>)[String(requirement.id)].contract_fingerprint
    ).toBe(absenceEvidenceFingerprint(requirement));
  });

  it('rejects symlink escapes for atomic base and review target paths', () => {
    const safeRoot = fs.mkdtempSync(path.join(matrixDir, '.g1-symlink-safe-'));
    const outsideRoot = fs.mkdtempSync(path.join(matrixDir, '.g1-symlink-outside-'));
    const escapeParent = path.join(safeRoot, 'escape');
    const symlinkBase = path.join(matrixDir, '.g1-symlink-base-');
    const sentinelPath = path.join(outsideRoot, 'sentinel.txt');
    fs.writeFileSync(sentinelPath, 'external sentinel');
    const sentinelBefore = fs.readFileSync(sentinelPath);
    fs.symlinkSync(outsideRoot, escapeParent, 'dir');
    fs.symlinkSync(outsideRoot, symlinkBase, 'dir');
    try {
      expect(() => approveModule.atomicWriteSet({
        baseDir: safeRoot,
        writes: [[path.join(escapeParent, 'review.json'), 'escape']],
      })).toThrow(/symlink|outside/i);
      expect(() => approveModule.atomicWriteSet({
        baseDir: symlinkBase,
        writes: [[path.join(symlinkBase, 'review.json'), 'escape']],
      })).toThrow(/symlink|outside/i);
      expect(fs.existsSync(path.join(outsideRoot, 'review.json'))).toBe(false);
      expect(fs.readFileSync(sentinelPath)).toEqual(sentinelBefore);
    } finally {
      fs.rmSync(safeRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
      fs.rmSync(symlinkBase, { recursive: true, force: true });
    }
  });

  it('rejects duplicate atomic transaction targets', () => {
    const transactionRoot = fs.mkdtempSync(path.join(matrixDir, '.g1-duplicate-targets-'));
    try {
      expect(() => approveModule.atomicWriteSet({
        baseDir: transactionRoot,
        writes: [
          [path.join(transactionRoot, 'same.json'), 'first'],
          [path.join(transactionRoot, 'same.json'), 'second'],
        ],
      })).toThrow(/duplicate|collision/i);
    } finally {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
    }
  });

  it('rejects reserved review aliases before dry-run approval', async () => {
    const runApproval = (approveModule as unknown as {
      approveMatrixInWorkspace?: (argv: string[], options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).approveMatrixInWorkspace;
    expect(typeof runApproval).toBe('function');
    if (!runApproval) return;
    const workspace = createIsolatedWorkspace();
    const reservedPaths = [
      workspace.files.matrix,
      workspace.files.inventory,
      workspace.files.requirements,
      workspace.files.listeners,
      workspace.files.candidates,
      workspace.files.exclusions,
      workspace.files.orphans,
      workspace.files.render,
      workspace.files.authOverrides,
    ];
    for (const reviewFile of reservedPaths) {
      await expect(runApproval([
        '--review-file',
        reviewFile,
        '--approver',
        'fixture-approver',
        '--evidence',
        'fixture-evidence',
        '--dry-run',
      ], { ...workspace, repoRoot })).rejects.toThrow(/reserved|transaction target/i);
    }
  });

  it('runs non-dry approval then close with one confirmed evidence item and atomic review writes', async () => {
    const runApproval = (approveModule as unknown as {
      approveMatrixInWorkspace?: (argv: string[], options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).approveMatrixInWorkspace;
    expect(typeof runApproval).toBe('function');
    if (!runApproval) return;

    const workspace = createIsolatedWorkspace();
    const reviewPath = workspace.files.review;
    expect(workspace.matrixDir).not.toBe(matrixDir);
    expect(reviewPath).not.toBe(path.join(matrixDir, 'g1-review.json'));
    const { review, row } = writeReview({}, reviewPath);
    const exposure = row.exposures[0];
    if (!exposure) throw new Error(`Missing exposure for ${row.id}`);
    const exposureKey = `${exposure.deployment}|${exposure.runtime}`;
    const existingEvidence = {
      row: row.id,
      deployment: exposure.deployment,
      runtime: exposure.runtime,
      layer: 'unit',
      assertion_evidence: 'existing-evidence',
      assertion_confirmed: true,
      test_file_sha256: 'existing-test-hash',
    };
    const confirmedEvidence = {
      row: row.id,
      deployment: exposure.deployment,
      runtime: exposure.runtime,
      layer: 'unit',
      assertion_evidence: 'confirmed-evidence',
      assertion_confirmed: true,
      test_file_sha256: 'confirmed-test-hash',
    };
    const isolatedMatrix = JSON.parse(fs.readFileSync(workspace.files.matrix, 'utf8')) as {
      rows: Array<Record<string, unknown>>;
      phase?: string;
      g1_closure?: unknown;
    };
    const isolatedRow = isolatedMatrix.rows.find((entry) => entry.id === row.id);
    if (!isolatedRow) throw new Error(`Missing isolated row ${row.id}`);
    isolatedMatrix.phase = 'authoring';
    delete isolatedMatrix.g1_closure;
    isolatedRow.test_evidence = { derived: [], manual: [existingEvidence] };
    fs.writeFileSync(workspace.files.matrix, `${JSON.stringify(isolatedMatrix, null, 2)}\n`);
    (review.rows[row.id] as Record<string, unknown>).exposure_attestations = {
      [exposureKey]: {
        test_coverage: 'confirmed',
        test_evidence: [confirmedEvidence],
      },
    };
    fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
    const options = { ...workspace, repoRoot: workspace.matrixDir };
    expect(options.files.matrix).not.toBe(matrixPath);
    expect(options.files.review).not.toBe(path.join(matrixDir, 'g1-review.json'));

    const first = await runApproval([
      '--review-file',
      reviewPath,
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
    ], options);
    expect(first).toMatchObject({ dry_run: false, close_g1: false, phase: 'authoring' });
    const firstMatrix = JSON.parse(fs.readFileSync(workspace.files.matrix, 'utf8')) as {
      rows: Array<Record<string, unknown>>;
    };
    const firstRow = firstMatrix.rows.find((entry) => entry.id === row.id);
    if (!firstRow) throw new Error(`Missing first-pass row ${row.id}`);
    const firstManual = (firstRow.test_evidence as { manual: Array<Record<string, unknown>> }).manual;
    expect(firstManual.map((entry) => entry.assertion_evidence)).toEqual([
      'confirmed-evidence',
      'existing-evidence',
    ]);
    expect(firstManual.filter((entry) => entry.assertion_evidence === 'confirmed-evidence')).toHaveLength(1);
    const reboundReview = JSON.parse(fs.readFileSync(reviewPath, 'utf8')) as {
      rows: Record<string, { exposure_attestations?: Record<string, { contract_fingerprint?: string }> }>;
    };
    expect(reboundReview.rows[row.id].exposure_attestations?.[exposureKey]?.contract_fingerprint).toBe(
      firstRow.contract_fingerprint
    );
    const reviewAfterApprove = fs.readFileSync(reviewPath);

    const second = await runApproval([
      '--review-file',
      reviewPath,
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
      '--close-g1',
    ], options);
    expect(second).toMatchObject({ dry_run: false, close_g1: true, phase: 'closed' });
    expect(fs.readFileSync(reviewPath)).toEqual(reviewAfterApprove);
    const closedMatrix = JSON.parse(fs.readFileSync(workspace.files.matrix, 'utf8')) as {
      rows: Array<Record<string, unknown>>;
    };
    const closedRow = closedMatrix.rows.find((entry) => entry.id === row.id);
    if (!closedRow) throw new Error(`Missing closed row ${row.id}`);
    const closedManual = (closedRow.test_evidence as { manual: Array<Record<string, unknown>> }).manual;
    expect(closedManual.filter((entry) => entry.assertion_evidence === 'confirmed-evidence')).toHaveLength(1);
    expect(closedManual.map((entry) => entry.assertion_evidence)).toEqual([
      'confirmed-evidence',
      'existing-evidence',
    ]);
  }, 60_000);

  it('rolls back rebound review and generated artifacts when injected install rename fails', async () => {
    const runApproval = (approveModule as unknown as {
      approveMatrixInWorkspace?: (argv: string[], options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).approveMatrixInWorkspace;
    expect(typeof runApproval).toBe('function');
    if (!runApproval) return;

    const workspace = createIsolatedWorkspace();
    const reviewPath = workspace.files.review;
    expect(workspace.matrixDir).not.toBe(matrixDir);
    expect(reviewPath).not.toBe(path.join(matrixDir, 'g1-review.json'));
    writeReview({}, reviewPath);
    const trackedPaths = [...Object.values(workspace.files)];
    const before = trackedPaths.map((file) => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
    const fsApi = Object.create(fs) as typeof fs;
    let stagedInstallCount = 0;
    fsApi.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
      if (String(from).includes('.g1-stage-')) {
        stagedInstallCount += 1;
        if (path.basename(String(to)) === 'g1-review.json') {
          throw new Error('injected final review install failure');
        }
      }
      return fs.renameSync(from, to);
    }) as typeof fs.renameSync;

    await expect(runApproval([
      '--review-file',
      reviewPath,
      '--approver',
      'fixture-approver',
      '--evidence',
      'fixture-evidence',
    ], { ...workspace, repoRoot: workspace.matrixDir, fsApi })).rejects.toThrow('Atomic matrix transaction rolled back');
    expect(stagedInstallCount).toBeGreaterThan(1);
    trackedPaths.forEach((file, index) => {
      const snapshot = before[index];
      if (snapshot === undefined) expect(fs.existsSync(file)).toBe(false);
      else expect(fs.readFileSync(file)).toEqual(snapshot);
    });
    expect(fs.readdirSync(workspace.matrixDir).filter((entry) => (
      entry.startsWith('.g1-stage-') || entry.startsWith('.g1-backup-')
    ))).toEqual([]);
  }, 60_000);

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
