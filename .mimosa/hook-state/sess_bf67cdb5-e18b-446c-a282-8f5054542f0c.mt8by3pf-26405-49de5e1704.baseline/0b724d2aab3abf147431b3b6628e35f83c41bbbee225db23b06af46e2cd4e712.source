import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ListenerDispositionSchema,
  discoverHttpListenerCandidates,
  extractProductRoutes,
  listenerDispositionFingerprint,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';

const repoRoot = process.cwd();
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const temporaryRoot = temporaryRoots.pop();
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function productDisposition(candidatePath: string, listenerId: string) {
  const base = {
    candidate_path: candidatePath,
    listener_id: listenerId,
    disposition: 'product-surface' as const,
    row_namespace: 'listener' as const,
    route_extraction_strategy: 'literal-route-registration',
    evidence: [`${candidatePath}:listener`],
  };
  return ListenerDispositionSchema.parse({
    ...base,
    fingerprint: listenerDispositionFingerprint(base),
  });
}

function createTrackedFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-contract-listener-'));
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

describe('surface contract matrix HTTP listener discovery', () => {
  it('extracts all five worker-health and four FastAPI routes', () => {
    const workerRoutes = extractProductRoutes(
      productDisposition('workers/health-server.ts', 'worker-health'),
      { rootDir: repoRoot }
    );
    const mlRoutes = extractProductRoutes(productDisposition('ml-service/app.py', 'ml-reserve'), {
      rootDir: repoRoot,
    });

    expect(workerRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`)).toEqual([
      'GET /health',
      'GET /live',
      'GET /ready',
      'GET /metrics',
      'GET /stats',
    ]);
    expect(mlRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`)).toEqual([
      'GET /health',
      'POST /train',
      'POST /predict',
      'GET /model/info',
    ]);
  });

  it('detects known tooling listeners while scanning tracked runtime sources', () => {
    const candidates = discoverHttpListenerCandidates({ rootDir: repoRoot });
    const candidatePaths = new Set(candidates.map((candidate) => candidate.path));

    expect(candidatePaths.has('server/observability/metrics-demo.ts')).toBe(true);
    expect(candidatePaths.has('scripts/orchestrate.ts')).toBe(true);
    expect(candidatePaths.has('scripts/ai-tools/metrics-server.js')).toBe(true);
  });

  it('detects a newly added tracked listener candidate', () => {
    const root = createTrackedFixture({
      'src/new-listener.mjs': `
        import http from 'node:http';
        http.createServer((_request, response) => response.end('ok')).listen(4321);
      `,
    });

    const candidates = discoverHttpListenerCandidates({ rootDir: root });
    expect(candidates).toEqual([
      expect.objectContaining({
        path: 'src/new-listener.mjs',
        source_type: 'source',
        patterns: expect.arrayContaining([
          expect.objectContaining({ kind: 'node-listen' }),
          expect.objectContaining({ kind: 'node-http-server-creation' }),
        ]),
      }),
    ]);
  });

  it('hard-fails unsupported dynamic route registration with file and line', () => {
    const root = createTrackedFixture({
      'src/dynamic-listener.ts': `
        import express from 'express';
        const app = express();
        const routePath = '/health';
        app.get(routePath, (_request, response) => response.sendStatus(200));
        app.listen(4321);
      `,
    });
    const disposition = productDisposition('src/dynamic-listener.ts', 'dynamic');

    expect(() => extractProductRoutes(disposition, { rootDir: root })).toThrow(
      'Unsupported dynamic route registration at src/dynamic-listener.ts:5'
    );
  });

  it('requires tooling dispositions to carry rationale and evidence', () => {
    expect(() =>
      ListenerDispositionSchema.parse({
        candidate_path: 'scripts/orchestrate.ts',
        listener_id: 'orchestrate',
        disposition: 'non-product-tooling',
        fingerprint: '0'.repeat(64),
      })
    ).toThrow();

    const disposition = {
      candidate_path: 'scripts/orchestrate.ts',
      listener_id: 'orchestrate',
      disposition: 'non-product-tooling' as const,
      rationale: 'Local orchestration tooling, not a release product surface.',
      evidence: ['scripts/orchestrate.ts:listener'],
    };
    expect(
      ListenerDispositionSchema.parse({
        ...disposition,
        fingerprint: listenerDispositionFingerprint(disposition),
      })
    ).toMatchObject(disposition);
  });
});
