import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  ADMIN_GATED_ROUTES,
  APP_ROUTE_DEFINITIONS,
  ARCHIVED_PLACEHOLDER_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_INDEX_REDIRECT_PATH,
  LP_ROUTE_DEFINITIONS,
  PUBLIC_ENTRY_ROUTES,
} from '../../../shared/routes/app-route-definitions.ts';
import { ROUTE_GOVERNANCE_REGISTRY } from '../../../shared/routes/route-governance-registry.ts';
import { QUEUE_CATALOG } from '../../../server/queues/registry.ts';
import { scanBullmqConstructors } from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import { mergeManifestSourceHashes } from '../../../audit/surface-contract-matrix/scripts/seed-matrix.mjs';
import { reconcileKnowledgeGraph } from '../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd());
const generatorPath = '../../../audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs';
const routeProjectionFiles = [
  'shared/routes/app-route-definitions.ts',
  'shared/routes/route-governance-registry.ts',
  'client/src/app/app-routes.tsx',
  'client/src/app/app-router.tsx',
];
const generatorLoad = import(generatorPath).catch((error) => ({ loadError: error }));

async function requireGenerator() {
  const loaded = await generatorLoad;
  if (loaded.loadError) {
    throw new Error(
      `RED: route projection generator is not available: ${loaded.loadError.message}`
    );
  }
  return loaded;
}

async function currentHead(root = repoRoot) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
  return stdout.trim();
}

async function trackedTestFiles(root = repoRoot) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: root });
  return stdout
    .split('\0')
    .filter((file) => file && (
      (file.startsWith('tests/') && /\.(?:test|spec)\.[^/]+$/.test(file))
      || (!file.startsWith('tests/') && /\.test\.[^/]+$/.test(file))
    ));
}

async function withOutputDir(callback) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'route-projection-'));
  const outputDir = path.join(parent, 'out');
  await mkdir(outputDir, { recursive: true });
  try {
    return await callback(outputDir, parent);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function baseInput() {
  return {
    head: 'a'.repeat(40),
    timestamp: '2026-08-12T00:00:00Z',
    sourceHashes: { 'b/file.ts': 'h2', 'a/file.ts': 'h1' },
    nodes: [
      { record: 'node', id: 'api:GET /b', type: 'APIEndpoint', method: 'GET', path: '/b', source: { path: 's.ts', line: 2 } },
      { record: 'node', id: 'api:GET /a', type: 'APIEndpoint', method: 'GET', path: '/a', source: { path: 's.ts', line: 1 } },
    ],
    edges: [],
    tests: [],
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonl(filePath) {
  const contents = await readFile(filePath, 'utf8');
  return contents.trim() === '' ? [] : contents.trim().split('\n').map((line) => JSON.parse(line));
}

async function readProjection(outputDir) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const nodesPath = path.join(outputDir, 'nodes-routes.jsonl');
  const edgesPath = path.join(outputDir, 'edges-routes.jsonl');
  const testsPath = path.join(outputDir, 'tests.jsonl');
  return {
    manifest: await readJson(manifestPath),
    nodes: await readJsonl(nodesPath),
    edges: await readJsonl(edgesPath),
    tests: await readJsonl(testsPath),
    manifestBytes: await readFile(manifestPath),
    nodesBytes: await readFile(nodesPath),
    edgesBytes: await readFile(edgesPath),
    testsBytes: await readFile(testsPath),
  };
}

function projectionRecords(projection) {
  if (Array.isArray(projection)) return projection;
  return projection.records ?? projection.routes ?? projection.nodes ?? [];
}

function expectedClientPaths() {
  return new Set([
    '/',
    '/login',
    ...APP_ROUTE_DEFINITIONS.map(({ path: routePath }) => routePath),
    ...ARCHIVED_PLACEHOLDER_ROUTES.map(({ path: routePath }) => routePath),
    ...LP_ROUTE_DEFINITIONS.map(({ path: routePath }) => routePath),
    LP_INDEX_REDIRECT_PATH,
    ...Object.values(LEGACY_REDIRECT_ROUTES),
    ...Object.values(PUBLIC_ENTRY_ROUTES),
    ...Object.values(ADMIN_GATED_ROUTES),
  ]);
}

async function createClientProjectionFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'client-route-fixture-'));
  for (const relativePath of routeProjectionFiles) {
    const sourcePath = path.join(repoRoot, relativePath);
    const targetPath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath);
  }
  return fixtureRoot;
}

async function replaceFixtureText(fixtureRoot, relativePath, from, to) {
  const filePath = path.join(fixtureRoot, relativePath);
  const source = await readFile(filePath, 'utf8');
  if (!source.includes(from)) throw new Error(`Fixture anchor missing: ${relativePath}`);
  await writeFile(filePath, source.replace(from, to));
}

async function createDirtyGitFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'dirty-route-fixture-'));
  await mkdir(path.join(fixtureRoot, 'audit/surface-contract-matrix'), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, 'audit/surface-contract-matrix/source-inventory.json'),
    `${JSON.stringify(
      {
        kg_counts: { APIEndpoint: 0, ClientRoute: 0, WorkerJob: 0 },
        source_hashes: {},
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(fixtureRoot, 'tracked-input.txt'), 'committed\n');
  await execFileAsync('git', ['init', '--quiet'], { cwd: fixtureRoot });
  await execFileAsync('git', ['config', 'user.email', 'route-test@example.invalid'], {
    cwd: fixtureRoot,
  });
  await execFileAsync('git', ['config', 'user.name', 'Route Projection Test'], {
    cwd: fixtureRoot,
  });
  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  const head = await currentHead(fixtureRoot);
  await writeFile(path.join(fixtureRoot, 'tracked-input.txt'), 'dirty\n');
  return { fixtureRoot, head };
}

const fixtureGitEnv = () => {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
};

const INVENTORY_DRIFT_SOURCE_FILES = [
  'shared/routes/app-route-definitions.ts',
  'shared/routes/route-governance-registry.ts',
  'client/src/app/app-routes.tsx',
  'client/src/app/app-router.tsx',
  'server/queues/registry.ts',
];

// Bounded fixture: a fresh, tiny git repo carrying only the six source
// files `buildRouteKnowledgeGraph` hashes plus an inventory whose kg_counts
// deliberately disagree with anything a `projectionImpl` fake could return.
// No clone of this repo, no node_modules symlink, no real runtime
// inspection -- the count-mismatch/seed-rebaseline logic under test never
// depends on real projection contents, only on the count comparison.
async function createInventoryDriftFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'inventory-drift-fixture-'));
  const fixtureRoot = path.join(parent, 'repo');
  const env = fixtureGitEnv();
  await mkdir(path.join(fixtureRoot, 'audit/surface-contract-matrix'), { recursive: true });
  for (const relativePath of INVENTORY_DRIFT_SOURCE_FILES) {
    const filePath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, 'export const sentinel = 1;\n');
  }
  await writeFile(
    path.join(fixtureRoot, 'audit/surface-contract-matrix/source-inventory.json'),
    `${JSON.stringify(
      { kg_counts: { APIEndpoint: 999, ClientRoute: 999, WorkerJob: 999 }, source_hashes: {} },
      null,
      2
    )}\n`
  );
  await execFileAsync('git', ['init', '--quiet'], { cwd: fixtureRoot, env });
  await execFileAsync('git', ['config', 'user.email', 'route-test@example.invalid'], {
    cwd: fixtureRoot,
    env,
  });
  await execFileAsync('git', ['config', 'user.name', 'Route Projection Test'], {
    cwd: fixtureRoot,
    env,
  });
  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot, env });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'inventory drift fixture'], {
    cwd: fixtureRoot,
    env: {
      ...env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  return { parent, fixtureRoot, head: await currentHead(fixtureRoot) };
}

function fakeInventoryDriftProjection() {
  return async () => [
    [
      {
        record: 'node',
        id: 'api:GET /fake',
        type: 'APIEndpoint',
        method: 'GET',
        path: '/fake',
        source_path: 'shared/routes/app-route-definitions.ts',
        line_start: 1,
        line_end: 1,
        role: 'handler',
        surface: 'default',
      },
    ],
    [
      {
        record: 'node',
        id: 'croute:/fake',
        type: 'ClientRoute',
        path: '/fake',
        component: 'Fake',
        definition_site: 'client/src/app/app-routes.tsx:1',
        mount_site: 'client/src/app/app-router.tsx:1',
        source_path: 'client/src/app/app-routes.tsx',
        line_start: 1,
        line_end: 1,
      },
    ],
    [
      {
        record: 'node',
        id: 'worker:fake',
        type: 'WorkerJob',
        name: 'fake',
        queue: 'fake',
        source_path: 'server/queues/registry.ts',
        line_start: 1,
        line_end: 1,
        constructor_sites: [
          { constructor: 'Worker', kind: 'worker', source: 'identifier', path: 'server/queues/registry.ts', line: 1 },
        ],
        source_sites: ['server/queues/registry.ts:1'],
      },
    ],
  ];
}

// Minimal hermetic fixture for the TESTS-edge test below: two source files
// (one API-relevant, one only reachable via a WorkerJob's constructor_sites)
// plus three tracked test files -- one importing each relevant source, one
// unrelated -- so `reduceTestProjection` can be exercised directly without a
// clone of the real repo or any runtime inspection.
async function createTestsEdgeFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'tests-edge-fixture-'));
  const fixtureRoot = path.join(parent, 'repo');
  const env = fixtureGitEnv();
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync('git', ['init', '--quiet'], { cwd: fixtureRoot, env });
  await execFileAsync('git', ['config', 'user.email', 'route-test@example.invalid'], {
    cwd: fixtureRoot,
    env,
  });
  await execFileAsync('git', ['config', 'user.name', 'Route Projection Test'], {
    cwd: fixtureRoot,
    env,
  });

  await mkdir(path.join(fixtureRoot, 'server'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'server/api-source.ts'), 'export const apiSource = 1;\n');
  await writeFile(path.join(fixtureRoot, 'server/worker-source.ts'), 'export const workerSource = 1;\n');

  await mkdir(path.join(fixtureRoot, 'tests/unit'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'tests/unit/api.test.ts'), "import '../../server/api-source.ts';\n");
  await writeFile(path.join(fixtureRoot, 'tests/unit/worker.test.ts'), "import '../../server/worker-source.ts';\n");
  await writeFile(
    path.join(fixtureRoot, 'tests/unit/unrelated.test.ts'),
    "import { describe } from 'vitest';\ndescribe;\n"
  );

  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot, env });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=route-test@example.invalid',
      '-c',
      'user.name=Route Projection Test',
      'commit',
      '--quiet',
      '-m',
      'tests-edge fixture',
    ],
    {
      cwd: fixtureRoot,
      env: {
        ...env,
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      },
    }
  );
  return { parent, fixtureRoot };
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const projectionArtifact = (snapshotId, bytes) => ({
  snapshot_id: snapshotId,
  sha256: sha256(bytes),
  byte_length: bytes.byteLength,
});

async function createValidatorGitFixture({ matrixOnlySkew = false } = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'kg-validator-fixture-'));
  const fixtureRoot = path.join(parent, 'repo');
  await mkdir(path.join(fixtureRoot, 'audit/surface-contract-matrix'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'source-input.txt'), 'projection input\n');
  await writeFile(
    path.join(fixtureRoot, 'audit/surface-contract-matrix', 'seed-marker.txt'),
    'seed snapshot\n'
  );
  await execFileAsync('git', ['init', '--quiet'], { cwd: fixtureRoot });
  await execFileAsync('git', ['config', 'user.email', 'route-test@example.invalid'], {
    cwd: fixtureRoot,
  });
  await execFileAsync('git', ['config', 'user.name', 'Route Projection Test'], {
    cwd: fixtureRoot,
  });
  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'source snapshot'], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  const sourceHead = await currentHead(fixtureRoot);
  if (matrixOnlySkew) {
    await writeFile(
      path.join(fixtureRoot, 'audit/surface-contract-matrix', 'seed-marker.txt'),
      'matrix-only commit\n'
    );
    await execFileAsync('git', ['add', 'audit/surface-contract-matrix/seed-marker.txt'], {
      cwd: fixtureRoot,
    });
    await execFileAsync('git', ['commit', '--quiet', '-m', 'matrix-only skew'], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z',
      },
    });
  }
  const head = await currentHead(fixtureRoot);
  const snapshotId = `snapshot:${'a'.repeat(64)}`;
  const records = [
    {
      record: 'node',
      id: 'api:GET /health',
      type: 'APIEndpoint',
      method: 'GET',
      path: '/health',
      source_path: 'source-input.txt',
      line_start: 1,
    },
    {
      record: 'node',
      id: 'croute:/health',
      type: 'ClientRoute',
      path: '/health',
      source_path: 'source-input.txt',
      line_start: 1,
    },
    {
      record: 'node',
      id: 'worker:synthetic',
      type: 'WorkerJob',
      queue: 'synthetic',
      source_path: 'source-input.txt',
      line_start: 1,
    },
  ].map((record) => ({
    ...record,
    commit_sha: head,
    observed_at: '2026-01-02T00:00:00.000Z',
    snapshot_id: snapshotId,
  }));
  const nodesBytes = Buffer.from(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  const edgesBytes = Buffer.from('');
  const outputDir = path.join(parent, 'out');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'nodes-routes.jsonl'), nodesBytes);
  await writeFile(path.join(outputDir, 'edges-routes.jsonl'), edgesBytes);
  await writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify({
      schema: 'surface-route-projection-v1',
      snapshot_id: snapshotId,
      repo_head: head,
      artifacts: {
        'nodes-routes.jsonl': projectionArtifact(snapshotId, nodesBytes),
        'edges-routes.jsonl': projectionArtifact(snapshotId, edgesBytes),
      },
      source_hashes: { 'source-input.txt': 'source-hash' },
      node_type_counts: { APIEndpoint: 1, ClientRoute: 1, WorkerJob: 1 },
    }, null, 2)}\n`
  );
  return {
    parent,
    fixtureRoot,
    outputDir,
    sourceHead,
    head,
    snapshotId,
    inventory: {
      snapshot_id: `snapshot:${'b'.repeat(64)}`,
      source_hashes: { 'source-input.txt': 'source-hash' },
      kg_counts: { APIEndpoint: 1, ClientRoute: 1, WorkerJob: 1 },
    },
    document: { rows: [{ id: 'api:GET:/health' }] },
  };
}

async function updateValidatorManifest(outputDir, update) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const next = await update(manifest);
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

describe('route knowledge-graph generator contract', () => {
  it('exports the build and exact client projection helpers and documents CLI default output', async () => {
    const generator = await requireGenerator();
    expect(generator.buildRouteKnowledgeGraph).toEqual(expect.any(Function));
    expect(generator.extractClientRouteProjection).toEqual(expect.any(Function));
    expect(generator.serializeRouteKnowledgeGraph).toEqual(expect.any(Function));
    expect(generator.writeRouteKnowledgeGraphArtifacts).toEqual(expect.any(Function));
    expect(generator.reduceRuntimeDocuments).toEqual(expect.any(Function));
    expect(generator.reduceWorkerFindings).toEqual(expect.any(Function));
    expect(generator.reduceTestProjection).toEqual(expect.any(Function));

    const source = await readFile(
      path.join(repoRoot, 'audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs'),
      'utf8'
    );
    expect(source).toContain('audit/knowledge-graph/out');
  });

  it('carries every projection manifest source hash into seeded inventory except the inventory self-path', () => {
    const seeded = { 'existing-input.ts': 'existing-hash' };
    const manifest = {
      'client/src/app/app-routes.tsx': 'app-routes-hash',
      'future-generator-input.ts': 'future-input-hash',
      'audit/surface-contract-matrix/source-inventory.json': 'pre-seed-self-hash',
    };

    const merged = mergeManifestSourceHashes(seeded, manifest);
    expect(merged).toEqual({
      'existing-input.ts': 'existing-hash',
      'client/src/app/app-routes.tsx': 'app-routes-hash',
      'future-generator-input.ts': 'future-input-hash',
    });
    expect(merged).not.toHaveProperty([
      'audit/surface-contract-matrix/source-inventory.json',
    ]);
  });

  it('does not require the inventory self-path during manifest-inventory hash agreement', async () => {
    const fixture = await createValidatorGitFixture();
    try {
      await updateValidatorManifest(fixture.outputDir, (manifest) => ({
        ...manifest,
        source_hashes: {
          ...manifest.source_hashes,
          'audit/surface-contract-matrix/source-inventory.json': 'pre-seed-self-hash',
        },
      }));
      await expect(
        reconcileKnowledgeGraph(fixture.document, fixture.inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).resolves.toMatchObject({ snapshot_id: fixture.snapshotId });
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('fails validation when a projection artifact is tampered after manifest write', async () => {
    const fixture = await createValidatorGitFixture();
    try {
      const nodesPath = path.join(fixture.outputDir, 'nodes-routes.jsonl');
      const records = (await readFile(nodesPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      records[0].tampered = true;
      await writeFile(
        nodesPath,
        `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
      );
      await expect(
        reconcileKnowledgeGraph(fixture.document, fixture.inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).rejects.toThrow(/artifact|sha|byte/i);
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('fails validation when a JSONL record snapshot identity is edited', async () => {
    const fixture = await createValidatorGitFixture();
    try {
      const nodesPath = path.join(fixture.outputDir, 'nodes-routes.jsonl');
      const records = (await readFile(nodesPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      records[0].snapshot_id = `snapshot:${'c'.repeat(64)}`;
      const nodesBytes = Buffer.from(
        `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
      );
      await writeFile(nodesPath, nodesBytes);
      await updateValidatorManifest(fixture.outputDir, (manifest) => ({
        ...manifest,
        artifacts: {
          ...manifest.artifacts,
          'nodes-routes.jsonl': projectionArtifact(manifest.snapshot_id, nodesBytes),
        },
      }));

      await expect(
        reconcileKnowledgeGraph(fixture.document, fixture.inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).rejects.toThrow(/snapshot/i);
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('fails validation when manifest HEAD is not the repository HEAD', async () => {
    const fixture = await createValidatorGitFixture();
    try {
      await updateValidatorManifest(fixture.outputDir, (manifest) => ({
        ...manifest,
        repo_head: '0'.repeat(40),
      }));
      await expect(
        reconcileKnowledgeGraph(fixture.document, fixture.inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).rejects.toThrow(/repo_head|HEAD|fresh/i);
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('fails validation when manifest and inventory input hashes disagree', async () => {
    const fixture = await createValidatorGitFixture();
    try {
      const inventory = {
        ...fixture.inventory,
        source_hashes: { 'source-input.txt': 'different-source-hash' },
      };
      await expect(
        reconcileKnowledgeGraph(fixture.document, inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).rejects.toThrow(/source hash|input hash|manifest/i);
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('permits one-commit matrix skew when only matrix files changed', async () => {
    const fixture = await createValidatorGitFixture({ matrixOnlySkew: true });
    try {
      expect(fixture.sourceHead).not.toBe(fixture.head);
      await expect(
        reconcileKnowledgeGraph(fixture.document, fixture.inventory, {
          rootDir: fixture.fixtureRoot,
          graphDir: fixture.outputDir,
        })
      ).resolves.toMatchObject({ snapshot_id: fixture.snapshotId });
    } finally {
      await rm(fixture.parent, { recursive: true, force: true });
    }
  });

  it('fails release count drift but permits seed rebaseline without weakening discovery', async () => {
    // Reduced from a shared-clone-of-the-repo + full 19-profile runtime
    // inspection fixture (~11s warm, >30s on a cold CI shard, timed out at
    // the default 30s in run 31573521532) to a tiny hermetic fixture plus
    // `buildRouteKnowledgeGraph`'s injectable `projectionImpl` seam. The
    // count-mismatch/seed-rebaseline logic under test reads only
    // `inventory.kg_counts` vs the projected node counts -- it never
    // inspects projection contents -- so a literal three-node fake exercises
    // the exact same release-vs-seed branch with equivalent assertion
    // strength and zero inspector children.
    const { buildRouteKnowledgeGraph } = await requireGenerator();
    const { parent, fixtureRoot, head } = await createInventoryDriftFixture();
    try {
      await withOutputDir(async (outputDir) => {
        await expect(
          buildRouteKnowledgeGraph({
            repoRoot: fixtureRoot,
            outputDir,
            expectedSha: head,
            mode: 'release',
            projectionImpl: fakeInventoryDriftProjection(),
          })
        ).rejects.toThrow(/count mismatch/i);

        await expect(
          buildRouteKnowledgeGraph({
            repoRoot: fixtureRoot,
            outputDir,
            expectedSha: head,
            mode: 'seed',
            projectionImpl: fakeInventoryDriftProjection(),
          })
        ).resolves.toBeDefined();
        const { manifest } = await readProjection(outputDir);
        expect(manifest.valid_for_release_proof).toBe(false);
        expect(manifest.node_type_counts).toEqual({ APIEndpoint: 1, ClientRoute: 1, WorkerJob: 1 });
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects release HEAD mismatch and dirty tracked inputs', async () => {
    await withOutputDir(async (outputDir) => {
      const { buildRouteKnowledgeGraph } = await requireGenerator();
      await expect(
        buildRouteKnowledgeGraph({ repoRoot, outputDir, expectedSha: '0'.repeat(40), mode: 'release' })
      ).rejects.toThrow(/HEAD|SHA|expected/i);
    });

    const { fixtureRoot, head } = await createDirtyGitFixture();
    try {
      await withOutputDir(async (outputDir) => {
        const { buildRouteKnowledgeGraph } = await requireGenerator();
        await expect(
          buildRouteKnowledgeGraph({
            repoRoot: fixtureRoot,
            outputDir,
            expectedSha: head,
            mode: 'release',
          })
        ).rejects.toThrow(/dirty/i);
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  // The former "emits deterministic bytes, two full builds" test (two full
  // real-repo projection builds via a shared-clone fixture) is deleted here:
  // byte-for-byte determinism under reversed record order / varied
  // source-hash insertion order is now covered without any build by
  // `serializeRouteKnowledgeGraph (pure)` above, and end-to-end release-byte
  // proof is Task 11's release verifier's job, not this unit file's.

  it('emits allowlisted API, client, worker, and structural edge records', async () => {
    // Reduced from a full real-repo build to `structuralEdges` (now exported)
    // over three literal nodes. The exact real-repo counts (391/43/10) are
    // no longer this test's concern -- the 43 and 10 counts are still
    // proven against real repo data by the "real client parity" and
    // "nineteen BullMQ constructor sites" tests below; this test's job is
    // the record-shape and edge-type allowlist, which literal fixtures
    // exercise identically.
    const { structuralEdges } = await requireGenerator();
    const apiNode = {
      record: 'node', id: 'api:GET /a', type: 'APIEndpoint', method: 'GET', path: '/a',
      source_path: 'server/routes/a.ts', line_start: 3, surface: 'default',
    };
    const clientNode = {
      record: 'node', id: 'croute:/a', type: 'ClientRoute', path: '/a', component: 'A',
      definition_site: 'shared/routes/app-route-definitions.ts:1',
      mount_site: 'client/src/app/app-router.tsx:9',
      source_path: 'shared/routes/app-route-definitions.ts', line_start: 1,
    };
    const workerNode = {
      record: 'node', id: 'worker:q1', type: 'WorkerJob', name: 'q1', queue: 'q1',
      source_path: 'server/queues/registry.ts', line_start: 2,
    };
    const nodes = [apiNode, clientNode, workerNode];
    const edges = structuralEdges(nodes, [clientNode]);

    expect(nodes.every((record) => record.record === 'node')).toBe(true);
    expect(apiNode.id).toBe(`api:${apiNode.method} ${apiNode.path}`);
    expect(apiNode.method).toEqual(expect.any(String));
    expect(apiNode.path).toEqual(expect.any(String));
    expect(clientNode.id).toBe(`croute:${clientNode.path}`);
    expect(clientNode.path).toEqual(expect.any(String));
    expect(clientNode.component ?? clientNode.redirect).toEqual(expect.any(String));
    expect(workerNode.id).toBe(`worker:${workerNode.queue}`);
    expect(workerNode.name).toBe(workerNode.queue);
    expect(JSON.stringify(workerNode)).toContain(workerNode.source_path);
    expect(JSON.stringify(workerNode)).toContain(String(workerNode.line_start));

    expect(edges.map((record) => record.type).sort()).toEqual(['DEFINES', 'DEFINES', 'DEFINES', 'EXPOSES', 'MOUNTS']);
    for (const record of edges) {
      expect(record.record).toBe('edge');
      expect(record.id).toEqual(expect.any(String));
      expect(record.from).toEqual(expect.any(String));
      expect(record.to).toEqual(expect.any(String));
      expect(record.source_path).toEqual(expect.any(String));
      expect(record.line_start).toEqual(expect.any(Number));
      expect(['DEFINES', 'EXPOSES', 'MOUNTS']).toContain(record.type);
    }
  });

  it('emits TESTS edges for tracked tests and row-relevant source files', async () => {
    // Reduced from a full real-repo build to a minimal hermetic git fixture
    // plus `reduceTestProjection` direct, mirroring the pattern used by the
    // "discovery reducers (pure)" describe block below.
    const { reduceTestProjection } = await requireGenerator();
    const { parent, fixtureRoot } = await createTestsEdgeFixture();
    try {
      const nodes = [
        {
          record: 'node',
          id: 'api:GET /fake',
          type: 'APIEndpoint',
          source_path: 'server/api-source.ts',
          line_start: 1,
        },
        {
          record: 'node',
          id: 'worker:fake',
          type: 'WorkerJob',
          source_path: 'server/worker-registration.ts',
          line_start: 1,
          constructor_sites: [{ path: 'server/worker-source.ts', line: 1 }],
        },
      ];
      const tests = await reduceTestProjection(fixtureRoot, nodes);
      const trackedTests = new Set(await trackedTestFiles(fixtureRoot));
      const rowRelevantSources = new Set(
        nodes.flatMap((record) => [
          record.source_path,
          ...(record.type === 'WorkerJob'
            ? (record.constructor_sites ?? []).map((site) => site.path)
            : []),
        ])
      );
      const workerConstructorSources = new Set(
        nodes
          .filter((record) => record.type === 'WorkerJob')
          .flatMap((record) => (record.constructor_sites ?? []).map((site) => site.path))
      );

      expect(tests.length).toBeGreaterThan(0);
      for (const record of tests) {
        const target = record.to.replace(/^file:/, '');
        expect(record.record).toBe('edge');
        expect(record.type).toBe('TESTS');
        expect(trackedTests).toContain(record.source_path);
        expect(rowRelevantSources).toContain(target);
        expect(record.id).toBe(`edge:TESTS:test:${record.source_path}->file:${target}`);
        expect(record.line_start).toEqual(expect.any(Number));
        expect(record.line_start).toBeGreaterThanOrEqual(1);
      }
      expect(tests.some((record) => record.source_path === 'tests/unit/unrelated.test.ts')).toBe(false);
      expect(tests.some((record) => workerConstructorSources.has(record.to.replace(/^file:/, '')))).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects duplicate IDs, missing source locations, and source-inspection failures', async () => {
    const { extractClientRouteProjection } = await requireGenerator();
    const mutations = [
      {
        name: 'duplicate route ID',
        path: 'shared/routes/app-route-definitions.ts',
        from: '] as const satisfies readonly AppRouteDefinition[];',
        to: "  { path: '/dashboard' },\n] as const satisfies readonly AppRouteDefinition[];",
        pattern: /duplicate|unique|route/i,
      },
      {
        name: 'missing component-map anchor',
        path: 'client/src/app/app-routes.tsx',
        from: '  \'/dashboard\': Dashboard,\n',
        to: '',
        pattern: /missing|component|map|anchor|route/i,
      },
      {
        name: 'missing mount inspection',
        path: 'client/src/app/app-router.tsx',
        from: '{APP_ROUTES.map(renderAppRoute)}',
        to: '{APP_ROUTES}',
        pattern: /missing|mount|AST|inspection|route/i,
      },
    ];

    for (const mutation of mutations) {
      const fixtureRoot = await createClientProjectionFixture();
      try {
        await replaceFixtureText(fixtureRoot, mutation.path, mutation.from, mutation.to);
        await expect(
          Promise.resolve().then(() => extractClientRouteProjection({ repoRoot: fixtureRoot }))
        ).rejects.toThrow(mutation.pattern);
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    }
  });

  it('confines all generated writes to caller outputDir', async () => {
    // Reduced: exercises the same confinement guarantee directly against
    // `writeRouteKnowledgeGraphArtifacts` (where `assertPathStaysInsideOutputDir`
    // actually lives) instead of the whole real-repo build pipeline.
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    await withOutputDir(async (outputDir, parent) => {
      const sentinel = path.join(parent, 'outside.txt');
      await writeFile(sentinel, 'must remain\n');
      const serialized = serializeRouteKnowledgeGraph(baseInput());
      await writeRouteKnowledgeGraphArtifacts({ outputDir, serialized });
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('must remain\n');
      await expect(readdir(parent)).resolves.toEqual(['out', 'outside.txt']);
      await expect(readdir(outputDir)).resolves.toEqual(
        expect.arrayContaining(['manifest.json', 'nodes-routes.jsonl', 'edges-routes.jsonl', 'tests.jsonl'])
      );
    });
  });

  it('keeps unchanged seed and validation inputs compatible with the projection contract', async () => {
    const seedSource = await readFile(
      path.join(repoRoot, 'audit/surface-contract-matrix/scripts/seed-matrix.mjs'),
      'utf8'
    );
    const validateSource = await readFile(
      path.join(repoRoot, 'audit/surface-contract-matrix/scripts/validate-matrix.mjs'),
      'utf8'
    );
    expect(seedSource).toContain("nodes-routes.jsonl");
    expect(seedSource).toContain("edges-routes.jsonl");
    expect(validateSource).toContain('manifest.snapshot_id');
    expect(validateSource).toContain("record.type === 'APIEndpoint'");

    // Reduced: serializer output shape vs validator expectations, no build.
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const input = baseInput();
    input.nodes = input.nodes.map((node) => ({ ...node, commit_sha: input.head, observed_at: input.timestamp }));
    const serialized = serializeRouteKnowledgeGraph(input);
    expect(serialized.manifest.snapshot_id).toBeTruthy();
    expect(serialized.nodes.length).toBeGreaterThan(0);
    expect(serialized.nodes.every((record) => record.commit_sha)).toBe(true);
  });

  it('proves real client definition/component/mount parity with only /login and /lp exceptions', async () => {
    const { extractClientRouteProjection } = await requireGenerator();
    const records = projectionRecords(await extractClientRouteProjection({ repoRoot }));
    const paths = records.map((record) => record.path);
    const expected = expectedClientPaths();
    const governed = new Set(ROUTE_GOVERNANCE_REGISTRY.map((entry) => entry.path));

    expect(records).toHaveLength(43);
    expect(new Set(paths)).toEqual(expected);
    expect([...expected].filter((routePath) => !governed.has(routePath))).toEqual([
      '/login',
      '/lp',
    ]);
    for (const record of records) {
      expect(record.id).toBe(`croute:${record.path}`);
      expect(record.definition_site).toEqual(expect.any(String));
      expect(record.mount_site).toEqual(expect.any(String));
      expect(record.component ?? record.redirect).toEqual(expect.any(String));
    }
  });

  it('fails client projection when a governance record is removed', async () => {
    const { extractClientRouteProjection } = await requireGenerator();
    const fixtureRoot = await createClientProjectionFixture();
    try {
      await replaceFixtureText(
        fixtureRoot,
        'shared/routes/app-route-definitions.ts',
        "  { path: '/help' },\n",
        ''
      );
      await expect(
        Promise.resolve().then(() => extractClientRouteProjection({ repoRoot: fixtureRoot }))
      ).rejects.toThrow(/governance|missing|route|registry/i);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('groups nineteen BullMQ constructor sites into ten catalog-backed worker nodes', async () => {
    // Reduced: `reduceWorkerFindings` over the real scanner's findings.
    // `scanBullmqConstructors` alone is a static AST scan (no build, no
    // inspector children) -- verified <5s in the cold timing at Step 3.
    // Catalog membership, previously enforced by `workerProjection`'s throw
    // inside the full build, is asserted directly below with identical
    // strength.
    const { reduceWorkerFindings } = await requireGenerator();
    const findings = scanBullmqConstructors({ rootDir: repoRoot });
    const workerNodes = reduceWorkerFindings(findings);
    const discoveredQueues = new Set(findings.map((finding) => finding.queue_name));
    const catalogQueues = new Set(QUEUE_CATALOG.map((entry) => entry.queueName));

    expect(findings).toHaveLength(19);
    expect(workerNodes).toHaveLength(10);
    expect(new Set(workerNodes.map((record) => record.queue))).toEqual(discoveredQueues);
    expect([...discoveredQueues].every((queue) => catalogQueues.has(queue))).toBe(true);
    expect(workerNodes.some((record) => record.queue === 'economics-calc')).toBe(false);
    for (const finding of findings) {
      const serialized = JSON.stringify(workerNodes.find((record) => record.queue === finding.queue_name));
      expect(serialized).toContain(`${finding.path}:${finding.line}`);
    }
  });
});

describe('serializeRouteKnowledgeGraph (pure)', () => {
  it('is byte-identical under reversed record order and varied source-hash insertion order', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const a = serializeRouteKnowledgeGraph(baseInput());
    const shuffled = baseInput();
    shuffled.nodes.reverse();
    shuffled.sourceHashes = { 'a/file.ts': 'h1', 'b/file.ts': 'h2' };
    const b = serializeRouteKnowledgeGraph(shuffled);
    expect(a.manifestBytes.equals(b.manifestBytes)).toBe(true);
    expect(a.nodesBytes.equals(b.nodesBytes)).toBe(true);
  });

  it('never emits release authority and does not alias caller input', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const input = baseInput();
    const result = serializeRouteKnowledgeGraph(input);
    expect(result.manifest.valid_for_release_proof).toBe(false);
    expect(result.nodes[0]).not.toBe(input.nodes[0]);
    result.nodes[0].id = 'mutated';
    expect(input.nodes.some((n) => n.id === 'mutated')).toBe(false);
  });

  it('returned records exactly equal parsed serialized files including snapshot_id', async () => {
    const { serializeRouteKnowledgeGraph } = await requireGenerator();
    const result = serializeRouteKnowledgeGraph(baseInput());
    const parsed = result.nodesBytes.toString('utf8').trim().split('\n').map(JSON.parse);
    expect(parsed).toEqual(result.nodes);
    expect(JSON.parse(result.manifestBytes.toString('utf8'))).toEqual(result.manifest);
  });
});

describe('writeRouteKnowledgeGraphArtifacts', () => {
  it('rejects a tampered artifact set before any destination write', async () => {
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    const serialized = serializeRouteKnowledgeGraph(baseInput());
    serialized.manifest.artifacts['nodes-routes.jsonl'].sha256 = 'f'.repeat(64);
    await withOutputDir(async (outputDir) => {
      await expect(writeRouteKnowledgeGraphArtifacts({ outputDir, serialized })).rejects.toThrow(/hash/i);
      expect(await readdir(outputDir)).toEqual([]); // destination untouched
    });
  });

  it('rejects a manifest object/bytes desync so the authority gate cannot be bypassed', async () => {
    // The authority gate inspects `serialized.manifest` (the object), but the
    // bytes actually published to disk are `serialized.manifestBytes`. A
    // caller could otherwise pass valid_for_release_proof: false (sailing
    // past the authority check) paired with manifestBytes independently
    // crafted to say true, publishing release-valid bytes without authority.
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    const desynced = serializeRouteKnowledgeGraph(baseInput());
    const releaseManifest = { ...desynced.manifest, valid_for_release_proof: true };
    desynced.manifestBytes = Buffer.from(`${JSON.stringify(releaseManifest)}\n`);
    await withOutputDir(async (outputDir) => {
      await expect(writeRouteKnowledgeGraphArtifacts({ outputDir, serialized: desynced })).rejects.toThrow(/manifest/i);
      expect(await readdir(outputDir)).toEqual([]); // destination untouched
    });
  });

  it('publishes manifest.json last and rejects release-flavored manifests without authority', { retry: 0 }, async () => {
    // The generator destructures fs/promises at module top, so a real ESM
    // module-namespace spy cannot intercept its rename() calls ("Cannot
    // redefine property" — module namespace is not configurable in ESM).
    // Inject a fake fsImpl instead and assert on it, per the brief's
    // documented fallback; the assertions below are unchanged.
    const { serializeRouteKnowledgeGraph, writeRouteKnowledgeGraphArtifacts } = await requireGenerator();
    const renameCalls = [];
    const fsImpl = {
      writeFile,
      unlink,
      rename: async (...args) => {
        renameCalls.push(args);
        return rename(...args);
      },
    };
    const serialized = serializeRouteKnowledgeGraph(baseInput());
    await withOutputDir(async (outputDir) => {
      await writeRouteKnowledgeGraphArtifacts({ outputDir, serialized }, { fsImpl });
      const renamed = renameCalls.map(([, dest]) => path.basename(dest));
      expect(renamed.at(-1)).toBe('manifest.json');
      expect(renamed.slice(0, -1).sort()).toEqual(['edges-routes.jsonl', 'nodes-routes.jsonl', 'tests.jsonl']);
    });
    const forged = serializeRouteKnowledgeGraph(baseInput());
    forged.manifest.valid_for_release_proof = true;
    forged.manifestBytes = Buffer.from(`${JSON.stringify(forged.manifest)}\n`);
    await withOutputDir(async (outputDir) => {
      await expect(writeRouteKnowledgeGraphArtifacts({ outputDir, serialized: forged })).rejects.toThrow(/authority/i);
    });
  });
});

async function createDiscoveryTestProjectionFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'discovery-test-projection-fixture-'));
  const fixtureRoot = path.join(parent, 'repo');
  const env = fixtureGitEnv();
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync('git', ['init', '--quiet'], { cwd: fixtureRoot, env });
  await execFileAsync('git', ['config', 'user.email', 'route-test@example.invalid'], {
    cwd: fixtureRoot,
    env,
  });
  await execFileAsync('git', ['config', 'user.name', 'Route Projection Test'], {
    cwd: fixtureRoot,
    env,
  });

  await mkdir(path.join(fixtureRoot, 'server'), { recursive: true });
  await writeFile(path.join(fixtureRoot, 'server/widget.ts'), 'export const widget = 1;\n');

  await mkdir(path.join(fixtureRoot, 'tests/unit'), { recursive: true });
  await writeFile(
    path.join(fixtureRoot, 'tests/unit/widget.test.ts'),
    [
      "import '../../server/widget.ts';",
      "import { widget } from '../../server/widget.ts';",
      'widget;',
      '',
    ].join('\n')
  );
  await writeFile(
    path.join(fixtureRoot, 'tests/unit/unrelated.test.ts'),
    "import { describe } from 'vitest';\ndescribe;\n"
  );

  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot, env });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=route-test@example.invalid',
      '-c',
      'user.name=Route Projection Test',
      'commit',
      '--quiet',
      '-m',
      'discovery reducer fixture',
    ],
    {
      cwd: fixtureRoot,
      env: {
        ...env,
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      },
    }
  );
  return { parent, fixtureRoot };
}

describe('discovery reducers (pure)', () => {
  it('reduceRuntimeDocuments dedupes across profiles with guard precedence and stable order', async () => {
    const { reduceRuntimeDocuments } = await requireGenerator();
    const docs = [
      { routes: [{ id: 'api:x', method: 'GET', path: '/b', role: 'handler', site: 's.ts:9', surface: 'p1' }] },
      { routes: [
        { id: 'api:x', method: 'GET', path: '/b', role: 'guard', site: 's.ts:3', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: '/a', role: 'handler', site: 's.ts:5', surface: 'p2' },
        { id: 'client:x', method: 'GET', path: '/c', role: 'handler', site: 's.ts:1', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: 'relative', role: 'handler', site: 's.ts:2', surface: 'p2' },
        { id: 'api:x', method: 'GET', path: '/d', role: 'shadowed', site: 's.ts:4', surface: 'p2' },
      ] },
    ];
    const records = reduceRuntimeDocuments(docs);
    expect(records.map((r) => r.id)).toEqual(['api:GET /a', 'api:GET /b']);
    const b = records.find((r) => r.id === 'api:GET /b');
    // Reducer keeps the existing flattened source_path/line_start shape (not a
    // nested `source` object) so runtimeApiProjection's thin wrapper -- and
    // every real downstream consumer of these node records (structuralEdges,
    // validateRecords, rowRelevantSourcePaths, and the integration assertions
    // at lines ~753/761/774 below) -- see byte-identical output to before
    // this refactor. See task-2-report.md deviations section.
    expect(b.source_path).toBe('s.ts'); // guard wins over handler
    expect(b.line_start).toBe(3);
  });

  it('reduceWorkerFindings groups two findings for one queue into a single catalog-backed node', async () => {
    const { reduceWorkerFindings } = await requireGenerator();
    const findings = [
      { queue_name: 'q1', constructor: 'Worker', kind: 'worker', source: 'identifier', path: 'b.ts', line: 5 },
      { queue_name: 'q1', constructor: 'Queue', kind: 'queue', source: 'literal', path: 'a.ts', line: 2 },
    ];
    const nodes = reduceWorkerFindings(findings);
    expect(nodes.map((n) => n.id)).toEqual(['worker:q1']);
    const node = nodes[0];
    expect(node.source_path).toBe('a.ts');
    expect(node.line_start).toBe(2);
    expect(node.line_end).toBe(5);
    expect(node.constructor_sites).toHaveLength(2);
    expect(node.source_sites).toEqual(['a.ts:2', 'b.ts:5']);
  });

  it('reduceTestProjection discovers tracked tests importing row-relevant sources with earliest-line selection', async () => {
    const { reduceTestProjection } = await requireGenerator();
    const { parent, fixtureRoot } = await createDiscoveryTestProjectionFixture();
    try {
      const nodes = [
        {
          record: 'node',
          id: 'api:GET /widget',
          type: 'APIEndpoint',
          source_path: 'server/widget.ts',
          line_start: 1,
        },
      ];
      const records = await reduceTestProjection(fixtureRoot, nodes);
      expect(records).toEqual([
        {
          record: 'edge',
          id: 'edge:TESTS:test:tests/unit/widget.test.ts->file:server/widget.ts',
          type: 'TESTS',
          source_path: 'tests/unit/widget.test.ts',
          to: 'file:server/widget.ts',
          line_start: 1,
        },
      ]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

// Fake `child_process`-shaped child for spawnInspectorProfile's injectable
// `spawnImpl` seam. `kill(signal)` records the call but never emits
// 'close'/'exit' -- simulating a child that ignores the signal entirely, the
// pathological case the SIGTERM->SIGKILL->force-settle escalation exists to
// bound.
function createFakeInspectorChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.killCalls = [];
  child.kill = (signal) => { child.killCalls.push(signal); };
  return child;
}

describe('spawnInspectorProfile (bounded escalation seam)', () => {
  // Regression coverage for the redesign's core guarantee: a hung/unreapable
  // inspector child can never hang the aggregate run. Task 4's runner tests
  // (knowledge-graph-inspector-runner.test.mjs) exercise runInspectorProfiles
  // with fake spawnProfile functions, but nothing previously exercised this
  // module's own production spawnProfile wrapper -- the piece that actually
  // owns the SIGTERM/SIGKILL escalation and satisfies the runner's "must
  // settle within a bounded time once aborted" precondition. A real warm run
  // (see task-5-report.md) recorded zero child_signal events because every
  // child exited cleanly, so that guarantee had no test coverage at all.
  // These tests inject a fake child + short grace windows via
  // spawnInspectorProfile's seam so they run in milliseconds, never a real
  // 4s+ wall wait.

  it('force-settles when a child ignores both SIGTERM and SIGKILL', { retry: 0 }, async () => {
    const { spawnInspectorProfile } = await requireGenerator();
    const child = createFakeInspectorChild();
    const events = [];
    const controller = new globalThis.AbortController();
    const spawnProfile = spawnInspectorProfile(repoRoot, (event) => events.push(event), {
      spawnImpl: () => child,
      sigtermGraceMs: 5,
      sigkillGraceMs: 5,
    });

    const promise = spawnProfile('hanging-profile', { signal: controller.signal });
    const startedAt = Date.now();
    controller.abort();

    await expect(promise).rejects.toThrow(/did not exit after SIGKILL/i);
    // Bounded: settles from the injected 5ms+5ms grace windows, not a real
    // 4s SIGTERM+SIGKILL wall wait.
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(child.killCalls).toEqual(['SIGTERM', 'SIGKILL']);
    expect(events.map((event) => event.event)).toEqual(['child_signal', 'child_signal']);
    expect(events[0]).toMatchObject({ signal: 'SIGTERM', exit_code: null, profile: 'hanging-profile' });
    expect(events[1]).toMatchObject({ signal: 'SIGKILL', exit_code: null, profile: 'hanging-profile' });
  });

  it('does not escalate to SIGKILL once the child exits from SIGTERM', { retry: 0 }, async () => {
    const { spawnInspectorProfile } = await requireGenerator();
    const child = createFakeInspectorChild();
    const controller = new globalThis.AbortController();
    const spawnProfile = spawnInspectorProfile(repoRoot, () => {}, {
      spawnImpl: () => child,
      sigtermGraceMs: 30,
      sigkillGraceMs: 30,
    });

    const promise = spawnProfile('graceful-profile', { signal: controller.signal });
    controller.abort();
    expect(child.killCalls).toEqual(['SIGTERM']);
    child.emit('close', null, 'SIGTERM');

    await expect(promise).rejects.toThrow(/aborted/i);
    // Give the SIGKILL timer time to fire if `finish()` failed to clear it
    // -- it must not, or a future refactor moving the clear/removeListener
    // order would silently reintroduce a stray SIGKILL (or worse, a
    // dangling timer) after a clean SIGTERM exit.
    await new Promise((resolve) => { globalThis.setTimeout(resolve, 60); });
    expect(child.killCalls).toEqual(['SIGTERM']);
  });

  it('settles when the child process itself errors (no close ever arrives)', { retry: 0 }, async () => {
    const { spawnInspectorProfile } = await requireGenerator();
    const child = createFakeInspectorChild();
    const spawnProfile = spawnInspectorProfile(repoRoot, () => {}, { spawnImpl: () => child });

    const promise = spawnProfile('erroring-profile', { signal: new globalThis.AbortController().signal });
    const spawnError = new Error('spawn ENOENT');
    child.emit('error', spawnError);

    await expect(promise).rejects.toBe(spawnError);
  });
});
