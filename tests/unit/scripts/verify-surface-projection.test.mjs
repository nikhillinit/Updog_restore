import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fsSync from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseVerifierArgs,
  resolveTsxBin,
  runVerifier,
} from '../../../scripts/release/verify-surface-projection.mjs';
import { serializeRouteKnowledgeGraph } from '../../../audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd());
const TIMESTAMP = '2026-08-12T00:00:00Z';

// -- shared helpers -----------------------------------------------------

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}
const stableJson = (value) => JSON.stringify(stableValue(value));

let realHeadPromise;
function realHead() {
  realHeadPromise ??= execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).then(({ stdout }) => stdout.trim());
  return realHeadPromise;
}

const createdRoots = [];
async function tmpOutputRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'verify-surface-projection-'));
  createdRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bindCommit(records, head, timestamp) {
  return records.map((record) => ({ ...record, commit_sha: head, observed_at: timestamp }));
}

function richFixtureInput(head) {
  const nodes = bindCommit(
    [
      { record: 'node', id: 'api:GET /probe', type: 'APIEndpoint', method: 'GET', path: '/probe', source_path: 's.ts', line_start: 1 },
      { record: 'node', id: 'client:/probe', type: 'ClientRoute', path: '/probe', source_path: 'c.tsx', line_start: 1 },
      { record: 'node', id: 'worker:probe-queue', type: 'WorkerJob', queue: 'probe-queue', source_path: 'w.ts', line_start: 1 },
    ],
    head,
    TIMESTAMP,
  );
  const edges = bindCommit(
    [{ record: 'edge', id: 'edge:DEFINES:s.ts:1', type: 'DEFINES', source_path: 's.ts', to: 'api:GET /probe', line_start: 1 }],
    head,
    TIMESTAMP,
  );
  const tests = bindCommit(
    [{ record: 'edge', id: 'edge:TESTS:test:t.test.ts->file:s.ts', type: 'TESTS', source_path: 't.test.ts', to: 'file:s.ts', line_start: 1 }],
    head,
    TIMESTAMP,
  );
  return { head, timestamp: TIMESTAMP, sourceHashes: {}, nodes, edges, tests };
}

function minimalFixtureInput(head) {
  const nodes = bindCommit(
    [{ record: 'node', id: 'api:GET /min', type: 'APIEndpoint', method: 'GET', path: '/min', source_path: 's.ts', line_start: 1 }],
    head,
    TIMESTAMP,
  );
  return { head, timestamp: TIMESTAMP, sourceHashes: {}, nodes, edges: [], tests: [] };
}

/**
 * Writes a canned, self-consistent build directory directly (bypassing the
 * generator entirely and its authority-gated writer, which refuses to publish
 * `valid_for_release_proof: true` without a private token). `overrides`
 * patches the manifest object after serialization, for freshness-check
 * negative tests.
 */
async function writeCannedBuild(outputDir, { fixture, overrides = {} } = {}) {
  const serialized = serializeRouteKnowledgeGraph(fixture);
  const manifest = { ...serialized.manifest, valid_for_release_proof: true, ...overrides };
  const manifestBytes = Buffer.from(`${stableJson(manifest)}\n`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'nodes-routes.jsonl'), serialized.nodesBytes);
  await writeFile(path.join(outputDir, 'edges-routes.jsonl'), serialized.edgesBytes);
  await writeFile(path.join(outputDir, 'tests.jsonl'), serialized.testsBytes);
  await writeFile(path.join(outputDir, 'manifest.json'), manifestBytes);
  return manifest;
}

function fakeSpawnBuildFixed(fixture) {
  return async ({ outputDir }) => {
    await writeCannedBuild(outputDir, { fixture });
  };
}

function fakeSpawnBuildDivergingOnSecond(head) {
  let callIndex = 0;
  return async ({ outputDir }) => {
    callIndex += 1;
    const fixture = richFixtureInput(head);
    if (callIndex === 2) {
      fixture.nodes = [
        ...fixture.nodes,
        ...bindCommit(
          [{ record: 'node', id: 'api:GET /extra', type: 'APIEndpoint', method: 'GET', path: '/extra', source_path: 's2.ts', line_start: 2 }],
          head,
          TIMESTAMP,
        ),
      ];
    }
    await writeCannedBuild(outputDir, { fixture });
  };
}

function fakeGitEnv(sha, statusSequence = ['', '']) {
  let statusCallIndex = 0;
  return async (args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${sha}\n`;
    if (args[0] === 'status') {
      const value = statusSequence[Math.min(statusCallIndex, statusSequence.length - 1)];
      statusCallIndex += 1;
      return value;
    }
    throw new Error(`fakeGitEnv: unexpected git invocation: ${args.join(' ')}`);
  };
}

// -- Bullet 9: arg validation --------------------------------------------

describe('parseVerifierArgs', () => {
  it('accepts a well-formed CLI invocation and rejects unknown flags, duplicates, and missing values', { retry: 0 }, () => {
    const sha = 'a'.repeat(40);
    expect(parseVerifierArgs(['--proof', 'pr', '--expected-sha', sha, '--output-root', '/tmp/out'])).toMatchObject({
      proof: 'pr',
      expectedSha: sha,
      outputRoot: '/tmp/out',
    });
    expect(() => parseVerifierArgs(['--bogus'])).toThrow(/unknown/i);
    expect(() => parseVerifierArgs(['--proof'])).toThrow(/value/i);
    expect(() => parseVerifierArgs(['--proof', 'pr', '--proof', 'release', '--expected-sha', sha, '--output-root', '/tmp/out'])).toThrow(/duplicate/i);
  });
});

describe('runVerifier argument validation', () => {
  it('rejects malformed sha, relative output root, and unknown proof mode before invoking any seam', { retry: 0 }, async () => {
    const sha = 'a'.repeat(40);
    let seamCalled = false;
    const seams = { spawnBuild: async () => { seamCalled = true; }, exec: async () => { seamCalled = true; return ''; }, log: () => {} };

    await expect(runVerifier({ proof: 'bogus', expectedSha: sha, outputRoot: '/tmp/out' }, seams)).rejects.toThrow(/proof/i);
    await expect(runVerifier({ proof: 'pr', expectedSha: 'not-a-sha', outputRoot: '/tmp/out' }, seams)).rejects.toThrow(/sha/i);
    await expect(runVerifier({ proof: 'pr', expectedSha: sha, outputRoot: 'relative/dir' }, seams)).rejects.toThrow(/absolute/i);
    expect(seamCalled).toBe(false);
  });
});

// -- Bullet 2: tsx resolution ---------------------------------------------

describe('resolveTsxBin', () => {
  it('resolves the local node_modules/.bin/tsx entrypoint and never npx', { retry: 0 }, () => {
    const tsxBin = resolveTsxBin(repoRoot);
    expect(tsxBin).toBe(path.join(repoRoot, 'node_modules', '.bin', 'tsx'));
    expect(tsxBin).not.toMatch(/npx/);
  });
});

// -- Bullet 1: checkout SHA binding ----------------------------------------

describe('checkout SHA binding', () => {
  it('rejects before spawning any build when checked-out HEAD does not match --expected-sha', { retry: 0 }, async () => {
    const root = await tmpOutputRoot();
    let spawnCalled = false;
    const wrongSha = 'b'.repeat(40);
    const actualSha = 'c'.repeat(40);
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: wrongSha, outputRoot: root },
        { spawnBuild: async () => { spawnCalled = true; }, exec: fakeGitEnv(actualSha), log: () => {} },
      ),
    ).rejects.toThrow(/expected-sha|checkout/i);
    expect(spawnCalled).toBe(false);
  });
});

// -- Bullet 3 (+7): spawn counts, no retry ---------------------------------

describe('generator spawn counts', () => {
  it('pr mode spawns exactly one generator build; release mode spawns exactly two, always in release mode', { retry: 0 }, async () => {
    const head = await realHead();
    const calls = [];
    const spawnBuild = async ({ outputDir, mode, expectedSha }) => {
      calls.push({ outputDir, mode, expectedSha });
      await writeCannedBuild(outputDir, { fixture: richFixtureInput(head) });
    };

    const prRoot = await tmpOutputRoot();
    await runVerifier({ proof: 'pr', expectedSha: head, outputRoot: prRoot }, { spawnBuild, exec: fakeGitEnv(head), log: () => {} }).catch(() => {});
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ outputDir: path.join(prRoot, 'build-1'), mode: 'release', expectedSha: head });

    calls.length = 0;
    const releaseRoot = await tmpOutputRoot();
    await runVerifier({ proof: 'release', expectedSha: head, outputRoot: releaseRoot }, { spawnBuild, exec: fakeGitEnv(head), log: () => {} }).catch(() => {});
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.outputDir)).toEqual([path.join(releaseRoot, 'build-1'), path.join(releaseRoot, 'build-2')]);
  });

  it('does not retry a failed generator spawn', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    let calls = 0;
    const spawnBuild = async () => { calls += 1; throw new Error('generator boom'); };
    await expect(
      runVerifier({ proof: 'pr', expectedSha: head, outputRoot: root }, { spawnBuild, exec: fakeGitEnv(head), log: () => {} }),
    ).rejects.toThrow(/boom/);
    expect(calls).toBe(1);
  });
});

// -- Bullet 4: release byte-compare -----------------------------------------

describe('release proof byte comparison', () => {
  it('release mode byte-compares four files and fails after printing diagnostics', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    const logs = [];
    const result = runVerifier(
      { proof: 'release', expectedSha: head, outputRoot: root },
      { spawnBuild: fakeSpawnBuildDivergingOnSecond(head), exec: fakeGitEnv(head), log: (line) => logs.push(line) },
    );
    await expect(result).rejects.toThrow(/byte/i);
    expect(logs.join('\n')).toMatch(/nodes-routes\.jsonl.*sha256/);
  });
});

// -- Bullet 5: freshness, coverage, and the real validateMatrix call --------

describe('manifest freshness, coverage, and matrix validation', () => {
  it('records checkout_sha/pr_head_sha (from PR_HEAD_SHA, distinct from checkout_sha), validates freshness+coverage, then calls the real validateMatrix which gates the result', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    const logs = [];
    const trueHeadSha = 'f'.repeat(40);
    vi.stubEnv('PR_HEAD_SHA', trueHeadSha);
    try {
      const result = runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: root },
        { spawnBuild: fakeSpawnBuildFixed(richFixtureInput(head)), exec: fakeGitEnv(head), log: (line) => logs.push(line) },
      );
      // The canned fixture's tiny node counts can never match the real
      // repo's source-inventory kg_counts, so the real validateMatrix call
      // deterministically fails here -- proving it ran for real (not a stub)
      // and that its failure gates runVerifier's result.
      await expect(result).rejects.toThrow(/count mismatch/i);
      expect(logs.some((line) => line.includes('checkout_sha=') && line.includes(head))).toBe(true);
      expect(logs.some((line) => line.includes('pr_head_sha=') && line.includes(trueHeadSha))).toBe(true);
      // pr_head_sha is never derived from checkout_sha/GITHUB_SHA: on
      // pull_request events those are the synthetic merge commit, distinct
      // from the PR's true head recorded here.
      expect(trueHeadSha).not.toBe(head);
      expect(logs.some((line) => line.includes('matrix_validate_start'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('pr_head_sha is null when PR_HEAD_SHA is unset or empty (never falls back to GITHUB_SHA/checkout_sha)', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    const logs = [];
    vi.stubEnv('GITHUB_SHA', head);
    vi.stubEnv('PR_HEAD_SHA', '');
    try {
      const result = runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: root },
        { spawnBuild: fakeSpawnBuildFixed(richFixtureInput(head)), exec: fakeGitEnv(head), log: (line) => logs.push(line) },
      );
      await expect(result).rejects.toThrow(/count mismatch/i);
      expect(logs.some((line) => line.includes('pr_head_sha=none'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a malformed PR_HEAD_SHA instead of silently accepting it', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    vi.stubEnv('PR_HEAD_SHA', 'not-a-sha');
    try {
      await expect(
        runVerifier(
          { proof: 'pr', expectedSha: head, outputRoot: root },
          { spawnBuild: fakeSpawnBuildFixed(richFixtureInput(head)), exec: fakeGitEnv(head), log: () => {} },
        ),
      ).rejects.toThrow(/PR_HEAD_SHA/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects when manifest freshness fields are wrong', { retry: 0 }, async () => {
    const head = await realHead();

    const rootA = await tmpOutputRoot();
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: rootA },
        {
          spawnBuild: async ({ outputDir }) => writeCannedBuild(outputDir, { fixture: richFixtureInput(head), overrides: { fresh_for_checkout: false } }),
          exec: fakeGitEnv(head),
          log: () => {},
        },
      ),
    ).rejects.toThrow(/fresh_for_checkout/);

    const rootB = await tmpOutputRoot();
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: rootB },
        {
          spawnBuild: async ({ outputDir }) => writeCannedBuild(outputDir, { fixture: richFixtureInput(head), overrides: { valid_for_release_proof: false } }),
          exec: fakeGitEnv(head),
          log: () => {},
        },
      ),
    ).rejects.toThrow(/valid_for_release_proof/);

    const rootC = await tmpOutputRoot();
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: rootC },
        {
          spawnBuild: async ({ outputDir }) => writeCannedBuild(outputDir, { fixture: richFixtureInput(head), overrides: { repo_head: 'd'.repeat(40) } }),
          exec: fakeGitEnv(head),
          log: () => {},
        },
      ),
    ).rejects.toThrow(/repo_head/);
  });

  it('rejects when a required coverage count is zero', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: root },
        { spawnBuild: fakeSpawnBuildFixed(minimalFixtureInput(head)), exec: fakeGitEnv(head), log: () => {} },
      ),
    ).rejects.toThrow(/coverage count.*client/i);
  });
});

// -- Bullet 6: tracked worktree unchanged -----------------------------------

describe('tracked worktree invariance', () => {
  it('ignores untracked-only status noise but fails fast on tracked-file drift', { retry: 0 }, async () => {
    const head = await realHead();

    const rootA = await tmpOutputRoot();
    const resultA = runVerifier(
      { proof: 'pr', expectedSha: head, outputRoot: rootA },
      { spawnBuild: fakeSpawnBuildFixed(richFixtureInput(head)), exec: fakeGitEnv(head, ['', '?? scratch.tmp\n']), log: () => {} },
    );
    // Untracked-only drift is ignored, so the flow reaches the real
    // validateMatrix call and fails there instead of on the worktree check.
    await expect(resultA).rejects.toThrow(/count mismatch/i);

    const rootB = await tmpOutputRoot();
    const resultB = runVerifier(
      { proof: 'pr', expectedSha: head, outputRoot: rootB },
      { spawnBuild: fakeSpawnBuildFixed(richFixtureInput(head)), exec: fakeGitEnv(head, ['', ' M shared/some-tracked-file.ts\n']), log: () => {} },
    );
    await expect(resultB).rejects.toThrow(/tracked worktree|worktree changed/i);
  });
});

// -- Bullet 8: cleanup -------------------------------------------------------

describe('cleanup', () => {
  it('cleans owned build dirs on failure but preserves output-root', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    await expect(
      runVerifier(
        { proof: 'pr', expectedSha: head, outputRoot: root },
        { spawnBuild: fakeSpawnBuildFixed(minimalFixtureInput(head)), exec: fakeGitEnv(head), log: () => {} },
      ),
    ).rejects.toThrow();
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(false);
    expect(fsSync.existsSync(root)).toBe(true);
  });

  it('registers SIGINT/SIGTERM handlers that clean up owned build dirs without touching output-root', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    const registeredCleanups = [];
    const onSignal = (cleanupFn) => {
      registeredCleanups.push(cleanupFn);
      return () => {};
    };
    let releaseSpawn;
    const hangingSpawnBuild = async ({ outputDir }) => {
      await writeCannedBuild(outputDir, { fixture: richFixtureInput(head) });
      await new Promise((resolve) => { releaseSpawn = resolve; });
    };

    const resultPromise = runVerifier(
      { proof: 'pr', expectedSha: head, outputRoot: root },
      { spawnBuild: hangingSpawnBuild, exec: fakeGitEnv(head), log: () => {}, onSignal },
    );

    // onSignal is registered synchronously before any await inside
    // runVerifier, so it is already captured once runVerifier() returns.
    expect(registeredCleanups).toHaveLength(1);
    for (let attempt = 0; attempt < 50 && !fsSync.existsSync(path.join(root, 'build-1')); attempt += 1) {
      await sleep(5);
    }
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(true);

    await registeredCleanups[0]();
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(false);
    expect(fsSync.existsSync(root)).toBe(true);

    releaseSpawn();
    await expect(resultPromise).rejects.toThrow();
  });

  it('signal path terminates the active generator child (SIGTERM -> grace -> SIGKILL -> grace) and awaits settlement BEFORE running directory cleanup', { retry: 0 }, async () => {
    const head = await realHead();
    const root = await tmpOutputRoot();
    const events = [];
    const registeredCleanups = [];
    const onSignal = (onTerminate) => {
      registeredCleanups.push(onTerminate);
      return () => {};
    };

    // A fake "active child": a plain EventEmitter standing in for the real
    // ChildProcess handle. It never emits 'exit' on its own -- the whole
    // point of this test is to prove the SIGKILL escalation (and its
    // bounded force-settle) runs, not that a cooperative child exits early.
    const fakeChild = new EventEmitter();
    fakeChild.exitCode = null;
    fakeChild.signalCode = null;
    fakeChild.kill = (signal) => { events.push(`kill:${signal}`); };

    let releaseSpawn;
    const spawnBuild = async ({ outputDir, registerChild }) => {
      registerChild?.(fakeChild);
      await writeCannedBuild(outputDir, { fixture: richFixtureInput(head) });
      await new Promise((resolve) => { releaseSpawn = resolve; });
    };

    const resultPromise = runVerifier(
      { proof: 'pr', expectedSha: head, outputRoot: root },
      {
        spawnBuild,
        exec: fakeGitEnv(head),
        log: () => {},
        onSignal,
        // Real terminateActiveChild logic runs (not stubbed out) -- only
        // the grace windows are shortened so the test stays fast.
        sigtermGraceMs: 5,
        sigkillGraceMs: 5,
      },
    ).catch(() => {});

    expect(registeredCleanups).toHaveLength(1);
    for (let attempt = 0; attempt < 50 && !fsSync.existsSync(path.join(root, 'build-1')); attempt += 1) {
      await sleep(5);
    }
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(true);

    const terminatePromise = registeredCleanups[0]();
    // Still mid-escalation (SIGTERM already sent, SIGKILL grace pending):
    // the build dir must not be gone yet -- cleanup has not run.
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(true);
    await terminatePromise;
    events.push('cleanup_done');

    expect(events).toEqual(['kill:SIGTERM', 'kill:SIGKILL', 'cleanup_done']);
    // Cleanup only ran after termination settled.
    expect(fsSync.existsSync(path.join(root, 'build-1'))).toBe(false);
    expect(fsSync.existsSync(root)).toBe(true);

    releaseSpawn();
    await resultPromise;
  });
});
