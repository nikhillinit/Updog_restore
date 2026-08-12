import { execFile } from 'node:child_process';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
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

async function buildRealProjection({ mode = 'seed', outputDir, expectedSha } = {}) {
  const { buildRouteKnowledgeGraph } = await requireGenerator();
  return buildRouteKnowledgeGraph({
    repoRoot,
    outputDir,
    expectedSha: expectedSha ?? (await currentHead()),
    mode,
  });
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
  return {
    manifest: await readJson(manifestPath),
    nodes: await readJsonl(nodesPath),
    edges: await readJsonl(edgesPath),
    manifestBytes: await readFile(manifestPath),
    nodesBytes: await readFile(nodesPath),
    edgesBytes: await readFile(edgesPath),
  };
}

function projectionRecords(projection) {
  if (Array.isArray(projection)) return projection;
  return projection.records ?? projection.routes ?? projection.nodes ?? [];
}

function artifactFor(manifest, name) {
  if (Array.isArray(manifest.artifacts)) {
    return manifest.artifacts.find((artifact) => artifact.name === name || artifact.path === name);
  }
  return (
    manifest.artifacts?.[name] ??
    Object.values(manifest.artifacts ?? {}).find(
      (artifact) => artifact.name === name || artifact.path === name || artifact.file === name
    )
  );
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

async function createInventoryDriftFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'inventory-drift-fixture-'));
  const fixtureRoot = path.join(parent, 'repo');
  const env = fixtureGitEnv();
  await execFileAsync('git', ['clone', '--shared', '--quiet', repoRoot, fixtureRoot], { env });
  await symlink(path.join(repoRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');
  const inventoryPath = path.join(
    fixtureRoot,
    'audit/surface-contract-matrix/source-inventory.json'
  );
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  inventory.kg_counts = { ...inventory.kg_counts, APIEndpoint: 1, ClientRoute: 1, WorkerJob: 1 };
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  await execFileAsync(
    'git',
    ['add', 'audit/surface-contract-matrix/source-inventory.json'],
    { cwd: fixtureRoot, env }
  );
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
      'inventory drift fixture',
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
  return { parent, fixtureRoot, head: await currentHead(fixtureRoot) };
}

describe('route knowledge-graph generator contract', () => {
  it('exports the build and exact client projection helpers and documents CLI default output', async () => {
    const generator = await requireGenerator();
    expect(generator.buildRouteKnowledgeGraph).toEqual(expect.any(Function));
    expect(generator.extractClientRouteProjection).toEqual(expect.any(Function));

    const source = await readFile(
      path.join(repoRoot, 'audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs'),
      'utf8'
    );
    expect(source).toContain('audit/knowledge-graph/out');
  });

  it('fails release count drift but permits seed rebaseline without weakening discovery', async () => {
    const { buildRouteKnowledgeGraph } = await requireGenerator();
    const { parent, fixtureRoot, head } = await createInventoryDriftFixture();
    try {
      await withOutputDir(async (outputDir) => {
        await expect(
          buildRouteKnowledgeGraph({ repoRoot: fixtureRoot, outputDir, expectedSha: head, mode: 'release' })
        ).rejects.toThrow(/count mismatch/i);

        await expect(
          buildRouteKnowledgeGraph({ repoRoot: fixtureRoot, outputDir, expectedSha: head, mode: 'seed' })
        ).resolves.toBeDefined();
        const { manifest } = await readProjection(outputDir);
        expect(manifest.valid_for_release_proof).toBe(false);
        expect(manifest.node_type_counts).toEqual(
          expect.objectContaining({
            APIEndpoint: expect.any(Number),
            ClientRoute: 43,
            WorkerJob: 10,
          })
        );
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects release HEAD mismatch and dirty tracked inputs', async () => {
    await withOutputDir(async (outputDir) => {
      await expect(
        buildRealProjection({ mode: 'release', outputDir, expectedSha: '0'.repeat(40) })
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

  it('emits deterministic bytes and a strict normalized manifest', async () => {
    const first = await withOutputDir(async (outputDir) => {
      await buildRealProjection({ mode: 'seed', outputDir });
      return readProjection(outputDir);
    });
    const second = await withOutputDir(async (outputDir) => {
      await buildRealProjection({ mode: 'seed', outputDir });
      return readProjection(outputDir);
    });

    expect(first.manifestBytes).toEqual(second.manifestBytes);
    expect(first.nodesBytes).toEqual(second.nodesBytes);
    expect(first.edgesBytes).toEqual(second.edgesBytes);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.nodes).toEqual(second.nodes);
    expect(first.edges).toEqual(second.edges);
    expect(first.manifest).toMatchObject({
      schema: 'surface-route-projection-v1',
      fresh_for_checkout: true,
      valid_for_release_proof: false,
    });
    expect(first.manifest.snapshot_id).toMatch(/^snapshot:[0-9a-f]{64}$/);
    expect(first.manifest.repo_head).toMatch(/^[0-9a-f]{40}$/);
    expect(first.manifest.source_hashes).toEqual(expect.any(Object));
    expect(Object.keys(first.manifest)).not.toEqual(
      expect.arrayContaining(['valid_for_coding', 'full_graph_complete', 'coding_authority'])
    );

    for (const name of ['nodes-routes.jsonl', 'edges-routes.jsonl']) {
      const artifact = artifactFor(first.manifest, name);
      expect(artifact).toBeDefined();
      expect(artifact).toMatchObject({
        snapshot_id: first.manifest.snapshot_id,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        byte_length: expect.any(Number),
      });
    }
  });

  it('emits allowlisted API, client, worker, and structural edge records', async () => {
    await withOutputDir(async (outputDir) => {
      await buildRealProjection({ mode: 'seed', outputDir });
      const { nodes, edges } = await readProjection(outputDir);
      const apiNodes = nodes.filter((record) => record.type === 'APIEndpoint');
      const clientNodes = nodes.filter((record) => record.type === 'ClientRoute');
      const workerNodes = nodes.filter((record) => record.type === 'WorkerJob');

      expect(nodes.every((record) => record.record === 'node')).toBe(true);
      expect(apiNodes.length).toBe(391);
      expect(clientNodes.length).toBe(43);
      expect(workerNodes.length).toBe(10);
      for (const record of apiNodes) {
        expect(record.id).toBe(`api:${record.method} ${record.path}`);
        expect(record.method).toEqual(expect.any(String));
        expect(record.path).toEqual(expect.any(String));
      }
      for (const record of clientNodes) {
        expect(record.id).toBe(`croute:${record.path}`);
        expect(record.path).toEqual(expect.any(String));
        expect(record.component ?? record.redirect).toEqual(expect.any(String));
      }
      for (const record of workerNodes) {
        expect(record.id).toBe(`worker:${record.queue}`);
        expect(record.name).toBe(record.queue);
        expect(JSON.stringify(record)).toContain(record.source_path);
        expect(JSON.stringify(record)).toContain(String(record.line_start));
      }
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
    await withOutputDir(async (outputDir, parent) => {
      const sentinel = path.join(parent, 'outside.txt');
      await writeFile(sentinel, 'must remain\n');
      await buildRealProjection({ mode: 'seed', outputDir });
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('must remain\n');
      await expect(readdir(parent)).resolves.toEqual(['out', 'outside.txt']);
      await expect(readdir(outputDir)).resolves.toEqual(
        expect.arrayContaining(['manifest.json', 'nodes-routes.jsonl', 'edges-routes.jsonl'])
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

    await withOutputDir(async (outputDir) => {
      await buildRealProjection({ mode: 'seed', outputDir });
      const projection = await readProjection(outputDir);
      expect(projection.manifest.snapshot_id).toBeTruthy();
      expect(projection.nodes.length).toBeGreaterThan(0);
      expect(projection.nodes.every((record) => record.commit_sha)).toBe(true);
    });
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
    await withOutputDir(async (outputDir) => {
      await buildRealProjection({ mode: 'seed', outputDir });
      const { nodes } = await readProjection(outputDir);
      const workerNodes = nodes.filter((record) => record.type === 'WorkerJob');
      const findings = scanBullmqConstructors({ rootDir: repoRoot });
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
});
