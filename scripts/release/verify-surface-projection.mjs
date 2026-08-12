// This module must be launched via `node_modules/.bin/tsx`, not plain
// `node` -- `validateMatrix` (imported below) dynamically imports
// extensionless `.ts` registry modules at runtime, which only resolve under
// tsx's loader hooks. Confirmed empirically at Task 8 Step 5: plain `node`
// fails with ERR_MODULE_NOT_FOUND once execution reaches validateMatrix.
// The CI lane (Task 9) must invoke this script the same way it invokes the
// generator: via the local tsx binary, never `npx`.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateMatrix } from '../../audit/surface-contract-matrix/scripts/validate-matrix.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '../..');
const GENERATOR_RELATIVE_PATH = 'audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs';
const ARTIFACT_FILE_NAMES = ['manifest.json', 'nodes-routes.jsonl', 'edges-routes.jsonl', 'tests.jsonl'];
const PROOF_MODES = new Set(['pr', 'release']);
const SHA_PATTERN = /^[0-9a-f]{40}$/;

// -- pure helpers ------------------------------------------------------

/**
 * Resolves the local tsx binary from a repo root. The generator CLI mixes
 * plain .mjs with dynamic `import()` of raw .ts registry modules, which only
 * resolve under tsx's loader hooks -- so builds must always run through this
 * path, never `npx tsx` (a network/registry-resolution dependency this
 * verifier must not have).
 */
export function resolveTsxBin(repoRoot) {
  return path.join(repoRoot, 'node_modules', '.bin', 'tsx');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reduces `git status --porcelain` to the tracked-file delta only: `??`
 * (untracked) lines are dropped so stray scratch files at the worktree root
 * never trip the post-build invariance check.
 */
function trackedPorcelain(rawStatus) {
  return rawStatus
    .split('\n')
    .filter((line) => line && !line.startsWith('??'))
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
}

/**
 * Validates and normalizes the `PR_HEAD_SHA` env var: absent/empty (the
 * workflow sets it to `github.event.pull_request.head.sha`, which is empty
 * outside `pull_request` events) resolves to `null`; a present value must be
 * a 40-hex sha or this throws. Never derived from `GITHUB_SHA` -- on
 * `pull_request` events `GITHUB_SHA` is the synthetic merge commit that
 * `checkout_sha` is bound to, and conflating the two here would silently
 * reintroduce the provenance bug this seam exists to prevent.
 */
export function validatePrHeadSha(rawValue) {
  if (rawValue === undefined || rawValue === '') return null;
  if (!SHA_PATTERN.test(rawValue)) {
    throw new Error(`PR_HEAD_SHA must be a 40-character lowercase hex sha when set (got ${JSON.stringify(rawValue)})`);
  }
  return rawValue;
}

function assertVerifierOptions(options) {
  const { proof, expectedSha, outputRoot } = options ?? {};
  if (!PROOF_MODES.has(proof)) {
    throw new Error(`--proof must be 'pr' or 'release' (got ${JSON.stringify(proof)})`);
  }
  if (typeof expectedSha !== 'string' || !SHA_PATTERN.test(expectedSha)) {
    throw new Error(`--expected-sha must be a 40-character lowercase hex sha (got ${JSON.stringify(expectedSha)})`);
  }
  if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot)) {
    throw new Error(`--output-root must be an absolute path (got ${JSON.stringify(outputRoot)})`);
  }
  return { proof, expectedSha, outputRoot };
}

export function parseVerifierArgs(argv) {
  const parsed = { proof: undefined, expectedSha: undefined, outputRoot: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--proof' || argument === '--expected-sha' || argument === '--output-root') {
      const key = argument === '--proof' ? 'proof' : argument === '--expected-sha' ? 'expectedSha' : 'outputRoot';
      if (parsed[key] !== undefined) throw new Error(`duplicate argument: ${argument}`);
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`Missing value for argument: ${argument}`);
      parsed[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return assertVerifierOptions(parsed);
}

async function readJsonl(filePath) {
  const contents = await readFile(filePath, 'utf8');
  return contents.trim() === '' ? [] : contents.trim().split('\n').map((line) => JSON.parse(line));
}

async function readBuildArtifacts(buildDir) {
  const files = {};
  for (const fileName of ARTIFACT_FILE_NAMES) {
    const bytes = await readFile(path.join(buildDir, fileName));
    files[fileName] = { sha256: sha256(bytes), byteLength: bytes.byteLength };
  }
  const manifest = JSON.parse((await readFile(path.join(buildDir, 'manifest.json'))).toString('utf8'));
  const nodes = await readJsonl(path.join(buildDir, 'nodes-routes.jsonl'));
  const edges = await readJsonl(path.join(buildDir, 'edges-routes.jsonl'));
  const tests = await readJsonl(path.join(buildDir, 'tests.jsonl'));
  return { dir: buildDir, files, manifest, nodes, edges, tests };
}

function assertManifestFreshness(manifest, expectedSha) {
  if (manifest?.fresh_for_checkout !== true) {
    throw new Error(`manifest fresh_for_checkout must be true (got ${JSON.stringify(manifest?.fresh_for_checkout)})`);
  }
  if (manifest?.valid_for_release_proof !== true) {
    throw new Error(`manifest valid_for_release_proof must be true (got ${JSON.stringify(manifest?.valid_for_release_proof)})`);
  }
  if (manifest?.repo_head !== expectedSha) {
    throw new Error(`manifest repo_head ${manifest?.repo_head} does not match expected ${expectedSha}`);
  }
}

function typeCount(nodes, type) {
  return nodes.filter((record) => record.type === type).length;
}

function assertCoverageCounts(build) {
  const counts = {
    api: typeCount(build.nodes, 'APIEndpoint'),
    client: typeCount(build.nodes, 'ClientRoute'),
    worker: typeCount(build.nodes, 'WorkerJob'),
    structural: build.edges.length,
    tests: build.tests.length,
  };
  for (const [key, value] of Object.entries(counts)) {
    if (!(value > 0)) throw new Error(`required coverage count is not > 0: ${key} (${value})`);
  }
  return counts;
}

// -- default seam implementations (production) --------------------------

async function defaultExec(repoRoot, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: repoRoot });
  return stdout;
}

/**
 * Spawns the generator CLI as a fresh child process (no shared module state
 * possible between the two release builds). Inherits stdio so the
 * generator's own NDJSON phase events remain visible on this process's
 * stderr, unmodified. `registerChild` (an injection seam, no-op in
 * production callers that omit it) is invoked with the live child on spawn
 * and with `null` once it exits, so a signal arriving mid-build can find and
 * terminate it -- see `terminateActiveChild`.
 */
async function defaultSpawnBuild({ mode, expectedSha, outputDir, repoRoot, registerChild }) {
  const tsxBin = resolveTsxBin(repoRoot);
  const generatorPath = path.join(repoRoot, GENERATOR_RELATIVE_PATH);
  await new Promise((resolve, reject) => {
    const child = spawn(
      tsxBin,
      [generatorPath, '--mode', mode, '--expected-sha', expectedSha, '--output-dir', outputDir],
      { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    registerChild?.(child);
    child.on('error', (error) => { registerChild?.(null); reject(error); });
    child.on('exit', (code, signal) => {
      registerChild?.(null);
      if (signal) { reject(new Error(`generator terminated by signal ${signal}`)); return; }
      if (code !== 0) { reject(new Error(`generator exited with code ${code}`)); return; }
      resolve();
    });
  });
}

function defaultLog(message) {
  process.stderr.write(`${message}\n`);
}

const CHILD_SIGTERM_GRACE_MS = 2_000;
const CHILD_SIGKILL_GRACE_MS = 2_000;

/**
 * Terminates the currently-tracked active generator child (if any) before
 * signal-triggered cleanup is allowed to proceed: SIGTERM -> wait
 * `sigtermGraceMs` -> SIGKILL -> wait `sigkillGraceMs`, then resolves
 * regardless of whether the child ever actually reaped (bounded settlement
 * -- an unreapable child must never hang process exit). Mirrors the
 * escalation pattern in `spawnInspectorProfile`
 * (audit/knowledge-graph/scripts/rebuild-knowledge-graph.mjs). No-op when no
 * build is currently in flight (`activeChildRef.child` is null) or the
 * tracked child has already exited.
 */
export function terminateActiveChild(activeChildRef, {
  sigtermGraceMs = CHILD_SIGTERM_GRACE_MS,
  sigkillGraceMs = CHILD_SIGKILL_GRACE_MS,
} = {}) {
  const child = activeChildRef.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let sigtermTimer;
    let sigkillTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(sigtermTimer);
      globalThis.clearTimeout(sigkillTimer);
      child.off('exit', onExit);
      resolve();
    };
    const onExit = () => finish();
    child.once('exit', onExit);
    try { child.kill('SIGTERM'); } catch { /* already exited */ }
    sigtermTimer = globalThis.setTimeout(() => {
      if (settled) return;
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      sigkillTimer = globalThis.setTimeout(finish, sigkillGraceMs);
    }, sigtermGraceMs);
  });
}

/**
 * Registers real SIGINT/SIGTERM handlers that run `onTerminate` (terminate
 * the active child, then run directory cleanup) and exit. Returns a
 * function that removes the handlers (called once the run settles normally,
 * so a later signal does not re-trigger cleanup on a torn-down verifier).
 */
function defaultOnSignal(onTerminate) {
  const handler = (signal) => {
    onTerminate().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  const onSigint = () => handler('SIGINT');
  const onSigterm = () => handler('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}

// -- verifier -------------------------------------------------------------

/**
 * Verifies that the checked-out commit produces a release-valid surface
 * route projection. `pr` proof runs one generator build; `release` proof
 * runs two independent, sequential builds and byte-compares all four
 * artifact files (proof repetition, not a retry -- neither build is ever
 * retried on its own). Both modes bind the generator to `--mode release` so
 * every build carries release authority (`valid_for_release_proof: true`);
 * the difference is solely build count and whether outputs are compared.
 *
 * `seams` are injection points for tests only (ESM namespace spying does
 * not work in this repo): `spawnBuild`, `exec`, `log`, `onSignal`,
 * `terminateActiveChild` each default to real implementations and are never
 * overridden in production. `sigtermGraceMs`/`sigkillGraceMs` shorten the
 * default terminate-escalation grace windows for tests only.
 * `validateMatrix` is imported directly, not injectable -- it is the
 * load-bearing real-tree drift check this verifier exists to run.
 *
 * On SIGINT/SIGTERM, the currently-active generator child (if a build is in
 * flight) is terminated and its settlement awaited BEFORE build-dir cleanup
 * runs -- never the reverse, which could delete a directory an active child
 * is still writing into and would orphan the child. See
 * `terminateActiveChild`.
 */
export async function runVerifier(options, seams = {}) {
  const { proof, expectedSha, outputRoot } = assertVerifierOptions(options);
  const repoRoot = defaultRepoRoot;
  const activeChildRef = { child: null };
  const spawnBuild = seams.spawnBuild ?? ((buildOptions) => defaultSpawnBuild({ ...buildOptions, repoRoot }));
  const exec = seams.exec ?? ((args) => defaultExec(repoRoot, args));
  const log = seams.log ?? defaultLog;
  const onSignal = seams.onSignal ?? defaultOnSignal;
  const terminate = seams.terminateActiveChild
    ?? ((ref) => terminateActiveChild(ref, { sigtermGraceMs: seams.sigtermGraceMs, sigkillGraceMs: seams.sigkillGraceMs }));

  const buildDirs = [];
  const cleanup = async () => {
    await Promise.all(buildDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  };
  const terminateThenCleanup = async () => {
    await terminate(activeChildRef);
    await cleanup();
  };
  const removeSignalHandlers = onSignal(terminateThenCleanup);

  try {
    const preStatus = trackedPorcelain(await exec(['status', '--porcelain']));
    const checkoutSha = (await exec(['rev-parse', 'HEAD'])).trim();
    if (checkoutSha !== expectedSha) {
      throw new Error(`checkout_sha ${checkoutSha} does not match --expected-sha ${expectedSha}`);
    }
    // PR manifests bind to the synthetic merge checkout: `checkout_sha` is
    // the commit actually built and proven (GITHUB_SHA-bound, above), and it
    // stays that way -- on `pull_request` events GITHUB_SHA IS the synthetic
    // merge sha, indistinguishable from the checkout it is asserted against.
    // `pr_head_sha` is a separate provenance-only field sourced from
    // PR_HEAD_SHA (the workflow sets it to the true PR head, empty outside
    // PR events); it is never substituted for the checkout binding above.
    const prHeadSha = validatePrHeadSha(process.env.PR_HEAD_SHA);
    log(`checkout proof=${proof} checkout_sha=${checkoutSha} pr_head_sha=${prHeadSha ?? 'none'}`);

    const buildCount = proof === 'release' ? 2 : 1;
    const builds = [];
    for (let index = 1; index <= buildCount; index += 1) {
      const buildDir = path.join(outputRoot, `build-${index}`);
      buildDirs.push(buildDir);
      const startedAt = Date.now();
      // Sequential by design: release builds must run one after another
      // (fresh process per build, no shared state) -- never in parallel.
      await spawnBuild({
        mode: 'release',
        expectedSha,
        outputDir: buildDir,
        repoRoot,
        log,
        registerChild: (child) => { activeChildRef.child = child; },
      });
      const build = await readBuildArtifacts(buildDir);
      builds.push(build);
      log(`build_complete build=${index} duration_ms=${Date.now() - startedAt} snapshot_id=${build.manifest?.snapshot_id ?? 'unknown'}`);
    }

    // Both modes: record per-file artifact hashes/lengths for every build,
    // only once all builds have succeeded. Release mode: print diagnostics
    // for both builds before comparing, so any byte inequality is reported
    // as a failure AFTER the diagnostics are already on the record.
    for (const [buildIndex, build] of builds.entries()) {
      for (const fileName of ARTIFACT_FILE_NAMES) {
        log(`artifact_diagnostic build=${buildIndex + 1} file=${fileName} sha256=${build.files[fileName].sha256} byte_length=${build.files[fileName].byteLength}`);
      }
    }

    if (proof === 'release') {
      const [first, second] = builds;
      const diverged = ARTIFACT_FILE_NAMES.filter((fileName) => first.files[fileName].sha256 !== second.files[fileName].sha256);
      if (diverged.length > 0) {
        throw new Error(`Release proof byte comparison failed for: ${diverged.join(', ')}`);
      }
    }

    for (const build of builds) {
      assertManifestFreshness(build.manifest, expectedSha);
      assertCoverageCounts(build);
    }
    log(`freshness_and_coverage_ok builds=${builds.length}`);

    const postBuildStatus = trackedPorcelain(await exec(['status', '--porcelain']));
    if (preStatus !== postBuildStatus) {
      throw new Error(`Tracked worktree changed during verification.\nbefore:\n${preStatus}\nafter:\n${postBuildStatus}`);
    }

    const build1Dir = buildDirs[0];
    log(`matrix_validate_start graph_dir=${build1Dir}`);
    await validateMatrix({ graphDir: build1Dir, writeMetadata: false });
    log('matrix_validate_ok');

    return { checkoutSha, prHeadSha, buildDirs: [...buildDirs] };
  } finally {
    removeSignalHandlers();
    await cleanup();
  }
}

// -- CLI shim ---------------------------------------------------------------

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isEntrypoint) {
  try {
    const options = parseVerifierArgs(process.argv.slice(2));
    const result = await runVerifier(options, {});
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
